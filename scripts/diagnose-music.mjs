/**
 * 音乐播放全链路深度诊断 — 模拟浏览器 audio 元素的真实请求行为
 *
 * 链路: manifest → /api/resolve → /api/bbstream(带Range) → MP4容器字节级校验
 */
import http from 'http'
import https from 'https'
import fs from 'fs'

const API = 'http://127.0.0.1:8787'
const DEV = 'http://localhost:5173'

function request(url, { headers = {}, maxBytes = Infinity } = {}) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http
    const req = proto.get(url, { headers, timeout: 20000 }, (res) => {
      const chunks = []
      let size = 0
      res.on('data', (c) => {
        size += c.length
        if (size <= maxBytes) chunks.push(c)
        else req.destroy()
      })
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }))
      res.on('close', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks), truncated: true }))
    })
    req.on('error', (e) => e.message.includes('socket hang up') || e.code === 'ECONNRESET'
      ? resolve({ status: 'stream-ok', headers: {}, body: Buffer.concat([]), note: 'early-terminated after maxBytes (正常)' })
      : reject(e))
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
  })
}

const ok = (b) => (b ? '✅' : '❌')
let failures = 0
function report(label, pass, detail) {
  if (!pass) failures++
  console.log(`  ${ok(pass)} ${label}${detail ? '  →  ' + detail : ''}`)
}

console.log('═'.repeat(64))
console.log('  音乐播放链路逐跳诊断（模拟浏览器行为）')
console.log('═'.repeat(64))

/* ─── 第 1 跳: 清单 ─── */
console.log('\n[跳1] 加载 music-manifest.jsonl（前端 load() 做的事）')
const mf = await request(`${DEV}/music-manifest.jsonl`)
const tracks = mf.body.toString().trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
report(`HTTP ${mf.status}，解析出 ${tracks.length} 首`, mf.status === 200 && tracks.length > 0)
const t = tracks[0]
console.log(`      首条目: title=${JSON.stringify(t.title)} artist=${JSON.stringify(t.artist)} online=${t.online}`)
report('首条目含 title（resolve 的必要参数）', !!t.title)

/* ─── 第 2 跳: resolve（POST + JSON body，与前端 resolveOnline() 完全一致） ─── */
function postJSON(url, payload) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const body = JSON.stringify(payload)
    const req = http.request(u, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 60000,
    }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }))
    })
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
    req.on('error', reject)
    req.end(body)
  })
}
console.log(`\n[跳2] POST /api/resolve 经 Vite 代理（前端 resolveOnline() 现在的真实路径）`)
console.log(`      请求体: {"song":"${t.title}","singer":"${t.artist}"}`)
const t0 = Date.now()
const rs = await postJSON(`${DEV}/api/resolve`, { song: t.title, singer: t.artist, duration: 0 })
const resolve = JSON.parse(rs.body.toString())
console.log(`      耗时 ${Date.now() - t0}ms`)
report(`HTTP ${rs.status} ok=${resolve.ok}`, rs.status === 200 && resolve.ok === true)
report('返回 audioUrl（B站CDN直链）', !!resolve.audioUrl, resolve.audioUrl?.slice(0, 72) + '…')
report('返回 expiresAt（前端缓存有效期）', !!resolve.expiresAt, `剩余 ${Math.round((resolve.expiresAt - Date.now()) / 1000)}s`)
console.log(`      匹配视频: ${resolve.bvid} 《${resolve.title}》 ${resolve.duration}s`)

/* ─── 第 3 跳: bbstream 全量（audio.src 赋值后浏览器自动发起） ─── */
console.log('\n[跳3] GET /api/bbstream（前端 audio.src 指向的地址，无 Range）')
const streamUrl = `${API}/api/bbstream?url=${encodeURIComponent(resolve.audioUrl)}`
const s1 = await request(streamUrl, { maxBytes: 256 * 1024 })
const ct1 = s1.headers['content-type'] || ''
const cl1 = s1.headers['content-length'] || ''
report(`HTTP ${s1.status}`, s1.status === 200 || s1.status === 206)
report(`Content-Type: ${ct1}`, /mp4|octet|audio|video/.test(ct1))
report(`Content-Length 存在`, !!cl1, cl1 ? `${(Number(cl1) / 1048576).toFixed(2)} MB` : 'chunked')

/* ─── 第 4 跳: Range 请求（浏览器 audio 元素的标准行为） ─── */
console.log('\n[跳4] GET /api/bbstream + Range: bytes=0-（audio 元素真实首发请求）')
const s2 = await request(streamUrl, {
  headers: {
    'Range': 'bytes=0-',
    'Accept': '*/*',
    'Accept-Encoding': 'identity',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  },
  maxBytes: 512 * 1024,
})
const cr2 = s2.headers['content-range'] || ''
report(`HTTP ${s2.status}（浏览器要求 206）`, s2.status === 206)
report(`Content-Range 回传`, !!cr2, cr2)
report(`Accept-Ranges: ${s2.headers['accept-ranges']}`, s2.headers['accept-ranges'] === 'bytes')

/* ─── 第 5 跳: seek 模拟（拖动进度条） ─── */
console.log('\n[跳5] GET /api/bbstream + Range: bytes=1000000-（拖动进度条场景）')
const s3 = await request(streamUrl, { headers: { 'Range': 'bytes=1000000-' }, maxBytes: 64 * 1024 })
report(`HTTP ${s3.status}（拖动需 206）`, s3.status === 206, s3.headers['content-range'] || '')

/* ─── 第 6 跳: MP4 容器字节级校验 ─── */
console.log('\n[跳6] 音频流字节级检查（能否被 <audio> 解码的关键）')
const head = s2.body.subarray(0, 64)
const ascii = head.toString('latin1')
report('文件头为 ftyp box（合法 MP4 容器）', ascii.slice(4, 8) === 'ftyp', `brand="${ascii.slice(8, 12).trim()}"`)
// 解析顶层 box 结构
let off = 0
const boxes = []
const scan = s2.body.subarray(0, Math.min(s2.body.length, 512 * 1024))
while (off + 8 <= scan.length && boxes.length < 8) {
  const size = scan.readUInt32BE(off)
  const type = scan.toString('latin1', off + 4, off + 8)
  if (size < 8) break
  boxes.push(type)
  off += size
}
report('fMP4 结构含 moov（元数据）', boxes.includes('moov'), `boxes=[${boxes.join(',')}]`)
report('fMP4 结构含 moof（分片，Chrome audio 可播）', boxes.includes('moof'))
fs.writeFileSync('/tmp/bili-audio-head.mp4', s2.body)
console.log(`      已保存前 ${s2.body.length} 字节到 /tmp/bili-audio-head.mp4`)

/* ─── 第 7 跳: 经 Vite 代理 ─── */
console.log('\n[跳7] 同一请求经 Vite 代理(5173)（浏览器实际走的路径）')
const v = await request(`${DEV}/api/bbstream?url=${encodeURIComponent(resolve.audioUrl)}`, {
  headers: { 'Range': 'bytes=0-' }, maxBytes: 64 * 1024,
})
report(`HTTP ${v.status}`, v.status === 206 || v.status === 200, `content-range=${v.headers['content-range'] || '无'}`)

/* ─── 第 8 跳: 过期 URL 行为 ─── */
console.log('\n[跳8] 过期/失效 URL 的表现（audio 会收到什么错误）')
const bad = await request(`${API}/api/bbstream?url=${encodeURIComponent('https://xy.mcdn.bilivideo.cn/expired.m4s?e=fake')}`)
report(`失效 URL → HTTP ${bad.status}（映射 410）`, bad.status === 410)
console.log(`      响应体: ${bad.body.toString().slice(0, 80)}`)
console.log('      ⚠️ audio 元素对 410 会触发 error code=4(SRC_NOT_SUPPORTED)，前端仅对 code 1/2/3 自动重试')

/* ─── 汇总 ─── */
console.log('\n' + '═'.repeat(64))
console.log(failures === 0 ? '🎉 服务端每一跳全部正常 → 问题在浏览器侧' : `⚠️ ${failures} 项失败`)
console.log('═'.repeat(64))
process.exit(0)
