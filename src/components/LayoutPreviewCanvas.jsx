import { useEffect, useRef } from 'react'
import { Space, Tag, Typography } from 'antd'

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

function stackZ(r, index) {
  const v = r?.zIndex ?? r?.z_index ?? r?.zindex
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? n : index + 1
}

function mediaKind(media, playlistMedia) {
  const source = media || playlistMedia
  return String(source?.type || source?.mediaType || '').toUpperCase()
}

function isVideoMedia(media, playlistMedia) {
  if (mediaKind(media, playlistMedia) === 'VIDEO') return true
  const url = (media?.fileUrl || playlistMedia?.fileUrl || '').trim().toLowerCase()
  return /\.(mp4|webm|mov|m4v|m3u8)(\?|$)/.test(url)
}

function imagePreviewUrl(media, playlistMedia) {
  if (isVideoMedia(media, playlistMedia)) return ''
  const thumb = (media?.thumbnailUrl || playlistMedia?.thumbnailUrl || '').trim()
  if (thumb) return thumb
  const file = (media?.fileUrl || playlistMedia?.fileUrl || '').trim()
  if (file) return file
  return ''
}

function videoPreviewUrl(media, playlistMedia) {
  if (!isVideoMedia(media, playlistMedia)) return ''
  return (media?.fileUrl || playlistMedia?.fileUrl || '').trim()
}

function PreviewVideo({ src }) {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el || !src) return undefined

    const tryPlay = () => {
      const p = el.play()
      if (p && typeof p.catch === 'function') {
        p.catch(() => {})
      }
    }

    el.load()
    tryPlay()
    el.addEventListener('canplay', tryPlay)
    return () => {
      el.removeEventListener('canplay', tryPlay)
    }
  }, [src])

  return (
    <video
      ref={ref}
      key={src}
      src={src}
      muted
      autoPlay
      loop
      playsInline
      preload="auto"
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
    />
  )
}

/** Layout regions that render the active playlist item in preview. */
function regionUsesPlaylistMedia(componentType) {
  const t = String(componentType || 'PLAYLIST').toUpperCase()
  return t === 'PLAYLIST' || t === 'VIDEO' || t === 'IMAGE' || t === 'CAROUSEL'
}

/**
 * Read-only layout canvas; optional playlist media fills media-driven regions.
 * @param {{
 *   layout: { resolutionWidth?: number, resolutionHeight?: number, regions?: unknown[] } | null
 *   playlistMedia?: { mediaId?: number, mediaType?: string, fileUrl?: string, thumbnailUrl?: string } | null
 *   mediaById?: Map<number, { thumbnailUrl?: string, fileUrl?: string, type?: string, mediaType?: string, title?: string, name?: string }>
 *   maxHeight?: string
 * }} props
 */
export default function LayoutPreviewCanvas({
  layout,
  playlistMedia = null,
  mediaById = null,
  maxHeight = 'min(42vh, 360px)',
}) {
  if (!layout) return null
  const rw = Number(layout.resolutionWidth)
  const rh = Number(layout.resolutionHeight)
  const baseW = Math.max(1, Number.isFinite(rw) ? rw : 1920)
  const baseH = Math.max(1, Number.isFinite(rh) ? rh : 1080)
  const regions = Array.isArray(layout.regions) ? layout.regions : []

  if (regions.length === 0) {
    return <Typography.Text type="secondary">No regions in this layout.</Typography.Text>
  }

  const media = playlistMedia?.mediaId != null ? mediaById?.get(Number(playlistMedia.mediaId)) : null
  const videoSrc = videoPreviewUrl(media, playlistMedia)
  const imageSrc = videoSrc ? '' : imagePreviewUrl(media, playlistMedia)
  const showMedia = Boolean(videoSrc || imageSrc)

  return (
    <div
      style={{
        width: '100%',
        maxHeight,
        aspectRatio: `${baseW} / ${baseH}`,
        margin: '0 auto',
        position: 'relative',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #0f172a 100%)',
        border: '1px solid #334155',
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
          const showRegionMedia = regionUsesPlaylistMedia(ctype) && showMedia

          return (
            <div
              key={r?.id ?? `r-${i}`}
              style={{
                position: 'absolute',
                left: `${(x / baseW) * 100}%`,
                top: `${(y / baseH) * 100}%`,
                width: `${(rw0 / baseW) * 100}%`,
                height: `${(rh0 / baseH) * 100}%`,
                borderRadius: 6,
                border: showRegionMedia ? '1px solid #3b82f6' : '1px dashed #64748b',
                background: showRegionMedia ? '#000' : 'rgba(255,255,255,0.08)',
                padding: showRegionMedia ? 0 : 6,
                boxSizing: 'border-box',
                zIndex: stackZ(r, i),
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
                overflow: 'hidden',
              }}
            >
              {showRegionMedia ? (
                <>
                  {videoSrc ? (
                    <PreviewVideo src={videoSrc} />
                  ) : (
                    <img
                      src={imageSrc}
                      alt={media?.title || media?.name || playlistMedia?.name || 'Media preview'}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  )}
                  <div
                    style={{
                      position: 'absolute',
                      left: 4,
                      top: 4,
                      right: 4,
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 4,
                      pointerEvents: 'none',
                    }}
                  >
                    <Tag color="blue" style={{ margin: 0, fontSize: 10, lineHeight: '18px' }}>
                      {r?.regionName || `Region ${i + 1}`}
                    </Tag>
                    <Tag style={{ margin: 0, fontSize: 10, lineHeight: '18px' }}>
                      {videoSrc ? 'Video' : componentLabel(ctype)}
                    </Tag>
                  </div>
                </>
              ) : (
                <>
                  <Space size={4} wrap style={{ width: '100%' }}>
                    <Tag color="geekblue" style={{ margin: 0, fontSize: 10 }}>
                      {componentLabel(ctype)}
                    </Tag>
                  </Space>
                  <Typography.Text
                    strong
                    style={{ color: '#e2e8f0', fontSize: 11, lineHeight: 1.3 }}
                    ellipsis={{ tooltip: r?.regionName }}
                  >
                    {r?.regionName || `Region ${i + 1}`}
                  </Typography.Text>
                </>
              )}
            </div>
          )
        })}
    </div>
  )
}
