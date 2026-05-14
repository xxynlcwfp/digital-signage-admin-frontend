import { authApi, getApiErrorMessage } from './authService'

/**
 * Some browsers leave `File.type` empty for MP4; OSS signatures often bind Content-Type,
 * so the policy request must send the same type the PUT will use.
 * @param {File} file
 * @param {'IMAGE' | 'VIDEO' | 'YOUTUBE'} mediaType
 * @returns {string|undefined}
 */
export function guessUploadContentType(file, mediaType) {
  const raw = (file?.type || '').trim()
  if (raw) return raw
  const name = (file?.name || '').toLowerCase()
  if (mediaType === 'VIDEO') {
    if (name.endsWith('.mp4')) return 'video/mp4'
    if (name.endsWith('.webm')) return 'video/webm'
    if (name.endsWith('.mov')) return 'video/quicktime'
    if (name.endsWith('.mkv')) return 'video/x-matroska'
    return 'video/mp4'
  }
  if (mediaType === 'IMAGE') {
    if (name.endsWith('.png')) return 'image/png'
    if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg'
    if (name.endsWith('.gif')) return 'image/gif'
    if (name.endsWith('.webp')) return 'image/webp'
    return 'image/jpeg'
  }
  return undefined
}

function unwrapApiResponse(response) {
  const body = response.data
  if (!body || typeof body.code !== 'number') {
    throw new Error('Invalid response from server')
  }
  if (body.code !== 200) {
    const msg = typeof body.message === 'string' ? body.message : 'Request failed'
    throw new Error(msg)
  }
  return body.data
}

/**
 * @param {string} responseText
 * @param {number} status
 * @returns {string}
 */
function formatStoragePutError(responseText, status) {
  const raw = (responseText || '').trim()
  if (!raw) {
    return `Upload to storage failed (HTTP ${status}).`
  }
  if (raw.startsWith('<?xml') || raw.includes('<Error>')) {
    const code = raw.match(/<Code>([^<]*)<\/Code>/)?.[1]?.trim()
    const msg = raw.match(/<Message>([^<]*)<\/Message>/)?.[1]?.trim()
    if (code === 'InvalidAccessKeyId') {
      return 'OSS: Access Key Id 无效或不存在。请在运行后端的机器上检查环境变量 ALIYUN_OSS_ACCESS_KEY_ID / ALIYUN_OSS_ACCESS_KEY_SECRET（或 application 配置），使用对该 Bucket 有权限的 RAM 子账号密钥后重启后端。'
    }
    if (code === 'SignatureDoesNotMatch') {
      return 'OSS: 签名不匹配。请核对 AccessKeySecret 与 endpoint/region/bucket 配置是否与 RAM 控制台一致。'
    }
    if (code && msg) {
      return `OSS: ${code} — ${msg}`
    }
  }
  return raw.length > 600 ? `${raw.slice(0, 580)}…` : raw
}

function assertHttpUrl(uploadUrl) {
  try {
    const u = new URL(uploadUrl)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      throw new Error('invalid protocol')
    }
  } catch {
    throw new Error('Invalid upload URL from server.')
  }
}

/**
 * 开发时默认走 Vite 同源转发（避免浏览器→OSS CORS）。显式关闭：`VITE_OSS_DEV_RELAY=false`。
 * 生产构建默认直连 OSS；若构建时设 `VITE_OSS_DEV_RELAY=true` 且用 `vite preview` 启用了中转，才会走 relay。
 */
export function shouldUseOssDevRelay() {
  if (import.meta.env.VITE_OSS_DEV_RELAY === 'false') return false
  if (import.meta.env.VITE_OSS_DEV_RELAY === 'true') return true
  return import.meta.env.DEV === true
}

function devRelaySessionUrl() {
  return new URL(
    '__ds_oss_relay/session',
    `${window.location.origin}${import.meta.env.BASE_URL || '/'}`,
  ).toString()
}

function devRelayStreamUrl(id) {
  return new URL(
    `__ds_oss_relay/stream/${encodeURIComponent(id)}`,
    `${window.location.origin}${import.meta.env.BASE_URL || '/'}`,
  ).toString()
}

/**
 * @param {string} uploadUrl
 * @param {Blob} file
 * @param {Record<string, string>} requiredHeaders
 * @param {(pct: number) => void} [onProgress]
 */
function uploadViaViteOssRelay(uploadUrl, file, requiredHeaders, onProgress) {
  assertHttpUrl(uploadUrl)
  return (async () => {
    const sessionRes = await fetch(devRelaySessionUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uploadUrl, requiredHeaders: requiredHeaders || {} }),
    })
    const sessionText = await sessionRes.text().catch(() => '')
    if (!sessionRes.ok) {
      throw new Error(sessionText || `Relay session failed (${sessionRes.status})`)
    }
    let id
    try {
      id = JSON.parse(sessionText).id
    } catch {
      throw new Error('Relay: invalid session response')
    }
    if (!id || typeof id !== 'string') {
      throw new Error('Relay: missing session id')
    }

    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('PUT', devRelayStreamUrl(id))
      xhr.withCredentials = false
      xhr.responseType = 'text'
      xhr.upload.onprogress = (evt) => {
        if (!onProgress || !evt.lengthComputable || !file.size) return
        const pct = Math.round((evt.loaded / evt.total) * 100)
        onProgress(Math.min(100, Math.max(0, pct)))
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          if (onProgress) onProgress(100)
          resolve()
          return
        }
        reject(new Error(formatStoragePutError(xhr.responseText, xhr.status)))
      }
      xhr.onerror = () =>
        reject(new Error('经 Vite 转发上传失败：请确认已重启 dev 且 vite.config 已启用 ossDevRelayPlugin。'))
      xhr.onabort = () => reject(new Error('Upload cancelled'))
      xhr.send(file)
    })
  })()
}

function isLikelyNetworkCorsFailure(err) {
  const msg = typeof err?.message === 'string' ? err.message : ''
  if (msg === 'Failed to fetch' || msg === 'Load failed' || msg === 'NetworkError when attempting to fetch resource.') {
    return true
  }
  if (err?.name === 'TypeError' && /fetch|network|load failed/i.test(msg)) return true
  return false
}

/**
 * PUT file to presigned object storage URL (from upload-policy).
 *
 * @param {string} uploadUrl
 * @param {Blob} file
 * @param {Record<string, string>} requiredHeaders
 * @param {(pct: number) => void} [onProgress]
 */
export function uploadFileToPresignedUrl(uploadUrl, file, requiredHeaders = {}, onProgress) {
  if (shouldUseOssDevRelay()) {
    return uploadViaViteOssRelay(uploadUrl, file, requiredHeaders, onProgress)
  }
  assertHttpUrl(uploadUrl)
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', uploadUrl)
    xhr.withCredentials = false
    xhr.responseType = 'text'

    Object.entries(requiredHeaders || {}).forEach(([k, v]) => {
      if (v != null && String(v).trim() !== '') {
        try {
          xhr.setRequestHeader(k, String(v))
        } catch {
          // ignore bad header name
        }
      }
    })

    xhr.upload.onprogress = (evt) => {
      if (!onProgress || !evt.lengthComputable || !file.size) return
      const pct = Math.round((evt.loaded / evt.total) * 100)
      onProgress(Math.min(100, Math.max(0, pct)))
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        if (onProgress) onProgress(100)
        resolve()
        return
      }
      reject(new Error(formatStoragePutError(xhr.responseText, xhr.status)))
    }

    xhr.onerror = () => {
      reject(
        new Error(
          '无法连接对象存储（网络或浏览器跨域限制）。若为跨域，请在 OSS 控制台为该 Bucket 配置 CORS，允许当前站点来源与 PUT 方法。',
        ),
      )
    }

    xhr.onabort = () => reject(new Error('Upload cancelled'))

    try {
      xhr.send(file)
    } catch (err) {
      if (isLikelyNetworkCorsFailure(err)) {
        reject(
          new Error(
            `Upload failed: ${err.message}. 若为跨域，请在 OSS Bucket 的 CORS 中允许本页来源（如 http://localhost:3000）及 PUT。`,
          ),
        )
      } else {
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    }
  })
}

/**
 * POST /api/admin/media/upload-policy
 */
export async function requestUploadPolicy(payload) {
  const body = {
    mediaType: payload.mediaType,
    originalFilename: payload.originalFilename,
    ...(payload.contentType ? { contentType: payload.contentType } : {}),
    ...(payload.fileSizeBytes != null ? { fileSizeBytes: payload.fileSizeBytes } : {}),
  }
  const res = await authApi.post('/api/admin/media/upload-policy', body)
  return unwrapApiResponse(res)
}

/**
 * POST /api/admin/media/confirm
 */
export async function confirmMedia(payload) {
  const body = {
    objectKey: payload.objectKey,
    name: payload.name,
    mediaType: payload.mediaType,
    ...(payload.fileUrl ? { fileUrl: payload.fileUrl } : {}),
    ...(payload.thumbnailUrl ? { thumbnailUrl: payload.thumbnailUrl } : {}),
    ...(payload.fileSizeBytes != null ? { fileSizeBytes: payload.fileSizeBytes } : {}),
    ...(payload.durationSeconds != null ? { durationSeconds: payload.durationSeconds } : {}),
    ...(payload.checksumSha256 ? { checksumSha256: payload.checksumSha256 } : {}),
  }
  const res = await authApi.post('/api/admin/media/confirm', body)
  return unwrapApiResponse(res)
}

export async function listMedia() {
  const res = await authApi.get('/api/admin/media')
  return unwrapApiResponse(res)
}

export async function getMedia(id) {
  const res = await authApi.get(`/api/admin/media/${id}`)
  return unwrapApiResponse(res)
}

export async function deleteMedia(id) {
  const res = await authApi.delete(`/api/admin/media/${id}`)
  return unwrapApiResponse(res)
}

export { getApiErrorMessage }
