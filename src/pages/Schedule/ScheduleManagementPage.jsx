import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { listLayouts } from '../../services/layoutService'
import { listScreenGroups, listScreens } from '../../services/deviceService'
import { getApiErrorMessage, listPlaylistOptions } from '../../services/playlistService'
import {
  SCHEDULE_STATUSES,
  SCHEDULE_TARGET_TYPES,
  createSchedule,
  deleteSchedule,
  formValuesToScheduleRequest,
  getSchedule,
  getScheduleApiErrorMessage,
  listSchedules,
  updateSchedule,
} from '../../services/scheduleService'

const STATUS_META = {
  [SCHEDULE_STATUSES.ACTIVE]: { color: 'green', label: 'Active' },
  [SCHEDULE_STATUSES.DRAFT]: { color: 'gold', label: 'Draft' },
  [SCHEDULE_STATUSES.ENDED]: { color: 'default', label: 'Ended' },
  [SCHEDULE_STATUSES.CANCELLED]: { color: 'red', label: 'Cancelled' },
}

const TARGET_TYPE_OPTIONS = [
  { value: SCHEDULE_TARGET_TYPES.SCREEN, label: 'Screen' },
  { value: SCHEDULE_TARGET_TYPES.GROUP, label: 'Screen group (GROUP)' },
  { value: SCHEDULE_TARGET_TYPES.DEFAULT, label: 'Organization default (DEFAULT)' },
]

const STATUS_OPTIONS = [
  { value: SCHEDULE_STATUSES.DRAFT, label: 'DRAFT' },
  { value: SCHEDULE_STATUSES.ACTIVE, label: 'ACTIVE' },
  { value: SCHEDULE_STATUSES.ENDED, label: 'ENDED' },
  { value: SCHEDULE_STATUSES.CANCELLED, label: 'CANCELLED' },
]

function formatDateTime(value) {
  if (value == null) return '-'
  const d = dayjs(value)
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : String(value)
}

function formatRange(startDatetime, endDatetime) {
  if (!startDatetime && !endDatetime) return '-'
  return `${formatDateTime(startDatetime)} ~ ${formatDateTime(endDatetime)}`
}

function parseApiDateTime(value) {
  if (value == null) return null
  const d = dayjs(value)
  return d.isValid() ? d : null
}

function scheduleToFormValues(record) {
  const targetType = record.targetType || SCHEDULE_TARGET_TYPES.SCREEN
  return {
    name: record.name,
    layoutId: record.layoutId,
    playlistId: record.playlistId,
    targetType,
    screenId: record.screenId != null ? record.screenId : undefined,
    screenGroupId: record.screenGroupId != null ? record.screenGroupId : undefined,
    startDatetime: parseApiDateTime(record.startDatetime),
    endDatetime: parseApiDateTime(record.endDatetime),
    priority: record.priority ?? 10,
    status: record.status || SCHEDULE_STATUSES.DRAFT,
  }
}

function targetLabel(targetType) {
  if (targetType === SCHEDULE_TARGET_TYPES.GROUP) return 'Screen group'
  if (targetType === SCHEDULE_TARGET_TYPES.DEFAULT) return 'Default'
  return 'Screen'
}

export default function ScheduleManagementPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [optionsLoading, setOptionsLoading] = useState(true)
  const [playlistsLoading, setPlaylistsLoading] = useState(false)
  const [playlistsError, setPlaylistsError] = useState('')
  const [options, setOptions] = useState({
    layouts: [],
    playlists: [],
    screens: [],
    screenGroups: [],
  })

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [submitLoading, setSubmitLoading] = useState(false)
  const [formError, setFormError] = useState('')
  const [form] = Form.useForm()

  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detail, setDetail] = useState(null)
  const [detailError, setDetailError] = useState('')

  const targetTypeWatch = Form.useWatch('targetType', form)

  const layoutMap = useMemo(
    () => new Map(options.layouts.map((l) => [l.id, l.name])),
    [options.layouts],
  )
  const playlistMap = useMemo(
    () => new Map(options.playlists.map((p) => [p.id, p.name])),
    [options.playlists],
  )
  const screenMap = useMemo(
    () =>
      new Map(
        options.screens.map((s) => [
          s.id,
          `${s.name || s.deviceCode || `Screen #${s.id}`}${s.deviceCode ? ` (${s.deviceCode})` : ''}`,
        ]),
      ),
    [options.screens],
  )
  const groupMap = useMemo(
    () => new Map(options.screenGroups.map((g) => [g.id, g.name || `Group #${g.id}`])),
    [options.screenGroups],
  )

  const loadPlaylists = useCallback(async () => {
    setPlaylistsLoading(true)
    setPlaylistsError('')
    try {
      const playlists = await listPlaylistOptions()
      setOptions((prev) => ({ ...prev, playlists }))
      return playlists
    } catch (e) {
      const msg = getApiErrorMessage(e)
      setPlaylistsError(msg)
      setOptions((prev) => ({ ...prev, playlists: [] }))
      return []
    } finally {
      setPlaylistsLoading(false)
    }
  }, [])

  const loadOptions = useCallback(async () => {
    setOptionsLoading(true)
    const [layoutsResult, playlistsResult, screensResult, groupsResult] =
      await Promise.allSettled([
        listLayouts(),
        listPlaylistOptions(),
        listScreens(),
        listScreenGroups(),
      ])

    const layouts =
      layoutsResult.status === 'fulfilled'
        ? (layoutsResult.value || []).map((l) => ({
            id: l.id,
            name: l.name || `Layout #${l.id}`,
          }))
        : []

    const playlists = playlistsResult.status === 'fulfilled' ? playlistsResult.value || [] : []
    if (playlistsResult.status === 'rejected') {
      setPlaylistsError(getApiErrorMessage(playlistsResult.reason))
    } else {
      setPlaylistsError('')
    }

    const screens = screensResult.status === 'fulfilled' ? screensResult.value || [] : []
    const screenGroups = groupsResult.status === 'fulfilled' ? groupsResult.value || [] : []

    setOptions({ layouts, playlists, screens, screenGroups })

    const failed = [layoutsResult, screensResult, groupsResult].filter(
      (r) => r.status === 'rejected',
    )
    if (failed.length > 0) {
      message.warning(getScheduleApiErrorMessage(failed[0].reason))
    }

    setOptionsLoading(false)
  }, [])

  const loadSchedules = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const data = await listSchedules()
      setItems(Array.isArray(data) ? data : [])
    } catch (e) {
      setLoadError(getScheduleApiErrorMessage(e))
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadOptions()
    loadSchedules()
  }, [loadOptions, loadSchedules])

  const resolveTargetDisplay = useCallback(
    (record) => {
      if (record.targetType === SCHEDULE_TARGET_TYPES.GROUP) {
        return groupMap.get(record.screenGroupId) || (record.screenGroupId != null ? `#${record.screenGroupId}` : '-')
      }
      if (record.targetType === SCHEDULE_TARGET_TYPES.SCREEN) {
        return screenMap.get(record.screenId) || (record.screenId != null ? `#${record.screenId}` : '-')
      }
      if (record.targetType === SCHEDULE_TARGET_TYPES.DEFAULT) {
        return 'Organization default'
      }
      return '-'
    },
    [groupMap, screenMap],
  )

  const openDetail = useCallback(async (id) => {
    setDetailOpen(true)
    setDetail(null)
    setDetailError('')
    setDetailLoading(true)
    try {
      const data = await getSchedule(id)
      setDetail(data)
    } catch (e) {
      setDetailError(getScheduleApiErrorMessage(e))
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const openCreate = () => {
    setEditing(null)
    setFormError('')
    setOpen(true)
    form.resetFields()
    form.setFieldsValue({
      targetType: SCHEDULE_TARGET_TYPES.SCREEN,
      priority: 10,
      status: SCHEDULE_STATUSES.DRAFT,
    })
    void loadPlaylists()
  }

  const openEdit = (record) => {
    setEditing(record)
    setFormError('')
    setOpen(true)
    form.setFieldsValue(scheduleToFormValues(record))
    void loadPlaylists()
  }

  const onSubmit = async () => {
    setFormError('')
    let values
    try {
      values = await form.validateFields()
    } catch {
      return
    }

    let body
    try {
      body = formValuesToScheduleRequest(values)
    } catch (e) {
      setFormError(getScheduleApiErrorMessage(e))
      return
    }

    setSubmitLoading(true)
    try {
      if (editing?.id != null) {
        await updateSchedule(editing.id, body)
        message.success('Schedule updated')
      } else {
        await createSchedule(body)
        message.success('Schedule created')
      }
      setOpen(false)
      await loadSchedules()
    } catch (e) {
      setFormError(getScheduleApiErrorMessage(e))
    } finally {
      setSubmitLoading(false)
    }
  }

  const onDelete = (record) => {
    Modal.confirm({
      title: 'Confirm delete schedule?',
      content: record.name,
      okText: 'Delete',
      okButtonProps: { danger: true },
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await deleteSchedule(record.id)
          message.success('Schedule deleted')
          await loadSchedules()
        } catch (e) {
          message.error(getScheduleApiErrorMessage(e))
        }
      },
    })
  }

  const columns = useMemo(
    () => [
      { title: 'Schedule name', dataIndex: 'name', key: 'name', ellipsis: true, width: 180 },
      {
        title: 'Layout',
        dataIndex: 'layoutId',
        key: 'layoutId',
        width: 160,
        render: (id) => layoutMap.get(id) || (id != null ? `#${id}` : '-'),
      },
      {
        title: 'Playlist',
        dataIndex: 'playlistId',
        key: 'playlistId',
        width: 160,
        render: (id) => playlistMap.get(id) || (id != null ? `#${id}` : '-'),
      },
      {
        title: 'Target type',
        dataIndex: 'targetType',
        key: 'targetType',
        width: 120,
        render: (t) => targetLabel(t),
      },
      {
        title: 'Target',
        key: 'target',
        width: 200,
        ellipsis: true,
        render: (_, r) => resolveTargetDisplay(r),
      },
      {
        title: 'Time range',
        key: 'range',
        width: 280,
        render: (_, r) => formatRange(r.startDatetime, r.endDatetime),
      },
      { title: 'Priority', dataIndex: 'priority', key: 'priority', width: 90 },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        width: 110,
        render: (s) => {
          const m = STATUS_META[s] || { color: 'default', label: String(s || '-') }
          return <Tag color={m.color}>{m.label}</Tag>
        },
      },
      {
        title: 'Actions',
        key: 'actions',
        width: 200,
        fixed: 'right',
        render: (_, record) => (
          <Space wrap>
            <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(record.id)}>
              View
            </Button>
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
              Edit
            </Button>
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => onDelete(record)}
            >
              Delete
            </Button>
          </Space>
        ),
      },
    ],
    [layoutMap, openDetail, playlistMap, resolveTargetDisplay],
  )

  return (
    <div style={{ padding: 24 }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <Space
          align="baseline"
          style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}
          wrap
        >
          <div>
            <Typography.Title level={3} style={{ margin: 0, color: '#0f172a' }}>
              Schedule Management
            </Typography.Title>
          </div>
          <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={loadSchedules} loading={loading}>
              Refresh
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              Create schedule
            </Button>
          </Space>
        </Space>

        {loadError ? (
          <Alert
            type="error"
            showIcon
            message="Failed to load schedules"
            description={loadError}
            style={{ marginBottom: 16 }}
            action={
              <Button size="small" onClick={loadSchedules}>
                Retry
              </Button>
            }
          />
        ) : null}

        <Card
          variant="borderless"
          style={{
            borderRadius: 12,
            overflow: 'hidden',
            boxShadow:
              '0 1px 2px rgba(15, 23, 42, 0.06), 0 12px 32px rgba(15, 23, 42, 0.06)',
          }}
        >
          <Spin spinning={loading}>
            <div style={{ overflowX: 'auto' }}>
              <Table
                rowKey="id"
                tableLayout="fixed"
                columns={columns}
                dataSource={items}
                pagination={{ pageSize: 10, showSizeChanger: false }}
                scroll={{ x: 1320 }}
              />
            </div>
          </Spin>
        </Card>
      </div>

      <Modal
        title={editing ? 'Edit schedule' : 'Create schedule'}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={onSubmit}
        okText={editing ? 'Save' : 'Create'}
        cancelText="Cancel"
        confirmLoading={submitLoading}
        destroyOnClose
        width={720}
      >
        {formError ? (
          <Alert type="error" showIcon message={formError} style={{ marginBottom: 16 }} />
        ) : null}

        <Form
          form={form}
          layout="vertical"
          requiredMark={false}
          onValuesChange={(changed) => {
            if (changed.targetType) {
              form.setFieldsValue({ screenId: undefined, screenGroupId: undefined })
            }
          }}
        >
          <Form.Item
            label="Schedule name"
            name="name"
            rules={[{ required: true, message: 'Please enter the schedule name' }]}
          >
            <Input placeholder="e.g. Morning lobby schedule" />
          </Form.Item>

          <Space size={12} style={{ width: '100%' }} wrap>
            <Form.Item
              label="Layout"
              name="layoutId"
              rules={[{ required: true, message: 'Please select a layout' }]}
              style={{ flex: 1, minWidth: 240 }}
            >
              <Select
                loading={optionsLoading}
                placeholder="Select layout"
                options={options.layouts.map((l) => ({ value: l.id, label: l.name }))}
              />
            </Form.Item>

            <Form.Item
              label="Playlist"
              name="playlistId"
              rules={[{ required: true, message: 'Please select a playlist' }]}
              style={{ flex: 1, minWidth: 240 }}
              help={
                playlistsError
                  ? playlistsError
                  : !playlistsLoading && options.playlists.length === 0
                    ? 'No playlists found. Create a playlist in the API or database first.'
                    : undefined
              }
              validateStatus={playlistsError ? 'error' : undefined}
            >
              <Select
                showSearch
                optionFilterProp="label"
                loading={optionsLoading || playlistsLoading}
                placeholder={
                  playlistsLoading
                    ? 'Loading playlists…'
                    : options.playlists.length
                      ? 'Select playlist'
                      : 'No playlists available'
                }
                disabled={playlistsLoading}
                notFoundContent={
                  playlistsLoading ? <Spin size="small" /> : 'No matching playlist'
                }
                options={options.playlists.map((p) => ({
                  value: p.id,
                  label:
                    p.itemCount > 0
                      ? `${p.name} (${p.itemCount} item${p.itemCount === 1 ? '' : 's'})`
                      : p.name,
                }))}
              />
            </Form.Item>
          </Space>

          <Space size={12} style={{ width: '100%' }} wrap>
            <Form.Item
              label="Target type"
              name="targetType"
              rules={[{ required: true, message: 'Please select target type' }]}
              style={{ width: 220 }}
            >
              <Select options={TARGET_TYPE_OPTIONS} />
            </Form.Item>

            {targetTypeWatch === SCHEDULE_TARGET_TYPES.SCREEN ? (
              <Form.Item
                label="Screen"
                name="screenId"
                rules={[{ required: true, message: 'Please select a screen' }]}
                style={{ flex: 1, minWidth: 260 }}
              >
                <Select
                  loading={optionsLoading}
                  placeholder="Select screen"
                  options={options.screens.map((s) => ({
                    value: s.id,
                    label:
                      screenMap.get(s.id) ||
                      `${s.name || s.deviceCode || `Screen #${s.id}`}${s.deviceCode ? ` (${s.deviceCode})` : ''}`,
                  }))}
                />
              </Form.Item>
            ) : null}

            {targetTypeWatch === SCHEDULE_TARGET_TYPES.GROUP ? (
              <Form.Item
                label="Screen group"
                name="screenGroupId"
                rules={[{ required: true, message: 'Please select a screen group' }]}
                style={{ flex: 1, minWidth: 260 }}
              >
                <Select
                  loading={optionsLoading}
                  placeholder="Select screen group"
                  options={options.screenGroups.map((g) => ({
                    value: g.id,
                    label: g.name || `Group #${g.id}`,
                  }))}
                />
              </Form.Item>
            ) : null}
          </Space>

          <Space size={12} style={{ width: '100%' }} wrap>
            <Form.Item
              label="Start time"
              name="startDatetime"
              rules={[{ required: true, message: 'Please select start time' }]}
              style={{ flex: 1, minWidth: 240 }}
            >
              <DatePicker showTime style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              label="End time"
              name="endDatetime"
              dependencies={['startDatetime']}
              rules={[
                { required: true, message: 'Please select end time' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    const start = getFieldValue('startDatetime')
                    if (!start || !value) return Promise.resolve()
                    if (dayjs(value).isAfter(dayjs(start))) return Promise.resolve()
                    return Promise.reject(new Error('End time must be after start time'))
                  },
                }),
              ]}
              style={{ flex: 1, minWidth: 240 }}
            >
              <DatePicker showTime style={{ width: '100%' }} />
            </Form.Item>
          </Space>

          <Space size={12} style={{ width: '100%' }} wrap>
            <Form.Item
              label="Priority"
              name="priority"
              rules={[{ required: true, message: 'Please enter priority' }]}
              style={{ width: 180 }}
            >
              <InputNumber min={0} max={999} style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item
              label="Status"
              name="status"
              rules={[{ required: true, message: 'Please select status' }]}
              style={{ width: 220 }}
            >
              <Select options={STATUS_OPTIONS} />
            </Form.Item>
          </Space>
        </Form>
      </Modal>

      <Modal
        title="Schedule detail"
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={[
          <Button key="close" onClick={() => setDetailOpen(false)}>
            Close
          </Button>,
          detail?.id != null ? (
            <Button
              key="edit"
              type="primary"
              onClick={() => {
                setDetailOpen(false)
                openEdit(detail)
              }}
            >
              Edit
            </Button>
          ) : null,
        ]}
        width={640}
        destroyOnClose
      >
        {detailError ? <Alert type="error" showIcon message={detailError} /> : null}
        <Spin spinning={detailLoading}>
          {detail && !detailError ? (
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="ID">{detail.id}</Descriptions.Item>
              <Descriptions.Item label="Name">{detail.name}</Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag color={STATUS_META[detail.status]?.color || 'default'}>
                  {detail.status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Target type">{detail.targetType}</Descriptions.Item>
              <Descriptions.Item label="Target">{resolveTargetDisplay(detail)}</Descriptions.Item>
              <Descriptions.Item label="Layout">
                {layoutMap.get(detail.layoutId) || detail.layoutId}
              </Descriptions.Item>
              <Descriptions.Item label="Playlist">
                {playlistMap.get(detail.playlistId) || detail.playlistId}
              </Descriptions.Item>
              <Descriptions.Item label="Time range">
                {formatRange(detail.startDatetime, detail.endDatetime)}
              </Descriptions.Item>
              <Descriptions.Item label="Priority">{detail.priority}</Descriptions.Item>
            </Descriptions>
          ) : null}
        </Spin>
      </Modal>
    </div>
  )
}
