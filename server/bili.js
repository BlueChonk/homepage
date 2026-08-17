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
import { httpGet } from './httpclient.js'
import { httpsProxyAgent } from './proxy.js'

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
 * 音频流代理：支持 Range（seek），并加上防盗链所需的 UA / Referer。
 * 由 index.js 的 /api/bili/stream 路由调用。
 */
export function proxyAudioStream(audioUrl, clientReq, clientRes) {
  const parsed = new URL(audioUrl)
  const mod = parsed.protocol === 'https:' ? https : http
  const headers = {
    'User-Agent': UA,
    Referer: 'https://www.bilibili.com/',
  }
  // 透传客户端的 Range 头，实现拖动
  if (clientReq.headers.range) headers['Range'] = clientReq.headers.range

  const upstream = mod.request(
    parsed,
    { method: 'GET', headers, agent: parsed.protocol === 'https:' ? httpsProxyAgent() : undefined },
    (res) => {
    const clientHeaders = {
      'Content-Type': res.headers['content-type'] || 'application/octet-stream',
      'Accept-Ranges': res.headers['accept-ranges'] || 'bytes',
      'Cache-Control': 'no-cache',
    }
    if (res.headers['content-length']) {
      clientHeaders['Content-Length'] = res.headers['content-length']
    }
    if (res.headers['content-range']) {
      clientHeaders['Content-Range'] = res.headers['content-range']
    }
    clientRes.writeHead(res.statusCode || 200, clientHeaders)
    res.pipe(clientRes)
  })
  upstream.on('error', () => clientRes.end())
  upstream.end()
  return upstream
}