/**
 * homepage 静态站点服务器（Node 原生 http，无第三方依赖）。
 *
 * 音乐播放已迁移至 APlayer + Meting API（QQ 音乐），前端直接请求公共 API，
 * 后端不再需要 B 站音频解析/代理。
 *
 * 提供：
 *   GET /api/health  -> 存活探测
 *   GET /*           -> 静态文件托管（dist 产物）+ SPA 回退
 *
 * 启动：node server/index.js  （端口可用环境变量 PORT 覆盖，默认 8787）
 * dev 环境由 Vite 将 /api 反代到本服务。
 */
import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST_DIR = path.resolve(__dirname, '..', 'dist')

const PORT = Number(process.env.PORT || 8787)

// MIME 类型映射
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
}

function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  })
  res.end(body)
}

function sendError(res, status, msg) {
  sendJSON(res, status, { error: msg })
}

/** 静态文件托管 + SPA 回退 */
function serveStatic(res, url) {
  let pathname = decodeURIComponent(url.pathname)
  if (pathname.endsWith('/')) pathname += 'index.html'

  const filePath = path.join(DIST_DIR, pathname)
  // 防路径穿越
  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA 回退：所有未命中文件返回 index.html
      const fallback = path.join(DIST_DIR, 'index.html')
      fs.readFile(fallback, (e2, html) => {
        if (e2) {
          res.writeHead(404)
          res.end('Not Found')
          return
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(html)
      })
      return
    }
    const ext = path.extname(filePath)
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000',
    })
    res.end(data)
  })
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)

  // CORS 预检
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    })
    res.end()
    return
  }

  // 健康检查
  if (url.pathname === '/api/health') {
    sendJSON(res, 200, { ok: true })
    return
  }

  // 未知 API
  if (url.pathname.startsWith('/api/')) {
    sendError(res, 404, '未知接口')
    return
  }

  // 静态站点托管
  if (req.method === 'GET') {
    serveStatic(res, url)
    return
  }

  sendError(res, 404, 'Not Found')
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[homepage] server listening on http://0.0.0.0:${PORT}`)
})
