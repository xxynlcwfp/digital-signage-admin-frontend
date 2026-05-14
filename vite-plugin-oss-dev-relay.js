import http from 'node:http'
import https from 'node:https'
import { randomUUID } from 'node:crypto'

const SESSION_MAX_BYTES = 512 * 1024
const SESSION_TTL_MS = 15 * 60 * 1000

function hostAllowed(hostname) {
  const h = String(hostname || '').toLowerCase()
  return (
    h.endsWith('.aliyuncs.com') ||
    h.endsWith('.aliyuncs.cn') ||
    h.includes('.amazonaws.com') ||
    h.endsWith('.digitaloceanspaces.com') ||
    h.endsWith('.r2.cloudflarestorage.com')
  )
}

function attachOssRelayMiddleware(server) {
  const sessions = new Map()

  server.middlewares.use((req, res, next) => {
    const pathname = (req.url || '').split('?')[0]

    if (req.method === 'POST' && pathname.includes('/__ds_oss_relay/session')) {
      const chunks = []
      let total = 0
      req.on('data', (c) => {
        total += c.length
        if (total > SESSION_MAX_BYTES) {
          if (!res.writableEnded) {
            res.statusCode = 413
            res.end('session body too large')
          }
          req.destroy()
          return
        }
        chunks.push(c)
      })
      req.on('end', () => {
        if (res.writableEnded) return
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
          const uploadUrl = body.uploadUrl
          const requiredHeaders =
            body.requiredHeaders && typeof body.requiredHeaders === 'object' ? body.requiredHeaders : {}
          if (typeof uploadUrl !== 'string' || !uploadUrl.trim()) {
            res.statusCode = 400
            res.end('missing uploadUrl')
            return
          }
          const u = new URL(uploadUrl.trim())
          if (u.protocol !== 'https:' && u.protocol !== 'http:') {
            res.statusCode = 400
            res.end('invalid uploadUrl protocol')
            return
          }
          if (!hostAllowed(u.hostname)) {
            res.statusCode = 400
            res.end('uploadUrl host not allowed for this relay')
            return
          }
          const id = randomUUID()
          sessions.set(id, { uploadUrl: uploadUrl.trim(), requiredHeaders, expires: Date.now() + SESSION_TTL_MS })
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ id }))
        } catch (e) {
          res.statusCode = 400
          res.end(String(e?.message || e))
        }
      })
      return
    }

    const streamMatch = pathname.match(/\/__ds_oss_relay\/stream\/([^/]+)$/)
    if (req.method === 'PUT' && streamMatch) {
      const id = decodeURIComponent(streamMatch[1])
      const sess = sessions.get(id)
      if (!sess || sess.expires < Date.now()) {
        res.statusCode = 404
        res.end('invalid or expired relay session')
        return
      }
      sessions.delete(id)

      const target = new URL(sess.uploadUrl)
      const isHttps = target.protocol === 'https:'
      const lib = isHttps ? https : http
      const headers = { ...sess.requiredHeaders }
      const cl = req.headers['content-length']
      if (cl) {
        headers['Content-Length'] = cl
      }

      const port = target.port ? Number(target.port) : isHttps ? 443 : 80
      const upstream = lib.request(
        {
          hostname: target.hostname,
          port,
          path: target.pathname + target.search,
          method: 'PUT',
          headers,
        },
        (upRes) => {
          res.statusCode = upRes.statusCode ?? 502
          const ct = upRes.headers['content-type']
          if (ct) {
            res.setHeader('Content-Type', ct)
          }
          upRes.pipe(res)
        },
      )
      upstream.on('error', (err) => {
        if (!res.headersSent) {
          res.statusCode = 502
        }
        res.end(String(err.message))
      })
      req.pipe(upstream)
      return
    }

    next()
  })
}

/**
 * Dev / preview: browser PUTs same-origin to Vite; Node streams body to OSS presigned URL (no browser→OSS CORS).
 * Does not change the Spring Boot backend.
 */
export default function ossDevRelayPlugin() {
  return {
    name: 'ds-oss-dev-relay',
    configureServer(server) {
      attachOssRelayMiddleware(server)
    },
    configurePreviewServer(server) {
      attachOssRelayMiddleware(server)
    },
  }
}
