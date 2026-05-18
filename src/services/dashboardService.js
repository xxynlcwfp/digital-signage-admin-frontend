import { authApi, getApiErrorMessage } from './authService'
import { listScreens } from './deviceService'

/** Max screens to query for per-screen log APIs (avoid N+1 explosion). */
const MAX_SCREENS_FOR_LOGS = 30
/** Per-screen page size for events / playback-logs. */
const LOG_PAGE_SIZE = 8
const MAX_RECENT_ALERTS = 20
const MAX_RECENT_ACTIVITIES = 20

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
 * @param {import('axios').AxiosResponse} response
 * @returns {unknown[]}
 */
function unwrapPageContent(response) {
  const data = unwrapApiResponse(response)
  if (data && Array.isArray(data.content)) {
    return data.content
  }
  if (Array.isArray(data)) {
    return data
  }
  return []
}

function bearerHeaders() {
  const token = localStorage.getItem('ds_admin_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/**
 * @returns {Promise<{
 *   screenTotal: number
 *   screenOnline: number
 *   screenSuspect: number
 *   screenOffline: number
 *   screenError: number
 *   playsToday: number
 *   alertsToday: number
 * }>}
 */
export async function fetchAnalyticsDashboard() {
  const res = await authApi.get('/api/admin/analytics/dashboard', {
    headers: bearerHeaders(),
  })
  return unwrapApiResponse(res)
}

/** @returns {Promise<unknown[]>} */
export async function fetchMediaList() {
  const res = await authApi.get('/api/admin/media', { headers: bearerHeaders() })
  return unwrapApiResponse(res)
}

/** @returns {Promise<unknown[]>} */
export async function fetchSchedulesList() {
  const res = await authApi.get('/api/admin/schedules', { headers: bearerHeaders() })
  return unwrapApiResponse(res)
}

/**
 * GET /api/admin/screens/{id}/events (Spring Page)
 * @param {number|string} screenId
 */
export async function fetchScreenEvents(screenId, page = 0, size = LOG_PAGE_SIZE) {
  const res = await authApi.get(`/api/admin/screens/${screenId}/events`, {
    headers: bearerHeaders(),
    params: { page, size, sort: 'createdAt,desc' },
  })
  return unwrapPageContent(res)
}

/**
 * GET /api/admin/screens/{id}/playback-logs (Spring Page)
 * @param {number|string} screenId
 */
export async function fetchScreenPlaybackLogs(screenId, page = 0, size = LOG_PAGE_SIZE) {
  const res = await authApi.get(`/api/admin/screens/${screenId}/playback-logs`, {
    headers: bearerHeaders(),
    params: { page, size, sort: 'playedAt,desc' },
  })
  return unwrapPageContent(res)
}

function formatDateTime(value) {
  if (value == null) return '--'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString()
}

function formatUpdatedAt(d = new Date()) {
  return formatDateTime(d)
}

/** @param {string|number|Date} value */
function sortKey(value) {
  const t = new Date(value).getTime()
  return Number.isNaN(t) ? 0 : t
}

/**
 * @param {{ id?: number, name?: string, deviceCode?: string }} screen
 */
function screenDisplayName(screen) {
  const name = String(screen?.name || '').trim()
  const code = String(screen?.deviceCode || '').trim()
  if (name && code) return `${name} (${code})`
  return name || code || `Screen #${screen?.id ?? '?'}`
}

function buildAlertsAggregateFallback(dashboard) {
  const n = Number(dashboard.alertsToday) || 0
  if (n <= 0) return []
  return [
    {
      id: 'aggregate-alerts-today',
      time: formatUpdatedAt(),
      level: 'INFO',
      screen: '—',
      message: `${n} alert event(s) today (aggregate). Per-device event logs were unavailable or empty.`,
      status: 'OPEN',
    },
  ]
}

function buildActivitiesAggregateFallback(dashboard) {
  const time = formatUpdatedAt()
  const items = [
    {
      id: 'agg-plays-today',
      time,
      action: 'PLAYBACK',
      actor: 'system',
      detail: `Plays recorded today: ${Number(dashboard.playsToday) || 0} (aggregate)`,
    },
  ]
  const suspect = Number(dashboard.screenSuspect) || 0
  const err = Number(dashboard.screenError) || 0
  if (suspect > 0) {
    items.push({
      id: 'agg-suspect-screens',
      time,
      action: 'SCREEN_STATUS',
      actor: 'system',
      detail: `Screens in suspect state: ${suspect}`,
    })
  }
  if (err > 0) {
    items.push({
      id: 'agg-error-screens',
      time,
      action: 'SCREEN_STATUS',
      actor: 'system',
      detail: `Screens in error state: ${err}`,
    })
  }
  return items
}

/**
 * @param {Array<{ id?: number, name?: string, deviceCode?: string }>} screens
 */
async function fetchRecentAlerts(screens) {
  const slice = (screens || []).slice(0, MAX_SCREENS_FOR_LOGS)
  const results = await Promise.allSettled(
    slice.map(async (screen) => {
      const events = await fetchScreenEvents(screen.id)
      const label = screenDisplayName(screen)
      return (events || [])
        .filter((e) => {
          const lvl = String(e?.eventLevel || '').toUpperCase()
          return lvl === 'WARN' || lvl === 'ERROR'
        })
        .map((e) => ({
          id: `event-${screen.id}-${e.id}`,
          time: formatDateTime(e.createdAt),
          _sort: sortKey(e.createdAt),
          level: String(e.eventLevel || 'WARN').toUpperCase(),
          screen: label,
          message:
            (typeof e.message === 'string' && e.message.trim()) ||
            (typeof e.eventType === 'string' && e.eventType.trim()) ||
            'Device event',
          status: 'OPEN',
        }))
    }),
  )

  const failed = results.some((r) => r.status === 'rejected')
  const rows = results
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => r.value)
    .sort((a, b) => b._sort - a._sort)
    .slice(0, MAX_RECENT_ALERTS)
    .map((row) => {
      const rest = { ...row }
      delete rest._sort
      return rest
    })

  return { rows, failed }
}

/**
 * @param {Array<{ id?: number, name?: string, deviceCode?: string }>} screens
 */
async function fetchRecentActivities(screens) {
  const slice = (screens || []).slice(0, MAX_SCREENS_FOR_LOGS)
  const results = await Promise.allSettled(
    slice.map(async (screen) => {
      const logs = await fetchScreenPlaybackLogs(screen.id)
      const label = screenDisplayName(screen)
      return (logs || []).map((log) => {
        const mediaName =
          (typeof log.mediaName === 'string' && log.mediaName.trim()) ||
          (log.mediaId != null ? `Media #${log.mediaId}` : 'media')
        const duration =
          log.durationPlayed != null && Number.isFinite(Number(log.durationPlayed))
            ? ` (${Number(log.durationPlayed)}s)`
            : ''
        return {
          id: `playback-${screen.id}-${log.id}`,
          time: formatDateTime(log.playedAt),
          _sort: sortKey(log.playedAt),
          action: 'PLAYBACK',
          actor: label,
          detail: `Played "${mediaName}"${duration}`,
        }
      })
    }),
  )

  const failed = results.some((r) => r.status === 'rejected')
  const rows = results
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => r.value)
    .sort((a, b) => b._sort - a._sort)
    .slice(0, MAX_RECENT_ACTIVITIES)
    .map((row) => {
      const rest = { ...row }
      delete rest._sort
      return rest
    })

  return { rows, failed }
}

/** Full fallback payload (same shape as dashboard page expects). */
export function getMockDashboardPayload() {
  return {
    summary: {
      totalDevices: 50,
      onlineDevices: 42,
      offlineDevices: 5,
      totalMedia: 318,
      activeSchedules: 12,
    },
    deviceStatus: { online: 42, offline: 5, error: 3 },
    recentAlerts: [
      {
        id: 'a-1',
        time: '2026-05-11 14:05',
        level: 'ERROR',
        screen: 'Lobby Screen A',
        message: 'Failed to download manifest',
        status: 'OPEN',
      },
      {
        id: 'a-2',
        time: '2026-05-11 13:52',
        level: 'WARN',
        screen: 'Mall Entrance',
        message: 'WebSocket disconnected (auto retry)',
        status: 'OPEN',
      },
    ],
    recentActivities: [
      {
        id: 'e-1',
        time: '2026-05-11 14:12',
        action: 'PLAYBACK',
        actor: 'Lobby Screen A',
        detail: 'Played "promo-summer.mp4" (30s)',
      },
    ],
    updatedAt: '2026-05-11 14:15',
  }
}

/**
 * @returns {Promise<{
 *   data: ReturnType<typeof getMockDashboardPayload>
 *   usingMock: boolean
 *   errorMessage: string | null
 *   partialFallback: boolean
 * }>}
 */
export async function loadDashboardData() {
  const mock = getMockDashboardPayload()

  try {
    const dashboard = await fetchAnalyticsDashboard()

    let mediaList = null
    let schedules = null
    let screens = null
    let mediaFailed = false
    let schedulesFailed = false
    let screensFailed = false

    try {
      mediaList = await fetchMediaList()
    } catch {
      mediaFailed = true
    }
    try {
      schedules = await fetchSchedulesList()
    } catch {
      schedulesFailed = true
    }
    try {
      screens = await listScreens()
    } catch {
      screensFailed = true
    }

    const screenRows = Array.isArray(screens) ? screens : []

    let recentAlerts = []
    let recentActivities = []
    let alertsFetchFailed = false
    let activitiesFetchFailed = false

    if (!screensFailed && screenRows.length > 0) {
      const [alertsResult, activitiesResult] = await Promise.all([
        fetchRecentAlerts(screenRows),
        fetchRecentActivities(screenRows),
      ])
      recentAlerts = alertsResult.rows
      recentActivities = activitiesResult.rows
      alertsFetchFailed = alertsResult.failed
      activitiesFetchFailed = activitiesResult.failed
    } else if (screensFailed) {
      alertsFetchFailed = true
      activitiesFetchFailed = true
    }

    if (recentAlerts.length === 0 && (alertsFetchFailed || screensFailed)) {
      recentAlerts = buildAlertsAggregateFallback(dashboard)
    }
    if (recentActivities.length === 0 && (activitiesFetchFailed || screensFailed)) {
      recentActivities = buildActivitiesAggregateFallback(dashboard)
    }

    const totalMedia = Array.isArray(mediaList)
      ? mediaList.length
      : mock.summary.totalMedia

    const activeSchedules = Array.isArray(schedules)
      ? schedules.filter((s) => s && String(s.status) === 'ACTIVE').length
      : mock.summary.activeSchedules

    const data = {
      summary: {
        totalDevices: Number(dashboard.screenTotal) || 0,
        onlineDevices: Number(dashboard.screenOnline) || 0,
        offlineDevices: Number(dashboard.screenOffline) || 0,
        totalMedia,
        activeSchedules,
      },
      deviceStatus: {
        online: Number(dashboard.screenOnline) || 0,
        offline: Number(dashboard.screenOffline) || 0,
        error: (Number(dashboard.screenError) || 0) + (Number(dashboard.screenSuspect) || 0),
      },
      recentAlerts,
      recentActivities,
      updatedAt: formatUpdatedAt(),
    }

    return {
      data,
      usingMock: false,
      errorMessage: null,
      partialFallback:
        mediaFailed ||
        schedulesFailed ||
        screensFailed ||
        alertsFetchFailed ||
        activitiesFetchFailed,
    }
  } catch (e) {
    return {
      data: mock,
      usingMock: true,
      errorMessage: getApiErrorMessage(e),
      partialFallback: false,
    }
  }
}
