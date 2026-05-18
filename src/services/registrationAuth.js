import {
  clearApplyViewerOnLogin,
  fetchCurrentUser,
  refreshAccessToken,
  shouldApplyViewerOnLogin,
} from './authService'
import { updateUser } from './userService'

/**
 * After org registration verify, backend creates ADMIN. On first login, demote to VIEWER
 * and refresh tokens so JWT authorities match the database role.
 * @param {import('./authService').LoginResponseLike} loginData
 */
export async function applyViewerRoleAfterRegistration(loginData) {
  if (!shouldApplyViewerOnLogin()) {
    return loginData
  }
  clearApplyViewerOnLogin()

  if (loginData?.role !== 'ADMIN' || loginData?.userId == null) {
    return loginData
  }

  try {
    await updateUser(loginData.userId, { role: 'VIEWER' })
    await refreshAccessToken()
    const me = await fetchCurrentUser()
    return {
      ...loginData,
      role: me?.role ?? 'VIEWER',
      username: me?.username ?? loginData.username,
      organizationId: me?.organizationId ?? loginData.organizationId,
    }
  } catch {
    return loginData
  }
}

/**
 * @typedef {object} LoginResponseLike
 * @property {string} [accessToken]
 * @property {string} [refreshToken]
 * @property {number} [userId]
 * @property {string} [username]
 * @property {string} [role]
 * @property {number} [organizationId]
 */
