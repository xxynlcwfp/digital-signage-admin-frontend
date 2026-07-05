/**
 * Axios API base URL from Vite env.
 *
 * Service paths already include `/api/...` (e.g. `/api/admin/auth/login`).
 * An empty base URL keeps requests same-origin so:
 * - dev: Vite proxies `/api` → local backend
 * - prod: Nginx proxies `/api` → backend
 *
 * Set VITE_API_BASE_URL only when the API is on another host (cross-origin).
 */
export function getApiBaseUrl() {
  const raw = import.meta.env.VITE_API_BASE_URL
  if (raw == null || String(raw).trim() === '') {
    return ''
  }
  return String(raw).trim().replace(/\/+$/, '')
}

export const API_BASE_URL = getApiBaseUrl()
