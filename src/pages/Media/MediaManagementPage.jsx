import { useState } from 'react'
import { Space, Tabs, Typography } from 'antd'
import { AppstoreOutlined, UnorderedListOutlined } from '@ant-design/icons'
import MediaLibraryPanel from './MediaLibraryPanel'
import PlaylistPanel from './PlaylistPanel'

export default function MediaManagementPage() {
  const [activeTab, setActiveTab] = useState('media')
  const [sharedMedia, setSharedMedia] = useState([])

  const tabItems = [
    {
      key: 'media',
      label: (
        <span>
          <AppstoreOutlined />
          Media library
        </span>
      ),
      children: <MediaLibraryPanel onMediaChange={setSharedMedia} />,
    },
    {
      key: 'playlists',
      label: (
        <span>
          <UnorderedListOutlined />
          Playlists
        </span>
      ),
      children: <PlaylistPanel mediaItems={sharedMedia} />,
    },
  ]

  return (
    <div style={{ padding: 24 }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <Space
          align="baseline"
          style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}
        >
          <Typography.Title level={3} style={{ margin: 0, color: '#0f172a' }}>
            Media Management
          </Typography.Title>
        </Space>

        <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
      </div>
    </div>
  )
}
