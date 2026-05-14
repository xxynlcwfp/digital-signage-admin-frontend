import { authApi, getApiErrorMessage } from './authService'

/**
 * Admin screens & screen groups → `/api/admin/screens`, `/api/admin/screen-groups`.
 * Player APIs live under `/api/device` (not used here).
 */

/**
 * @param {import('axios').AxiosResponse} response
 */
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

function bearerHeaders() {
  const token = localStorage.getItem('ds_admin_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/** @returns {Promise<import('axios').AxiosResponse>} */
async function adminGet(path) {
  return authApi.get(path, { headers: bearerHeaders() })
}

/** @returns {Promise<import('axios').AxiosResponse>} */
async function adminPost(path, body) {
  return authApi.post(path, body, { headers: bearerHeaders() })
}

/** @returns {Promise<import('axios').AxiosResponse>} */
async function adminPut(path, body) {
  return authApi.put(path, body, { headers: bearerHeaders() })
}

/** @returns {Promise<import('axios').AxiosResponse>} */
async function adminDelete(path) {
  return authApi.delete(path, { headers: bearerHeaders() })
}

// --- Screens (ScreenResponse, CreateScreenRequest, UpdateScreenRequest, …) ---

export async function listScreens() {
  const res = await adminGet('/api/admin/screens')
  return unwrapApiResponse(res)
}

export async function getScreen(id) {
  const res = await adminGet(`/api/admin/screens/${id}`)
  return unwrapApiResponse(res)
}

/**
 * @param {{ deviceCode: string, name: string, screenGroupId?: number | null }} payload
 */
export async function createScreen(payload) {
  const body = {
    deviceCode: payload.deviceCode,
    name: payload.name,
    ...(payload.screenGroupId != null ? { screenGroupId: payload.screenGroupId } : {}),
  }
  const res = await adminPost('/api/admin/screens', body)
  return unwrapApiResponse(res)
}

/**
 * @param {number|string} id
 * @param {{ name?: string }} payload
 */
export async function updateScreen(id, payload) {
  const body = {}
  if (payload.name != null && String(payload.name).trim() !== '') {
    body.name = String(payload.name).trim()
  }
  const res = await adminPut(`/api/admin/screens/${id}`, body)
  return unwrapApiResponse(res)
}

export async function deleteScreen(id) {
  const res = await adminDelete(`/api/admin/screens/${id}`)
  return unwrapApiResponse(res)
}

/**
 * @param {number|string} id
 * @param {{ screenGroupId: number | null }} payload — `null` 表示移出分组
 */
export async function assignScreenGroup(id, payload) {
  const res = await adminPut(`/api/admin/screens/${id}/group`, {
    screenGroupId: payload.screenGroupId ?? null,
  })
  return unwrapApiResponse(res)
}

export async function generateActivationCode(id) {
  const res = await adminPost(`/api/admin/screens/${id}/activation-code`, {})
  return unwrapApiResponse(res)
}

// --- Screen groups ---

export async function listScreenGroups() {
  const res = await adminGet('/api/admin/screen-groups')
  return unwrapApiResponse(res)
}

/**
 * @param {{ name: string, location?: string }} payload
 */
export async function createScreenGroup(payload) {
  const body = { name: payload.name }
  if (payload.location != null && String(payload.location).trim() !== '') {
    body.location = String(payload.location).trim()
  }
  const res = await adminPost('/api/admin/screen-groups', body)
  return unwrapApiResponse(res)
}

/**
 * @param {number|string} id
 * @param {{ name?: string, location?: string }} payload
 */
export async function updateScreenGroup(id, payload) {
  const body = {}
  if (payload.name != null) body.name = String(payload.name).trim()
  if (payload.location !== undefined) {
    body.location =
      payload.location == null || String(payload.location).trim() === ''
        ? null
        : String(payload.location).trim()
  }
  const res = await adminPut(`/api/admin/screen-groups/${id}`, body)
  return unwrapApiResponse(res)
}

export async function deleteScreenGroup(id) {
  const res = await adminDelete(`/api/admin/screen-groups/${id}`)
  return unwrapApiResponse(res)
}

export { getApiErrorMessage }
