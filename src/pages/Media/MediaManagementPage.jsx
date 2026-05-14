import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Col,
  Input,
  Modal,
  Progress,
  Row,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd'
import { DeleteOutlined, EyeOutlined, UploadOutlined } from '@ant-design/icons'
import {
  confirmMedia,
  deleteMedia,
  getApiErrorMessage,
  guessUploadContentType,
  listMedia,
  requestUploadPolicy,
  uploadFileToPresignedUrl,
} from '../../services/mediaService'

function bytesToHuman(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '-'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const val = bytes / 1024 ** i
  return `${val >= 10 ? val.toFixed(0) : val.toFixed(1)} ${units[i]}`
}

/** @returns {'IMAGE' | 'VIDEO' | 'UNKNOWN'} */
function inferMediaType(file) {
  const mime = (file?.type || '').toLowerCase()
  if (mime.startsWith('video/')) return 'VIDEO'
  if (mime.startsWith('image/')) return 'IMAGE'
  const name = (file?.name || '').toLowerCase()
  if (name.match(/\.(mp4|webm|mov|mkv)$/)) return 'VIDEO'
  if (name.match(/\.(png|jpg|jpeg|gif|webp)$/)) return 'IMAGE'
  return 'UNKNOWN'
}

function formatDateTime(value) {
  if (value == null) return '-'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString()
}

/** @param {string|undefined} url */
function youtubeVideoId(url) {
  if (!url || typeof url !== 'string') return null
  const s = url.trim()
  if (!s) return null
  try {
    const u = new URL(s)
    const host = u.hostname.toLowerCase()
    if (host === 'youtu.be') {
      const id = u.pathname.replace(/^\//, '').split('/')[0]
      return id || null
    }
    if (host.includes('youtube.com')) {
      const v = u.searchParams.get('v')
      if (v) return v
      const m = u.pathname.match(/\/embed\/([^/?]+)/)
      if (m) return m[1]
      const s2 = u.pathname.match(/\/shorts\/([^/?]+)/)
      if (s2) return s2[1]
    }
  } catch {
    /* ignore */
  }
  return null
}

/** @param {string|undefined} url */
function youtubeThumbnailUrl(url) {
  const id = youtubeVideoId(url)
  return id ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : null
}

function canPreviewMedia(it) {
  const f = (it.fileUrl || '').trim()
  const t = (it.thumbnailUrl || '').trim()
  if (f || t) return true
  if (it.type === 'YOUTUBE' && youtubeVideoId(f)) return true
  return false
}

/**
 * @param {{ type: string, fileUrl?: string, thumbnailUrl?: string }} it
 * @returns {{ mode: 'image' | 'video' | 'none', src?: string }}
 */
function resolveGridCover(it) {
  const thumb = (it.thumbnailUrl || '').trim()
  const file = (it.fileUrl || '').trim()
  if (it.type === 'IMAGE') {
    const src = thumb || file
    return src ? { mode: 'image', src } : { mode: 'none' }
  }
  if (it.type === 'VIDEO') {
    if (thumb) return { mode: 'image', src: thumb }
    if (file) {
      const src = file.includes('#') ? file : `${file}#t=0.001`
      return { mode: 'video', src }
    }
    return { mode: 'none' }
  }
  if (it.type === 'YOUTUBE') {
    if (thumb) return { mode: 'image', src: thumb }
    const yt = youtubeThumbnailUrl(file)
    if (yt) return { mode: 'image', src: yt }
    return { mode: 'none' }
  }
  if (thumb) return { mode: 'image', src: thumb }
  if (file) return { mode: 'image', src: file }
  return { mode: 'none' }
}

function MediaGridThumb({ item, fallbackLabel }) {
  const pres = resolveGridCover(item)
  const [failed, setFailed] = useState(false)

  if (pres.mode === 'none' || failed || !pres.src) {
    return (
      <div
        style={{
          height: 150,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #e2e8f0 0%, #f1f5f9 55%, #e2e8f0 100%)',
        }}
      >
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {fallbackLabel}
        </Typography.Text>
      </div>
    )
  }

  if (pres.mode === 'image') {
    return (
      <div style={{ height: 150, overflow: 'hidden', background: '#e8eef5' }}>
        <img
          src={pres.src}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          onError={() => setFailed(true)}
        />
      </div>
    )
  }

  return (
    <div style={{ height: 150, overflow: 'hidden', background: '#0b1220' }}>
      <video
        src={pres.src}
        muted
        playsInline
        preload="metadata"
        aria-hidden
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
          pointerEvents: 'none',
        }}
        onError={() => setFailed(true)}
      />
    </div>
  )
}

function mapApiItem(m) {
  return {
    id: m.id,
    name: m.name,
    type: m.mediaType,
    size: m.fileSizeBytes ?? 0,
    uploadedAt: formatDateTime(m.createdAt),
    fileUrl: m.fileUrl || '',
    thumbnailUrl: m.thumbnailUrl || '',
    objectKey: m.objectKey || '',
    raw: m,
  }
}

export default function MediaManagementPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [uploading, setUploading] = useState(false)
  const uploadOps = useRef(0)

  const [keyword, setKeyword] = useState('')
  const [type, setType] = useState('ALL')

  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewItem, setPreviewItem] = useState(null)
  /** 0–100 while uploading binary to storage; null when idle */
  const [uploadProgress, setUploadProgress] = useState(null)

  const beginUpload = () => {
    uploadOps.current += 1
    setUploading(true)
  }
  const endUpload = () => {
    uploadOps.current = Math.max(0, uploadOps.current - 1)
    if (uploadOps.current === 0) setUploading(false)
  }

  const loadMedia = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const list = await listMedia()
      setItems(Array.isArray(list) ? list.map(mapApiItem) : [])
    } catch (e) {
      setLoadError(getApiErrorMessage(e))
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadMedia()
  }, [loadMedia])

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return items.filter((m) => {
      const hitKw = !kw || String(m.name).toLowerCase().includes(kw)
      const hitType = type === 'ALL' || m.type === type
      return hitKw && hitType
    })
  }, [items, keyword, type])

  const beforeUpload = async (file) => {
    const inferred = inferMediaType(file)
    if (inferred === 'UNKNOWN') {
      message.error('Only image or video files are supported')
      return Upload.LIST_IGNORE
    }
    const mediaType = inferred

    beginUpload()
    setUploadProgress(0)
    try {
      const contentType = guessUploadContentType(file, mediaType)
      const policy = await requestUploadPolicy({
        mediaType,
        originalFilename: file.name,
        ...(contentType ? { contentType } : {}),
        fileSizeBytes: file.size,
      })

      if (policy.uploadMethod === 'PUT' && policy.uploadUrl) {
        await uploadFileToPresignedUrl(
          policy.uploadUrl,
          file,
          policy.requiredHeaders || {},
          (pct) => setUploadProgress(pct),
        )
      } else {
        message.error(
          '当前未返回可用的直传地址。请在服务端配置 OSS（app.storage.oss.*）或 presigned-put-url-template。',
        )
        return Upload.LIST_IGNORE
      }

      await confirmMedia({
        objectKey: policy.objectKey,
        name: file.name.trim(),
        mediaType,
        fileSizeBytes: file.size,
      })

      message.success('Uploaded')
      await loadMedia()
    } catch (e) {
      message.error(getApiErrorMessage(e))
    } finally {
      setUploadProgress(null)
      endUpload()
    }
    return false
  }

  const openPreview = (it) => {
    setPreviewItem(it)
    setPreviewOpen(true)
  }

  const removeItem = (it) => {
    Modal.confirm({
      title: 'Delete this media?',
      content: it.name,
      okText: 'Delete',
      okButtonProps: { danger: true },
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await deleteMedia(it.id)
          message.success('Deleted')
          await loadMedia()
        } catch (e) {
          message.error(getApiErrorMessage(e))
        }
      },
    })
  }

  const typeLabel = (t) => {
    if (t === 'VIDEO') return 'Video'
    if (t === 'IMAGE') return 'Image'
    if (t === 'YOUTUBE') return 'YouTube'
    return String(t || '-')
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <Space
          align="baseline"
          style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}
        >
          <div>
            <Typography.Title level={3} style={{ margin: 0, color: '#0f172a' }}>
              Media Management
            </Typography.Title>
          </div>
          <Space>
            <Button onClick={() => loadMedia()} loading={loading}>
              Refresh
            </Button>
            <Tag color="default">Total {filtered.length}</Tag>
          </Space>
        </Space>

        {loadError ? (
          <Alert type="error" showIcon message="Failed to load media" description={loadError} style={{ marginBottom: 16 }} />
        ) : null}

        <Card
          variant="borderless"
          style={{
            borderRadius: 12,
            boxShadow:
              '0 1px 2px rgba(15, 23, 42, 0.06), 0 12px 32px rgba(15, 23, 42, 0.06)',
          }}
        >
          <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
            <Space wrap>
              <Input
                allowClear
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="Search by name"
                style={{ width: 260, maxWidth: '100%' }}
              />
              <Select
                value={type}
                onChange={setType}
                style={{ width: 160 }}
                options={[
                  { value: 'ALL', label: 'All types' },
                  { value: 'IMAGE', label: 'Image' },
                  { value: 'VIDEO', label: 'Video' },
                  { value: 'YOUTUBE', label: 'YouTube' },
                ]}
              />
            </Space>

            <Space direction="vertical" size={8} style={{ minWidth: 200, maxWidth: 360 }}>
              <Upload
                accept="image/*,video/*"
                multiple
                showUploadList={false}
                beforeUpload={beforeUpload}
                disabled={uploading}
              >
                <Button type="primary" icon={<UploadOutlined />} loading={uploading}>
                  Upload media
                </Button>
              </Upload>
              {uploading && uploadProgress != null ? (
                <Progress percent={uploadProgress} size="small" status="active" />
              ) : null}
            </Space>
          </Space>
        </Card>

        <Spin spinning={loading} style={{ width: '100%', marginTop: 24 }}>
          <Row gutter={[16, 16]}>
            {filtered.map((it) => (
              <Col key={it.id} xs={24} sm={12} md={8} lg={6}>
                <Card
                  hoverable
                  variant="borderless"
                  style={{
                    borderRadius: 12,
                    overflow: 'hidden',
                    boxShadow:
                      '0 1px 2px rgba(15, 23, 42, 0.06), 0 12px 32px rgba(15, 23, 42, 0.06)',
                  }}
                  cover={<MediaGridThumb item={it} fallbackLabel={typeLabel(it.type)} />}
                >
                  <Space direction="vertical" size={10} style={{ width: '100%' }}>
                    <div>
                      <Typography.Text strong style={{ color: '#0f172a' }} ellipsis>
                        {it.name}
                      </Typography.Text>
                      <div style={{ marginTop: 6 }}>
                        <Tag color={it.type === 'VIDEO' ? 'blue' : it.type === 'YOUTUBE' ? 'purple' : 'geekblue'}>
                          {typeLabel(it.type)}
                        </Tag>
                        <Tag color="default">{bytesToHuman(it.size)}</Tag>
                      </div>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {it.uploadedAt}
                      </Typography.Text>
                    </div>

                    <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                      <Button icon={<EyeOutlined />} onClick={() => openPreview(it)} disabled={!canPreviewMedia(it)}>
                        Preview
                      </Button>
                      <Button danger icon={<DeleteOutlined />} onClick={() => removeItem(it)}>
                        Delete
                      </Button>
                    </Space>
                  </Space>
                </Card>
              </Col>
            ))}
          </Row>
        </Spin>

        {!loading && filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <Typography.Text type="secondary">No media</Typography.Text>
          </div>
        ) : null}
      </div>

      <Modal
        title="Media preview"
        open={previewOpen}
        onCancel={() => setPreviewOpen(false)}
        footer={null}
        width={860}
        destroyOnClose
      >
        {previewItem ? (
          <div>
            <Space
              wrap
              style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }}
            >
              <Typography.Text strong>{previewItem.name}</Typography.Text>
              <Space size={8}>
                <Tag color={previewItem.type === 'VIDEO' ? 'blue' : previewItem.type === 'YOUTUBE' ? 'purple' : 'geekblue'}>
                  {typeLabel(previewItem.type)}
                </Tag>
                <Tag color="default">{bytesToHuman(previewItem.size)}</Tag>
              </Space>
            </Space>

            <div
              style={{
                width: '100%',
                borderRadius: 12,
                overflow: 'hidden',
                background: '#0b1220',
                border: '1px solid rgba(148,163,184,0.25)',
              }}
            >
              {(() => {
                const fileSrc = (previewItem.fileUrl || '').trim()
                const thumbSrc = (previewItem.thumbnailUrl || '').trim()
                const imgSrc = fileSrc || thumbSrc
                const ytId = youtubeVideoId(fileSrc)
                if (previewItem.type === 'IMAGE' && imgSrc) {
                  return (
                    <img
                      src={imgSrc}
                      alt={previewItem.name}
                      style={{ width: '100%', display: 'block', maxHeight: 520, objectFit: 'contain' }}
                    />
                  )
                }
                if (previewItem.type === 'VIDEO' && fileSrc) {
                  return (
                    <video
                      src={fileSrc}
                      poster={(previewItem.thumbnailUrl || '').trim() || undefined}
                      controls
                      playsInline
                      style={{ width: '100%', display: 'block', maxHeight: 520 }}
                    />
                  )
                }
                if (previewItem.type === 'YOUTUBE' && ytId) {
                  return (
                    <iframe
                      title={previewItem.name}
                      src={`https://www.youtube.com/embed/${encodeURIComponent(ytId)}`}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      style={{ width: '100%', aspectRatio: '16 / 9', border: 0, minHeight: 360, display: 'block' }}
                    />
                  )
                }
                if (fileSrc) {
                  return (
                    <div style={{ padding: 48, textAlign: 'center' }}>
                      <Typography.Link href={fileSrc} target="_blank" rel="noreferrer">
                        Open media URL
                      </Typography.Link>
                    </div>
                  )
                }
                return (
                  <div style={{ padding: 72, textAlign: 'center' }}>
                    <Typography.Text style={{ color: '#cbd5e1' }}>
                      No file URL (e.g. CDN base not configured).
                    </Typography.Text>
                  </div>
                )
              })()}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
