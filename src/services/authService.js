import axios from 'axios'

const STORAGE_ACCESS_TOKEN = 'ds_admin_token'
const STORAGE_REFRESH_TOKEN = 'ds_admin_refresh_token'
const STORAGE_USERNAME = 'ds_admin_username'
const STORAGE_USER = 'ds_admin_user'

const AUTH_LOGIN_PATH = '/api/admin/auth/login'
const AUTH_REFRESH_PATH = '/api/admin/auth/refresh'
const USERS_ME_PATH = '/api/admin/users/me'

/**
 * Base URL for API calls. In dev, Vite proxies `/api` to the backend (see vite.config.js).
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

/** @type {Promise<string|null> | null} */
let refreshInFlight = null

/** @type {Set<(authenticated: boolean) => void>} */
const authListeners = new Set()

/**
 * @param {(authenticated: boolean) => void} listener
 * @returns {() => void}
 */
export function subscribeAuthState(listener) {
  authListeners.add(listener)
  return () => authListeners.delete(listener)
}

/** @param {boolean} authenticated */
function notifyAuthState(authenticated) {
  authListeners.forEach((fn) => {
    try {
      fn(authenticated)
    } catch {
      /* ignore listener errors */
    }
  })
}

export function getAccessToken() {
  return localStorage.getItem(STORAGE_ACCESS_TOKEN)
}

export function getRefreshToken() {
  return localStorage.getItem(STORAGE_REFRESH_TOKEN)
}

export function hasStoredSession() {
  return Boolean(getAccessToken() || getRefreshToken())
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
    const err = new Error(msg)
    err.code = body.code
    throw err
  }
  return body.data
}

/**
 * @param {{
 *   accessToken?: string
 *   refreshToken?: string
 *   username?: string
 *   userId?: number
 *   role?: string
 *   organizationId?: number
 * }} data
 */
export function persistSession(data) {
  if (data?.accessToken) {
    localStorage.setItem(STORAGE_ACCESS_TOKEN, data.accessToken)
  }
  if (data?.refreshToken) {
    localStorage.setItem(STORAGE_REFRESH_TOKEN, data.refreshToken)
  }
  if (data?.username) {
    localStorage.setItem(STORAGE_USERNAME, String(data.username).trim())
  }
  if (data?.userId != null || data?.username || data?.role) {
    localStorage.setItem(
      STORAGE_USER,
      JSON.stringify({
        userId: data.userId ?? null,
        username: data.username ?? null,
        role: data.role ?? null,
        organizationId: data.organizationId ?? null,
      }),
    )
  }
  notifyAuthState(true)
}

export function clearSession() {
  localStorage.removeItem(STORAGE_ACCESS_TOKEN)
  localStorage.removeItem(STORAGE_REFRESH_TOKEN)
  localStorage.removeItem(STORAGE_USERNAME)
  localStorage.removeItem(STORAGE_USER)
  notifyAuthState(false)
}

export function getStoredUsername() {
  return localStorage.getItem(STORAGE_USERNAME)?.trim() || ''
}

/**
 * @param {import('axios').InternalAxiosRequestConfig} config
 */
function isAuthExemptRequest(config) {
  const url = String(config?.url || '')
  return (
    url.includes(AUTH_LOGIN_PATH) ||
    url.includes(AUTH_REFRESH_PATH) ||
    url.includes('/auth/register') ||
    url.includes('/auth/verify-email')
  )
}

function redirectToLogin() {
  const path = window.location.pathname || ''
  if (path === '/login' || path.startsWith('/login/')) {
    return
  }
  window.location.assign('/login')
}

/**
 * POST /api/admin/auth/refresh — single-flight, no response interceptor retry.
 * @returns {Promise<string|null>}
 */
export async function refreshAccessToken() {
  if (refreshInFlight) {
    return refreshInFlight
  }

  refreshInFlight = (async () => {
    const refreshToken = getRefreshToken()
    if (!refreshToken) {
      throw new Error('No refresh token')
    }

    const res = await authApi.post(
      AUTH_REFRESH_PATH,
      { refreshToken },
      { skipAuthRefresh: true },
    )
    const data = unwrapApiResponse(res)
    if (!data?.accessToken) {
      throw new Error('Refresh did not return an access token')
    }
    persistSession(data)
    return data.accessToken
  })()

  try {
    return await refreshInFlight
  } finally {
    refreshInFlight = null
  }
}

/**
 * GET /api/admin/users/me — validates current access token.
 */
export async function fetchCurrentUser() {
  const res = await authApi.get(USERS_ME_PATH, { skipAuthRefresh: true })
  const user = unwrapApiResponse(res)
  if (user?.username) {
    localStorage.setItem(STORAGE_USERNAME, String(user.username).trim())
  }
  if (user) {
    localStorage.setItem(
      STORAGE_USER,
      JSON.stringify({
        userId: user.id ?? null,
        username: user.username ?? null,
        role: user.role ?? null,
        organizationId: user.organizationId ?? null,
      }),
    )
  }
  return user
}

/**
 * Restore session on app load: validate access token or refresh, then optional /me.
 * @returns {Promise<{ authenticated: boolean }>}
 */
export async function bootstrapSession() {
  if (!hasStoredSession()) {
    return { authenticated: false }
  }

  if (getAccessToken()) {
    try {
      await fetchCurrentUser()
      notifyAuthState(true)
      return { authenticated: true }
    } catch (e) {
      const status = e?.response?.status
      const code = e?.response?.data?.code
      if (status !== 401 && code !== 401 && !getRefreshToken()) {
        clearSession()
        return { authenticated: false }
      }
    }
  }

  if (getRefreshToken()) {
    try {
      await refreshAccessToken()
      await fetchCurrentUser()
      notifyAuthState(true)
      return { authenticated: true }
    } catch {
      clearSession()
      return { authenticated: false }
    }
  }

  clearSession()
  return { authenticated: false }
}

export function clearSessionAndRedirect() {
  clearSession()
  redirectToLogin()
}

// --- Axios interceptors (must run after authApi is created) ---

authApi.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) {
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

authApi.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error?.config
    if (!original || original.skipAuthRefresh || original._authRetried) {
      return Promise.reject(error)
    }

    const status = error?.response?.status
    const bodyCode = error?.response?.data?.code
    const isUnauthorized = status === 401 || bodyCode === 401

    if (!isUnauthorized || isAuthExemptRequest(original)) {
      return Promise.reject(error)
    }

    if (!getRefreshToken()) {
      clearSessionAndRedirect()
      return Promise.reject(error)
    }

    original._authRetried = true

    try {
      const newToken = await refreshAccessToken()
      original.headers = original.headers || {}
      original.headers.Authorization = `Bearer ${newToken}`
      return authApi(original)
    } catch {
      clearSessionAndRedirect()
      return Promise.reject(error)
    }
  },
)

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
 * @param {{ username: string, password: string }} payload
 */
export async function login(payload) {
  try {
    const res = await authApi.post(AUTH_LOGIN_PATH, payload, { skipAuthRefresh: true })
    const data = unwrapApiResponse(res)
    persistSession(data)
    return data
  } catch (e) {
    throw new Error(getApiErrorMessage(e))
  }
}

export async function registerOrganization(payload) {
  try {
    const res = await authApi.post('/api/admin/auth/register', payload, { skipAuthRefresh: true })
    return unwrapApiResponse(res)
  } catch (e) {
    throw new Error(getApiErrorMessage(e))
  }
}

export async function verifyEmail(payload) {
  try {
    const res = await authApi.post(
      '/api/admin/auth/verify-email',
      {
        email: payload.email.trim(),
        code: String(payload.code).trim(),
      },
      { skipAuthRefresh: true },
    )
    return unwrapApiResponse(res)
  } catch (e) {
    throw new Error(getApiErrorMessage(e))
  }
}
