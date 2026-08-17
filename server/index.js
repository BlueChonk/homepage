/**
 * homepage 在线音乐后端代理（Node 原生 http，无第三方依赖）。
 *
 * 提供：
 *   GET /api/qq/search?keyword=&type=&page=   -> QQ 音乐搜索列表
 *   GET /api/bili/search?keyword=             -> B 站视频候选
 *   GET /api/resolve?song=&singer=&duration=  -> 按歌名/歌手去 B 站匹配并解析音频直链
 *   GET /api/bbstream?url=                    -> 代理 B 站音频流（支持 Range/seek）
 *   GET /api/health                           -> 存活探测
 *
 * 启动：node server/index.js  （端口可用环境变量 PORT 覆盖，默认 8787）
 * dev 环境由 Vite 将 /api 反代到本服务，前端同源访问。
 */
import http from 'http'
import { searchQQ } from './qq.js'
import { searchBili, previewBili, resolveBest, proxyAudioStream } from './bili.js'

const PORT = Number(process.env.PORT || 8787)

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

  if (path === '/api/qq/search') {
    const keyword = queryVal(url, 'keyword').trim()
    if (!keyword) return sendError(res, 400, '缺少 keyword')
    const type = queryVal(url, 'type', 'song')
    const page = Number(queryVal(url, 'page', '1')) || 1
    try {
      const result = await searchQQ(keyword, type, page)
      sendJSON(res, 200, { ok: true, ...result })
    } catch (e) {
      sendError(res, 500, e.message)
    }
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

  sendError(res, 404, 'Not Found')
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[online-music] server listening on http://127.0.0.1:${PORT}`)
})