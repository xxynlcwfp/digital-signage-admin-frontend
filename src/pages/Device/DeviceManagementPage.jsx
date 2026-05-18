import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
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
  KeyOutlined,
  PlusOutlined,
  ReloadOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import {
  assignScreenGroup,
  createScreen,
  createScreenGroup,
  deleteScreen,
  deleteScreenGroup,
  generateActivationCode,
  getApiErrorMessage,
  getScreen,
  listScreenGroups,
  listScreens,
  updateScreen,
  updateScreenGroup,
} from '../../services/deviceService'
import { canWrite, getStoredRole } from '../../services/authService'
import { isViewerRole } from '../../utils/permissions'

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

function formatResolution(width, height) {
  if (width == null && height == null) return '—'
  return `${width ?? '—'} × ${height ?? '—'}`
}

export default function DeviceManagementPage() {
  const canMutate = canWrite()
  const [screens, setScreens] = useState([])
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('ALL')
  const [groupId, setGroupId] = useState('ALL')

  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [detailId, setDetailId] = useState(null)
  const [detailScreen, setDetailScreen] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const [createForm] = Form.useForm()
  const [editForm] = Form.useForm()
  const [groupForm] = Form.useForm()

  const [groupModalOpen, setGroupModalOpen] = useState(false)
  const [groupModalMode, setGroupModalMode] = useState('create')
  const [editingGroup, setEditingGroup] = useState(null)
  const [groupSubmitting, setGroupSubmitting] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [sList, gList] = await Promise.all([listScreens(), listScreenGroups()])
      setScreens(Array.isArray(sList) ? sList : [])
      setGroups(Array.isArray(gList) ? gList : [])
    } catch (e) {
      setLoadError(getApiErrorMessage(e))
      setScreens([])
      setGroups([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (!detailModalOpen || detailId == null) return
    let cancelled = false
    async function run() {
      setDetailLoading(true)
      setDetailScreen(null)
      try {
        const row = await getScreen(detailId)
        if (!cancelled) setDetailScreen(row)
      } catch (e) {
        if (!cancelled) message.error(getApiErrorMessage(e))
      } finally {
        if (!cancelled) setDetailLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [detailModalOpen, detailId])

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return screens.filter((d) => {
      const name = String(d.name ?? '').toLowerCase()
      const code = String(d.deviceCode ?? '').toLowerCase()
      const gname = String(d.screenGroupName ?? '').toLowerCase()
      const hitKw =
        !kw || name.includes(kw) || code.includes(kw) || gname.includes(kw)
      const hitStatus = status === 'ALL' || String(d.status) === status
      const gid = d.screenGroupId
      const hitGroup =
        groupId === 'ALL' ||
        (groupId === 'NONE' && (gid == null || gid === undefined)) ||
        String(gid) === String(groupId)
      return hitKw && hitStatus && hitGroup
    })
  }, [screens, groupId, keyword, status])

  const groupOptions = useMemo(
    () =>
      groups.map((g) => ({
        value: g.id,
        label: g.location ? `${g.name} (${g.location})` : g.name,
      })),
    [groups],
  )

  const openCreate = () => {
    createForm.resetFields()
    setCreateOpen(true)
  }

  const openCreateGroup = () => {
    setGroupModalMode('create')
    setEditingGroup(null)
    groupForm.resetFields()
    setGroupModalOpen(true)
  }

  const openEditGroup = useCallback((record) => {
    setGroupModalMode('edit')
    setEditingGroup(record)
    groupForm.setFieldsValue({
      name: record.name,
      location: record.location ?? '',
    })
    setGroupModalOpen(true)
  }, [groupForm])

  const handleGroupModalOk = async () => {
    try {
      const values = await groupForm.validateFields()
      setGroupSubmitting(true)
      const name = values.name.trim()
      const locRaw = values.location
      const location =
        locRaw == null || String(locRaw).trim() === '' ? undefined : String(locRaw).trim()

      if (groupModalMode === 'create') {
        await createScreenGroup({ name, ...(location !== undefined ? { location } : {}) })
        message.success('Screen group created')
      } else if (editingGroup?.id != null) {
        await updateScreenGroup(editingGroup.id, {
          name,
          location: location === undefined ? '' : location,
        })
        message.success('Screen group updated')
      }
      setGroupModalOpen(false)
      setEditingGroup(null)
      groupForm.resetFields()
      await loadData()
    } catch (e) {
      if (e?.errorFields) return
      message.error(getApiErrorMessage(e))
    } finally {
      setGroupSubmitting(false)
    }
  }

  const handleDeleteGroup = useCallback(
    async (id) => {
      try {
        await deleteScreenGroup(id)
        message.success('Screen group deleted')
        await loadData()
      } catch (e) {
        message.error(getApiErrorMessage(e))
      }
    },
    [loadData],
  )

  const groupColumns = useMemo(
    () => [
      { title: 'id', dataIndex: 'id', key: 'id', width: 90 },
      { title: 'name', dataIndex: 'name', key: 'name', ellipsis: true },
      {
        title: 'location',
        dataIndex: 'location',
        key: 'location',
        ellipsis: true,
        render: (v) => (v != null && String(v).trim() !== '' ? v : '—'),
      },
      {
        title: 'Actions',
        key: 'gActions',
        width: 160,
        render: (_, record) => (
          <Space size="small">
            {canMutate ? (
              <>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEditGroup(record)}>
                  Edit
                </Button>
                <Popconfirm
                  title="Delete this screen group?"
                  description="Not allowed if any screen still belongs to the group, or schedules reference the group."
                  okText="Delete"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => handleDeleteGroup(record.id)}
                >
                  <Button size="small" danger icon={<DeleteOutlined />}>
                    Delete
                  </Button>
                </Popconfirm>
              </>
            ) : (
              <Typography.Text type="secondary">—</Typography.Text>
            )}
          </Space>
        ),
      },
    ],
    [canMutate, handleDeleteGroup, openEditGroup],
  )

  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields()
      setSubmitting(true)
      await createScreen({
        deviceCode: values.deviceCode.trim(),
        name: values.name.trim(),
        screenGroupId: values.screenGroupId,
      })
      message.success('Screen created')
      setCreateOpen(false)
      await loadData()
    } catch (e) {
      if (e?.errorFields) return
      message.error(getApiErrorMessage(e))
    } finally {
      setSubmitting(false)
    }
  }

  const handleEdit = async () => {
    if (!editingRecord?.id) return
    try {
      const values = await editForm.validateFields()
      setSubmitting(true)
      await updateScreen(editingRecord.id, { name: values.name.trim() })

      const newGid = values.screenGroupId
      const oldGid = editingRecord.screenGroupId ?? null
      const n = newGid == null ? null : Number(newGid)
      const o = oldGid == null ? null : Number(oldGid)
      if (n !== o) {
        await assignScreenGroup(editingRecord.id, { screenGroupId: n })
      }

      message.success('Screen updated')
      setEditOpen(false)
      setEditingRecord(null)
      await loadData()
    } catch (e) {
      if (e?.errorFields) return
      message.error(getApiErrorMessage(e))
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = useCallback(
    async (id) => {
      try {
        await deleteScreen(id)
        message.success('Screen deleted')
        await loadData()
      } catch (e) {
        message.error(getApiErrorMessage(e))
      }
    },
    [loadData],
  )

  const handleActivationCode = useCallback(
    async (record) => {
      try {
        const data = await generateActivationCode(record.id)
        Modal.info({
          title: 'Activation code',
          width: 480,
          content: (
            <div style={{ marginTop: 8 }}>
              <Typography.Text type="secondary">
                Screen: {record.name} ({record.deviceCode})
              </Typography.Text>
              <div style={{ marginTop: 12 }}>
                <Typography.Text
                  copyable
                  strong
                  style={{ fontSize: 18, letterSpacing: 1, fontFamily: 'monospace' }}
                >
                  {data?.activationCode ?? '—'}
                </Typography.Text>
              </div>
              <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0, fontSize: 12 }}>
                Use this code on the device to finish activation.
              </Typography.Paragraph>
            </div>
          ),
        })
        await loadData()
      } catch (e) {
        message.error(getApiErrorMessage(e))
      }
    },
    [loadData],
  )

  const openEdit = useCallback(
    (record) => {
      setEditingRecord(record)
      editForm.setFieldsValue({
        name: record.name,
        screenGroupId: record.screenGroupId ?? undefined,
      })
      setEditOpen(true)
    },
    [editForm],
  )

  const columns = useMemo(
    () => [
      { title: 'name', dataIndex: 'name', key: 'name', ellipsis: true, width: 180 },
      { title: 'deviceCode', dataIndex: 'deviceCode', key: 'deviceCode', width: 140 },
      {
        title: 'screenGroupName',
        dataIndex: 'screenGroupName',
        key: 'screenGroupName',
        width: 140,
        ellipsis: true,
        render: (v) => v ?? '—',
      },
      {
        title: 'status',
        dataIndex: 'status',
        key: 'status',
        width: 110,
        render: (s) => {
          const m = formatStatus(s)
          return <Tag color={m.color}>{m.label}</Tag>
        },
      },
      {
        title: 'activationStatus',
        dataIndex: 'activationStatus',
        key: 'activationStatus',
        width: 130,
        render: (s) => {
          const m = formatActivation(s)
          return <Tag color={m.color}>{m.label}</Tag>
        },
      },
      {
        title: 'wsStatus',
        dataIndex: 'wsStatus',
        key: 'wsStatus',
        width: 130,
        render: (s) => {
          const m = formatWs(s)
          return <Tag color={m.color}>{m.label}</Tag>
        },
      },
      {
        title: 'lastHeartbeatAt',
        dataIndex: 'lastHeartbeatAt',
        key: 'lastHeartbeatAt',
        width: 170,
        render: (v) => formatDateTime(v),
      },
      {
        title: 'resolution',
        key: 'resolution',
        width: 120,
        render: (_, r) => formatResolution(r.resolutionWidth, r.resolutionHeight),
      },
      { title: 'appVersion', dataIndex: 'appVersion', key: 'appVersion', width: 100, ellipsis: true },
      {
        title: 'Actions',
        key: 'actions',
        width: 260,
        fixed: 'right',
        render: (_, record) => (
          <Space wrap size="small">
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => {
                setDetailId(record.id)
                setDetailModalOpen(true)
              }}
            >
              View
            </Button>
            {canMutate ? (
              <>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
                  Edit
                </Button>
                <Button
                  size="small"
                  type="primary"
                  icon={<KeyOutlined />}
                  onClick={() => handleActivationCode(record)}
                >
                  Code
                </Button>
                <Popconfirm
                  title="Delete this screen?"
                  description="Not allowed if schedules still reference this screen."
                  okText="Delete"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => handleDelete(record.id)}
                >
                  <Button size="small" danger icon={<DeleteOutlined />}>
                    Delete
                  </Button>
                </Popconfirm>
              </>
            ) : null}
          </Space>
        ),
      },
    ],
    [canMutate, handleActivationCode, handleDelete, openEdit],
  )

  return (
    <div style={{ padding: 24 }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <Space
          align="baseline"
          style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}
        >
          <div>
            <Typography.Title level={3} style={{ margin: 0, color: '#0f172a' }}>
              Device Management
            </Typography.Title>
            <Typography.Text type="secondary">Manage screens and groups.</Typography.Text>
          </div>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => loadData()} loading={loading}>
              Refresh
            </Button>
            <Tag color="default">Total {filtered.length} screens</Tag>
          </Space>
        </Space>

        {loadError ? (
          <Alert type="error" showIcon message="Failed to load screens" description={loadError} style={{ marginBottom: 16 }} />
        ) : null}

        {!loadError && !loading && filtered.length === 0 ? (
          <Alert
            type="info"
            showIcon
            message="No screens yet"
            description={
              isViewerRole(getStoredRole())
                ? 'Your organization has no registered screens. Viewers cannot add devices; ask an administrator or editor to create them.'
                : 'Create a screen with “Add screen” above.'
            }
            style={{ marginBottom: 16 }}
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
          <Row gutter={[12, 12]} align="middle">
            <Col xs={24} lg={18}>
              <Space wrap>
                <Input
                  allowClear
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="Search name / deviceCode / screenGroupName"
                  style={{ width: 300, maxWidth: '100%' }}
                />
                <Select
                  value={status}
                  onChange={setStatus}
                  style={{ width: 150 }}
                  options={[
                    { value: 'ALL', label: 'All status' },
                    { value: 'ONLINE', label: 'ONLINE' },
                    { value: 'OFFLINE', label: 'OFFLINE' },
                    { value: 'SUSPECT', label: 'SUSPECT' },
                    { value: 'ERROR', label: 'ERROR' },
                  ]}
                />
                <Select
                  value={groupId}
                  onChange={setGroupId}
                  style={{ width: 200 }}
                  options={[
                    { value: 'ALL', label: 'All groups' },
                    { value: 'NONE', label: 'Ungrouped' },
                    ...groups.map((g) => ({ value: String(g.id), label: g.name })),
                  ]}
                />
              </Space>
            </Col>

            <Col xs={24} lg={6} style={{ display: 'flex', justifyContent: 'flex-end' }}>
              {canMutate ? (
                <Button type="primary" icon={<PlusOutlined />} block onClick={openCreate}>
                  Add screen
                </Button>
              ) : null}
            </Col>
          </Row>

          <Divider style={{ marginBlock: 16 }} />

          <div style={{ overflowX: 'auto' }}>
            <Table
              rowKey="id"
              tableLayout="fixed"
              columns={columns}
              dataSource={filtered}
              scroll={{ x: 1400 }}
              loading={loading}
              pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: [10, 20, 50] }}
            />
          </div>
        </Card>

        <Card
          variant="borderless"
          style={{
            marginTop: 16,
            borderRadius: 12,
            overflow: 'hidden',
            boxShadow:
              '0 1px 2px rgba(15, 23, 42, 0.06), 0 12px 32px rgba(15, 23, 42, 0.06)',
          }}
        >
          <Row gutter={[12, 12]} align="middle" style={{ marginBottom: 12 }}>
            <Col xs={24} md={14} lg={16}>
              <Space align="center" wrap>
                <TeamOutlined style={{ fontSize: 18, color: '#1a5fb4' }} />
                <Typography.Title level={5} style={{ margin: 0, color: '#0f172a' }}>
                  Screen groups
                </Typography.Title>
              </Space>
            </Col>
            <Col xs={24} md={10} lg={8} style={{ textAlign: 'right' }}>
              {canMutate ? (
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreateGroup}>
                  Add screen group
                </Button>
              ) : null}
            </Col>
          </Row>
          <Table
            rowKey="id"
            size="middle"
            columns={groupColumns}
            dataSource={groups}
            loading={loading}
            pagination={{ pageSize: 8, showSizeChanger: true }}
          />
        </Card>
      </div>

      <Modal
        title={groupModalMode === 'create' ? 'Create screen group' : 'Edit screen group'}
        open={groupModalOpen}
        onCancel={() => {
          setGroupModalOpen(false)
          setEditingGroup(null)
          groupForm.resetFields()
        }}
        onOk={handleGroupModalOk}
        confirmLoading={groupSubmitting}
        destroyOnHidden
        width={480}
      >
        {groupModalMode === 'edit' && editingGroup?.id != null ? (
          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
            Group id: {editingGroup.id} (cannot change)
          </Typography.Text>
        ) : null}
        <Form form={groupForm} layout="vertical">
          <Form.Item
            label="name"
            name="name"
            rules={[
              { required: true, message: 'Required' },
              { max: 255, message: 'Max 255 characters' },
            ]}
          >
            <Input placeholder="Group name" />
          </Form.Item>
          <Form.Item
            label="location"
            name="location"
            rules={[{ max: 512, message: 'Max 512 characters' }]}
          >
            <Input.TextArea rows={2} placeholder="Optional (e.g. building / floor)" allowClear />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Create screen"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreate}
        confirmLoading={submitting}
        destroyOnHidden
        width={480}
      >
        <Form form={createForm} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item
            label="deviceCode"
            name="deviceCode"
            rules={[
              { required: true, message: 'Required' },
              { max: 64, message: 'Max 64 characters' },
            ]}
          >
            <Input placeholder="Unique device code" autoComplete="off" />
          </Form.Item>
          <Form.Item
            label="name"
            name="name"
            rules={[
              { required: true, message: 'Required' },
              { max: 255, message: 'Max 255 characters' },
            ]}
          >
            <Input placeholder="Display name" />
          </Form.Item>
          <Form.Item label="screenGroupId" name="screenGroupId">
            <Select allowClear placeholder="Optional group" options={groupOptions} optionFilterProp="label" showSearch />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Edit screen"
        open={editOpen}
        onCancel={() => {
          setEditOpen(false)
          setEditingRecord(null)
        }}
        onOk={handleEdit}
        confirmLoading={submitting}
        destroyOnHidden
        width={480}
      >
        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
          Device code: {editingRecord?.deviceCode} (cannot change)
        </Typography.Text>
        <Form form={editForm} layout="vertical">
          <Form.Item
            label="name"
            name="name"
            rules={[
              { required: true, message: 'Required' },
              { max: 255, message: 'Max 255 characters' },
            ]}
          >
            <Input />
          </Form.Item>
          <Form.Item label="screenGroupId" name="screenGroupId">
            <Select allowClear placeholder="Optional group" options={groupOptions} optionFilterProp="label" showSearch />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Screen details"
        open={detailModalOpen}
        onCancel={() => {
          setDetailModalOpen(false)
          setDetailId(null)
          setDetailScreen(null)
        }}
        footer={null}
        width={560}
        destroyOnHidden
      >
        {detailLoading ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <Spin />
          </div>
        ) : detailScreen ? (
          <Descriptions column={1} size="middle" bordered>
            <Descriptions.Item label="id">{detailScreen.id}</Descriptions.Item>
            <Descriptions.Item label="deviceCode">{detailScreen.deviceCode}</Descriptions.Item>
            <Descriptions.Item label="name">{detailScreen.name}</Descriptions.Item>
            <Descriptions.Item label="screenGroupId">{detailScreen.screenGroupId ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="screenGroupName">{detailScreen.screenGroupName ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="activationStatus">
              <Tag color={formatActivation(detailScreen.activationStatus).color}>
                {detailScreen.activationStatus}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="status">
              <Tag color={formatStatus(detailScreen.status).color}>{detailScreen.status}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="wsStatus">
              <Tag color={formatWs(detailScreen.wsStatus).color}>{detailScreen.wsStatus}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="lastHeartbeatAt">{formatDateTime(detailScreen.lastHeartbeatAt)}</Descriptions.Item>
            <Descriptions.Item label="lastWsConnectedAt">{formatDateTime(detailScreen.lastWsConnectedAt)}</Descriptions.Item>
            <Descriptions.Item label="lastWsMessageAt">{formatDateTime(detailScreen.lastWsMessageAt)}</Descriptions.Item>
            <Descriptions.Item label="resolutionWidth">{detailScreen.resolutionWidth ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="resolutionHeight">{detailScreen.resolutionHeight ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="appVersion">{detailScreen.appVersion ?? '—'}</Descriptions.Item>
          </Descriptions>
        ) : (
          <Typography.Text type="secondary">No data</Typography.Text>
        )}
      </Modal>
    </div>
  )
}
