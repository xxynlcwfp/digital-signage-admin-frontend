import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Layout,
  Modal,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from 'antd'
import { ArrowLeftOutlined, SaveOutlined, SendOutlined, PlusOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  buildCreateLayoutRequest,
  buildUpdateLayoutRequestFromEditor,
  createLayout,
  getApiErrorMessage,
  getLayout,
  getLayoutTemplateSkeleton,
  listLayoutTemplates,
  updateLayout,
} from '../../services/layoutService'
import { canWrite } from '../../services/authService'

const { Content, Sider } = Layout

const COMPONENTS = [
  { type: 'PLAYLIST', name: 'Playlist' },
  { type: 'MARQUEE', name: 'Text/Marquee' },
  { type: 'IMAGE', name: 'Image/Media' },
  { type: 'VIDEO', name: 'Video' },
  { type: 'CLOCK', name: 'Clock' },
  { type: 'CAROUSEL', name: 'Carousel' },
  { type: 'YOUTUBE', name: 'YouTube' },
]

function niceType(type) {
  const hit = COMPONENTS.find((c) => c.type === type)
  return hit?.name || String(type || '-')
}

function clamp(n, min, max) {
  const x = Number.isFinite(n) ? n : min
  return Math.min(Math.max(x, min), max)
}

function newClientId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function pickZIndex(r, fallbackIndex) {
  const v = r.zIndex ?? r.z_index ?? r.zindex
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? n : fallbackIndex + 1
}

function mapSkeletonRegionToUi(r, i) {
  const comps = (r.components || []).map((c, j) => ({
    componentType: c.componentType || 'PLAYLIST',
    configJson: typeof c.configJson === 'string' ? c.configJson : '{}',
    sortOrder: c.sortOrder != null ? c.sortOrder : j,
  }))
  return {
    clientId: newClientId(`sk-${i}`),
    regionName: r.regionName,
    x: r.x,
    y: r.y,
    width: r.width,
    height: r.height,
    zIndex: pickZIndex(r, i),
    components: comps.length ? comps : [{ componentType: 'PLAYLIST', configJson: '{}', sortOrder: 0 }],
  }
}

function mapLoadedRegionToUi(r, idx) {
  const comps = (r.components || []).map((c, j) => ({
    componentType: c.componentType || 'PLAYLIST',
    configJson: typeof c.configJson === 'string' ? c.configJson : '{}',
    sortOrder: c.sortOrder != null ? c.sortOrder : j,
  }))
  return {
    clientId: newClientId(`db-${r.id ?? idx}`),
    regionName: r.regionName,
    x: r.x,
    y: r.y,
    width: r.width,
    height: r.height,
    zIndex: pickZIndex(r, idx),
    components: comps.length ? comps : [{ componentType: 'PLAYLIST', configJson: '{}', sortOrder: 0 }],
  }
}

export default function LayoutEditorPage() {
  const canMutate = canWrite()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const idParam = params.get('id')
  const layoutId = idParam ? Number(idParam) : null
  const isNew = layoutId == null || Number.isNaN(layoutId)

  const [metaForm] = Form.useForm()
  const [propsForm] = Form.useForm()

  const [templates, setTemplates] = useState([])
  const [templatesLoading, setTemplatesLoading] = useState(true)
  const [layoutLoading, setLayoutLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [regions, setRegions] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [skeletonNonce, setSkeletonNonce] = useState(0)

  const resolutionWidth = Form.useWatch('resolutionWidth', metaForm)
  const resolutionHeight = Form.useWatch('resolutionHeight', metaForm)
  const templateTypeWatch = Form.useWatch('templateType', metaForm)

  const baseCanvas = useMemo(() => {
    const w = Number(resolutionWidth) || 1920
    const h = Number(resolutionHeight) || 1080
    return { width: Math.max(1, w), height: Math.max(1, h) }
  }, [resolutionHeight, resolutionWidth])

  const displayCanvas = useMemo(() => {
    const maxW = 960
    const maxH = 540
    const scale = Math.min(maxW / baseCanvas.width, maxH / baseCanvas.height, 1)
    return {
      width: Math.round(baseCanvas.width * scale),
      height: Math.round(baseCanvas.height * scale),
      scale,
    }
  }, [baseCanvas.height, baseCanvas.width])

  const selectedRegion = useMemo(
    () => regions.find((r) => r.clientId === selectedId) || null,
    [regions, selectedId],
  )

  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true)
    try {
      const list = await listLayoutTemplates()
      setTemplates(Array.isArray(list) ? list : [])
    } catch (e) {
      message.error(getApiErrorMessage(e))
      setTemplates([])
    } finally {
      setTemplatesLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

  useEffect(() => {
    if (!isNew) return
    if (templatesLoading || templates.length === 0) return
    const cur = metaForm.getFieldValue('templateType')
    if (!cur) {
      metaForm.setFieldsValue({
        name: metaForm.getFieldValue('name') || 'New layout',
        templateType: templates[0].templateType,
        resolutionWidth: 1920,
        resolutionHeight: 1080,
      })
      setSkeletonNonce((n) => n + 1)
    }
  }, [isNew, metaForm, templates, templatesLoading])

  useEffect(() => {
    if (!isNew) return
    if (templatesLoading) return
    const tt = templateTypeWatch || metaForm.getFieldValue('templateType') || 'SINGLE_FULL'
    const w = Number(resolutionWidth) || 1920
    const h = Number(resolutionHeight) || 1080
    let cancelled = false
    ;(async () => {
      try {
        const sk = await getLayoutTemplateSkeleton(tt, w, h)
        if (cancelled) return
        setRegions((sk.regions || []).map((r, i) => mapSkeletonRegionToUi(r, i)))
        setSelectedId(null)
      } catch (e) {
        if (!cancelled) message.error(getApiErrorMessage(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    isNew,
    templatesLoading,
    templateTypeWatch,
    resolutionWidth,
    resolutionHeight,
    skeletonNonce,
    metaForm,
  ])

  useEffect(() => {
    if (isNew) {
      setLayoutLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      setLayoutLoading(true)
      try {
        const layout = await getLayout(layoutId)
        if (cancelled) return
        metaForm.setFieldsValue({
          name: layout.name,
          templateType: layout.templateType,
          resolutionWidth: layout.resolutionWidth,
          resolutionHeight: layout.resolutionHeight,
        })
        setRegions((layout.regions || []).map((r, idx) => mapLoadedRegionToUi(r, idx)))
        setSelectedId(null)
      } catch (e) {
        if (!cancelled) message.error(getApiErrorMessage(e))
      } finally {
        if (!cancelled) setLayoutLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isNew, layoutId, metaForm])

  useEffect(() => {
    setRegions((prev) =>
      prev.map((r) => ({
        ...r,
        x: clamp(r.x, 0, baseCanvas.width),
        y: clamp(r.y, 0, baseCanvas.height),
        width: clamp(r.width, 40, baseCanvas.width),
        height: clamp(r.height, 40, baseCanvas.height),
      })),
    )
  }, [baseCanvas.height, baseCanvas.width])

  useEffect(() => {
    if (!selectedRegion) {
      propsForm.resetFields()
      return
    }
    const c0 = selectedRegion.components?.[0] || {
      componentType: 'PLAYLIST',
      configJson: '{}',
      sortOrder: 0,
    }
    propsForm.setFieldsValue({
      regionName: selectedRegion.regionName,
      x: selectedRegion.x,
      y: selectedRegion.y,
      width: selectedRegion.width,
      height: selectedRegion.height,
      zIndex: selectedRegion.zIndex,
      componentType: c0.componentType,
      configJson: c0.configJson || '{}',
    })
  }, [propsForm, selectedRegion])

  const addRegion = (componentType) => {
    setRegions((prev) => {
      const count = prev.length
      const w = 220
      const h = 120
      const x = 24 + (count % 3) * 30
      const y = 24 + (count % 4) * 26
      const region = {
        clientId: newClientId('add'),
        regionName: `${niceType(componentType)} ${count + 1}`,
        x: clamp(x, 0, baseCanvas.width - 40),
        y: clamp(y, 0, baseCanvas.height - 40),
        width: clamp(w, 40, baseCanvas.width),
        height: clamp(h, 40, baseCanvas.height),
        zIndex: count + 1,
        components: [{ componentType, configJson: '{}', sortOrder: 0 }],
      }
      return [region, ...prev]
    })
    setSelectedId(null)
    message.success('Region added')
  }

  const removeSelected = () => {
    if (!selectedRegion) return
    Modal.confirm({
      title: 'Delete this region?',
      content: selectedRegion.regionName,
      okText: 'Delete',
      okButtonProps: { danger: true },
      cancelText: 'Cancel',
      onOk: () => {
        setRegions((prev) => prev.filter((r) => r.clientId !== selectedRegion.clientId))
        setSelectedId(null)
      },
    })
  }

  const updateSelected = (patch) => {
    if (!selectedRegion) return
    setRegions((prev) =>
      prev.map((r) => (r.clientId === selectedRegion.clientId ? { ...r, ...patch } : r)),
    )
  }

  const onPropsChange = (_, allValues) => {
    if (!selectedRegion) return
    const comps = [...(selectedRegion.components || [])]
    if (!comps.length) {
      comps.push({ componentType: 'PLAYLIST', configJson: '{}', sortOrder: 0 })
    }
    comps[0] = {
      ...comps[0],
      componentType: allValues.componentType,
      configJson: typeof allValues.configJson === 'string' ? allValues.configJson : '{}',
      sortOrder: comps[0].sortOrder ?? 0,
    }
    updateSelected({
      regionName: allValues.regionName,
      x: clamp(allValues.x, 0, baseCanvas.width),
      y: clamp(allValues.y, 0, baseCanvas.height),
      width: clamp(allValues.width, 40, baseCanvas.width),
      height: clamp(allValues.height, 40, baseCanvas.height),
      zIndex: clamp(allValues.zIndex, 0, 9999),
      components: comps,
    })
  }

  const readEditorState = async (status) => {
    const v = await metaForm.validateFields()
    if (!regions.length) {
      throw new Error('At least one region is required')
    }
    return {
      name: v.name,
      templateType: v.templateType,
      resolutionWidth: v.resolutionWidth,
      resolutionHeight: v.resolutionHeight,
      status,
      regions,
    }
  }

  const onSaveDraft = async () => {
    setSaving(true)
    try {
      const state = await readEditorState('DRAFT')
      if (isNew) {
        const saved = await createLayout(buildCreateLayoutRequest(state))
        message.success('Saved')
        navigate(`/layouts/editor?id=${saved.id}`, { replace: true })
      } else {
        await updateLayout(layoutId, buildUpdateLayoutRequestFromEditor(state))
        message.success('Saved')
      }
    } catch (e) {
      message.error(getApiErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const onPublish = async () => {
    setSaving(true)
    try {
      const state = await readEditorState('PUBLISHED')
      if (isNew) {
        await createLayout(buildCreateLayoutRequest(state))
        message.success('Published')
        navigate('/layouts')
      } else {
        await updateLayout(layoutId, buildUpdateLayoutRequestFromEditor(state))
        message.success('Published')
        navigate('/layouts')
      }
    } catch (e) {
      message.error(getApiErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const applyTemplateAgain = () => {
    if (!isNew) {
      message.info('Edit existing layouts by manually adjusting regions on the canvas; new layouts can reload the template skeleton.')
      return
    }
    setSkeletonNonce((n) => n + 1)
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <Space
          align="baseline"
          style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}
        >
          <Typography.Title level={3} style={{ margin: 0, color: '#0f172a' }}>
            Layout Editor
          </Typography.Title>
          <Tag color="blue">{isNew ? 'New' : `Edit #${layoutId}`}</Tag>
        </Space>

        <Spin spinning={layoutLoading || templatesLoading}>
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
              <Space wrap>
                <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/layouts')}>
                  Back
                </Button>
                {canMutate ? (
                  <>
                    <Button icon={<SaveOutlined />} loading={saving} onClick={onSaveDraft}>
                      Save draft
                    </Button>
                    <Button type="primary" icon={<SendOutlined />} loading={saving} onClick={onPublish}>
                      Publish
                    </Button>
                    {isNew ? (
                      <Button onClick={applyTemplateAgain}>Reload template</Button>
                    ) : null}
                  </>
                ) : null}
              </Space>

              <Form
                form={metaForm}
                layout="inline"
                style={{ marginTop: 4, marginBottom: 4, justifyContent: 'flex-end' }}
              >
                <Form.Item
                  label="Name"
                  name="name"
                  rules={[{ required: true, message: 'Enter layout name' }]}
                >
                  <Input style={{ width: 200 }} placeholder="Layout name" />
                </Form.Item>
                <Form.Item
                  label="Template"
                  name="templateType"
                  rules={[{ required: true, message: 'Select template' }]}
                >
                  <Select
                    style={{ width: 180 }}
                    options={templates.map((t) => ({
                      value: t.templateType,
                      label: t.displayName || t.templateType,
                    }))}
                  />
                </Form.Item>
                <Form.Item label="Resolution" required style={{ marginRight: 0 }} shouldUpdate>
                  <Space size={8}>
                    <Form.Item
                      name="resolutionWidth"
                      noStyle
                      rules={[{ required: true, message: 'Width required' }]}
                    >
                      <InputNumber min={1} max={99999} style={{ width: 110 }} />
                    </Form.Item>
                    <Typography.Text type="secondary">×</Typography.Text>
                    <Form.Item
                      name="resolutionHeight"
                      noStyle
                      rules={[{ required: true, message: 'Height required' }]}
                    >
                      <InputNumber min={1} max={99999} style={{ width: 110 }} />
                    </Form.Item>
                  </Space>
                </Form.Item>
              </Form>
            </Space>
          </Card>

          <Layout
            style={{
              marginTop: 16,
              background: 'transparent',
              gap: 16,
            }}
          >
            <Sider
              width={240}
              style={{ background: 'transparent' }}
              breakpoint="lg"
              collapsedWidth={0}
            >
              <Card
                title="Components"
                variant="borderless"
                style={{
                  borderRadius: 12,
                  boxShadow:
                    '0 1px 2px rgba(15, 23, 42, 0.06), 0 12px 32px rgba(15, 23, 42, 0.06)',
                }}
              >
                <Space direction="vertical" size={10} style={{ width: '100%' }}>
                  {COMPONENTS.map((c) => (
                    <div
                      key={c.type}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        padding: '10px 12px',
                        borderRadius: 10,
                        border: '1px solid #eef2f7',
                        background: '#f8fafc',
                      }}
                    >
                      <Tag color="geekblue" style={{ margin: 0 }}>
                        {c.name}
                      </Tag>
                      {canMutate ? (
                        <Button size="small" icon={<PlusOutlined />} onClick={() => addRegion(c.type)}>
                          Add
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </Space>
              </Card>
            </Sider>

            <Content style={{ background: 'transparent' }}>
              <Card
                title="Canvas"
                extra={
                  <Space size={8}>
                    <Tag color="default">
                      {baseCanvas.width}×{baseCanvas.height}
                    </Tag>
                    <Tag color="default">{Math.round(displayCanvas.scale * 100)}%</Tag>
                    <Tag color="default">{regions.length} regions</Tag>
                  </Space>
                }
                variant="borderless"
                style={{
                  borderRadius: 12,
                  boxShadow:
                    '0 1px 2px rgba(15, 23, 42, 0.06), 0 12px 32px rgba(15, 23, 42, 0.06)',
                }}
                styles={{ body: { padding: 16 } }}
              >
                <div
                  style={{
                    position: 'relative',
                    width: '100%',
                    aspectRatio: `${baseCanvas.width} / ${baseCanvas.height}`,
                    background:
                      'linear-gradient(135deg, #e2e8f0 0%, #f1f5f9 55%, #e2e8f0 100%)',
                    border: '1px solid #eef2f7',
                    borderRadius: 12,
                    overflow: 'hidden',
                  }}
                  onClick={(e) => {
                    if (e.target === e.currentTarget) setSelectedId(null)
                  }}
                >
                  {regions
                    .slice()
                    .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0))
                    .map((r) => {
                      const isActive = r.clientId === selectedId
                      const left = `${(r.x / baseCanvas.width) * 100}%`
                      const top = `${(r.y / baseCanvas.height) * 100}%`
                      const w = `${(r.width / baseCanvas.width) * 100}%`
                      const h = `${(r.height / baseCanvas.height) * 100}%`
                      return (
                        <div
                          key={r.clientId}
                          role="button"
                          tabIndex={0}
                          onClick={(ev) => {
                            ev.stopPropagation()
                            setSelectedId(r.clientId)
                          }}
                          onKeyDown={(ev) => {
                            if (ev.key === 'Enter' || ev.key === ' ') {
                              ev.preventDefault()
                              setSelectedId(r.clientId)
                            }
                          }}
                          style={{
                            position: 'absolute',
                            left,
                            top,
                            width: w,
                            height: h,
                            borderRadius: 10,
                            border: isActive ? '2px solid #1a5fb4' : '1px dashed #94a3b8',
                            background: isActive ? 'rgba(26, 95, 180, 0.10)' : 'rgba(255,255,255,0.65)',
                            boxShadow: isActive ? '0 0 0 2px rgba(26, 95, 180, 0.10)' : 'none',
                            padding: 10,
                            boxSizing: 'border-box',
                            cursor: 'pointer',
                            zIndex: r.zIndex || 0,
                          }}
                        >
                          <Space size={8} wrap>
                            <Tag color={isActive ? 'blue' : 'default'} style={{ margin: 0 }}>
                              {niceType((r.components && r.components[0]?.componentType) || 'PLAYLIST')}
                            </Tag>
                            <Typography.Text style={{ color: '#0f172a' }} ellipsis>
                              {r.regionName}
                            </Typography.Text>
                          </Space>
                        </div>
                      )
                    })}
                </div>
              </Card>
            </Content>

            <Sider
              width={320}
              style={{ background: 'transparent' }}
              breakpoint="xl"
              collapsedWidth={0}
            >
              <Card
                title="Region properties"
                extra={
                  canMutate ? (
                    <Button danger size="small" disabled={!selectedRegion} onClick={removeSelected}>
                      Delete
                    </Button>
                  ) : null
                }
                variant="borderless"
                style={{
                  borderRadius: 12,
                  boxShadow:
                    '0 1px 2px rgba(15, 23, 42, 0.06), 0 12px 32px rgba(15, 23, 42, 0.06)',
                }}
              >
                {selectedRegion ? (
                  <Form
                    form={propsForm}
                    layout="vertical"
                    requiredMark={false}
                    onValuesChange={onPropsChange}
                  >
                    <Form.Item label="Region name" name="regionName">
                      <Input />
                    </Form.Item>

                    <Space size={10} style={{ width: '100%' }} wrap>
                      <Form.Item label="X" name="x" style={{ width: 145 }}>
                        <InputNumber min={0} max={baseCanvas.width} style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item label="Y" name="y" style={{ width: 145 }}>
                        <InputNumber min={0} max={baseCanvas.height} style={{ width: '100%' }} />
                      </Form.Item>
                    </Space>

                    <Space size={10} style={{ width: '100%' }} wrap>
                      <Form.Item label="Width" name="width" style={{ width: 145 }}>
                        <InputNumber min={40} max={baseCanvas.width} style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item label="Height" name="height" style={{ width: 145 }}>
                        <InputNumber min={40} max={baseCanvas.height} style={{ width: '100%' }} />
                      </Form.Item>
                    </Space>

                    <Space size={10} style={{ width: '100%' }} wrap>
                      <Form.Item label="Z-index" name="zIndex" style={{ width: 145 }}>
                        <InputNumber min={0} max={99999} style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item label="Component" name="componentType" style={{ width: 145 }}>
                        <Select
                          options={COMPONENTS.map((c) => ({ value: c.type, label: c.name }))}
                        />
                      </Form.Item>
                    </Space>

                    <Form.Item
                      label="configJson"
                      name="configJson"
                      rules={[
                        {
                          validator: (_, v) => {
                            if (!v || !String(v).trim()) return Promise.resolve()
                            try {
                              JSON.parse(String(v))
                              return Promise.resolve()
                            } catch {
                              return Promise.reject(new Error('Must be valid JSON'))
                            }
                          },
                        },
                      ]}
                    >
                      <Input.TextArea rows={4} placeholder="{}" />
                    </Form.Item>
                  </Form>
                ) : (
                  <Typography.Text type="secondary">Select a region on the canvas.</Typography.Text>
                )}
              </Card>
            </Sider>
          </Layout>
        </Spin>
      </div>
    </div>
  )
}
