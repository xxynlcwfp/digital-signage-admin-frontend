import axios from 'axios'

/**
 * Base URL for API calls. In dev, Vite proxies `/api` to the backend (see vite.config.js).
 * Override with VITE_API_BASE_URL (e.g. https://api.example.com) when not using the proxy.
 */
const baseURL =
  import.meta.env.VITE_API_BASE_URL != null &&
  String(import.meta.env.VITE_API_BASE_URL).trim() !== ''
    ? String(import.meta.env.VITE_API_BASE_URL).trim().replace(/\/+$/, '')
    : ''

export const authApi = axios.create({
  baseURL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

// 所有经 authApi 的请求统一附带管理员 access token（避免漏传 Authorization 导致 401 unauthorized）
authApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('ds_admin_token')
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

/**
 * @param {unknown} error
 * @returns {string}
 */
export function getApiErrorMessage(error) {
  const status = error?.response?.status
  const code = error?.response?.data?.code
  const fromBody = error?.response?.data?.message
  if (typeof fromBody === 'string' && fromBody.trim()) {
    const msg = fromBody.trim()
    if (status === 401 || (code === 401 && msg.toLowerCase() === 'unauthorized')) {
      return `${msg}. Please check your username and password and try again.`
    }
    if (status === 403 && code === 403 && msg === 'forbidden') {
      return `${msg}. Creating or changing resources requires ADMIN or EDITOR; VIEWER is read-only.`
    }
    return msg
  }
  if (typeof error?.message === 'string' && error.message.trim()) {
    const m = error.message.trim()
    if (m === 'Network Error' || m === 'Failed to fetch') {
      return `${m}. Check that the API is reachable (Vite proxy / VITE_API_BASE_URL) and that HTTPS/mixed-content is not blocking the request.`
    }
    return m
  }
  return 'Request failed'
}

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

/**
 * @param {{ username: string, password: string }} payload
 * @returns {Promise<{ accessToken?: string, refreshToken?: string, tokenType?: string, userId?: number, username?: string, role?: string, organizationId?: number }>}
 */
export async function login(payload) {
  try {
    const res = await authApi.post('/api/admin/auth/login', payload)
    return unwrapApiResponse(res)
  } catch (e) {
    throw new Error(getApiErrorMessage(e))
  }
}

/**
 * @param {{
 *   organizationName: string
 *   organizationCode: string
 *   adminUsername: string
 *   adminPassword: string
 *   adminEmail: string
 * }} payload
 */
export async function registerOrganization(payload) {
  try {
    const res = await authApi.post('/api/admin/auth/register', payload)
    return unwrapApiResponse(res)
  } catch (e) {
    throw new Error(getApiErrorMessage(e))
  }
}

/**
 * Completes organization registration after email verification (backend creates DB rows).
 * @param {{ email: string, code: string }} payload
 */
export async function verifyEmail(payload) {
  try {
    const res = await authApi.post('/api/admin/auth/verify-email', {
      email: payload.email.trim(),
      code: String(payload.code).trim(),
    })
    return unwrapApiResponse(res)
  } catch (e) {
    throw new Error(getApiErrorMessage(e))
  }
}
