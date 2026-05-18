import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
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
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { getApiErrorMessage, listMedia } from '../../services/mediaService'
import { mapApiMediaItem } from './MediaLibraryPanel'
import {
  PLAYLIST_STATUSES,
  createPlaylist,
  deletePlaylist,
  editorRowsToPlaylistItems,
  getMockPlaylists,
  getPlaylist,
  listPlaylists,
  playlistItemsToEditorRows,
  updatePlaylist,
} from '../../services/playlistService'
import { canWrite, getStoredRole } from '../../services/authService'
import { isViewerRole } from '../../utils/permissions'

const STATUS_META = {
  [PLAYLIST_STATUSES.ACTIVE]: { color: 'green', label: 'Active' },
  [PLAYLIST_STATUSES.ARCHIVED]: { color: 'default', label: 'Archived' },
}

function defaultDurationForMedia(media) {
  if (!media) return 10
  const fromMedia = media.durationSeconds
  if (fromMedia != null && Number.isFinite(Number(fromMedia)) && Number(fromMedia) > 0) {
    return Math.trunc(Number(fromMedia))
  }
  if (media.type === 'VIDEO') return 30
  if (media.type === 'IMAGE') return 10
  return 10
}

function newEditorRow(mediaId, mediaList) {
  const media = mediaList.find((m) => m.id === mediaId)
  return {
    key: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    mediaId,
    durationSeconds: defaultDurationForMedia(media),
  }
}

/**
 * @param {import('./MediaLibraryPanel').mapApiMediaItem extends Function ? never : unknown} props
 */
export default function PlaylistPanel({ mediaItems: mediaItemsProp }) {
  const canMutate = canWrite()
  const [playlists, setPlaylists] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [usingMock, setUsingMock] = useState(false)

  const [mediaItems, setMediaItems] = useState(mediaItemsProp || [])
  const [mediaLoading, setMediaLoading] = useState(false)

  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [submitLoading, setSubmitLoading] = useState(false)
  const [formError, setFormError] = useState('')
  const [form] = Form.useForm()
  const [editorRows, setEditorRows] = useState([])

  const [viewOpen, setViewOpen] = useState(false)
  const [viewLoading, setViewLoading] = useState(false)
  const [viewPlaylist, setViewPlaylist] = useState(null)
  const [viewError, setViewError] = useState('')

  const mediaMap = useMemo(
    () => new Map((mediaItems || []).map((m) => [m.id, m])),
    [mediaItems],
  )

  const mediaSelectOptions = useMemo(
    () =>
      (mediaItems || []).map((m) => ({
        value: m.id,
        label: `${m.name} (${m.type})`,
        disabled: false,
      })),
    [mediaItems],
  )

  const loadMedia = useCallback(async () => {
    if (mediaItemsProp?.length) {
      setMediaItems(mediaItemsProp)
      return
    }
    setMediaLoading(true)
    try {
      const list = await listMedia()
      setMediaItems(Array.isArray(list) ? list.map(mapApiMediaItem) : [])
    } catch {
      setMediaItems([])
    } finally {
      setMediaLoading(false)
    }
  }, [mediaItemsProp])

  const loadPlaylists = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    setUsingMock(false)
    try {
      const data = await listPlaylists()
      setPlaylists(Array.isArray(data) ? data : [])
    } catch (e) {
      setLoadError(getApiErrorMessage(e))
      setPlaylists(getMockPlaylists())
      setUsingMock(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadMedia()
    loadPlaylists()
  }, [loadMedia, loadPlaylists])

  useEffect(() => {
    if (mediaItemsProp?.length) {
      setMediaItems(mediaItemsProp)
    }
  }, [mediaItemsProp])

  const openCreate = () => {
    setEditing(null)
    setFormError('')
    setEditorRows([])
    form.resetFields()
    form.setFieldsValue({ status: PLAYLIST_STATUSES.ACTIVE })
    setEditorOpen(true)
  }

  const openEdit = async (record) => {
    setEditing(record)
    setFormError('')
    setEditorOpen(true)
    form.setFieldsValue({
      name: record.name,
      status: record.status || PLAYLIST_STATUSES.ACTIVE,
    })
    try {
      const full = await getPlaylist(record.id)
      setEditorRows(playlistItemsToEditorRows(full.items))
    } catch (e) {
      setEditorRows(playlistItemsToEditorRows(record.items))
      message.warning(getApiErrorMessage(e))
    }
  }

  const openView = async (record) => {
    setViewOpen(true)
    setViewPlaylist(null)
    setViewError('')
    setViewLoading(true)
    try {
      const full = usingMock ? record : await getPlaylist(record.id)
      setViewPlaylist(full)
    } catch (e) {
      setViewError(getApiErrorMessage(e))
    } finally {
      setViewLoading(false)
    }
  }

  const moveRow = (index, direction) => {
    setEditorRows((rows) => {
      const next = [...rows]
      const target = index + direction
      if (target < 0 || target >= next.length) return rows
      const tmp = next[index]
      next[index] = next[target]
      next[target] = tmp
      return next
    })
  }

  const removeRow = (key) => {
    setEditorRows((rows) => rows.filter((r) => r.key !== key))
  }

  const addRow = () => {
    const first = mediaItems[0]
    if (!first) {
      message.warning('Upload media in the Media library tab first.')
      return
    }
    setEditorRows((rows) => [...rows, newEditorRow(first.id, mediaItems)])
  }

  const onMediaPick = (key, mediaId) => {
    const media = mediaMap.get(mediaId)
    setEditorRows((rows) =>
      rows.map((r) =>
        r.key === key
          ? {
              ...r,
              mediaId,
              durationSeconds: defaultDurationForMedia(media),
            }
          : r,
      ),
    )
  }

  const onDurationChange = (key, value) => {
    setEditorRows((rows) =>
      rows.map((r) => (r.key === key ? { ...r, durationSeconds: value } : r)),
    )
  }

  const onSubmit = async () => {
    setFormError('')
    let values
    try {
      values = await form.validateFields()
    } catch {
      return
    }

    if (editorRows.length === 0) {
      setFormError('Add at least one media item to the playlist.')
      return
    }

    const missingMedia = editorRows.some((r) => !r.mediaId)
    if (missingMedia) {
      setFormError('Every row must have a media selected.')
      return
    }

    const body = {
      name: String(values.name || '').trim(),
      status: values.status,
      items: editorRowsToPlaylistItems(editorRows),
    }

    if (usingMock) {
      message.info('Playlist API unavailable — changes are not persisted (mock mode).')
      setEditorOpen(false)
      return
    }

    setSubmitLoading(true)
    try {
      if (editing?.id != null) {
        await updatePlaylist(editing.id, body)
        message.success('Playlist updated')
      } else {
        await createPlaylist(body)
        message.success('Playlist created')
      }
      setEditorOpen(false)
      await loadPlaylists()
    } catch (e) {
      setFormError(getApiErrorMessage(e))
    } finally {
      setSubmitLoading(false)
    }
  }

  const onDelete = (record) => {
    Modal.confirm({
      title: 'Delete this playlist?',
      content: record.name,
      okText: 'Delete',
      okButtonProps: { danger: true },
      cancelText: 'Cancel',
      onOk: async () => {
        if (usingMock) {
          setPlaylists((prev) => prev.filter((p) => p.id !== record.id))
          message.success('Removed (mock)')
          return
        }
        try {
          await deletePlaylist(record.id)
          message.success('Playlist deleted')
          await loadPlaylists()
        } catch (e) {
          message.error(getApiErrorMessage(e))
        }
      },
    })
  }

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
    },
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
      title: 'Items',
      key: 'items',
      width: 90,
      render: (_, r) => (Array.isArray(r.items) ? r.items.length : 0),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 220,
      render: (_, record) => (
        <Space wrap>
          <Button size="small" icon={<EyeOutlined />} onClick={() => openView(record)}>
            View
          </Button>
          {canMutate ? (
            <>
              <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
                Edit
              </Button>
              <Button size="small" danger icon={<DeleteOutlined />} onClick={() => onDelete(record)}>
                Delete
              </Button>
            </>
          ) : null}
        </Space>
      ),
    },
  ]

  const editorColumns = [
    {
      title: '#',
      key: 'order',
      width: 48,
      render: (_, __, index) => index + 1,
    },
    {
      title: 'Order',
      key: 'move',
      width: 88,
      render: (_, __, index) => (
        <Space size={4}>
          <Button
            type="text"
            size="small"
            icon={<ArrowUpOutlined />}
            disabled={index === 0}
            onClick={() => moveRow(index, -1)}
          />
          <Button
            type="text"
            size="small"
            icon={<ArrowDownOutlined />}
            disabled={index === editorRows.length - 1}
            onClick={() => moveRow(index, 1)}
          />
        </Space>
      ),
    },
    {
      title: 'Media',
      key: 'media',
      render: (_, row) => (
        <Select
          showSearch
          optionFilterProp="label"
          style={{ width: '100%', minWidth: 200 }}
          placeholder="Select media"
          value={row.mediaId}
          loading={mediaLoading}
          options={mediaSelectOptions}
          onChange={(v) => onMediaPick(row.key, v)}
        />
      ),
    },
    {
      title: 'Duration (sec)',
      key: 'duration',
      width: 130,
      render: (_, row) => (
        <InputNumber
          min={1}
          max={86400}
          style={{ width: '100%' }}
          value={row.durationSeconds}
          onChange={(v) => onDurationChange(row.key, v)}
        />
      ),
    },
    {
      title: '',
      key: 'remove',
      width: 48,
      render: (_, row) => (
        <Button
          type="text"
          danger
          size="small"
          icon={<DeleteOutlined />}
          onClick={() => removeRow(row.key)}
        />
      ),
    },
  ]

  return (
    <>
      {usingMock ? (
        <Alert
          type="warning"
          showIcon
          message="Using mock playlist data"
          description="Could not reach the playlist API. Showing sample data until the backend is available."
          style={{ marginBottom: 16 }}
        />
      ) : null}

      {loadError && !usingMock ? (
        <Alert type="error" showIcon message="Failed to load playlists" description={loadError} style={{ marginBottom: 16 }} />
      ) : null}

      {!loadError && !usingMock && !loading && playlists.length === 0 ? (
        <Alert
          type="info"
          showIcon
          message="No playlists yet"
          description={
            isViewerRole(getStoredRole())
              ? 'Your organization has no playlists. Viewers cannot create playlists; ask an administrator or editor to add them.'
              : 'Create a playlist with “Create playlist” above after uploading media.'
          }
          style={{ marginBottom: 16 }}
        />
      ) : null}

      <Card
        variant="borderless"
        style={{
          borderRadius: 12,
          boxShadow:
            '0 1px 2px rgba(15, 23, 42, 0.06), 0 12px 32px rgba(15, 23, 42, 0.06)',
        }}
      >
        <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }} wrap>
          <Typography.Text type="secondary">
            Build ordered playlists from uploaded media. Each item can have a display duration in seconds.
          </Typography.Text>
          <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={loadPlaylists} loading={loading}>
              Refresh
            </Button>
            {canMutate ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                Create playlist
              </Button>
            ) : null}
          </Space>
        </Space>

        <Spin spinning={loading}>
          <Table
            rowKey="id"
            columns={columns}
            dataSource={playlists}
            pagination={{ pageSize: 10, showSizeChanger: false }}
          />
        </Spin>
      </Card>

      <Modal
        title={editing ? 'Edit playlist' : 'Create playlist'}
        open={editorOpen}
        onCancel={() => setEditorOpen(false)}
        onOk={onSubmit}
        okText={editing ? 'Save' : 'Create'}
        confirmLoading={submitLoading}
        width={800}
        destroyOnClose
      >
        {formError ? <Alert type="error" showIcon message={formError} style={{ marginBottom: 16 }} /> : null}

        <Form form={form} layout="vertical" requiredMark={false}>
          <Space size={12} style={{ width: '100%' }} wrap>
            <Form.Item
              label="Playlist name"
              name="name"
              rules={[{ required: true, message: 'Enter playlist name' }]}
              style={{ flex: 1, minWidth: 240 }}
            >
              <Input placeholder="e.g. Lobby rotation" />
            </Form.Item>
            <Form.Item
              label="Status"
              name="status"
              rules={[{ required: true, message: 'Select status' }]}
              style={{ width: 160 }}
            >
              <Select
                options={[
                  { value: PLAYLIST_STATUSES.ACTIVE, label: 'ACTIVE' },
                  { value: PLAYLIST_STATUSES.ARCHIVED, label: 'ARCHIVED' },
                ]}
              />
            </Form.Item>
          </Space>
        </Form>

        <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8 }}>
          <Typography.Text strong>Playlist items</Typography.Text>
          <Button icon={<PlusOutlined />} onClick={addRow} disabled={mediaItems.length === 0}>
            Add media
          </Button>
        </Space>

        {mediaItems.length === 0 ? (
          <Alert
            type="info"
            showIcon
            message="No media available"
            description="Upload files in the Media library tab, then add them here."
            style={{ marginBottom: 12 }}
          />
        ) : null}

        <Table
          rowKey="key"
          size="small"
          pagination={false}
          columns={editorColumns}
          dataSource={editorRows}
          locale={{ emptyText: 'No items — click Add media' }}
        />
      </Modal>

      <Modal
        title="Playlist detail"
        open={viewOpen}
        onCancel={() => setViewOpen(false)}
        footer={[
          <Button key="close" onClick={() => setViewOpen(false)}>
            Close
          </Button>,
          viewPlaylist?.id != null && canMutate ? (
            <Button
              key="edit"
              type="primary"
              onClick={() => {
                setViewOpen(false)
                openEdit(viewPlaylist)
              }}
            >
              Edit
            </Button>
          ) : null,
        ]}
        width={720}
        destroyOnClose
      >
        {viewError ? <Alert type="error" showIcon message={viewError} /> : null}
        <Spin spinning={viewLoading}>
          {viewPlaylist && !viewError ? (
            <>
              <Descriptions bordered size="small" column={1} style={{ marginBottom: 16 }}>
                <Descriptions.Item label="Name">{viewPlaylist.name}</Descriptions.Item>
                <Descriptions.Item label="Status">
                  <Tag color={STATUS_META[viewPlaylist.status]?.color || 'default'}>
                    {viewPlaylist.status}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Items">
                  {Array.isArray(viewPlaylist.items) ? viewPlaylist.items.length : 0}
                </Descriptions.Item>
              </Descriptions>
              <Table
                rowKey={(r) => r.id ?? `${r.mediaId}-${r.orderIndex}`}
                size="small"
                pagination={false}
                dataSource={[...(viewPlaylist.items || [])].sort(
                  (a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0),
                )}
                columns={[
                  { title: '#', width: 48, render: (_, __, i) => i + 1 },
                  {
                    title: 'Media',
                    render: (_, row) =>
                      mediaMap.get(row.mediaId)?.name || `Media #${row.mediaId}`,
                  },
                  {
                    title: 'Duration (sec)',
                    dataIndex: 'durationSeconds',
                    width: 120,
                    render: (v) => (v != null ? v : '—'),
                  },
                ]}
              />
            </>
          ) : null}
        </Spin>
      </Modal>
    </>
  )
}
