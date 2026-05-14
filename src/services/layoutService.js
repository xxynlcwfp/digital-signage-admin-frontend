import { authApi, getApiErrorMessage } from './authService'

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

/** @typedef {{ templateType: string, displayName: string }} LayoutTemplateResponse */
/** @typedef {{ templateType: string, resolutionWidth: number, resolutionHeight: number, regions: LayoutRegionRequest[] }} LayoutTemplateSkeletonResponse */

/**
 * @typedef {Object} LayoutRegionComponentRequest
 * @property {string} componentType
 * @property {string} configJson
 * @property {number} [sortOrder]
 */

/**
 * @typedef {Object} LayoutRegionRequest
 * @property {string} regionName
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 * @property {number} zIndex
 * @property {LayoutRegionComponentRequest[]} components
 */

/**
 * @typedef {Object} CreateLayoutRequest
 * @property {string} name
 * @property {string} templateType
 * @property {number} resolutionWidth
 * @property {number} resolutionHeight
 * @property {'DRAFT'|'PUBLISHED'|'DISABLED'} status
 * @property {LayoutRegionRequest[]} regions
 */

/**
 * @typedef {Object} UpdateLayoutRequest
 * @property {string} [name]
 * @property {string} [templateType]
 * @property {number} [resolutionWidth]
 * @property {number} [resolutionHeight]
 * @property {'DRAFT'|'PUBLISHED'|'DISABLED'} [status]
 * @property {LayoutRegionRequest[]} regions
 */

export async function listLayoutTemplates() {
  const res = await authApi.get('/api/admin/layout-templates')
  return unwrapApiResponse(res)
}

/**
 * @param {string} templateType
 * @param {number} [width]
 * @param {number} [height]
 */
export async function getLayoutTemplateSkeleton(templateType, width = 1920, height = 1080) {
  const res = await authApi.get(
    `/api/admin/layout-templates/${encodeURIComponent(templateType)}/skeleton`,
    { params: { width, height } },
  )
  return unwrapApiResponse(res)
}

export async function listLayouts() {
  const res = await authApi.get('/api/admin/layouts')
  return unwrapApiResponse(res)
}

export async function getLayout(id) {
  const res = await authApi.get(`/api/admin/layouts/${id}`)
  return unwrapApiResponse(res)
}

export async function deleteLayout(id) {
  const res = await authApi.delete(`/api/admin/layouts/${id}`)
  return unwrapApiResponse(res)
}

/**
 * Normalize configJson to a non-empty JSON string (CreateLayoutRequest / UpdateLayoutRequest).
 * @param {string|undefined|null|unknown} raw
 * @returns {string}
 */
export function normalizeConfigJson(raw) {
  if (raw != null && typeof raw === 'object') {
    try {
      return JSON.stringify(raw)
    } catch {
      return '{}'
    }
  }
  const s = typeof raw === 'string' ? raw.trim() : ''
  if (!s) return '{}'
  try {
    JSON.parse(s)
    return s
  } catch {
    return '{}'
  }
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function toInt(value, fallback) {
  const n = Math.trunc(Number(value))
  return Number.isFinite(n) ? n : fallback
}

/** Jackson may expose region stack order as zIndex, zindex, or z_index (JavaBeans / naming quirks). */
function pickRegionZ(raw, index) {
  const v = raw?.zIndex ?? raw?.z_index ?? raw?.zindex
  return toInt(v, index + 1)
}

/**
 * Wire object for POST/PUT: duplicate z-order keys so Jackson always binds (see jackson-databind #1455 / JavaBeans zIndex).
 * @param {number} z
 * @returns {Record<string, number>}
 */
function zOrderWireFields(z) {
  return {
    zIndex: z,
    zindex: z,
    z_index: z,
  }
}

/**
 * Editor region row → LayoutRegionRequest[] (supports multiple components per region).
 * @param {Array<{
 *   regionName: string
 *   x: number
 *   y: number
 *   width: number
 *   height: number
 *   zIndex: number
 *   components?: Array<{ componentType: string, configJson?: string, sortOrder?: number }>
 *   componentType?: string
 *   configJson?: string
 * }>} regions
 */
export function editorRegionsToLayoutRegionRequests(regions) {
  return (regions || []).map((r, index) => {
    const rawComps =
      r.components && r.components.length > 0
        ? r.components
        : [
            {
              componentType: r.componentType || 'PLAYLIST',
              configJson: r.configJson,
              sortOrder: 0,
            },
          ]
    const components = rawComps.map((c, ci) => ({
      componentType: String(c.componentType || 'PLAYLIST').trim() || 'PLAYLIST',
      configJson: normalizeConfigJson(c.configJson),
      sortOrder: c.sortOrder != null ? toInt(c.sortOrder, ci) : ci,
    }))
    const zIdx = pickRegionZ(r, index)
    return {
      regionName: String(r.regionName || '').trim() || `region-${index + 1}`,
      x: toInt(r?.x, 0),
      y: toInt(r?.y, 0),
      width: Math.max(1, toInt(r?.width, 1)),
      height: Math.max(1, toInt(r?.height, 1)),
      ...zOrderWireFields(zIdx),
      components,
    }
  })
}

/**
 * Final JSON shape for POST/PUT: plain objects only (no spread of UI rows), every zIndex finite.
 * @param {unknown} regionsInput
 */
function wireLayoutRegions(regionsInput) {
  const rows = editorRegionsToLayoutRegionRequests(regionsInput)
  return rows.map((reg, i) => {
    const z = pickRegionZ(reg, i)
    return {
      regionName: String(reg.regionName || '').trim() || `region-${i + 1}`,
      x: toInt(reg.x, 0),
      y: toInt(reg.y, 0),
      width: Math.max(1, toInt(reg.width, 1)),
      height: Math.max(1, toInt(reg.height, 1)),
      ...zOrderWireFields(z),
      components: (reg.components || []).map((c, ci) => ({
        componentType: String(c.componentType || 'PLAYLIST').trim() || 'PLAYLIST',
        configJson: normalizeConfigJson(c.configJson),
        sortOrder: c.sortOrder != null ? toInt(c.sortOrder, ci) : ci,
      })),
    }
  })
}

/**
 * @param {CreateLayoutRequest} body
 */
export async function createLayout(body) {
  const payload = {
    name: String(body?.name ?? '').trim(),
    templateType: String(body?.templateType ?? '').trim(),
    resolutionWidth: Math.max(1, toInt(body?.resolutionWidth, 1920)),
    resolutionHeight: Math.max(1, toInt(body?.resolutionHeight, 1080)),
    status: body?.status,
    regions: wireLayoutRegions(body?.regions),
  }
  const res = await authApi.post('/api/admin/layouts', payload)
  return unwrapApiResponse(res)
}

/**
 * @param {number|string} id
 * @param {UpdateLayoutRequest} body
 */
export async function updateLayout(id, body) {
  if (!body || !Array.isArray(body.regions)) {
    const res = await authApi.put(`/api/admin/layouts/${id}`, body)
    return unwrapApiResponse(res)
  }
  const payload = {
    ...body,
    regions: wireLayoutRegions(body.regions),
  }
  const res = await authApi.put(`/api/admin/layouts/${id}`, payload)
  return unwrapApiResponse(res)
}

/**
 * @param {{
 *   name: string
 *   templateType: string
 *   resolutionWidth: number
 *   resolutionHeight: number
 *   status: 'DRAFT'|'PUBLISHED'|'DISABLED'
 *   regions: Parameters<typeof editorRegionsToLayoutRegionRequests>[0]
 * }} state
 */
export function buildCreateLayoutRequest(state) {
  return {
    name: String(state.name || '').trim(),
    templateType: String(state.templateType || '').trim(),
    resolutionWidth: Math.max(1, toInt(state.resolutionWidth, 1920)),
    resolutionHeight: Math.max(1, toInt(state.resolutionHeight, 1080)),
    status: state.status,
    regions: state.regions,
  }
}

/**
 * Full PUT body from editor (UpdateLayoutRequest: regions required).
 * @param {Parameters<typeof buildCreateLayoutRequest>[0]} state
 */
export function buildUpdateLayoutRequestFromEditor(state) {
  return {
    name: String(state.name || '').trim(),
    templateType: String(state.templateType || '').trim(),
    resolutionWidth: Math.max(1, toInt(state.resolutionWidth, 1920)),
    resolutionHeight: Math.max(1, toInt(state.resolutionHeight, 1080)),
    status: state.status,
    regions: state.regions,
  }
}

/**
 * Re-publish or status-only update from saved LayoutResponse (list page).
 * @param {Record<string, unknown>} layoutResponse
 * @param {Partial<{ status: 'DRAFT'|'PUBLISHED'|'DISABLED' }>} overrides
 */
export function toUpdateLayoutRequest(layoutResponse, overrides = {}) {
  const regions = (layoutResponse.regions || []).map((r, idx) => ({
    regionName: r.regionName,
    x: r.x,
    y: r.y,
    width: r.width,
    height: r.height,
    ...zOrderWireFields(pickRegionZ(r, idx)),
    components: (r.components || []).length
      ? (r.components || []).map((c, ci) => ({
          componentType: c.componentType,
          configJson: normalizeConfigJson(c.configJson),
          sortOrder: c.sortOrder != null ? toInt(c.sortOrder, ci) : ci,
        }))
      : [{ componentType: 'PLAYLIST', configJson: '{}', sortOrder: 0 }],
  }))
  return {
    name: layoutResponse.name,
    templateType: layoutResponse.templateType,
    resolutionWidth: layoutResponse.resolutionWidth,
    resolutionHeight: layoutResponse.resolutionHeight,
    status: overrides.status ?? layoutResponse.status,
    regions,
  }
}

export { getApiErrorMessage }
