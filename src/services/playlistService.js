import { authApi, getApiErrorMessage } from './authService'

/** @typedef {'ACTIVE' | 'ARCHIVED'} PlaylistStatus */

/**
 * @typedef {Object} PlaylistItemResponse
 * @property {number} id
 * @property {number} mediaId
 * @property {number} orderIndex
 * @property {number} [durationSeconds]
 */

/**
 * @typedef {Object} PlaylistResponse
 * @property {number} id
 * @property {string} name
 * @property {PlaylistStatus} [status]
 * @property {PlaylistItemResponse[]} [items]
 */

/**
 * @typedef {Object} PlaylistItemRequest
 * @property {number} mediaId
 * @property {number} [durationSeconds]
 * @property {number} [orderIndex]
 */

/**
 * @typedef {Object} CreatePlaylistRequest
 * @property {string} name
 * @property {PlaylistStatus} status
 * @property {PlaylistItemRequest[]} items
 */

/** @typedef {CreatePlaylistRequest} UpdatePlaylistRequest */

export const PLAYLIST_STATUSES = Object.freeze({
  ACTIVE: 'ACTIVE',
  ARCHIVED: 'ARCHIVED',
})

/**
 * @typedef {Object} PlaylistOption
 * @property {number} id
 * @property {string} name
 * @property {string} [status]
 * @property {number} itemCount
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

/** @returns {Promise<PlaylistResponse[]>} */
export async function listPlaylists() {
  const res = await authApi.get('/api/admin/playlists')
  const data = unwrapApiResponse(res)
  return Array.isArray(data) ? data : []
}

/** @returns {Promise<PlaylistResponse>} */
export async function getPlaylist(id) {
  const res = await authApi.get(`/api/admin/playlists/${id}`)
  return unwrapApiResponse(res)
}

/**
 * @param {CreatePlaylistRequest} body
 * @returns {Promise<PlaylistResponse>}
 */
export async function createPlaylist(body) {
  const res = await authApi.post('/api/admin/playlists', body)
  return unwrapApiResponse(res)
}

/**
 * @param {number|string} id
 * @param {UpdatePlaylistRequest} body
 * @returns {Promise<PlaylistResponse>}
 */
export async function updatePlaylist(id, body) {
  const res = await authApi.put(`/api/admin/playlists/${id}`, body)
  return unwrapApiResponse(res)
}

/** @param {number|string} id */
export async function deletePlaylist(id) {
  const res = await authApi.delete(`/api/admin/playlists/${id}`)
  return unwrapApiResponse(res)
}

/**
 * @param {number|string} playlistId
 * @param {number[]} itemIdsInOrder
 * @returns {Promise<PlaylistResponse>}
 */
export async function reorderPlaylistItems(playlistId, itemIdsInOrder) {
  const res = await authApi.put(`/api/admin/playlists/${playlistId}/items/order`, {
    itemIdsInOrder,
  })
  return unwrapApiResponse(res)
}

/**
 * @param {Array<{ mediaId: number, durationSeconds?: number | null }>} rows
 * @returns {PlaylistItemRequest[]}
 */
export function editorRowsToPlaylistItems(rows) {
  return (rows || []).map((row, index) => {
    const mediaId = Number(row.mediaId)
    const durationRaw = row.durationSeconds
    const item = {
      mediaId,
      orderIndex: index,
    }
    if (durationRaw != null && durationRaw !== '' && Number.isFinite(Number(durationRaw))) {
      item.durationSeconds = Math.max(1, Math.trunc(Number(durationRaw)))
    }
    return item
  })
}

/**
 * @param {PlaylistItemResponse[]} [items]
 * @returns {Array<{ key: string, mediaId: number, durationSeconds: number | undefined }>}
 */
export function playlistItemsToEditorRows(items) {
  const sorted = [...(items || [])].sort(
    (a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0),
  )
  return sorted.map((it, i) => ({
    key: it.id != null ? `item-${it.id}` : `new-${i}-${it.mediaId}`,
    mediaId: it.mediaId,
    durationSeconds:
      it.durationSeconds != null && Number.isFinite(Number(it.durationSeconds))
        ? Number(it.durationSeconds)
        : undefined,
  }))
}

/**
 * @param {PlaylistResponse} row
 * @returns {PlaylistOption | null}
 */
export function toPlaylistOption(row) {
  if (row == null || row.id == null) return null
  const id = Number(row.id)
  if (!Number.isFinite(id)) return null
  const name = String(row.name || '').trim() || `Playlist #${id}`
  const itemCount = Array.isArray(row.items) ? row.items.length : 0
  return {
    id,
    name,
    status: row.status,
    itemCount,
  }
}

/** @returns {Promise<PlaylistOption[]>} */
export async function listPlaylistOptions() {
  const rows = await listPlaylists()
  return rows.map(toPlaylistOption).filter((p) => p != null)
}

/** Dev fallback when playlist API is unreachable. */
export function getMockPlaylists() {
  return [
    {
      id: 9001,
      name: 'Lobby loop (mock)',
      status: PLAYLIST_STATUSES.ACTIVE,
      items: [
        { id: 1, mediaId: 1, orderIndex: 0, durationSeconds: 10 },
        { id: 2, mediaId: 2, orderIndex: 1, durationSeconds: 15 },
      ],
    },
  ]
}

export { getApiErrorMessage }
