/**
 * homepage 在线音乐后端代理（Node 原生 http，无第三方依赖）。
 *
 * 提供：
 *   GET /api/bili/search?keyword=             -> B 站视频候选
 *   GET /api/resolve?song=&singer=&duration=  -> 按歌名/歌手去 B 站匹配并解析音频直链
 *   GET /api/bbstream?url=                    -> 代理 B 站音频流（支持 Range/seek）
 *   GET /api/health                           -> 存活探测
 *
 * 启动：node server/index.js  （端口可用环境变量 PORT 覆盖，默认 8787）
 * dev 环境由 Vite 将 /api 反代到本服务，前端同源访问。
 */
import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { searchBili, previewBili, resolveBest, proxyAudioStream } from './bili.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST_DIR = path.resolve(__dirname, '..', 'dist')

const PORT = Number(process.env.PORT || 8787)

// MIME 类型映射（静态站点）
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jsonl': 'application/x-ndjson; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
}

const BYPASS_STATIC = /\.(js|mjs|css|json|jsonl|png|jpe?g|gif|webp|avif|svg|mp3|m4a|aac|flac|wav|ogg|woff2|map)$/i

function serveStatic(clientRes, url) {
  if (!fs.existsSync(DIST_DIR)) {
    clientRes.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
    clientRes.end('前端尚未构建：请先运行 npm run build')
    return
  }
  // 解析相对路径（保持 . 表示根 —— vite base 为 ./）
  const rel = url.pathname.replace(/^\/+/, '')
  let filePath = path.normalize(path.join(DIST_DIR, rel))
  // 路径穿越防护
  if (!filePath.startsWith(DIST_DIR)) {
    clientRes.writeHead(403).end('Forbidden')
    return
  }
  let abs = filePath
  try {
    if (fs.statSync(abs).isDirectory()) {
      abs = path.join(abs, 'index.html')
    }
  } catch {
    // 不存在则走 SPA 回退
  }
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    // SPA 回退：非文件资源（去掉扩展名的路由）一律给 index.html
    if (!BYPASS_STATIC.test(abs)) abs = path.join(DIST_DIR, 'index.html')
    if (!fs.existsSync(abs)) {
      clientRes.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not Found')
      return
    }
  }
  const ext = path.extname(abs).toLowerCase()
  clientRes.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': BYPASS_STATIC.test(abs)
      ? 'public, max-age=604800, immutable'
      : 'no-cache',
  })
  fs.createReadStream(abs).pipe(clientRes)
}

function sendJSON(res, code, data) {
  const body = JSON.stringify(data)
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  })
  res.end(body)
}

function sendError(res, code, message) {
  sendJSON(res, code, { error: message })
}

function queryVal(url, key, fallback = '') {
  const v = url.searchParams.get(key)
  return v == null ? fallback : v
}

async function handleApi(url, req, res) {
  const path = url.pathname

  if (path === '/api/health') {
    sendJSON(res, 200, { ok: true })
    return
  }

  if (path === '/api/bili/search') {
    const keyword = queryVal(url, 'keyword').trim()
    if (!keyword) return sendError(res, 400, '缺少 keyword')
    try {
      const items = await searchBili(keyword)
      sendJSON(res, 200, { ok: true, keyword, items })
    } catch (e) {
      sendError(res, 500, e.message)
    }
    return
  }

  if (path === '/api/resolve') {
    const song = queryVal(url, 'song').trim()
    const singer = queryVal(url, 'singer').trim()
    const duration = Number(queryVal(url, 'duration', '0')) || 0
    try {
      const audio = await resolveBest({ song, singer, duration })
      if (!audio) return sendError(res, 404, '未能在 B 站匹配到可播放的音频')
      sendJSON(res, 200, { ok: true, ...audio })
    } catch (e) {
      sendError(res, 500, e.message)
    }
    return
  }

  if (path === '/api/bili/preview') {
    const bvid = queryVal(url, 'bvid').trim()
    const cid = Number(queryVal(url, 'cid', '0')) || undefined
    if (!bvid) return sendError(res, 400, '缺少 bvid')
    try {
      const audio = await previewBili(bvid, cid)
      if (!audio) return sendError(res, 404, '解析音频失败')
      sendJSON(res, 200, { ok: true, ...audio })
    } catch (e) {
      sendError(res, 500, e.message)
    }
    return
  }

  sendError(res, 404, '未知接口')
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  // CORS 预检
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' })
    res.end()
    return
  }

  // 音频流代理：流式转发，支持 Range
  if (req.method === 'GET' && url.pathname === '/api/bbstream') {
    const streamUrl = queryVal(url, 'url')
    if (!streamUrl) return sendError(res, 400, '缺少 url')
    try {
      proxyAudioStream(streamUrl, req, res)
    } catch (e) {
      sendError(res, 500, e.message)
    }
    return
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/')) {
    try {
      await handleApi(url, req, res)
    } catch (e) {
      sendError(res, 500, e.message)
    }
    return
  }

  // 静态站点托管（npm run build 产物）+ SPA 回退
  if (req.method === 'GET') {
    serveStatic(res, url)
    return
  }

  sendError(res, 404, 'Not Found')
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[online-music] server listening on http://0.0.0.0:${PORT}`)
})