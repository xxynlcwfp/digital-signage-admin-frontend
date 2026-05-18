import { authApi, getApiErrorMessage } from './authService'

/**
 * Admin users → `/api/admin/users` (UserController, CreateUserRequest, UpdateUserRequest, UserResponse).
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
    const err = new Error(msg)
    err.code = body.code
    throw err
  }
  return body.data
}

export async function listUsers() {
  const res = await authApi.get('/api/admin/users')
  return unwrapApiResponse(res)
}

export async function getUser(id) {
  const res = await authApi.get(`/api/admin/users/${id}`)
  return unwrapApiResponse(res)
}

/**
 * @param {{ username: string, password: string, email?: string, role: string }} payload
 */
export async function createUser(payload) {
  const body = {
    username: String(payload.username).trim(),
    password: payload.password,
    role: payload.role,
  }
  if (payload.email != null && String(payload.email).trim() !== '') {
    body.email = String(payload.email).trim()
  }
  const res = await authApi.post('/api/admin/users', body)
  return unwrapApiResponse(res)
}

/**
 * @param {number|string} id
 * @param {{ email?: string, role?: string, status?: string, password?: string }} payload
 */
export async function updateUser(id, payload) {
  const body = {}
  if (payload.email !== undefined) {
    body.email = payload.email == null || String(payload.email).trim() === '' ? null : String(payload.email).trim()
  }
  if (payload.role != null) {
    body.role = payload.role
  }
  if (payload.status != null) {
    body.status = payload.status
  }
  if (payload.password != null && String(payload.password) !== '') {
    body.password = payload.password
  }
  const res = await authApi.put(`/api/admin/users/${id}`, body)
  return unwrapApiResponse(res)
}

export async function deleteUser(id) {
  const res = await authApi.delete(`/api/admin/users/${id}`)
  return unwrapApiResponse(res)
}

export { getApiErrorMessage }
