/**
 * B 站（Bilibili）音频搜索、DASH 音频解析与流代理。移植自 musicgrove 并精简。
 *
 * 要点：
 * - 会话级 CookieJar：首次请求前先访问 B 站首页拿 buvid3/b_nut 访客指纹，
 *   避免未带指纹时搜索接口返回不完整的结果。
 * - 搜索接口使用 /x/web-interface/search/all/v2，无需 WBI 签名，默认拉前 3 页。
 * - 按「歌名/歌手/时长/热度/官方信号词」打分选出最匹配视频，解析其 DASH 音频流直链。
 * - 音频流由后端代理转发（加上正确的 User-Agent / Referer 满足防盗链），前端同源播放。
 */
import http from 'http'
import https from 'https'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import { httpGet } from './httpclient.js'
import { httpsProxyAgent } from './proxy.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CACHE_DIR = path.resolve(__dirname, '..', '.music_cache')
const CACHE_MAX_BYTES = 300 * 1024 * 1024

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

let sessionCookies = {}
let sessionInited = false

function cookieHeader() {
  return Object.entries(sessionCookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')
}

async function initSession() {
  if (sessionInited) return
  for (const url of ['https://www.bilibili.com/', 'https://search.bilibili.com/']) {
    try {
      const r = await httpGet(url, {
        headers: { 'User-Agent': UA, Referer: 'https://www.bilibili.com/' },
        timeout: 8,
      })
      Object.assign(sessionCookies, r.cookies)
    } catch {
      /* ignore */
    }
  }
  sessionInited = true
}

async function getText(url, referer = 'https://www.bilibili.com/', timeout = 10) {
  await initSession()
  try {
    const headers = {
      'User-Agent': UA,
      Referer: referer,
      Accept: 'application/json, text/plain, */*',
      'Accept-Encoding': 'gzip, deflate',
    }
    const ck = cookieHeader()
    if (ck) headers['Cookie'] = ck
    const r = await httpGet(url, { headers, timeout })
    Object.assign(sessionCookies, r.cookies)
    return r.text
  } catch {
    return null
  }
}

function stripHtml(s) {
  let out = String(s || '').replace(/<[^>]+>/g, '')
  const map = [
    [/&amp;/g, '&'],
    [/&lt;/g, '<'],
    [/&gt;/g, '>'],
    [/&quot;/g, '"'],
    [/&#x27;/g, "'"],
    [/&apos;/g, "'"],
    [/&#x2F;/g, '/'],
    [/&#x2f;/g, '/'],
  ]
  for (const [re, rep] of map) out = out.replace(re, rep)
  return out
}

function parseJson(text) {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** 搜索 B 站视频候选（前 3 页）。 */
export async function searchBili(keyword) {
  if (!keyword) return []
  await initSession()
  const results = []
  const seenBvid = new Set()
  for (let p = 1; p <= 3; p++) {
    const url = `https://api.bilibili.com/x/web-interface/search/all/v2?keyword=${encodeURIComponent(
      keyword
    )}&page=${p}`
    const text = await getText(
      url,
      'https://search.bilibili.com/all?keyword=' + encodeURIComponent(keyword)
    )
    const data = parseJson(text)
    if (!data || data.code !== 0) break
    const blocks = (data.data || {}).result || []
    let got = false
    for (const block of blocks) {
      if (!block || typeof block !== 'object') continue
      if (block.result_type === 'video') {
        for (const v of block.data || []) {
          const bvid = String(v.bvid || '')
          if (!bvid || seenBvid.has(bvid)) continue
          seenBvid.add(bvid)
          const pic = String(v.pic || '')
          results.push({
            bvid,
            title: stripHtml(String(v.title || '')),
            author: String(v.author || ''),
            description: stripHtml(String(v.description || '')),
            duration: String(v.duration || '0:00'),
            pubdate: Number(v.pubdate || 0) || 0,
            play: Number(v.play || 0) || 0,
            cover: pic.replace(/^\/\//, 'https://'),
          })
        }
        got = true
        break
      }
    }
    if (!got) break
  }
  return results
}

/* ===== 匹配打分（由歌声名/歌手/时长选最匹配视频）====== */

function parseDuration(s) {
  const parts = String(s || '')
    .split(':')
    .map((x) => parseInt(x, 10))
    .filter((x) => Number.isFinite(x))
  if (!parts.length) return 0
  let sec = 0
  for (const p of parts) sec = sec * 60 + p
  return sec
}

function norm(s) {
  let out = String(s || '').replace(/[\(\[\（【][^\)\]\）】]*[\)\]\）】]/g, '')
  out = out.replace(/\s+/g, '')
  return out.toLowerCase()
}

const POSITIVE_SIGNALS = [
  '官方', 'official', 'mv', 'music video', 'pv', 'promotion video',
  '原版', '原唱', '原声', '原曲', '无损', 'hq', 'hd', '高音质',
  '完整版', '全长', '华语', '单曲', '主打',
]
const NEGATIVE_SIGNALS = [
  '翻唱', 'cover', 'remix', 'remake', 'live', '现场', '演唱会',
  '弹唱', '教学', '教学曲', '教程', '扒带', '扒谱', '伴奏', 'karaoke',
  '恶搞', '鬼畜', '搞笑', '搞笑版', '解说', '点评', '乐评', '盘点',
  '钢琴', '吉他', '尤克里里', '二胡', '萨克斯',
]

function signalScore(text) {
  const s = norm(text)
  const pos = POSITIVE_SIGNALS.filter((w) => s.includes(w)).length
  const neg = NEGATIVE_SIGNALS.filter((w) => s.includes(w)).length
  return Math.max(-8, Math.min(15, pos * 5 - neg * 5))
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function rankBili(candidates, name = '', singer = '', duration = 0) {
  const nameN = norm(name)
  const singerN = norm(singer)
  const nameStem = nameN.replace(/[《》\-—_·\s]+/g, '')
  const scored = []

  for (const v of candidates || []) {
    const titleRaw = String(v.title || '')
    const titleN = norm(titleRaw)
    const authorN = norm(v.author)
    let score = 0

    if (nameN) {
      if (titleN.includes(nameN)) {
        score += 40
        const titleCompact = titleN.replace(/[《》\-—_·\s]+/g, '')
        if (titleCompact.startsWith(nameStem)) score += 10
      } else {
        const tokens = nameN.split('').filter((t) => t.length >= 2)
        const hits = tokens.filter((t) => titleN.includes(t)).length
        score += Math.min(20, 10 * hits)
      }
    }

    if (singerN) {
      const singerHitTitle = titleN.includes(singerN)
      const singerHitAuthor = authorN.includes(singerN)
      if (singerHitTitle || singerHitAuthor) {
        score += 30
      } else {
        const parts = singerN.split(/[/;、,，]|&/).filter(Boolean)
        if (parts.length && parts.some((p) => titleN.includes(p) || authorN.includes(p))) {
          score += 15
        }
      }
    }

    const vdur = parseDuration(v.duration)
    if (duration && duration > 0 && vdur > 0) {
      const diff = Math.abs(vdur - duration)
      if (diff <= 8) score += 25
      else if (diff <= 30) score += 25 - (diff - 8) * 0.5
      else if (diff <= 60) score += 14 - (diff - 30) * 0.3
      else score -= 20
    } else if (duration && duration > 0 && vdur === 0) {
      score -= 2
    }

    const play = Number(v.play || 0)
    if (play > 0) {
      score += Math.min(10, Math.log10(play + 1) * 1.5)
    }

    const titleScore = signalScore(titleN || titleRaw)
    const descScore = signalScore(v.description)
    score += Math.max(titleScore, Math.floor(descScore * 0.6))

    if (nameStem && singerN) {
      const re = new RegExp(
        `[《<]?${escapeRegExp(nameStem)}[》>]?\\s*[-–—:：]\\s*${escapeRegExp(singerN)}`
      )
      if (re.test(titleN)) score += 5
    }

    scored.push([score, v])
  }

  scored.sort((a, b) => b[0] - a[0])
  return scored.map(([sc, v]) => ({ ...v, _score: Math.round(sc * 100) / 100 }))
}

/** 解析视频的 DASH 音频流直链。 */
export async function previewBili(bvid, cid) {
  try {
    await initSession()
    let cidNum = cid
    let title = ''
    let duration = 0
    let cover = ''
    if (!cidNum) {
      const infoUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`
      const info = parseJson(await getText(infoUrl, 'https://www.bilibili.com/'))
      if (!info || info.code !== 0) return null
      const data = info.data || {}
      cidNum = data.cid
      title = data.title || ''
      duration = Number(data.duration || 0) || 0
      cover = String(data.pic || '').replace(/^http:\/\//, 'https://')
    }
    if (!cidNum) return null

    const playUrl = `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cidNum}&fnval=16&fourk=1&platform=pc`
    const play = parseJson(await getText(playUrl, `https://www.bilibili.com/video/${bvid}`))
    if (!play || play.code !== 0) return null
    const dash = (play.data || {}).dash || {}
    const audios = dash.audio || []
    if (!audios.length) return null
    audios.sort((a, b) => (Number(b.bandwidth) || 0) - (Number(a.bandwidth) || 0))
    const best = audios[0]
    const audioUrl = String(
      best.baseUrl ||
        (best.backupUrl && best.backupUrl.length ? best.backupUrl[0] : '') ||
        ''
    )
    if (!audioUrl) return null
    return {
      bvid,
      title,
      duration,
      audioUrl,
      cover,
      info: {
        id: Number(best.id || 0) || 0,
        bandwidth: Number(best.bandwidth || 0) || 0,
        codecs: String(best.codecs || ''),
        baseUrl: audioUrl,
      },
    }
  } catch {
    return null
  }
}

/** 综合：按歌名/歌手/时长搜索 B 站并选最匹配视频，解析出可播放音频直链。 */
export async function resolveBest(bilibili) {
  const { song = '', singer = '', duration = 0 } = bilibili || {}
  if (!song) return null
  const keyword = singer ? `${song} ${singer}` : song
  const candidates = await searchBili(keyword)
  if (!candidates.length) return null
  const ranked = rankBili(candidates, song, singer, duration)
  const best = ranked[0]
  if (!best) return null
  const audio = await previewBili(best.bvid, best.cid)
  if (!audio) return null
  return {
    bvid: best.bvid,
    title: audio.title || best.title,
    author: best.author,
    cover: audio.cover || best.cover,
    duration: audio.duration || parseDuration(best.duration),
    audioUrl: audio.audioUrl,
    source: 'bilibili',
  }
}

/**
 * 音频流代理（移植自 musicgrove /api/bili/proxy 的可靠方案）：
 *
 * 1. 请求头极简：仅 UA + Referer（+ Range）。多发 Origin / Accept-Encoding /
 *    Connection 等头会显著提高 B 站 CDN 对同一签名 URL 的 403 概率。
 * 2. 落盘缓存：首次完整请求（无 Range 或 bytes=0-）边转发边写入本地缓存，
 *    之后的播放/seek/重播全部从本地文件读取 —— CDN URL 只被打一次，
 *    彻底规避 B站对同一 URL 短时重复请求的间歇性 403，seek 也变成 O(1)。
 * 3. 写缓存按全局互斥锁串行化 + 双检，避免并发写坏同一文件。
 */
class KeyedLock {
  constructor() {
    this.tail = Promise.resolve()
  }
  run(fn) {
    const prev = this.tail
    let release
    this.tail = new Promise((r) => (release = r))
    return prev.then(fn).then(
      (v) => {
        release()
        return v
      },
      (e) => {
        release()
        throw e
      }
    )
  }
}
const cacheLock = new KeyedLock()

function cachePathFor(audioUrl) {
  const key = crypto.createHash('sha1').update(audioUrl).digest('hex')
  return path.join(CACHE_DIR, key + '.m4s')
}

/* token -> audioUrl 登记：预览环境的中间代理会破坏 query 里的百分号编码
 * （CDN URL 在第一个 & 处被截断 → 403），因此音频流改走路径 token */
const tokenUrls = new Map()

export function registerStreamToken(audioUrl) {
  const token = crypto.createHash('sha1').update(audioUrl).digest('hex')
  tokenUrls.set(token, audioUrl)
  return token
}

/** 按路径 token 代理音频流：优先本地缓存，其次登记过的 URL 回源 */
export function proxyAudioStreamByToken(token, clientReq, clientRes) {
  const cachePath = path.join(CACHE_DIR, token + '.m4s')
  if (cacheReady(cachePath)) {
    serveCachedFile(cachePath, clientReq, clientRes)
    return
  }
  const audioUrl = tokenUrls.get(token)
  if (!audioUrl) {
    clientRes.writeHead(410, { 'Content-Type': 'application/json; charset=utf-8' })
    clientRes.end(JSON.stringify({ error: '流标识已失效，请重新解析', expired: true }))
    return
  }
  proxyAudioStream(audioUrl, clientReq, clientRes)
}

function cacheReady(cachePath) {
  try {
    return fs.existsSync(cachePath) && fs.statSync(cachePath).size > 0
  } catch {
    return false
  }
}

/** 该音频 URL 的字节是否已完整落盘（供 /api/resolve 判断可否直接复用） */
export function audioCacheReady(audioUrl) {
  return cacheReady(cachePathFor(audioUrl))
}

/* 缓存目录超限时删除最旧文件（B站 URL 会过期，缓存自然失效，简单的 LRU 足够） */
function evictCacheIfNeeded() {
  try {
    const files = fs
      .readdirSync(CACHE_DIR)
      .filter((f) => f.endsWith('.m4s'))
      .map((f) => {
        const p = path.join(CACHE_DIR, f)
        return { p, size: fs.statSync(p).size, mtime: fs.statSync(p).mtimeMs }
      })
    let total = files.reduce((s, f) => s + f.size, 0)
    if (total <= CACHE_MAX_BYTES) return
    files.sort((a, b) => a.mtime - b.mtime)
    for (const f of files) {
      if (total <= CACHE_MAX_BYTES) break
      try {
        fs.rmSync(f.p)
        total -= f.size
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

/* 从本地缓存文件服务请求，支持 Range / seek */
function serveCachedFile(cachePath, clientReq, clientRes) {
  const total = fs.statSync(cachePath).size
  const rangeHeader = clientReq.headers.range || ''
  if (!rangeHeader) {
    clientRes.writeHead(200, {
      'Content-Type': 'audio/mp4',
      'Content-Length': total,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache',
    })
    fs.createReadStream(cachePath).pipe(clientRes)
    return
  }
  const spec = rangeHeader.replace(/^bytes=/, '')
  let start, end
  if (spec.startsWith('-')) {
    const n = parseInt(spec.slice(1), 10)
    start = Math.max(0, total - n)
    end = total - 1
  } else {
    const parts = spec.split('-')
    start = parseInt(parts[0], 10)
    end = parts[1] ? parseInt(parts[1], 10) : total - 1
  }
  if (!(start >= 0 && start < total)) {
    clientRes.writeHead(416).end()
    return
  }
  end = Math.min(end, total - 1)
  clientRes.writeHead(206, {
    'Content-Type': 'audio/mp4',
    'Content-Length': end - start + 1,
    'Content-Range': `bytes ${start}-${end}/${total}`,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache',
  })
  fs.createReadStream(cachePath, { start, end }).pipe(clientRes)
}

export function proxyAudioStream(audioUrl, clientReq, clientRes) {
  const parsed = new URL(audioUrl)

  // 仅允许 B 站音视频 CDN（.bilivideo.com / .bilivideo.cn），防 SSRF
  if (!/bilivideo\.(com|cn)$/i.test(parsed.hostname)) {
    clientRes.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' })
    clientRes.end(JSON.stringify({ error: 'host not allowed' }))
    return
  }

  const cachePath = cachePathFor(audioUrl)

  // 命中缓存：直接读盘（含 Range/seek）
  if (cacheReady(cachePath)) {
    serveCachedFile(cachePath, clientReq, clientRes)
    return
  }

  // 未命中：串行化回源，避免并发写同一缓存文件
  cacheLock
    .run(async () => {
      // 双检：等锁期间可能已被其他请求写满
      if (cacheReady(cachePath)) {
        serveCachedFile(cachePath, clientReq, clientRes)
        return
      }

      // 极简请求头（多发头会提高 B 站 CDN 403 概率）
      const headers = {
        'User-Agent': UA,
        Referer: 'https://www.bilibili.com/',
      }
      const rangeHeader = clientReq.headers.range || ''
      if (rangeHeader) headers['Range'] = rangeHeader

      const mod = parsed.protocol === 'https:' ? https : http
      const upstream = await new Promise((resolve, reject) => {
        const req = mod.request(
          parsed,
          { method: 'GET', headers, timeout: 20000, agent: parsed.protocol === 'https:' ? httpsProxyAgent() : undefined },
          (res) => resolve(res)
        )
        req.on('error', reject)
        req.end()
      })

      if (upstream.statusCode === 403 || upstream.statusCode === 404) {
        upstream.destroy()
        clientRes.writeHead(410, { 'Content-Type': 'application/json; charset=utf-8' })
        clientRes.end(JSON.stringify({ error: '音频链接已过期，请刷新重试', expired: true }))
        return
      }

      const status = upstream.statusCode || 200
      const upstreamCT = upstream.headers['content-type'] || ''
      const outCT = /octet-stream/i.test(upstreamCT) || !upstreamCT ? 'audio/mp4' : upstreamCT

      // 仅当「完整下载」(无 Range 或 bytes=0-) 才落盘缓存
      const wantCache = !rangeHeader || rangeHeader.trim().toLowerCase() === 'bytes=0-'
      const tmpPath = cachePath + '.part'
      let file = null
      if (wantCache) {
        try {
          fs.mkdirSync(CACHE_DIR, { recursive: true })
          file = fs.createWriteStream(tmpPath)
        } catch {
          file = null
        }
      }

      clientRes.writeHead(status, {
        'Content-Type': outCT,
        ...(upstream.headers['content-length'] ? { 'Content-Length': upstream.headers['content-length'] } : {}),
        ...(upstream.headers['content-range'] ? { 'Content-Range': upstream.headers['content-range'] } : {}),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache',
      })

      upstream.on('data', (c) => {
        if (!clientRes.destroyed) clientRes.write(c)
        if (file) file.write(c)
      })
      upstream.on('end', () => {
        try {
          clientRes.end()
        } catch {
          /* ignore */
        }
        if (file) {
          file.end()
          // 结束后统一改名落盘 + 容量淘汰
          file.on('close', () => {
            try {
              fs.renameSync(tmpPath, cachePath)
              evictCacheIfNeeded()
            } catch {
              try {
                fs.rmSync(tmpPath)
              } catch {
                /* ignore */
              }
            }
          })
        }
      })
      upstream.on('error', () => {
        try {
          clientRes.end()
        } catch {
          /* ignore */
        }
        if (file) {
          file.destroy()
          try {
            fs.rmSync(tmpPath)
          } catch {
            /* ignore */
          }
        }
      })
    })
    .catch(() => {
      if (!clientRes.headersSent) {
        clientRes.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' })
      }
      try {
        clientRes.end(JSON.stringify({ error: '音频代理请求失败' }))
      } catch {
        /* ignore */
      }
    })
}