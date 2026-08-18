#!/usr/bin/env node
/**
 * QQ音乐歌单解析脚本（Node.js 版，原 parse-qq-playlist.py 的等价重写）
 *
 * 用法：
 *   node scripts/parse-qq-playlist.mjs <歌单ID> [输出文件名]
 *
 * 示例：
 *   node scripts/parse-qq-playlist.mjs 7813925785
 *   node scripts/parse-qq-playlist.mjs 9765169551 other.jsonl
 *
 * 输出 JSONL 格式（与 public/music.jsonl 兼容）：
 *   每行一首歌，包含 API 返回的全部字段 + 构造的封面/链接 URL。
 *   核心字段：title, artist, duration, songmid, albummid, cover, ...
 *
 * 同时输出歌单元信息文件（同名 .info.json）：
 *   歌单名、创建者、封面、描述、播放数等。
 *
 * 依赖：无第三方依赖，仅需 Node.js >= 22（内置 fetch）。
 * 网络：自动读取 HTTP_PROXY / HTTPS_PROXY 环境变量；未设置则直连。
 */

import { writeFileSync, readFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

// QQ 音乐图片 CDN 前缀
const IMG_CDN = 'https://y.gtimg.cn/music/photo_new'

// 是否启用代理（仅当环境变量存在时）
const PROXY_URL = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || ''
const USE_PROXY = !!PROXY_URL

/** 通过代理（如配置）发起 HTTP 请求 */
async function fetchUrl(url, { headers = {}, body } = {}) {
  const reqHeaders = {
    'User-Agent': UA,
    Referer: 'https://y.qq.com/',
    Accept: 'application/json',
    ...headers,
  }
  const opts = {
    headers: reqHeaders,
    signal: AbortSignal.timeout(25000),
  }
  if (body) {
    opts.method = 'POST'
    opts.body = body
  }
  if (USE_PROXY) {
    opts.dispatcher = undefined // fetch 原生不直接支持代理，靠环境变量 HTTPS_PROXY 由运行时处理
  }
  const resp = await fetch(url, opts)
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`)
  return resp.text()
}

/** 由 albummid 构造专辑封面 URL */
function albumCover(albummid, size = 300) {
  if (!albummid) return ''
  return `${IMG_CDN}/T002R${size}x${size}M000${albummid}.jpg`
}

/** 由 singermid 构造歌手照片 URL */
function singerPhoto(singermid, size = 300) {
  if (!singermid) return ''
  return `${IMG_CDN}/T001R${size}x${size}M000${singermid}.jpg`
}

/** 由 songmid 构造歌曲页面 URL */
function songUrl(songmid) {
  if (!songmid) return ''
  return `https://y.qq.com/n/ryqq/songDetail/${songmid}`
}

/** 由 albummid 构造专辑页面 URL */
function albumUrl(albummid) {
  if (!albummid) return ''
  return `https://y.qq.com/n/ryqq/albumDetail/${albummid}`
}

/**
 * 将 API 返回的原始歌曲对象规范化，保留全部字段并补充构造字段。
 * 方案一字段名带 song 前缀（songname/songmid/songid），
 * 方案二字段名无前缀（name/mid/id），统一映射。
 */
function normalizeSong(s) {
  const title = (s.songname || s.name || '').trim()
  const songmid = s.songmid || s.mid || ''
  const songid = s.songid || s.id || 0

  // 歌手列表：保留完整结构 + 拼接名 + 照片 URL
  const singersRaw = s.singer || []
  const singers = singersRaw.map((x) => {
    const mid = x.mid || ''
    return {
      id: x.id || 0,
      mid,
      name: x.name || '',
      photo: singerPhoto(mid),
    }
  })
  const artist = singers.filter((x) => x.name).map((x) => x.name).join('、')

  const albummid = s.albummid || s.albumMid || ''
  const albumid = s.albumid || s.albumId || 0
  const duration = parseInt(s.interval || 0, 10) || 0

  const cover = albumCover(albummid)

  // 组装完整歌曲对象（保留 API 全部原始字段 + 构造字段）
  const song = {
    // —— 核心字段（前端直接使用）——
    title,
    artist,
    duration,
    cover,

    // —— 歌曲标识 ——
    songmid,
    songid,
    songorig: s.songorig || s.orig || '',
    songtype: s.songtype || 0,
    strMediaMid: s.strMediaMid || '',

    // —— 专辑信息 ——
    albumid,
    albummid,
    albumname: (s.albumname || s.albumName || '').trim(),
    albumdesc: (s.albumdesc || s.albumDesc || '').trim(),
    albumPic: albumCover(albummid, 800),
    albumUrl: albumUrl(albummid),

    // —— 歌手信息 ——
    singers,

    // —— 视频 ——
    vid: s.vid || '',

    // —— 文件大小（字节）——
    size128: s.size128 || 0,
    size320: s.size320 || 0,
    sizeflac: s.sizeflac || 0,
    sizeape: s.sizeape || 0,
    sizeogg: s.sizeogg || 0,

    // —— 付费/版权 ——
    pay: s.pay || {},
    preview: s.preview || {},
    isonly: s.isonly || 0,

    // —— 其他元数据 ——
    label: s.label || 0,
    rate: s.rate || 0,
    stream: s.stream || 0,
    switch: s.switch || 0,
    alertid: s.alertid || 0,
    msgid: s.msgid || 0,
    belongCD: s.belongCD || 0,
    cdIdx: s.cdIdx || 0,

    // —— 构造链接 ——
    songUrl: songUrl(songmid),
  }

  // 保留 API 中未映射的额外字段（防止遗漏）
  const mappedKeys = new Set([
    'songname', 'name', 'songmid', 'mid', 'songid', 'id',
    'songorig', 'orig', 'songtype', 'strMediaMid',
    'albummid', 'albumMid', 'albumid', 'albumId',
    'albumname', 'albumName', 'albumdesc', 'albumDesc',
    'singer', 'interval', 'vid',
    'size128', 'size320', 'sizeflac', 'sizeape', 'sizeogg',
    'pay', 'preview', 'isonly',
    'label', 'rate', 'stream', 'switch', 'alertid', 'msgid',
    'belongCD', 'cdIdx',
  ])
  for (const [k, v] of Object.entries(s)) {
    if (!mappedKeys.has(k) && !(k in song)) song[k] = v
  }

  return song
}

/** 提取歌单元信息 */
function extractPlaylistInfo(cd) {
  return {
    dissname: cd.dissname || cd.title || '',
    dissid: cd.dissid || '',
    disstid: cd.disstid || '',
    desc: (cd.desc || '').trim(),
    logo: cd.logo || '',
    nick: cd.nick || cd.nickname || '',
    headurl: cd.headurl || '',
    songnum: cd.songnum || cd.total_song_num || 0,
    visitnum: cd.visitnum || 0,
    buynum: cd.buynum || 0,
    cmtnum: cd.cmtnum || 0,
    scoreavage: cd.scoreavage || 0,
    scoreusercount: cd.scoreusercount || 0,
    tags: cd.tags || [],
    ctime: cd.ctime || 0,
    mtime: cd.mtime || 0,
  }
}

/** 方案一：c.y.qq.com 经典接口（最稳定） */
async function fetchPlaylistClassic(disstid) {
  const url =
    `https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?` +
    `disstid=${disstid}&type=1&json=1&utf8=1&onlysong=0&nosign=1&g_tk=5381` +
    `&loginUin=0&hostUin=0&format=json&inCharset=GB2312&outCharset=utf-8` +
    `&notice=0&platform=yqq&needNewCode=0`
  console.log('  [方案一] GET c.y.qq.com ...')
  const raw = await fetchUrl(url)
  let text = raw.trim()

  // 处理 JSONP 回调包裹
  if (text.startsWith('jsonCallback')) {
    text = text.slice(text.indexOf('(') + 1, text.lastIndexOf(')'))
  }

  const obj = JSON.parse(text)
  if (obj.code !== 0 || !obj.cdlist) {
    throw new Error(`方案一 cdlist 为空, code=${obj.code}`)
  }

  const cd = obj.cdlist[0]
  const songs = (cd.songlist || []).map(normalizeSong)
  const info = extractPlaylistInfo(cd)

  return {
    playlistName: info.dissname,
    songs,
    songCount: cd.songnum || songs.length,
    info,
  }
}

/** 方案二：u.y.qq.com POST 接口（备用） */
async function fetchPlaylistNew(disstid) {
  const url = 'https://u.y.qq.com/cgi-bin/musicu.fcg'
  const body = JSON.stringify({
    comm: { cv: 4747474, ct: 24, format: 'json', inCharset: 'utf-8', outCharset: 'utf-8', notice: 0, platform: 'yqq.json', needNewCode: 1, uin: '0' },
    playlist: {
      method: 'GetPlaylistDetail',
      module: 'music.playlist.PlaylistDetailServer',
      param: { id: parseInt(disstid, 10), n: 1000, order: 5 },
    },
  })

  console.log('  [方案二] POST u.y.qq.com ...')
  const raw = await fetchUrl(url, { headers: { 'Content-Type': 'application/json' }, body })
  const obj = JSON.parse(raw)

  const data = obj.playlist?.data
  if (!data || !data.songlist) {
    const code = obj.playlist?.code
    throw new Error(`方案二 songlist 为空, code=${code}`)
  }

  const songs = data.songlist.map(normalizeSong)
  const info = extractPlaylistInfo(data)

  return { playlistName: info.dissname, songs, songCount: songs.length, info }
}

/**
 * 同步歌单：拉取并写入 public/music.jsonl + public/music.info.json
 * 供 vite.config.js 直接 import 调用。
 * @param {string} disstid 歌单 ID
 * @param {string} outName 输出文件名（默认 music.jsonl）
 */
export async function syncPlaylist(disstid, outName = 'music.jsonl') {
  // 输出到 public/ 目录（与 music.jsonl 同级）
  const publicDir = resolve(__dirname, '..', 'public')
  const outPath = join(publicDir, outName)

  console.log(`[qq-music] 解析歌单 ${disstid}`)

  let result = null
  try {
    result = await fetchPlaylistClassic(disstid)
    console.log('  [qq-music] ✅ 方案一成功')
  } catch (e1) {
    console.log(`  [qq-music] ⚠️ 方案一失败: ${e1.message}`)
    try {
      result = await fetchPlaylistNew(disstid)
      console.log('  [qq-music] ✅ 方案二成功')
    } catch (e2) {
      throw new Error(`方案二也失败: ${e2.message}`)
    }
  }

  const { songs, info } = result

  // 写入歌单元信息
  const infoPath = outPath.replace(/\.[^.]+$/, '.info.json')
  writeFileSync(infoPath, JSON.stringify(info, null, 2), 'utf-8')
  console.log(`  [qq-music] 歌单信息已写入: ${infoPath}`)

  // 写入 JSONL
  writeFileSync(outPath, songs.map((s) => JSON.stringify(s)).join('\n') + (songs.length ? '\n' : ''), 'utf-8')
  console.log(`  [qq-music] 歌曲数据已写入: ${outPath}（${songs.length} 首）`)
}

/** CLI 入口：仅当直接运行本文件时执行 */
async function main() {
  const disstid = process.argv[2]
  if (!disstid) {
    console.log('用法: node scripts/parse-qq-playlist.mjs <歌单ID> [输出文件名]')
    console.log('示例: node scripts/parse-qq-playlist.mjs 7813925785 music.jsonl')
    process.exit(1)
  }
  const outName = process.argv[3] || 'music.jsonl'

  console.log('='.repeat(60))
  console.log(`解析歌单 ${disstid}`)
  console.log('='.repeat(60))

  await syncPlaylist(disstid, outName)

  // 打印前10条（CLI 模式才打印详细信息）
  const outPath = resolve(__dirname, '..', 'public', outName)
  const songs = readFileSync(outPath, 'utf-8').trim().split('\n').map((l) => JSON.parse(l))
  const info = JSON.parse(readFileSync(outPath.replace(/\.[^.]+$/, '.info.json'), 'utf-8'))
  console.log(`  歌单名: ${info.dissname}`)
  console.log(`  创建者: ${info.nick || ''}`)
  console.log(`  实际解析歌曲数: ${songs.length}`)
  console.log('\n  前10条数据:')
  songs.slice(0, 10).forEach((s, i) => {
    const mm = String(Math.floor(s.duration / 60)).padStart(2, '0')
    const ss = String(s.duration % 60).padStart(2, '0')
    console.log(`    ${String(i + 1).padStart(2, '0')}. ${s.title} — ${s.artist} (${mm}:${ss})`)
    console.log(`        封面: ${s.cover}`)
    console.log(`        专辑: ${s.albumname} (mid=${s.albummid})`)
    if (s.vid) console.log(`        MV: ${s.vid}`)
  })
}

// 仅在直接运行时执行 CLI 入口
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
