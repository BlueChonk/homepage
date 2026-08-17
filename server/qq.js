/**
 * QQ 音乐搜索（仅歌曲/专辑/歌词/歌手搜索，不做登录）。移植自 musicgrove。
 * 说明：QQ 音乐免费接口仅用于获取歌曲列表与元信息，获取可播放音频仍走 B 站。
 */
import { httpGet } from './httpclient.js'

const UA_PHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 9_1 like Mac OS X) AppleWebKit/601.1.46 (KHTML, like Gecko) Version/9.0 Mobile/13B143 Safari/601.1'

const SEARCH_URL = 'https://c.y.qq.com/soso/fcgi-bin/search_for_qq_cp'
const SMARTBOX_URL = 'https://c.y.qq.com/splcloud/fcgi-bin/smartbox_new.fcg'

function singerName(raw) {
  if (Array.isArray(raw)) {
    const names = raw.map((s) =>
      s && typeof s === 'object' ? String(s.name || '') : String(s || '')
    )
    return names.filter(Boolean).join(' / ')
  }
  if (typeof raw === 'string') return raw
  return ''
}

export function qqCover(albummid) {
  return albummid
    ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${albummid}.jpg`
    : ''
}

function normalizeSong(raw) {
  const albummid = String(raw.albummid || raw.albumMid || '')
  return {
    id: String(raw.songid || raw.id || ''),
    mid: String(raw.songmid || raw.mid || ''),
    name: String(raw.songname || raw.name || ''),
    singer: singerName(raw.singer),
    album: String(raw.albumname || raw.albumName || ''),
    album_mid: albummid,
    cover: qqCover(albummid),
    interval: Number(raw.interval || 0) || 0,
    pay: raw.pay || {},
  }
}

const TYPE_MAP = { song: 0, album: 8, playlist: 4, lyric: 7 }

function headers() {
  return { 'User-Agent': UA_PHONE, Referer: 'http://m.y.qq.com' }
}

/** 按关键字搜索歌曲。默认 searchType=song。 */
export async function searchQQ(keyword, searchType = 'song', page = 1, pageSize = 20) {
  const t = TYPE_MAP[searchType] ?? 0
  const params = {
    w: keyword,
    format: 'json',
    p: String(page),
    n: String(pageSize),
    t: String(t),
    zhidaqu: '1',
    catZhida: '1',
    flag: '1',
    ie: 'utf-8',
    sem: '1',
    aggr: '0',
    perpage: String(pageSize),
    remoteplace: 'txt.mqq.all',
  }
  const qs = new URLSearchParams(params).toString()
  const r = await httpGet(`${SEARCH_URL}?${qs}`, { headers: headers(), timeout: 30 })
  const j = JSON.parse(r.text)
  if (j.code !== 0) {
    throw new Error(`QQ 音乐搜索接口返回错误 code=${j.code}`)
  }
  const data = j.data || {}
  const song = data.song || {}
  const items = (song.list || []).map((s) => normalizeSong(s || {}))
  return { type: 'song', keyword, total: song.totalnum || items.length, items }
}