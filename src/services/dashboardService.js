import { authApi, getApiErrorMessage } from './authService'

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

function formatUpdatedAt(d = new Date()) {
  try {
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '--'
  }
}

function buildAlertsFromDashboard(dashboard) {
  const n = Number(dashboard.alertsToday) || 0
  if (n <= 0) return []
  return [
    {
      id: 'aggregate-alerts-today',
      time: formatUpdatedAt(),
      level: 'INFO',
      screen: '—',
      message: `${n} device alert event(s) today (organization aggregate). Use Device Management → screen detail for per-device logs.`,
      status: 'OPEN',
    },
  ]
}

function buildActivitiesFromDashboard(dashboard) {
  const time = formatUpdatedAt()
  const items = [
    {
      id: 'agg-plays-today',
      time,
      action: 'PLAYBACK',
      actor: 'system',
      detail: `Plays recorded today: ${Number(dashboard.playsToday) || 0}`,
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
      {
        id: 'a-3',
        time: '2026-05-11 12:20',
        level: 'INFO',
        screen: 'Meeting Room 3F',
        message: 'New layout version published',
        status: 'RESOLVED',
      },
    ],
    recentActivities: [
      {
        id: 'e-1',
        time: '2026-05-11 14:12',
        action: 'PUBLISH_LAYOUT',
        actor: 'admin',
        detail: 'Publish layout: Lobby Layout A (v3)',
      },
      {
        id: 'e-2',
        time: '2026-05-11 13:40',
        action: 'UPLOAD_MEDIA',
        actor: 'admin',
        detail: 'Upload media: promo-summer.mp4',
      },
      {
        id: 'e-3',
        time: '2026-05-11 11:05',
        action: 'CREATE_SCHEDULE',
        actor: 'operator',
        detail: 'Create schedule: Morning Lobby Schedule (SCREEN-001)',
      },
    ],
    updatedAt: '2026-05-11 14:15',
  }
}

/**
 * Loads dashboard metrics: analytics API plus optional media/schedule list for counts.
 * On analytics failure, returns mock payload and errorMessage.
 *
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
    let mediaFailed = false
    let schedulesFailed = false

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
      recentAlerts: buildAlertsFromDashboard(dashboard),
      recentActivities: buildActivitiesFromDashboard(dashboard),
      updatedAt: formatUpdatedAt(),
    }

    return {
      data,
      usingMock: false,
      errorMessage: null,
      partialFallback: mediaFailed || schedulesFailed,
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
