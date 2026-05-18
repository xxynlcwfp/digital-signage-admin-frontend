import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Dropdown,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons'
import { canManageUsers, getStoredUser } from '../../services/authService'
import {
  createUser,
  deleteUser,
  getApiErrorMessage,
  listUsers,
  updateUser,
} from '../../services/userService'

const ROLE_OPTIONS = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'EDITOR', label: 'Editor' },
  { value: 'VIEWER', label: 'Viewer' },
]

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'DISABLED', label: 'Disabled' },
]

function formatRole(role) {
  const map = {
    ADMIN: { color: 'purple', label: 'Admin' },
    EDITOR: { color: 'blue', label: 'Editor' },
    VIEWER: { color: 'default', label: 'Viewer' },
  }
  return map[role] || { color: 'default', label: String(role || '—') }
}

function formatStatus(status) {
  const map = {
    ACTIVE: { color: 'green', label: 'Active' },
    DISABLED: { color: 'red', label: 'Disabled' },
  }
  return map[status] || { color: 'default', label: String(status || '—') }
}

function formatDateTime(value) {
  if (value == null) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString()
}

export default function UserManagementPage() {
  const currentUser = getStoredUser()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [roleUpdatingId, setRoleUpdatingId] = useState(null)

  const [createForm] = Form.useForm()
  const [editForm] = Form.useForm()

  const loadData = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const list = await listUsers()
      setUsers(Array.isArray(list) ? list : [])
    } catch (e) {
      setLoadError(getApiErrorMessage(e))
      setUsers([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (canManageUsers()) {
      loadData()
    }
  }, [loadData])

  const openCreate = () => {
    createForm.resetFields()
    createForm.setFieldsValue({ role: 'VIEWER' })
    setCreateOpen(true)
  }

  const openEdit = useCallback(
    (record) => {
      setEditingRecord(record)
      editForm.setFieldsValue({
        email: record.email ?? '',
        role: record.role,
        status: record.status,
        password: '',
      })
      setEditOpen(true)
    },
    [editForm],
  )

  const handleCreateOk = async () => {
    try {
      const values = await createForm.validateFields()
      setSubmitting(true)
      await createUser({
        username: values.username,
        password: values.password,
        email: values.email,
        role: values.role,
      })
      message.success('User created')
      setCreateOpen(false)
      await loadData()
    } catch (e) {
      if (e?.errorFields) return
      message.error(getApiErrorMessage(e))
    } finally {
      setSubmitting(false)
    }
  }

  const handleEditOk = async () => {
    if (editingRecord?.id == null) return
    try {
      const values = await editForm.validateFields()
      setSubmitting(true)
      const payload = {
        email: values.email ?? '',
        role: values.role,
        status: values.status,
      }
      if (values.password != null && String(values.password).trim() !== '') {
        payload.password = values.password
      }
      await updateUser(editingRecord.id, payload)
      message.success('User updated')
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
        await deleteUser(id)
        message.success('User deleted')
        await loadData()
      } catch (e) {
        message.error(getApiErrorMessage(e))
      }
    },
    [loadData],
  )

  const handleRoleChange = useCallback(
    async (record, newRole) => {
      if (!record?.id || record.role === newRole) return
      setRoleUpdatingId(record.id)
      try {
        await updateUser(record.id, { role: newRole })
        message.success(`Role updated to ${newRole}`)
        await loadData()
      } catch (e) {
        message.error(getApiErrorMessage(e))
      } finally {
        setRoleUpdatingId(null)
      }
    },
    [loadData],
  )

  const columns = useMemo(
    () => [
      {
        title: 'Username / Email',
        key: 'username',
        render: (_, record) => (
          <Space direction="vertical" size={0}>
            <Typography.Text strong>{record.username || '—'}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {record.email || '—'}
            </Typography.Text>
          </Space>
        ),
      },
      {
        title: 'Role',
        dataIndex: 'role',
        key: 'role',
        width: 120,
        render: (role) => {
          const { color, label } = formatRole(role)
          return <Tag color={color}>{label}</Tag>
        },
      },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        width: 110,
        render: (status) => {
          const { color, label } = formatStatus(status)
          return <Tag color={color}>{label}</Tag>
        },
      },
      {
        title: 'Created',
        dataIndex: 'createdAt',
        key: 'createdAt',
        width: 180,
        render: (v) => formatDateTime(v),
      },
      {
        title: 'Actions',
        key: 'actions',
        width: 220,
        render: (_, record) => {
          const isSelf =
            currentUser?.userId != null && String(currentUser.userId) === String(record.id)
          const roleMenuItems = ROLE_OPTIONS.filter((opt) => opt.value !== record.role).map(
            (opt) => ({
              key: opt.value,
              label: `Set as ${opt.label}`,
              onClick: () => handleRoleChange(record, opt.value),
            }),
          )

          return (
            <Space size="small" wrap>
              <Dropdown
                menu={{ items: roleMenuItems }}
                trigger={['click']}
                disabled={roleUpdatingId === record.id}
              >
                <Button
                  size="small"
                  icon={<UserSwitchOutlined />}
                  loading={roleUpdatingId === record.id}
                >
                  Role
                </Button>
              </Dropdown>
              <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
                Edit
              </Button>
              <Popconfirm
                title="Delete this user?"
                description="This action cannot be undone."
                okText="Delete"
                okButtonProps={{ danger: true }}
                onConfirm={() => handleDelete(record.id)}
                disabled={isSelf}
              >
                <Button size="small" danger icon={<DeleteOutlined />} disabled={isSelf}>
                  Delete
                </Button>
              </Popconfirm>
            </Space>
          )
        },
      },
    ],
    [currentUser?.userId, handleDelete, handleRoleChange, openEdit, roleUpdatingId],
  )

  if (!canManageUsers()) {
    return (
      <PageShell title="Access denied">
        <Alert
          type="warning"
          showIcon
          message="You do not have permission to view this page."
          description="User management is available to administrators only."
        />
      </PageShell>
    )
  }

  return (
    <PageShell
      title="User Management"
      subtitle="Manage organization users, roles, and access."
    >
      <Space
        align="baseline"
        style={{ width: '100%', justifyContent: 'flex-end', marginBottom: 16 }}
      >
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => loadData()} loading={loading}>
            Refresh
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Add user
          </Button>
          <Tag color="default">Total {users.length} users</Tag>
        </Space>
      </Space>

      {loadError ? (
        <Alert
          type="error"
          showIcon
          message="Failed to load users"
          description={loadError}
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
        <Table
          rowKey="id"
          columns={columns}
          dataSource={users}
          loading={loading}
          pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t) => `${t} users` }}
          locale={{ emptyText: loading ? 'Loading…' : 'No users' }}
        />
      </Card>

      <Modal
        title="Add user"
        open={createOpen}
        onOk={handleCreateOk}
        onCancel={() => setCreateOpen(false)}
        confirmLoading={submitting}
        destroyOnHidden
        okText="Create"
      >
        <Form form={createForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="username"
            label="Username"
            rules={[
              { required: true, message: 'Username is required' },
              { max: 64, message: 'Maximum 64 characters' },
            ]}
          >
            <Input placeholder="Username" autoComplete="off" />
          </Form.Item>
          <Form.Item
            name="password"
            label="Password"
            rules={[
              { required: true, message: 'Password is required' },
              { min: 6, message: 'At least 6 characters' },
              { max: 128, message: 'Maximum 128 characters' },
            ]}
          >
            <Input.Password placeholder="Password" autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="email"
            label="Email"
            rules={[
              { type: 'email', message: 'Invalid email' },
              { max: 255, message: 'Maximum 255 characters' },
            ]}
          >
            <Input placeholder="Email (optional)" />
          </Form.Item>
          <Form.Item name="role" label="Role" rules={[{ required: true, message: 'Role is required' }]}>
            <Select options={ROLE_OPTIONS} placeholder="Select role" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingRecord ? `Edit user: ${editingRecord.username}` : 'Edit user'}
        open={editOpen}
        onOk={handleEditOk}
        onCancel={() => {
          setEditOpen(false)
          setEditingRecord(null)
        }}
        confirmLoading={submitting}
        destroyOnHidden
        okText="Save"
      >
        <Form form={editForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="email"
            label="Email"
            rules={[
              { type: 'email', message: 'Invalid email' },
              { max: 255, message: 'Maximum 255 characters' },
            ]}
          >
            <Input placeholder="Email (optional)" />
          </Form.Item>
          <Form.Item name="role" label="Role" rules={[{ required: true, message: 'Role is required' }]}>
            <Select options={ROLE_OPTIONS} placeholder="Select role" />
          </Form.Item>
          <Form.Item name="status" label="Status" rules={[{ required: true, message: 'Status is required' }]}>
            <Select options={STATUS_OPTIONS} placeholder="Select status" />
          </Form.Item>
          <Form.Item
            name="password"
            label="New password"
            rules={[
              { min: 6, message: 'At least 6 characters' },
              { max: 128, message: 'Maximum 128 characters' },
            ]}
            extra="Leave blank to keep the current password"
          >
            <Input.Password placeholder="New password (optional)" autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>
    </PageShell>
  )
}

function PageShell({ title, subtitle, children }) {
  return (
    <div style={{ padding: 24 }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <Space
          align="baseline"
          style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}
        >
          <div>
            <Typography.Title level={3} style={{ margin: 0, color: '#0f172a' }}>
              {title}
            </Typography.Title>
            {subtitle ? <Typography.Text type="secondary">{subtitle}</Typography.Text> : null}
          </div>
        </Space>
        {children}
      </div>
    </div>
  )
}
