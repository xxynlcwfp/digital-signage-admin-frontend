import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Alert,
  Button,
  Card,
  Col,
  Divider,
  Form,
  Input,
  List,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd'
import {
  ArrowLeftOutlined,
  CloudUploadOutlined,
  ReloadOutlined,
  SaveOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import LayoutPreviewCanvas from '../../components/LayoutPreviewCanvas'
import { canWrite } from '../../services/authService'
import {
  assignScreenGroup,
  getApiErrorMessage,
  getScreen,
  listScreenGroups,
  updateScreen,
} from '../../services/deviceService'
import { getLayout, listLayouts } from '../../services/layoutService'
import { listMedia } from '../../services/mediaService'
import { getPlaylist, listPlaylistOptions } from '../../services/playlistService'
import {
  SCHEDULE_STATUSES,
  SCHEDULE_TARGET_TYPES,
  createSchedule,
  formValuesToScheduleRequest,
  getSchedule,
  getScheduleApiErrorMessage,
  resolveScheduleForScreen,
  updateSchedule,
} from '../../services/scheduleService'

function formatStatus(status) {
  const map = {
    ONLINE: { color: 'green', label: 'Online' },
    OFFLINE: { color: 'default', label: 'Offline' },
    ERROR: { color: 'red', label: 'Error' },
    SUSPECT: { color: 'gold', label: 'Suspect' },
  }
  return map[status] || { color: 'default', label: String(status || '-') }
}

function formatActivation(activationStatus) {
  const map = {
    ACTIVATED: { color: 'green', label: 'ACTIVATED' },
    PENDING: { color: 'gold', label: 'PENDING' },
    REVOKED: { color: 'red', label: 'REVOKED' },
  }
  return map[activationStatus] || { color: 'default', label: String(activationStatus || '-') }
}

function formatWs(wsStatus) {
  const map = {
    CONNECTED: { color: 'green', label: 'CONNECTED' },
    DISCONNECTED: { color: 'default', label: 'DISCONNECTED' },
  }
  return map[wsStatus] || { color: 'default', label: String(wsStatus || '-') }
}

function formatDateTime(value) {
  if (value == null) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString()
}

function isNoActiveConfigMessage(msg) {
  return String(msg || '')
    .toLowerCase()
    .includes('no active configuration')
}

function contentStatusLabel(screen, resolvedConfig, configError, noActiveSchedule) {
  if (configError) return { text: 'Config unavailable', tone: 'warning' }
  if (noActiveSchedule || !resolvedConfig) return { text: 'No active schedule', tone: 'default' }
  if (screen?.status === 'ONLINE' && screen?.wsStatus === 'CONNECTED') {
    return { text: 'Schedule resolved — ready to push', tone: 'success' }
  }
  if (screen?.status === 'OFFLINE' || screen?.wsStatus === 'DISCONNECTED') {
    return { text: 'Player offline — push when online', tone: 'warning' }
  }
  return { text: 'Schedule resolved', tone: 'default' }
}

function enrichPlaylistItemForDisplay(item, mediaCatalog) {
  const m = item?.mediaId != null ? mediaCatalog.get(Number(item.mediaId)) : null
  return {
    ...item,
    name: item?.name ?? m?.name ?? m?.title,
    mediaType: item?.mediaType ?? m?.mediaType ?? m?.type,
    fileUrl: item?.fileUrl ?? m?.fileUrl,
    thumbnailUrl: item?.thumbnailUrl ?? m?.thumbnailUrl,
    durationSeconds: item?.durationSeconds ?? m?.durationSeconds,
  }
}

/** Build media map from resolve playlist items (ActiveConfigResponse). */
function buildMediaByIdFromResolve(playlist) {
  const map = new Map()
  const items = Array.isArray(playlist?.items) ? playlist.items : []
  for (const item of items) {
    if (item?.mediaId == null) continue
    map.set(Number(item.mediaId), {
      thumbnailUrl: item.thumbnailUrl,
      fileUrl: item.fileUrl,
      type: item.mediaType,
      title: item.name,
    })
  }
  return map
}

function buildScreenSchedulePayload(values, activeSchedule, screen) {
  const layoutId = values.layoutId
  const playlistId = values.playlistId
  if (activeSchedule?.id) {
    return {
      scheduleId: activeSchedule.id,
      body: formValuesToScheduleRequest({
        name: activeSchedule.name,
        targetType: activeSchedule.targetType,
        screenId: activeSchedule.screenId,
        screenGroupId: activeSchedule.screenGroupId,
        layoutId,
        playlistId,
        startDatetime: dayjs(activeSchedule.startDatetime),
        endDatetime: dayjs(activeSchedule.endDatetime),
        priority: activeSchedule.priority,
        status: activeSchedule.status,
      }),
    }
  }
  const screenName = String(values.name ?? screen?.name ?? '').trim() || `Screen ${screen?.id}`
  return {
    scheduleId: null,
    body: formValuesToScheduleRequest({
      name: `${screenName} schedule`,
      targetType: SCHEDULE_TARGET_TYPES.SCREEN,
      screenId: Number(screen.id),
      layoutId,
      playlistId,
      startDatetime: dayjs().startOf('day'),
      endDatetime: dayjs().add(1, 'year').endOf('day'),
      priority: 10,
      status: SCHEDULE_STATUSES.ACTIVE,
    }),
  }
}

async function persistScreenSchedule(values, activeSchedule, screen) {
  const { scheduleId, body } = buildScreenSchedulePayload(values, activeSchedule, screen)
  if (scheduleId != null) {
    return updateSchedule(scheduleId, body)
  }
  return createSchedule(body)
}

const cardStyle = {
  borderRadius: 12,
  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.06), 0 12px 32px rgba(15, 23, 42, 0.06)',
}

function StatusRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
      <Typography.Text type="secondary">{label}</Typography.Text>
      <div style={{ textAlign: 'right' }}>{value}</div>
    </div>
  )
}

function PreviewEmptyState({ noActiveSchedule, configError }) {
  if (configError) {
    return (
      <Alert type="warning" showIcon message="Preview unavailable" description={configError} style={{ marginBottom: 0 }} />
    )
  }
  if (noActiveSchedule) {
    return (
      <div
        style={{
          padding: 24,
          textAlign: 'center',
          borderRadius: 8,
          background: '#f1f5f9',
          border: '1px dashed #cbd5e1',
        }}
      >
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          No ACTIVE schedule targets this screen right now.
        </Typography.Text>
        <div style={{ marginTop: 8 }}>
          <Link to="/schedules">Create or activate a schedule</Link>
        </div>
      </div>
    )
  }
  return null
}

export default function ScreenDetailPage() {
  const { screenId } = useParams()
  const navigate = useNavigate()
  const canMutate = canWrite()
  const [form] = Form.useForm()

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [screen, setScreen] = useState(null)
  const [groups, setGroups] = useState([])
  const [resolvedConfig, setResolvedConfig] = useState(null)
  const [configError, setConfigError] = useState(null)
  const [noActiveSchedule, setNoActiveSchedule] = useState(false)
  const [activeSchedule, setActiveSchedule] = useState(null)
  const [layouts, setLayouts] = useState([])
  const [playlists, setPlaylists] = useState([])
  const [mediaCatalog, setMediaCatalog] = useState(() => new Map())
  const [optionsLoading, setOptionsLoading] = useState(false)
  const [draftLayout, setDraftLayout] = useState(null)
  const [draftPlaylistDetail, setDraftPlaylistDetail] = useState(null)
  const [previewFetching, setPreviewFetching] = useState(false)

  const watchedLayoutId = Form.useWatch('layoutId', form)
  const watchedPlaylistId = Form.useWatch('playlistId', form)

  const [saving, setSaving] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [pushModalOpen, setPushModalOpen] = useState(false)
  const [activeItemIndex, setActiveItemIndex] = useState(0)

  const loadScreen = useCallback(async () => {
    if (screenId == null) return
    setLoading(true)
    setLoadError(null)
    setConfigError(null)
    setNoActiveSchedule(false)
    try {
      setOptionsLoading(true)
      const [row, gList, layoutList, playlistList, mediaList] = await Promise.all([
        getScreen(screenId),
        listScreenGroups(),
        listLayouts(),
        listPlaylistOptions(),
        listMedia(),
      ])
      setScreen(row)
      setGroups(Array.isArray(gList) ? gList : [])
      setLayouts(Array.isArray(layoutList) ? layoutList : [])
      setPlaylists(Array.isArray(playlistList) ? playlistList : [])

      const catalog = new Map()
      for (const m of Array.isArray(mediaList) ? mediaList : []) {
        if (m?.id != null) catalog.set(Number(m.id), m)
      }
      setMediaCatalog(catalog)

      const baseFields = {
        name: row?.name ?? '',
        screenGroupId: row?.screenGroupId ?? undefined,
      }

      try {
        const config = await resolveScheduleForScreen(screenId)
        setResolvedConfig(config)
        setActiveItemIndex(0)
        setNoActiveSchedule(false)

        let schedule = null
        if (config?.scheduleId != null) {
          try {
            schedule = await getSchedule(config.scheduleId)
          } catch {
            schedule = null
          }
        }
        setActiveSchedule(schedule)

        form.setFieldsValue({
          ...baseFields,
          layoutId: config?.layout?.id ?? schedule?.layoutId ?? undefined,
          playlistId: config?.playlist?.id ?? schedule?.playlistId ?? undefined,
        })
      } catch (e) {
        setResolvedConfig(null)
        setActiveSchedule(null)
        form.setFieldsValue({
          ...baseFields,
          layoutId: undefined,
          playlistId: undefined,
        })
        const msg = getApiErrorMessage(e)
        if (isNoActiveConfigMessage(msg)) {
          setNoActiveSchedule(true)
        } else {
          setConfigError(msg)
        }
      }
    } catch (e) {
      setLoadError(getApiErrorMessage(e))
      setScreen(null)
    } finally {
      setOptionsLoading(false)
      setLoading(false)
    }
  }, [form, screenId])

  useEffect(() => {
    loadScreen()
  }, [loadScreen])

  const groupOptions = useMemo(
    () =>
      groups.map((g) => ({
        value: g.id,
        label: g.location ? `${g.name} (${g.location})` : g.name,
      })),
    [groups],
  )

  const layoutOptions = useMemo(
    () => layouts.map((l) => ({ value: l.id, label: l.name })),
    [layouts],
  )

  const playlistOptions = useMemo(
    () =>
      playlists.map((p) => ({
        value: p.id,
        label:
          p.itemCount > 0
            ? `${p.name} (${p.itemCount} item${p.itemCount === 1 ? '' : 's'})`
            : p.name,
      })),
    [playlists],
  )

  const layoutMap = useMemo(() => new Map(layouts.map((l) => [l.id, l.name])), [layouts])
  const playlistMap = useMemo(() => new Map(playlists.map((p) => [p.id, p.name])), [playlists])

  useEffect(() => {
    if (watchedLayoutId == null || watchedLayoutId === '') {
      setDraftLayout(null)
      return undefined
    }
    let cancelled = false
    setPreviewFetching(true)
    ;(async () => {
      try {
        const detail = await getLayout(watchedLayoutId)
        if (!cancelled) setDraftLayout(detail)
      } catch {
        if (!cancelled) setDraftLayout(null)
      } finally {
        if (!cancelled) setPreviewFetching(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [watchedLayoutId])

  useEffect(() => {
    if (watchedPlaylistId == null || watchedPlaylistId === '') {
      setDraftPlaylistDetail(null)
      setActiveItemIndex(0)
      return undefined
    }
    let cancelled = false
    setPreviewFetching(true)
    ;(async () => {
      try {
        const detail = await getPlaylist(watchedPlaylistId)
        if (!cancelled) {
          setDraftPlaylistDetail(detail)
          setActiveItemIndex(0)
        }
      } catch {
        if (!cancelled) setDraftPlaylistDetail(null)
      } finally {
        if (!cancelled) setPreviewFetching(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [watchedPlaylistId])

  const usingDraftPreview = watchedLayoutId != null && watchedPlaylistId != null

  const resolvedPlaylistItems = useMemo(() => {
    const items = resolvedConfig?.playlist?.items
    if (!Array.isArray(items)) return []
    return [...items].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
  }, [resolvedConfig])

  const draftPlaylistItems = useMemo(() => {
    const items = draftPlaylistDetail?.items
    if (!Array.isArray(items)) return []
    return [...items]
      .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
      .map((item) => enrichPlaylistItemForDisplay(item, mediaCatalog))
  }, [draftPlaylistDetail, mediaCatalog])

  const playlistItems = usingDraftPreview ? draftPlaylistItems : resolvedPlaylistItems

  const mediaById = useMemo(() => {
    if (usingDraftPreview) return mediaCatalog
    return buildMediaByIdFromResolve(resolvedConfig?.playlist)
  }, [usingDraftPreview, mediaCatalog, resolvedConfig])

  useEffect(() => {
    if (playlistItems.length <= 1) return undefined

    const item = playlistItems[activeItemIndex] ?? playlistItems[0]
    const isVideo = String(item?.mediaType || '').toUpperCase() === 'VIDEO'
    const durationSec = Number(item?.durationSeconds)
    const durationMs =
      Number.isFinite(durationSec) && durationSec > 0
        ? Math.min(Math.max(durationSec * 1000, 3000), 120000)
        : isVideo
          ? 15000
          : 4000

    const timer = window.setTimeout(() => {
      setActiveItemIndex((i) => (i + 1) % playlistItems.length)
    }, durationMs)
    return () => window.clearTimeout(timer)
  }, [playlistItems, activeItemIndex])

  const activePlaylistItem = playlistItems[activeItemIndex] ?? playlistItems[0] ?? null
  const previewLayout = usingDraftPreview ? draftLayout : (resolvedConfig?.layout ?? null)
  const previewLayoutName =
    (watchedLayoutId != null ? layoutMap.get(watchedLayoutId) : null) ??
    resolvedConfig?.layout?.name ??
    '—'
  const previewPlaylistName =
    (watchedPlaylistId != null ? playlistMap.get(watchedPlaylistId) : null) ??
    resolvedConfig?.playlist?.name ??
    '—'

  const statusMeta = formatStatus(screen?.status)
  const contentStatus = contentStatusLabel(screen, resolvedConfig, configError, noActiveSchedule)
  const lastSeen = formatDateTime(screen?.lastHeartbeatAt ?? screen?.lastWsConnectedAt)

  const handleSave = async () => {
    if (!canMutate || !screen?.id) return
    try {
      const values = await form.validateFields()
      setSaving(true)
      await updateScreen(screen.id, { name: values.name.trim() })

      const newGid = values.screenGroupId
      const oldGid = screen.screenGroupId ?? null
      const n = newGid == null ? null : Number(newGid)
      const o = oldGid == null ? null : Number(oldGid)
      if (n !== o) {
        await assignScreenGroup(screen.id, { screenGroupId: n })
      }

      if (values.layoutId != null && values.playlistId != null) {
        await persistScreenSchedule(values, activeSchedule, screen)
      }

      message.success('Screen saved')
      await loadScreen()
    } catch (e) {
      if (e?.errorFields) return
      message.error(getScheduleApiErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const handlePush = async () => {
    if (!canMutate || !screen?.id) return
    try {
      const values = await form.validateFields(['layoutId', 'playlistId'])
      setPushing(true)
      await persistScreenSchedule(values, activeSchedule, screen)
      message.success('Configuration pushed to online player(s).')
      setPushModalOpen(false)
      await loadScreen()
    } catch (e) {
      if (e?.errorFields) return
      message.error(getScheduleApiErrorMessage(e))
    } finally {
      setPushing(false)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    )
  }

  if (loadError || !screen) {
    return (
      <div style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
        <Button type="link" icon={<ArrowLeftOutlined />} onClick={() => navigate('/devices')} style={{ paddingLeft: 0 }}>
          Back to devices
        </Button>
        <Alert type="error" showIcon message="Failed to load screen" description={loadError ?? 'Not found'} />
      </div>
    )
  }

  const tabItems = [
    {
      key: 'basic',
      label: 'Basic',
      children: (
        <>
          <Form.Item label="Screen group" name="screenGroupId">
            <Select
              allowClear
              placeholder="Optional group"
              options={groupOptions}
              optionFilterProp="label"
              showSearch
            />
          </Form.Item>
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 0 }}>
            Group affects schedule targeting (GROUP schedules). Device code cannot be changed after creation.
          </Typography.Paragraph>
        </>
      ),
    },
    {
      key: 'content',
      label: 'Content',
      children: watchedPlaylistId != null || resolvedConfig ? (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {playlistItems.length > 0 ? (
            <List
              size="small"
              bordered
              dataSource={playlistItems}
              renderItem={(item, index) => {
                const thumb = item.thumbnailUrl || (item.mediaType === 'IMAGE' ? item.fileUrl : '')
                return (
                  <List.Item>
                    <Space align="start">
                      {thumb ? (
                        <img
                          src={thumb}
                          alt=""
                          style={{ width: 56, height: 40, objectFit: 'cover', borderRadius: 4, background: '#e2e8f0' }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 56,
                            height: 40,
                            borderRadius: 4,
                            background: '#e2e8f0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 10,
                            color: '#64748b',
                          }}
                        >
                          {item.mediaType || 'MEDIA'}
                        </div>
                      )}
                      <div>
                        <Typography.Text strong style={{ fontSize: 13 }}>
                          {index + 1}. {item.name ?? `Media #${item.mediaId}`}
                        </Typography.Text>
                        <div>
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            {item.mediaType ?? '—'}
                            {item.durationSeconds != null ? ` · ${item.durationSeconds}s` : ''}
                          </Typography.Text>
                        </div>
                      </div>
                    </Space>
                  </List.Item>
                )
              }}
            />
          ) : (
            <Typography.Text type="secondary">Playlist has no items.</Typography.Text>
          )}
          {watchedLayoutId != null ? (
            <Typography.Paragraph style={{ fontSize: 12, marginBottom: 0 }}>
              <Link to={`/layouts/editor?id=${watchedLayoutId}`}>Open layout in editor</Link>
              {' · '}
              <Link to="/schedules">Manage schedules</Link>
            </Typography.Paragraph>
          ) : null}
        </Space>
      ) : (
        <PreviewEmptyState noActiveSchedule={noActiveSchedule} configError={configError} />
      ),
    },
    {
      key: 'status',
      label: 'Status',
      children: (
        <Space direction="vertical" size={10} style={{ width: '100%', maxWidth: 520 }}>
          <StatusRow label="Device status" value={<Tag color={statusMeta.color}>{screen.status}</Tag>} />
          <StatusRow
            label="Activation"
            value={<Tag color={formatActivation(screen.activationStatus).color}>{screen.activationStatus}</Tag>}
          />
          <StatusRow
            label="WebSocket"
            value={<Tag color={formatWs(screen.wsStatus).color}>{screen.wsStatus}</Tag>}
          />
          <StatusRow label="Last heartbeat" value={formatDateTime(screen.lastHeartbeatAt)} />
          <StatusRow label="Last WS connected" value={formatDateTime(screen.lastWsConnectedAt)} />
          <StatusRow label="Last WS message" value={formatDateTime(screen.lastWsMessageAt)} />
          <StatusRow
            label="Reported resolution"
            value={`${screen.resolutionWidth ?? '—'} × ${screen.resolutionHeight ?? '—'}`}
          />
          <StatusRow label="App version" value={screen.appVersion ?? '—'} />
        </Space>
      ),
    },
    {
      key: 'schedule',
      label: 'Schedule',
      children: configError ? (
        <Alert type="warning" showIcon message="Could not resolve active config" description={configError} />
      ) : resolvedConfig ? (
        <Space direction="vertical" size={10} style={{ width: '100%', maxWidth: 520 }}>
          <StatusRow label="Schedule ID" value={resolvedConfig.scheduleId ?? '—'} />
          <StatusRow label="Resolved at" value={formatDateTime(resolvedConfig.resolvedAt)} />
          <StatusRow label="Priority" value={resolvedConfig.priority ?? '—'} />
          <StatusRow label="Emergency override" value={resolvedConfig.emergencyOverride ? 'Yes' : 'No'} />
          <StatusRow
            label="Schedule window"
            value={`${formatDateTime(resolvedConfig.scheduleStart)} → ${formatDateTime(resolvedConfig.scheduleEnd)}`}
          />
          <StatusRow
            label="Layout resolution"
            value={
              previewLayout?.resolutionWidth && previewLayout?.resolutionHeight
                ? `${previewLayout.resolutionWidth} × ${previewLayout.resolutionHeight}`
                : '—'
            }
          />
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 0 }}>
            Layout and playlist are saved to this schedule when you click Save. Use Push to notify the player.
          </Typography.Paragraph>
        </Space>
      ) : (
        <Alert
          type="info"
          showIcon
          message="No active schedule"
          description={
            <>
              No ACTIVE schedule currently applies to this screen. Create one in{' '}
              <Link to="/schedules">Schedule Management</Link> (target: this screen, its group, or DEFAULT).
            </>
          }
        />
      ),
    },
  ]

  return (
    <div style={{ padding: '20px 24px 32px', background: '#f5f7fb', minHeight: '100%' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <Row align="middle" justify="space-between" gutter={[16, 12]} style={{ marginBottom: 20 }}>
          <Col>
            <Space align="center" size={12}>
              <Button
                type="text"
                icon={<ArrowLeftOutlined />}
                onClick={() => navigate('/devices')}
                aria-label="Back"
              />
              <Typography.Title level={4} style={{ margin: 0, color: '#0f172a' }}>
                Screen Details
              </Typography.Title>
            </Space>
          </Col>
          <Col>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={loadScreen} loading={loading}>
                Refresh
              </Button>
              <Button onClick={() => navigate('/devices')}>Cancel</Button>
              {canMutate ? (
                <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>
                  Save
                </Button>
              ) : null}
            </Space>
          </Col>
        </Row>

        {!canMutate ? (
          <Alert
            type="info"
            showIcon
            message="Read-only"
            description="Viewers can view screen details but cannot save or push changes."
            style={{ marginBottom: 16 }}
          />
        ) : null}

        <Form form={form} layout="vertical" disabled={!canMutate}>
          <Row gutter={[20, 20]}>
            <Col xs={24} lg={8} xl={7}>
              <Card variant="borderless" style={cardStyle} styles={{ body: { padding: 16 } }}>
                <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                  Live preview (from schedule resolve)
                </Typography.Text>

                {previewLayout ? (
                  <Spin spinning={previewFetching}>
                    <LayoutPreviewCanvas
                      layout={previewLayout}
                      playlistMedia={activePlaylistItem}
                      mediaById={mediaById}
                      maxHeight="none"
                    />
                    <Space direction="vertical" size={4} style={{ width: '100%', marginTop: 10, marginBottom: 16 }}>
                      <Typography.Text strong style={{ fontSize: 13, color: '#334155' }}>
                        {previewLayoutName}
                      </Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {previewPlaylistName}
                        {playlistItems.length > 0
                          ? ` · ${playlistItems.length} item${playlistItems.length === 1 ? '' : 's'}`
                          : ''}
                      </Typography.Text>
                      {playlistItems.length > 1 && activePlaylistItem?.name ? (
                        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                          Showing: {activePlaylistItem.name}
                        </Typography.Text>
                      ) : null}
                    </Space>
                  </Spin>
                ) : watchedLayoutId != null && watchedPlaylistId != null ? (
                  <div style={{ marginBottom: 16, textAlign: 'center', padding: 24 }}>
                    <Spin />
                  </div>
                ) : (
                  <div style={{ marginBottom: 16 }}>
                    <PreviewEmptyState noActiveSchedule={noActiveSchedule} configError={configError} />
                  </div>
                )}

                <Space align="center" size={8} style={{ marginBottom: 12 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: statusMeta.color === 'green' ? '#22c55e' : '#94a3b8',
                      display: 'inline-block',
                    }}
                  />
                  <Typography.Text strong>{statusMeta.label}</Typography.Text>
                </Space>

                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <StatusRow label="Last seen online" value={lastSeen} />
                  <StatusRow
                    label="Content status"
                    value={
                      <Typography.Text
                        type={
                          contentStatus.tone === 'success'
                            ? 'success'
                            : contentStatus.tone === 'warning'
                              ? 'warning'
                              : 'secondary'
                        }
                      >
                        {contentStatus.text}
                      </Typography.Text>
                    }
                  />
                  {resolvedConfig?.scheduleId != null ? (
                    <StatusRow label="Active schedule" value={`#${resolvedConfig.scheduleId}`} />
                  ) : null}
                  <StatusRow
                    label="WebSocket"
                    value={<Tag color={formatWs(screen.wsStatus).color}>{screen.wsStatus}</Tag>}
                  />
                </Space>

                {canMutate ? (
                  <>
                    <Divider style={{ margin: '16px 0' }} />
                    <Button
                      type="primary"
                      block
                      size="large"
                      icon={<CloudUploadOutlined />}
                      loading={pushing}
                      disabled={pushing}
                      onClick={() => setPushModalOpen(true)}
                      style={{ fontWeight: 600 }}
                    >
                      Push changes to this screen
                    </Button>
                  </>
                ) : null}
              </Card>
            </Col>

            <Col xs={24} lg={16} xl={17}>
              <Card variant="borderless" style={cardStyle} styles={{ body: { padding: '20px 24px' } }}>
                <Form.Item
                  label="Name"
                  name="name"
                  rules={[
                    { required: true, message: 'Required' },
                    { max: 255, message: 'Max 255 characters' },
                  ]}
                  style={{ maxWidth: 520, marginBottom: 20 }}
                >
                  <Input placeholder="Screen name" size="large" />
                </Form.Item>

                <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 6, fontSize: 13 }}>
                  Device code
                </Typography.Text>
                <Input
                  readOnly
                  value={screen.deviceCode}
                  style={{ maxWidth: 520, marginBottom: 8, background: '#f8fafc' }}
                />
                {screen.screenGroupName ? (
                  <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 24 }}>
                    Current group: {screen.screenGroupName}
                  </Typography.Text>
                ) : (
                  <div style={{ marginBottom: 24 }} />
                )}

                <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 12 }}>
                  Screen content
                </Typography.Title>
                <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: -4, marginBottom: 12 }}>
                  Select layout and playlist below. Saving updates the active schedule for this screen (or creates one if
                  none exists).
                </Typography.Paragraph>

                <Row gutter={12} style={{ maxWidth: 640, marginBottom: 24 }}>
                  <Col span={12}>
                    <Form.Item
                      label="Layout"
                      name="layoutId"
                      rules={[{ required: true, message: 'Please select a layout' }]}
                    >
                      <Select
                        loading={optionsLoading}
                        placeholder="Select layout"
                        options={layoutOptions}
                        showSearch
                        optionFilterProp="label"
                      />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item
                      label="Playlist"
                      name="playlistId"
                      rules={[{ required: true, message: 'Please select a playlist' }]}
                    >
                      <Select
                        loading={optionsLoading}
                        placeholder="Select playlist"
                        options={playlistOptions}
                        showSearch
                        optionFilterProp="label"
                        notFoundContent={optionsLoading ? <Spin size="small" /> : 'No matching playlist'}
                      />
                    </Form.Item>
                  </Col>
                </Row>

                <Tabs items={tabItems} />
              </Card>
            </Col>
          </Row>
        </Form>
      </div>

      <Modal
        title="Push changes"
        open={pushModalOpen}
        onCancel={() => {
          if (!pushing) setPushModalOpen(false)
        }}
        footer={[
          <Button key="cancel" disabled={pushing} onClick={() => setPushModalOpen(false)}>
            Cancel
          </Button>,
          <Button key="push" type="primary" loading={pushing} disabled={pushing} onClick={handlePush}>
            Push
          </Button>,
        ]}
        destroyOnHidden
      >
        <Typography.Paragraph style={{ marginBottom: 0 }}>
          This re-publishes the active schedule for this screen (via the schedule API) and notifies connected players
          over WebSocket to refresh their configuration. Unsaved layout or playlist changes in the form will be included.
        </Typography.Paragraph>
      </Modal>
    </div>
  )
}
