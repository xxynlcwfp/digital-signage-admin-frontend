/** @typedef {'ADMIN' | 'EDITOR' | 'VIEWER'} UserRole */

export const ROLES = Object.freeze({
  ADMIN: 'ADMIN',
  EDITOR: 'EDITOR',
  VIEWER: 'VIEWER',
})

export const DEFAULT_ROLE = ROLES.VIEWER

/**
 * @param {unknown} role
 * @returns {UserRole}
 */
export function normalizeRole(role) {
  if (role === ROLES.ADMIN || role === ROLES.EDITOR || role === ROLES.VIEWER) {
    return role
  }
  return DEFAULT_ROLE
}

/**
 * @param {unknown} role
 */
export function canWrite(role) {
  const r = normalizeRole(role)
  return r === ROLES.ADMIN || r === ROLES.EDITOR
}

/**
 * @param {unknown} role
 */
export function canManageUsers(role) {
  return normalizeRole(role) === ROLES.ADMIN
}

/**
 * @param {unknown} role
 */
export function isAdminRole(role) {
  return normalizeRole(role) === ROLES.ADMIN
}

/**
 * @param {unknown} role
 */
export function isViewerRole(role) {
  return normalizeRole(role) === ROLES.VIEWER
}
