/**
 * B站 CDN 节点可用性探针：解析同一视频的 baseUrl + backupUrl，逐个探测哪些能用
 */
import http from 'http'
import https from 'https'
import { previewBili } from '../server/bili.js'
import { httpsProxyAgent } from '../server/proxy.js'

function probe(url) {
  return new Promise((resolve) => {
    const u = new URL(url)
    const req = https.request(
      u,
      {
        method: 'GET',
        agent: httpsProxyAgent(),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Referer: 'https://www.bilibili.com/',
          Origin: 'https://www.bilibili.com',
          Range: 'bytes=0-1023',
          'Accept-Encoding': 'identity',
        },
        timeout: 10000,
      },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const body = Buffer.concat(chunks)
          resolve({
            host: u.host,
            status: res.statusCode,
            ct: res.headers['content-type'] || '',
            len: res.headers['content-length'] || '',
            headOk: body.length > 12 && body.toString('latin1', 4, 8) === 'ftyp',
          })
        })
      }
    )
    req.on('timeout', () => { req.destroy(); resolve({ host: u.host, status: 'TIMEOUT' }) })
    req.on('error', (e) => resolve({ host: u.host, status: 'ERR:' + e.code }))
    req.end()
  })
}

const bvid = process.argv[2] || 'BV1k1Gcz9ETR'
console.log(`解析视频 ${bvid} 的全部音频 CDN URL…\n`)
const info = await previewBili(bvid)
if (!info) {
  console.log('解析失败')
  process.exit(1)
}
console.log(`标题: ${info.title}`)
console.log(`选中流: id=${info.info.id} codecs=${info.info.codecs} bandwidth=${info.info.bandwidth}`)
console.log(`baseUrl: ${info.audioUrl.slice(0, 100)}…\n`)

// 重新调 playurl 拿完整的 baseUrl + backupUrl 列表
const { httpGet } = await import('../server/httpclient.js')
const view = JSON.parse(
  (await httpGet(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, { timeout: 10 })).text
)
const play = JSON.parse(
  (
    await httpGet(
      `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${view.data.cid}&fnval=16&platform=pc`,
      { timeout: 10, headers: { Referer: `https://www.bilibili.com/video/${bvid}` } }
    )
  ).text
)
const audios = play.data.dash.audio || []
audios.sort((a, b) => (Number(b.bandwidth) || 0) - (Number(a.bandwidth) || 0))
console.log(`共 ${audios.length} 条音频流: ${audios.map((a) => a.id).join(', ')}\n`)

for (const a of audios.slice(0, 2)) {
  console.log(`── 流 id=${a.id} codecs=${a.codecs} ──`)
  const urls = [a.baseUrl, ...(a.backupUrl || [])].filter(Boolean)
  const seen = new Set()
  for (const url of urls) {
    const host = new URL(url).host
    if (seen.has(host)) continue
    seen.add(host)
    const r = await probe(url)
    const mark = r.status === 206 ? '✅' : '❌'
    console.log(`  ${mark} ${host} → ${r.status} ct=${r.ct || '-'} len=${r.len || '-'} ftyp=${r.headOk}`)
  }
  console.log()
}
process.exit(0)
