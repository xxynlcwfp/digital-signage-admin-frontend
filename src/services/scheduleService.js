import { authApi, getApiErrorMessage } from './authService'

/** @typedef {'SCREEN' | 'GROUP' | 'DEFAULT'} ScheduleTargetType */
/** @typedef {'DRAFT' | 'ACTIVE' | 'ENDED' | 'CANCELLED'} ScheduleStatus */

/** Backend ScheduleTargetType — API value for screen groups is `GROUP` (not SCREEN_GROUP). */
export const SCHEDULE_TARGET_TYPES = Object.freeze({
  SCREEN: 'SCREEN',
  GROUP: 'GROUP',
  DEFAULT: 'DEFAULT',
})

/** Backend ScheduleStatus — ended schedules use `ENDED` (not EXPIRED). */
export const SCHEDULE_STATUSES = Object.freeze({
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  ENDED: 'ENDED',
  CANCELLED: 'CANCELLED',
})

/**
 * @typedef {Object} ScheduleResponse
 * @property {number} id
 * @property {string} name
 * @property {ScheduleTargetType} targetType
 * @property {number} [screenId]
 * @property {number} [screenGroupId]
 * @property {number} layoutId
 * @property {number} playlistId
 * @property {string} startDatetime
 * @property {string} endDatetime
 * @property {number} priority
 * @property {ScheduleStatus} status
 */

/**
 * @typedef {Object} CreateScheduleRequest
 * @property {string} name
 * @property {ScheduleTargetType} targetType
 * @property {number} [screenId]
 * @property {number} [screenGroupId]
 * @property {number} layoutId
 * @property {number} playlistId
 * @property {string} startDatetime
 * @property {string} endDatetime
 * @property {number} priority
 * @property {ScheduleStatus} status
 */

/** @typedef {CreateScheduleRequest} UpdateScheduleRequest */

/**
 * @typedef {Object} ScheduleConflictCheckRequest
 * @property {number} [excludeScheduleId]
 * @property {ScheduleTargetType} targetType
 * @property {number} [screenId]
 * @property {number} [screenGroupId]
 * @property {string} startDatetime
 * @property {string} endDatetime
 */

/**
 * @typedef {Object} ScheduleConflictCheckResponse
 * @property {boolean} conflict
 * @property {number[]} [conflictingScheduleIds]
 */

export class ScheduleConflictError extends Error {
  /**
   * @param {number[]} conflictingScheduleIds
   */
  constructor(conflictingScheduleIds) {
    const ids = (conflictingScheduleIds || []).filter((id) => id != null)
    super(
      ids.length
        ? `Schedule time range conflicts with existing schedule(s): ${ids.join(', ')}`
        : 'Schedule time range conflicts with an existing schedule',
    )
    this.name = 'ScheduleConflictError'
    this.conflictingScheduleIds = ids
  }
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
 * @param {unknown} error
 * @returns {string}
 */
export function getScheduleApiErrorMessage(error) {
  if (error instanceof ScheduleConflictError) {
    return error.message
  }
  if (error?.message && typeof error.message === 'string') {
    return error.message
  }
  return getApiErrorMessage(error)
}

/**
 * @param {import('dayjs').Dayjs | Date | string} value
 * @returns {string}
 */
export function toApiDateTime(value) {
  const d = value && typeof value.format === 'function' ? value : null
  if (d) {
    return d.format('YYYY-MM-DDTHH:mm:ss')
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const pad = (n) => String(n).padStart(2, '0')
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`
  }
  if (typeof value === 'string' && value.trim()) {
    return value.trim()
  }
  throw new Error('Invalid date/time')
}

/**
 * Build CreateScheduleRequest / UpdateScheduleRequest from form values.
 * @param {{
 *   name: string
 *   targetType: ScheduleTargetType
 *   screenId?: number
 *   screenGroupId?: number
 *   layoutId: number
 *   playlistId: number
 *   startDatetime: import('dayjs').Dayjs
 *   endDatetime: import('dayjs').Dayjs
 *   priority: number
 *   status: ScheduleStatus
 * }} values
 * @returns {CreateScheduleRequest}
 */
export function formValuesToScheduleRequest(values) {
  const targetType = values.targetType
  const body = {
    name: String(values.name || '').trim(),
    targetType,
    layoutId: Number(values.layoutId),
    playlistId: Number(values.playlistId),
    startDatetime: toApiDateTime(values.startDatetime),
    endDatetime: toApiDateTime(values.endDatetime),
    priority: Math.trunc(Number(values.priority)),
    status: values.status,
  }

  if (targetType === SCHEDULE_TARGET_TYPES.SCREEN) {
    body.screenId = Number(values.screenId)
    body.screenGroupId = null
  } else if (targetType === SCHEDULE_TARGET_TYPES.GROUP) {
    body.screenGroupId = Number(values.screenGroupId)
    body.screenId = null
  } else {
    body.screenId = null
    body.screenGroupId = null
  }

  return body
}

/**
 * @param {CreateScheduleRequest} request
 * @param {number} [excludeScheduleId]
 * @returns {ScheduleConflictCheckRequest}
 */
export function toConflictCheckRequest(request, excludeScheduleId) {
  return {
    ...(excludeScheduleId != null ? { excludeScheduleId } : {}),
    targetType: request.targetType,
    screenId: request.screenId ?? undefined,
    screenGroupId: request.screenGroupId ?? undefined,
    startDatetime: request.startDatetime,
    endDatetime: request.endDatetime,
  }
}

/** @returns {Promise<ScheduleResponse[]>} */
export async function listSchedules() {
  const res = await authApi.get('/api/admin/schedules')
  return unwrapApiResponse(res)
}

/** @returns {Promise<ScheduleResponse>} */
export async function getSchedule(id) {
  const res = await authApi.get(`/api/admin/schedules/${id}`)
  return unwrapApiResponse(res)
}

/**
 * @param {CreateScheduleRequest} body
 * @param {{ skipConflictCheck?: boolean }} [options]
 * @returns {Promise<ScheduleResponse>}
 */
export async function createSchedule(body, options = {}) {
  if (!options.skipConflictCheck) {
    const check = await checkScheduleConflict(toConflictCheckRequest(body))
    if (check.conflict) {
      throw new ScheduleConflictError(check.conflictingScheduleIds)
    }
  }
  const res = await authApi.post('/api/admin/schedules', body)
  return unwrapApiResponse(res)
}

/**
 * @param {number|string} id
 * @param {UpdateScheduleRequest} body
 * @param {{ skipConflictCheck?: boolean }} [options]
 * @returns {Promise<ScheduleResponse>}
 */
export async function updateSchedule(id, body, options = {}) {
  if (!options.skipConflictCheck) {
    const check = await checkScheduleConflict(toConflictCheckRequest(body, Number(id)))
    if (check.conflict) {
      throw new ScheduleConflictError(check.conflictingScheduleIds)
    }
  }
  const res = await authApi.put(`/api/admin/schedules/${id}`, body)
  return unwrapApiResponse(res)
}

/** @param {number|string} id */
export async function deleteSchedule(id) {
  const res = await authApi.delete(`/api/admin/schedules/${id}`)
  return unwrapApiResponse(res)
}

/**
 * @param {ScheduleConflictCheckRequest} body
 * @returns {Promise<ScheduleConflictCheckResponse>}
 */
export async function checkScheduleConflict(body) {
  const res = await authApi.post('/api/admin/schedules/check-conflict', body)
  return unwrapApiResponse(res)
}

export { getApiErrorMessage }
