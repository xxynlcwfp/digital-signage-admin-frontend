import { useEffect, useMemo, useState } from 'react'
import { Card, Space, Spin, Tag, Typography } from 'antd'
import dayjs from 'dayjs'
import LayoutPreviewCanvas from './LayoutPreviewCanvas'
import { getLayout } from '../services/layoutService'
import { getPlaylist } from '../services/playlistService'
import { listMedia } from '../services/mediaService'

/**
 * Live preview for create/edit schedule modal (layout + playlist + metadata).
 */
export default function ScheduleFormPreview({
  scheduleName,
  layoutId,
  playlistId,
  layoutLabel,
  playlistLabel,
  targetSummary,
  status,
  priority,
  startDatetime,
  endDatetime,
}) {
  const [layoutDetail, setLayoutDetail] = useState(null)
  const [playlistDetail, setPlaylistDetail] = useState(null)
  const [mediaById, setMediaById] = useState(() => new Map())
  const [layoutLoading, setLayoutLoading] = useState(false)
  const [playlistLoading, setPlaylistLoading] = useState(false)
  const [activeItemIndex, setActiveItemIndex] = useState(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const list = await listMedia()
        if (cancelled) return
        const map = new Map()
        for (const m of Array.isArray(list) ? list : []) {
          if (m?.id != null) map.set(Number(m.id), m)
        }
        setMediaById(map)
      } catch {
        if (!cancelled) setMediaById(new Map())
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (layoutId == null || layoutId === '') {
      setLayoutDetail(null)
      return undefined
    }
    let cancelled = false
    setLayoutLoading(true)
    ;(async () => {
      try {
        const detail = await getLayout(layoutId)
        if (!cancelled) setLayoutDetail(detail)
      } catch {
        if (!cancelled) setLayoutDetail(null)
      } finally {
        if (!cancelled) setLayoutLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [layoutId])

  useEffect(() => {
    if (playlistId == null || playlistId === '') {
      setPlaylistDetail(null)
      setActiveItemIndex(0)
      return undefined
    }
    let cancelled = false
    setPlaylistLoading(true)
    ;(async () => {
      try {
        const detail = await getPlaylist(playlistId)
        if (!cancelled) {
          setPlaylistDetail(detail)
          setActiveItemIndex(0)
        }
      } catch {
        if (!cancelled) setPlaylistDetail(null)
      } finally {
        if (!cancelled) setPlaylistLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [playlistId])

  const playlistItems = useMemo(() => {
    const items = playlistDetail?.items
    if (!Array.isArray(items)) return []
    return [...items].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
  }, [playlistDetail])

  useEffect(() => {
    if (playlistItems.length <= 1) return undefined
    const timer = window.setInterval(() => {
      setActiveItemIndex((i) => (i + 1) % playlistItems.length)
    }, 3000)
    return () => window.clearInterval(timer)
  }, [playlistItems.length])

  const activePlaylistItem = playlistItems[activeItemIndex] ?? playlistItems[0] ?? null
  const activeMedia =
    activePlaylistItem?.mediaId != null ? mediaById.get(Number(activePlaylistItem.mediaId)) : null

  const loading = layoutLoading || playlistLoading
  const hasLayout = layoutId != null && layoutId !== ''
  const hasPlaylist = playlistId != null && playlistId !== ''

  return (
    <Card
      size="small"
      title="Live preview"
      style={{
        height: '100%',
        borderRadius: 12,
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
      }}
      styles={{ body: { padding: 12 } }}
    >
      <Spin spinning={loading}>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Schedule
            </Typography.Text>
            <Typography.Paragraph
              strong
              style={{ margin: '4px 0 0', color: '#0f172a', fontSize: 14 }}
              ellipsis={{ rows: 2, tooltip: scheduleName }}
            >
              {scheduleName?.trim() || 'Untitled schedule'}
            </Typography.Paragraph>
          </div>

          <Space size={[6, 6]} wrap>
            {status ? <Tag>{status}</Tag> : null}
            {priority != null ? <Tag color="blue">Priority {priority}</Tag> : null}
          </Space>

          {targetSummary ? (
            <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
              Target: {targetSummary}
            </Typography.Text>
          ) : null}

          {startDatetime || endDatetime ? (
            <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
              {startDatetime && dayjs(startDatetime).isValid()
                ? dayjs(startDatetime).format('YYYY-MM-DD HH:mm')
                : '—'}
              {' ~ '}
              {endDatetime && dayjs(endDatetime).isValid()
                ? dayjs(endDatetime).format('YYYY-MM-DD HH:mm')
                : '—'}
            </Typography.Text>
          ) : null}

          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Layout
            </Typography.Text>
            <div style={{ marginTop: 4 }}>
              <Typography.Text style={{ fontSize: 13 }}>
                {layoutLabel || (hasLayout ? `Layout #${layoutId}` : 'Not selected')}
              </Typography.Text>
            </div>
          </div>

          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Playlist
            </Typography.Text>
            <div style={{ marginTop: 4 }}>
              <Typography.Text style={{ fontSize: 13 }}>
                {playlistLabel || (hasPlaylist ? `Playlist #${playlistId}` : 'Not selected')}
              </Typography.Text>
              {playlistItems.length > 0 ? (
                <Typography.Text type="secondary" style={{ fontSize: 12, marginLeft: 6 }}>
                  ({playlistItems.length} item{playlistItems.length === 1 ? '' : 's'})
                </Typography.Text>
              ) : null}
            </div>
          </div>

          {!hasLayout ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Select a layout to preview regions.
            </Typography.Text>
          ) : layoutDetail ? (
            <LayoutPreviewCanvas
              layout={layoutDetail}
              playlistMedia={activePlaylistItem}
              mediaById={mediaById}
              maxHeight="min(36vh, 320px)"
            />
          ) : !layoutLoading ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Could not load layout preview.
            </Typography.Text>
          ) : null}

          {activeMedia ? (
            <div
              style={{
                padding: '8px 10px',
                borderRadius: 8,
                background: '#fff',
                border: '1px solid #e2e8f0',
              }}
            >
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                Now playing in playlist region
                {playlistItems.length > 1
                  ? ` (${activeItemIndex + 1}/${playlistItems.length})`
                  : ''}
              </Typography.Text>
              <Typography.Text
                ellipsis
                style={{ display: 'block', fontSize: 12, marginTop: 2, color: '#0f172a' }}
              >
                {activeMedia.title || activeMedia.name || `Media #${activeMedia.id}`}
              </Typography.Text>
            </div>
          ) : hasPlaylist && hasLayout && !playlistLoading && playlistItems.length === 0 ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Playlist has no items to preview.
            </Typography.Text>
          ) : null}
        </Space>
      </Spin>
    </Card>
  )
}
