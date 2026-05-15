import { useMemo, useState } from 'react'
import { Button, Layout, Menu, Typography } from 'antd'
import {
  AppstoreOutlined,
  CalendarOutlined,
  ClusterOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MonitorOutlined,
  PictureOutlined,
  LogoutOutlined,
} from '@ant-design/icons'
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { getStoredUsername } from '../services/authService'

const { Header, Sider, Content } = Layout

const MENU_ITEMS = [
  {
    key: '/dashboard',
    icon: <AppstoreOutlined />,
    label: <Link to="/dashboard">Admin Dashboard</Link>,
  },
  {
    key: '/layouts',
    icon: <ClusterOutlined />,
    label: <Link to="/layouts">Layout Management</Link>,
  },
  {
    key: '/devices',
    icon: <MonitorOutlined />,
    label: <Link to="/devices">Device Management</Link>,
  },
  {
    key: '/media',
    icon: <PictureOutlined />,
    label: <Link to="/media">Media Management</Link>,
  },
  {
    key: '/schedules',
    icon: <CalendarOutlined />,
    label: <Link to="/schedules">Schedule Management</Link>,
  },
]

export default function AdminLayout() {
  const location = useLocation()
  const { isAuthenticated, logout } = useAuth()
  const [collapsed, setCollapsed] = useState(false)

  if (!isAuthenticated) return <Navigate to="/login" replace />

  const selectedKeys = useMemo(() => {
    const match = MENU_ITEMS.find((item) =>
      location.pathname === '/'
        ? false
        : location.pathname === item.key || location.pathname.startsWith(item.key + '/'),
    )
    return [match?.key || '/dashboard']
  }, [location.pathname])

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        trigger={null}
        breakpoint="lg"
        width={220}
        style={{
          background: '#020617',
        }}
      >
        <div
          style={{
            height: 56,
            display: 'flex',
            alignItems: 'center',
            paddingInline: collapsed ? 16 : 20,
            borderBottom: '1px solid rgba(15,23,42,0.35)',
            boxSizing: 'border-box',
          }}
        >
          <div
            aria-hidden
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background:
                'radial-gradient(circle at 0 0, #38bdf8 0, #22c55e 35%, #4f46e5 80%)',
              marginRight: collapsed ? 0 : 10,
            }}
          />
          {!collapsed && (
            <Typography.Text
              style={{
                color: '#e5e7eb',
                fontWeight: 600,
                fontSize: 15,
                whiteSpace: 'nowrap',
              }}
            >
              Digital Signage platform
            </Typography.Text>
          )}
        </div>
        <Menu
          mode="inline"
          theme="dark"
          selectedKeys={selectedKeys}
          items={MENU_ITEMS}
          style={{ borderRight: 0, paddingTop: 8 }}
        />
      </Sider>

      <Layout>
        <Header
          style={{
            paddingInline: 16,
            background: '#ffffff',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              onClick={() => setCollapsed((v) => !v)}
              style={{
                width: 32,
                height: 32,
                borderRadius: 999,
                border: '1px solid #e5e7eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#0f172a',
              }}
            >
              {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            </div>
            <Typography.Title level={5} style={{ margin: 0 }}>
              Admin Dashboard
            </Typography.Title>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              {getStoredUsername() || 'User'}
            </Typography.Text>
            <Button icon={<LogoutOutlined />} onClick={logout}>
              Logout
            </Button>
          </div>
        </Header>

        <Content
          style={{
            background: '#f5f7fb',
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}

