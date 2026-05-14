import { useEffect, useMemo, useState } from 'react'
import { Alert, Card, Col, Row, Space, Table, Tag, Typography } from 'antd'
import {
  AlertOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloudOutlined,
  DatabaseOutlined,
  DesktopOutlined,
  DisconnectOutlined,
} from '@ant-design/icons'

import { loadDashboardData } from '../../services/dashboardService'

function SummaryCard({ title, value, icon, accent }) {
  return (
    <Card
      variant="borderless"
      style={{
        height: '100%',
        boxShadow:
          '0 1px 2px rgba(15, 23, 42, 0.06), 0 12px 32px rgba(15, 23, 42, 0.06)',
        borderRadius: 12,
      }}
      styles={{ body: { padding: 18 } }}
    >
      <Space align="start" style={{ width: '100%', justifyContent: 'space-between' }}>
        <div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {title}
          </Typography.Text>
          <div
            style={{
              marginTop: 6,
              fontSize: 28,
              fontWeight: 600,
              lineHeight: 1.1,
              color: '#0f172a',
            }}
          >
            {value}
          </div>
        </div>
        <div
          aria-hidden
          style={{
            width: 42,
            height: 42,
            borderRadius: 12,
            background: accent || 'rgba(26, 95, 180, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#1a5fb4',
            fontSize: 18,
          }}
        >
          {icon}
        </div>
      </Space>
    </Card>
  )
}

export default function DashboardPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [usingMock, setUsingMock] = useState(false)
  const [loadErrorMessage, setLoadErrorMessage] = useState(null)
  const [partialFallback, setPartialFallback] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function run() {
      setLoading(true)
      setLoadErrorMessage(null)
      setUsingMock(false)
      setPartialFallback(false)
      try {
        const result = await loadDashboardData()
        if (cancelled) return
        setData(result.data)
        setUsingMock(result.usingMock)
        setLoadErrorMessage(result.errorMessage)
        setPartialFallback(Boolean(result.partialFallback))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [])

  const summary = data?.summary
  const deviceStatus = data?.deviceStatus

  const alertColumns = useMemo(
    () => [
      { title: 'Time', dataIndex: 'time', key: 'time', width: 150 },
      {
        title: 'Level',
        dataIndex: 'level',
        key: 'level',
        width: 90,
        render: (level) => {
          const map = {
            ERROR: { color: 'red', label: 'ERROR' },
            WARN: { color: 'orange', label: 'WARN' },
            INFO: { color: 'blue', label: 'INFO' },
          }
          const m = map[level] || { color: 'default', label: String(level || '-') }
          return <Tag color={m.color}>{m.label}</Tag>
        },
      },
      { title: 'Device', dataIndex: 'screen', key: 'screen', ellipsis: true },
      { title: 'Message', dataIndex: 'message', key: 'message', ellipsis: true },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        width: 110,
        render: (status) => {
          if (status === 'RESOLVED') return <Tag color="green">Resolved</Tag>
          return <Tag color="gold">Processing</Tag>
        },
      },
    ],
    [],
  )

  const piePlaceholder = useMemo(() => {
    const online = deviceStatus?.online ?? 0
    const offline = deviceStatus?.offline ?? 0
    const error = deviceStatus?.error ?? 0
    const total = Math.max(online + offline + error, 1)
    const onlinePct = Math.round((online / total) * 100)
    const offlinePct = Math.round((offline / total) * 100)
    const errorPct = Math.max(0, 100 - onlinePct - offlinePct)

    return { online, offline, error, onlinePct, offlinePct, errorPct }
  }, [deviceStatus])

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        background: '#f5f7fb',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
        <Space
          align="baseline"
          style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}
        >
          <div>
            <Typography.Title level={3} style={{ margin: 0, color: '#0f172a' }}>
              Dashboard
            </Typography.Title>
            <Typography.Text type="secondary">
              {usingMock ? 'Demo data (live API unavailable).' : 'Live metrics from server.'}
            </Typography.Text>
          </div>
          <Tag icon={<ClockCircleOutlined />} color="default">
            Updated at {data?.updatedAt || '--'}
          </Tag>
        </Space>

        {usingMock && loadErrorMessage ? (
          <Alert
            type="warning"
            showIcon
            closable
            message="Could not load live dashboard"
            description={loadErrorMessage}
            style={{ marginBottom: 16 }}
          />
        ) : null}

        {!usingMock && partialFallback ? (
          <Alert
            type="info"
            showIcon
            message="Partial data"
            description="Media count or active schedules could not be loaded; demo numbers are used for those two cards only."
            style={{ marginBottom: 16 }}
          />
        ) : null}

        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={8} xl={6}>
            <SummaryCard
              title="Total Devices"
              value={summary?.totalDevices ?? '--'}
              icon={<DesktopOutlined />}
            />
          </Col>
          <Col xs={24} sm={12} lg={8} xl={6}>
            <SummaryCard
              title="Online Devices"
              value={summary?.onlineDevices ?? '--'}
              icon={<CloudOutlined />}
              accent="rgba(34, 197, 94, 0.12)"
            />
          </Col>
          <Col xs={24} sm={12} lg={8} xl={6}>
            <SummaryCard
              title="Offline Devices"
              value={summary?.offlineDevices ?? '--'}
              icon={<DisconnectOutlined />}
              accent="rgba(245, 158, 11, 0.14)"
            />
          </Col>
          <Col xs={24} sm={12} lg={8} xl={6}>
            <SummaryCard
              title="Total Media"
              value={summary?.totalMedia ?? '--'}
              icon={<DatabaseOutlined />}
              accent="rgba(59, 130, 246, 0.12)"
            />
          </Col>
          <Col xs={24} sm={12} lg={8} xl={6}>
            <SummaryCard
              title="Active Schedules"
              value={summary?.activeSchedules ?? '--'}
              icon={<CheckCircleOutlined />}
              accent="rgba(168, 85, 247, 0.12)"
            />
          </Col>
        </Row>

        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24} lg={14}>
            <Card
              title={
                <Space size={8}>
                  <AlertOutlined />
                  <span>Recent Alerts</span>
                </Space>
              }
              variant="borderless"
              style={{
                borderRadius: 12,
                boxShadow:
                  '0 1px 2px rgba(15, 23, 42, 0.06), 0 12px 32px rgba(15, 23, 42, 0.06)',
              }}
              styles={{ body: { padding: 0 } }}
            >
              <Table
                rowKey="id"
                size="middle"
                loading={loading}
                columns={alertColumns}
                dataSource={data?.recentAlerts || []}
                pagination={{ pageSize: 5, hideOnSinglePage: true }}
              />
            </Card>
          </Col>

          <Col xs={24} lg={10}>
            <Row gutter={[16, 16]}>
              <Col xs={24}>
                <Card
                  title="Device Status (Placeholder Pie Chart)"
                  variant="borderless"
                  style={{
                    borderRadius: 12,
                    boxShadow:
                      '0 1px 2px rgba(15, 23, 42, 0.06), 0 12px 32px rgba(15, 23, 42, 0.06)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      gap: 16,
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div
                      aria-hidden
                      style={{
                        width: 160,
                        height: 160,
                        borderRadius: 999,
                        background:
                          'conic-gradient(#22c55e 0% ' +
                          piePlaceholder.onlinePct +
                          '%, #f59e0b ' +
                          piePlaceholder.onlinePct +
                          '% ' +
                          (piePlaceholder.onlinePct + piePlaceholder.offlinePct) +
                          '%, #ef4444 ' +
                          (piePlaceholder.onlinePct + piePlaceholder.offlinePct) +
                          '% 100%)',
                        boxShadow: 'inset 0 0 0 12px #fff',
                      }}
                    />

                    <div style={{ flex: 1, minWidth: 180 }}>
                      <Space direction="vertical" size={10} style={{ width: '100%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Tag color="green">Online</Tag>
                          <Typography.Text strong>
                            {piePlaceholder.online} ({piePlaceholder.onlinePct}%)
                          </Typography.Text>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Tag color="gold">Offline</Tag>
                          <Typography.Text strong>
                            {piePlaceholder.offline} ({piePlaceholder.offlinePct}%)
                          </Typography.Text>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Tag color="red">Error</Tag>
                          <Typography.Text strong>
                            {piePlaceholder.error} ({piePlaceholder.errorPct}%)
                          </Typography.Text>
                        </div>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {usingMock ? 'Demo chart.' : 'Device status share (error includes suspect).'}
                        </Typography.Text>
                      </Space>
                    </div>
                  </div>
                </Card>
              </Col>

              <Col xs={24}>
                <Card
                  title="Recent Activities"
                  variant="borderless"
                  style={{
                    borderRadius: 12,
                    boxShadow:
                      '0 1px 2px rgba(15, 23, 42, 0.06), 0 12px 32px rgba(15, 23, 42, 0.06)',
                  }}
                >
                  <Space direction="vertical" size={12} style={{ width: '100%' }}>
                    {(data?.recentActivities || []).map((e) => (
                      <div
                        key={e.id}
                        style={{
                          display: 'flex',
                          gap: 12,
                          alignItems: 'flex-start',
                          padding: '10px 12px',
                          borderRadius: 10,
                          background: '#f8fafc',
                          border: '1px solid #eef2f7',
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <Typography.Text style={{ color: '#0f172a' }}>
                            {e.detail}
                          </Typography.Text>
                          <div style={{ marginTop: 2 }}>
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                              {e.time} · {e.actor}
                            </Typography.Text>
                          </div>
                        </div>
                      </div>
                    ))}
                    {!loading && (data?.recentActivities || []).length === 0 ? (
                      <Typography.Text type="secondary">No activities</Typography.Text>
                    ) : null}
                  </Space>
                </Card>
              </Col>
            </Row>
          </Col>
        </Row>
      </div>
    </div>
  )
}

