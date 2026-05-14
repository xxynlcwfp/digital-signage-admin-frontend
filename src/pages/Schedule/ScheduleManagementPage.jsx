import { useMemo, useState } from 'react'
import {
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'

const STATUS_META = {
  ACTIVE: { color: 'green', label: 'Active' },
  DRAFT: { color: 'gold', label: 'Draft' },
  EXPIRED: { color: 'default', label: 'Expired' },
}

function buildMockOptions() {
  return {
    layouts: [
      { id: 101, name: 'Lobby Layout A' },
      { id: 102, name: 'Header + Content' },
      { id: 103, name: 'Full Screen' },
    ],
    playlists: [
      { id: 201, name: 'Lobby Playlist A' },
      { id: 202, name: 'Promo Campaign' },
      { id: 203, name: 'Office Notices' },
    ],
    screens: [
      { id: 1, name: 'Lobby Screen A', code: 'SCREEN_001' },
      { id: 2, name: 'Mall Entrance', code: 'SCREEN_014' },
      { id: 3, name: 'Meeting Room 3F', code: 'SCREEN_033' },
    ],
    screenGroups: [
      { id: 10, name: 'Lobby' },
      { id: 11, name: 'Office' },
      { id: 12, name: 'Mall' },
    ],
  }
}

function buildMockSchedules() {
  return [
    {
      id: 1001,
      name: 'Morning Lobby Schedule',
      layoutId: 101,
      playlistId: 201,
      targetType: 'SCREEN',
      targetId: 1,
      startAt: '2026-05-12 08:00',
      endAt: '2026-05-12 18:00',
      priority: 10,
      status: 'ACTIVE',
      remark: 'High Priority Display',
    },
    {
      id: 1002,
      name: 'Office Notice Draft',
      layoutId: 102,
      playlistId: 203,
      targetType: 'GROUP',
      targetId: 11,
      startAt: '2026-05-13 09:00',
      endAt: '2026-05-13 12:00',
      priority: 5,
      status: 'DRAFT',
      remark: '',
    },
    {
      id: 1003,
      name: 'Last Week Promo',
      layoutId: 103,
      playlistId: 202,
      targetType: 'GROUP',
      targetId: 12,
      startAt: '2026-05-01 10:00',
      endAt: '2026-05-01 20:00',
      priority: 3,
      status: 'EXPIRED',
      remark: 'History Record',
    },
  ]
}

function formatRange(startAt, endAt) {
  if (!startAt || !endAt) return '-'
  return `${startAt} ~ ${endAt}`
}

export default function ScheduleManagementPage() {
  const options = useMemo(() => buildMockOptions(), [])
  const [items, setItems] = useState(() => buildMockSchedules())

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form] = Form.useForm()

  const layoutMap = useMemo(() => new Map(options.layouts.map((l) => [l.id, l.name])), [options])
  const playlistMap = useMemo(
    () => new Map(options.playlists.map((p) => [p.id, p.name])),
    [options],
  )
  const screenMap = useMemo(
    () => new Map(options.screens.map((s) => [s.id, `${s.name}（${s.code}）`])),
    [options],
  )
  const groupMap = useMemo(
    () => new Map(options.screenGroups.map((g) => [g.id, g.name])),
    [options],
  )

  const targetOptions = Form.useWatch('targetType', form)

  const columns = useMemo(
    () => [
      { title: 'Schedule Name', dataIndex: 'name', key: 'name', ellipsis: true, width: 180 },
      {
        title: 'Layout',
        dataIndex: 'layoutId',
        key: 'layoutId',
        width: 160,
        render: (id) => layoutMap.get(id) || '-',
      },
      {
        title: 'Playlist',
        dataIndex: 'playlistId',
        key: 'playlistId',
        width: 160,
        render: (id) => playlistMap.get(id) || '-',
      },
      {
        title: 'Target Type',
        dataIndex: 'targetType',
        key: 'targetType',
        width: 110,
        render: (t) => (t === 'GROUP' ? 'Screen Group' : 'Screen'),
      },
      {
        title: 'Target',
        key: 'target',
        width: 180,
        render: (_, r) => {
          if (r.targetType === 'GROUP') return groupMap.get(r.targetId) || '-'
          return screenMap.get(r.targetId) || '-'
        },
      },
      {
        title: 'Time Range',
        key: 'range',
        width: 240,
        render: (_, r) => formatRange(r.startAt, r.endAt),
      },
      { title: 'Priority', dataIndex: 'priority', key: 'priority', width: 90 },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        width: 100,
        render: (s) => {
          const m = STATUS_META[s] || { color: 'default', label: String(s || '-') }
          return <Tag color={m.color}>{m.label}</Tag>
        },
      },
      {
        title: 'Actions',
        key: 'actions',
        width: 140,
        fixed: 'right',
        render: (_, record) => (
          <Space>
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => {
                setEditing(record)
                setOpen(true)
                form.setFieldsValue({
                  name: record.name,
                  layoutId: record.layoutId,
                  playlistId: record.playlistId,
                  targetType: record.targetType,
                  targetId: String(record.targetId),
                  startAt: dayjs(record.startAt, 'YYYY-MM-DD HH:mm'),
                  endAt: dayjs(record.endAt, 'YYYY-MM-DD HH:mm'),
                  priority: record.priority,
                  status: record.status,
                  remark: record.remark,
                })
              }}
            >
              Edit
            </Button>
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => {
                Modal.confirm({
                  title: 'Confirm Delete Schedule?',
                  content: record.name,
                  okText: 'Delete',
                  okButtonProps: { danger: true },
                  cancelText: 'Cancel',
                  onOk: () => {
                    setItems((prev) => prev.filter((x) => x.id !== record.id))
                    message.success('Deleted (mock)')
                  },
                })
              }}
            />
          </Space>
        ),
      },
    ],
    [form, groupMap, layoutMap, playlistMap, screenMap],
  )

  const openCreate = () => {
    setEditing(null)
    setOpen(true)
    form.resetFields()
    form.setFieldsValue({
      targetType: 'SCREEN',
      priority: 10,
      status: 'DRAFT',
    })
  }

  const onSubmit = async () => {
    const values = await form.validateFields()
    const startAt = values.startAt
    const endAt = values.endAt
    const next = {
      id: editing?.id ?? Math.max(0, ...items.map((x) => x.id)) + 1,
      name: values.name,
      layoutId: values.layoutId,
      playlistId: values.playlistId,
      targetType: values.targetType,
      targetId: Number(values.targetId),
      startAt: startAt.format('YYYY-MM-DD HH:mm'),
      endAt: endAt.format('YYYY-MM-DD HH:mm'),
      priority: values.priority,
      status: values.status,
      remark: values.remark || '',
    }

    setItems((prev) => {
      const exists = prev.some((x) => x.id === next.id)
      if (!exists) return [next, ...prev]
      return prev.map((x) => (x.id === next.id ? next : x))
    })
    message.success(editing ? 'Updated (mock)' : 'Created (mock)')
    setOpen(false)
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <Space
          align="baseline"
          style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}
        >
          <div>
            <Typography.Title level={3} style={{ margin: 0, color: '#0f172a' }}>
              Schedule Management
            </Typography.Title>
            <Typography.Text type="secondary">
              Current is mock data; subsequent can connect to `GET/POST/PUT/DELETE /api/admin/schedules` and conflict detection interface.
            </Typography.Text>
          </div>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Create Schedule
          </Button>
        </Space>

        <Card
          variant="borderless"
          style={{
            borderRadius: 12,
            overflow: 'hidden',
            boxShadow:
              '0 1px 2px rgba(15, 23, 42, 0.06), 0 12px 32px rgba(15, 23, 42, 0.06)',
          }}
        >
          <div style={{ overflowX: 'auto' }}>
            <Table
              rowKey="id"
              tableLayout="fixed"
              columns={columns}
              dataSource={items}
              pagination={{ pageSize: 10, showSizeChanger: false }}
              scroll={{ x: 1250 }}
            />
          </div>
        </Card>
      </div>

      <Modal
        title={editing ? 'Edit Schedule' : 'Create Schedule'}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={onSubmit}
        okText={editing ? 'Save' : 'Create'}
        cancelText="Cancel"
        destroyOnClose
        width={720}
      >
        <Form
          form={form}
          layout="vertical"
          requiredMark={false}
          onValuesChange={(changed) => {
            if (changed.targetType) {
              form.setFieldsValue({ targetId: undefined })
            }
          }}
        >
          <Form.Item
            label="Schedule Name"
            name="name"
            rules={[{ required: true, message: 'Please enter the schedule name' }]}
          >
            <Input placeholder="For example: Morning Lobby Schedule" />
          </Form.Item>

          <Space size={12} style={{ width: '100%' }} wrap>
            <Form.Item
              label="Layout"
              name="layoutId"
              rules={[{ required: true, message: 'Please select the layout' }]}
              style={{ flex: 1, minWidth: 240 }}
            >
              <Select
                placeholder="Please select the layout"
                options={options.layouts.map((l) => ({ value: l.id, label: l.name }))}
              />
            </Form.Item>

            <Form.Item
              label="Playlist"
              name="playlistId"
              rules={[{ required: true, message: 'Please select the playlist' }]}
              style={{ flex: 1, minWidth: 240 }}
            >
              <Select
                placeholder="Please select the playlist"
                options={options.playlists.map((p) => ({ value: p.id, label: p.name }))}
              />
            </Form.Item>
          </Space>

          <Space size={12} style={{ width: '100%' }} wrap>
            <Form.Item
              label="Target Type"
              name="targetType"
              rules={[{ required: true, message: 'Please select the target type' }]}
              style={{ width: 180 }}
            >
              <Select
                options={[
                  { value: 'SCREEN', label: 'Screen' },
                  { value: 'GROUP', label: 'Screen Group' },
                ]}
              />
            </Form.Item>

            <Form.Item
              label="Target"
              name="targetId"
              rules={[{ required: true, message: 'Please select the target' }]}
              style={{ flex: 1, minWidth: 260 }}
            >
              <Select
                placeholder={targetOptions === 'GROUP' ? 'Please select the screen group' : 'Please select the screen'}
                options={
                  targetOptions === 'GROUP'
                    ? options.screenGroups.map((g) => ({
                        value: String(g.id),
                        label: g.name,
                      }))
                    : options.screens.map((s) => ({
                        value: String(s.id),
                        label: `${s.name} (${s.code})`,
                      }))
                }
              />
            </Form.Item>
          </Space>

          <Space size={12} style={{ width: '100%' }} wrap>
            <Form.Item
              label="Start Time"
              name="startAt"
              rules={[{ required: true, message: 'Please select the start time' }]}
              style={{ flex: 1, minWidth: 240 }}
            >
              <DatePicker showTime style={{ width: '100%' }} placeholder="Start Time" />
            </Form.Item>
            <Form.Item
              label="End Time"
              name="endAt"
              dependencies={['startAt']}
              rules={[
                { required: true, message: 'Please select the end time' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    const start = getFieldValue('startAt')
                    if (!start || !value) return Promise.resolve()
                    if (dayjs(value).isAfter(dayjs(start))) return Promise.resolve()
                    return Promise.reject(new Error('Start time must be before end time'))
                  },
                }),
              ]}
              style={{ flex: 1, minWidth: 240 }}
            >
              <DatePicker showTime style={{ width: '100%' }} placeholder="End Time" />
            </Form.Item>
          </Space>

          <Space size={12} style={{ width: '100%' }} wrap>
            <Form.Item
              label="Priority"
              name="priority"
              rules={[{ required: true, message: 'Please enter the priority' }]}
              style={{ width: 180 }}
            >
              <InputNumber min={0} max={999} style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item
              label="Status"
              name="status"
              rules={[{ required: true, message: 'Please select the status' }]}
              style={{ width: 220 }}
            >
              <Select
                options={[
                  { value: 'ACTIVE', label: 'ACTIVE (Active)' },
                  { value: 'DRAFT', label: 'DRAFT (Draft)' },
                  { value: 'EXPIRED', label: 'EXPIRED (Expired)' },
                ]}
              />
            </Form.Item>
          </Space>

          <Form.Item label="Remark" name="remark">
            <Input.TextArea placeholder="Optional" rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

