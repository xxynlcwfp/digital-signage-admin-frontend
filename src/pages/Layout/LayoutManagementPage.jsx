import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Card, Divider, Input, Modal, Space, Spin, Table, Tag, Typography, message } from 'antd'
import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import {
  deleteLayout,
  getApiErrorMessage,
  getLayout,
  listLayouts,
  toUpdateLayoutRequest,
  updateLayout,
} from '../../services/layoutService'

function statusMeta(status) {
  const s = typeof status === 'string' ? status : String(status || '')
  if (s === 'PUBLISHED') return { color: 'green', label: 'Published' }
  if (s === 'DISABLED') return { color: 'default', label: 'Disabled' }
  return { color: 'gold', label: 'Draft' }
}

function formatUpdatedAt(iso) {
  if (iso == null) return '-'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString()
}

const COMPONENT_LABELS = [
  { type: 'PLAYLIST', name: 'Playlist' },
  { type: 'MARQUEE', name: 'Text/Marquee' },
  { type: 'IMAGE', name: 'Image/Media' },
  { type: 'VIDEO', name: 'Video' },
  { type: 'CLOCK', name: 'Clock' },
  { type: 'CAROUSEL', name: 'Carousel' },
  { type: 'YOUTUBE', name: 'YouTube' },
]

function componentLabel(type) {
  const hit = COMPONENT_LABELS.find((c) => c.type === type)
  return hit?.name || String(type || '-')
}

/** CSS / draw order: use API zIndex when set, else stable fallback by index */
function stackZ(r, index) {
  const v = r?.zIndex ?? r?.z_index ?? r?.zindex
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? n : index + 1
}

/**
 * Read-only canvas: regions as % of layout resolution (same idea as layout editor).
 * @param {{ resolutionWidth?: number, resolutionHeight?: number, regions?: unknown[] } | null} layout
 */
function LayoutPreviewCanvas({ layout }) {
  if (!layout) return null
  const rw = Number(layout.resolutionWidth)
  const rh = Number(layout.resolutionHeight)
  const baseW = Math.max(1, Number.isFinite(rw) ? rw : 1920)
  const baseH = Math.max(1, Number.isFinite(rh) ? rh : 1080)
  const regions = Array.isArray(layout.regions) ? layout.regions : []

  if (regions.length === 0) {
    return (
      <Typography.Text type="secondary">No regions in this layout.</Typography.Text>
    )
  }

  return (
    <div
      style={{
        width: '100%',
        maxHeight: 'min(52vh, 440px)',
        aspectRatio: `${baseW} / ${baseH}`,
        margin: '0 auto',
        position: 'relative',
        background: 'linear-gradient(135deg, #e2e8f0 0%, #f1f5f9 55%, #e2e8f0 100%)',
        border: '1px solid #e2e8f0',
        borderRadius: 12,
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      {regions
        .map((r, idx) => ({ r, idx }))
        .sort((a, b) => stackZ(a.r, a.idx) - stackZ(b.r, b.idx))
        .map(({ r, idx: i }) => {
          const x = Number(r?.x) || 0
          const y = Number(r?.y) || 0
          const rw0 = Math.max(1, Number(r?.width) || 1)
          const rh0 = Math.max(1, Number(r?.height) || 1)
          const c0 = r?.components?.[0]
          const ctype = c0?.componentType || 'PLAYLIST'
          const left = `${(x / baseW) * 100}%`
          const top = `${(y / baseH) * 100}%`
          const w = `${(rw0 / baseW) * 100}%`
          const h = `${(rh0 / baseH) * 100}%`
          return (
            <div
              key={r?.id ?? `r-${i}`}
              style={{
                position: 'absolute',
                left,
                top,
                width: w,
                height: h,
                borderRadius: 8,
                border: '1px dashed #64748b',
                background: 'rgba(255,255,255,0.72)',
                padding: 8,
                boxSizing: 'border-box',
                zIndex: stackZ(r, i),
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                minHeight: 0,
              }}
            >
              <Space size={6} wrap style={{ width: '100%' }}>
                <Tag color="geekblue" style={{ margin: 0, maxWidth: '100%' }}>
                  {componentLabel(ctype)}
                </Tag>
              </Space>
              <Typography.Text
                strong
                style={{ color: '#0f172a', fontSize: 12, lineHeight: 1.3 }}
                ellipsis={{ tooltip: r?.regionName }}
              >
                {r?.regionName || `Region ${i + 1}`}
              </Typography.Text>
            </div>
          )
        })}
    </div>
  )
}

export default function LayoutManagementPage() {
  const navigate = useNavigate()
  const [keyword, setKeyword] = useState('')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewItem, setPreviewItem] = useState(null)
  const [previewDetail, setPreviewDetail] = useState(null)

  const loadLayouts = useCallback(async () => {
    setLoading(true)
    try {
      const list = await listLayouts()
      const rows = (Array.isArray(list) ? list : []).map((l) => ({
        id: l.id,
        name: l.name,
        templateType: l.templateType,
        resolution: `${l.resolutionWidth}×${l.resolutionHeight}`,
        status: l.status,
        updatedAt: formatUpdatedAt(l.updatedAt),
        raw: l,
      }))
      setItems(rows)
    } catch (e) {
      message.error(getApiErrorMessage(e))
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadLayouts()
  }, [loadLayouts])

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    if (!kw) return items
    return items.filter((x) => String(x.name).toLowerCase().includes(kw))
  }, [items, keyword])

  const openPreview = async (record) => {
    setPreviewItem(record)
    setPreviewDetail(null)
    setPreviewOpen(true)
    setPreviewLoading(true)
    try {
      const detail = await getLayout(record.id)
      setPreviewDetail(detail)
    } catch (e) {
      message.error(getApiErrorMessage(e))
    } finally {
      setPreviewLoading(false)
    }
  }

  const columns = useMemo(
    () => [
      { title: 'Name', dataIndex: 'name', key: 'name', ellipsis: true, width: 200 },
      { title: 'Template', dataIndex: 'templateType', key: 'templateType', width: 130 },
      { title: 'Resolution', dataIndex: 'resolution', key: 'resolution', width: 130 },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        width: 110,
        render: (s) => {
          const m = statusMeta(s)
          return <Tag color={m.color}>{m.label}</Tag>
        },
      },
      { title: 'Updated', dataIndex: 'updatedAt', key: 'updatedAt', width: 170 },
      {
        title: 'Actions',
        key: 'actions',
        width: 280,
        fixed: 'right',
        render: (_, record) => (
          <Space wrap>
            <Button size="small" icon={<EyeOutlined />} onClick={() => openPreview(record)}>
              View
            </Button>
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => navigate(`/layouts/editor?id=${record.id}`)}
            >
              Edit
            </Button>
            <Button
              size="small"
              type="primary"
              icon={<UploadOutlined />}
              disabled={String(record.status) === 'PUBLISHED'}
              onClick={() => {
                Modal.confirm({
                  title: 'Publish this layout?',
                  content: record.name,
                  okText: 'Publish',
                  cancelText: 'Cancel',
                  onOk: async () => {
                    try {
                      const latest = await getLayout(record.id)
                      await updateLayout(record.id, toUpdateLayoutRequest(latest, { status: 'PUBLISHED' }))
                      message.success('Published')
                      await loadLayouts()
                    } catch (e) {
                      message.error(getApiErrorMessage(e))
                      return Promise.reject(e)
                    }
                  },
                })
              }}
            >
              Publish
            </Button>
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => {
                Modal.confirm({
                  title: 'Delete this layout?',
                  content: record.name,
                  okText: 'Delete',
                  okButtonProps: { danger: true },
                  cancelText: 'Cancel',
                  onOk: async () => {
                    try {
                      await deleteLayout(record.id)
                      message.success('Deleted')
                      await loadLayouts()
                    } catch (e) {
                      message.error(getApiErrorMessage(e))
                      return Promise.reject(e)
                    }
                  },
                })
              }}
            />
          </Space>
        ),
      },
    ],
    [loadLayouts, navigate],
  )

  return (
    <div style={{ padding: 24 }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <Space
          align="baseline"
          style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}
        >
          <Typography.Title level={3} style={{ margin: 0, color: '#0f172a' }}>
            Layout Management
          </Typography.Title>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => loadLayouts()} loading={loading}>
              Refresh
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/layouts/editor')}>
              Create Layout
            </Button>
          </Space>
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
          <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
            <Input
              allowClear
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Search by name"
              style={{ width: 280, maxWidth: '100%' }}
            />
            <Tag color="default">Total {filtered.length}</Tag>
          </Space>

          <div style={{ marginTop: 16, overflowX: 'auto' }}>
            <Spin spinning={loading}>
              <Table
                rowKey="id"
                tableLayout="fixed"
                columns={columns}
                dataSource={filtered}
                pagination={{ pageSize: 10, showSizeChanger: false }}
                scroll={{ x: 1000 }}
              />
            </Spin>
          </div>
        </Card>
      </div>

      <Modal
        title="Layout preview"
        open={previewOpen}
        onCancel={() => setPreviewOpen(false)}
        footer={[
          <Button key="close" onClick={() => setPreviewOpen(false)}>
            Close
          </Button>,
        ]}
        width={800}
        destroyOnClose
      >
        {previewItem ? (
          <Spin spinning={previewLoading}>
            <Space direction="vertical" size={14} style={{ width: '100%' }}>
              <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
                <Typography.Text strong>{previewItem.name}</Typography.Text>
                <Space size={8}>
                  <Tag>{previewItem.templateType}</Tag>
                  <Tag color="default">{previewItem.resolution}</Tag>
                  <Tag color={statusMeta(previewItem.status).color}>
                    {statusMeta(previewItem.status).label}
                  </Tag>
                </Space>
              </Space>
              {previewDetail ? (
                <>
                  <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                    Proportional preview (read-only). Open Edit to change regions.
                  </Typography.Text>
                  <LayoutPreviewCanvas layout={previewDetail} />
                  <Divider style={{ margin: '8px 0' }} />
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {previewDetail.regions?.length ?? 0} region(s)
                  </Typography.Text>
                </>
              ) : !previewLoading ? (
                <Typography.Text type="secondary">Could not load layout detail.</Typography.Text>
              ) : null}
            </Space>
          </Spin>
        ) : null}
      </Modal>
    </div>
  )
}
