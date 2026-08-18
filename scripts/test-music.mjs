/**
 * 音乐播放全链路诊断脚本
 * 测试：manifest 加载 → API resolve → 音频流代理 → 可播放性
 */
import http from 'http'
import https from 'https'

const API = 'http://127.0.0.1:8787'
const DEV = 'http://localhost:5173'

function getJSON(url) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http
    proto.get(url, { timeout: 10000 }, (res) => {
      let data = ''
      res.on('data', (c) => (data += c))
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data), headers: res.headers })
        } catch {
          resolve({ status: res.statusCode, data, headers: res.headers })
        }
      })
    }).on('error', reject).on('timeout', function () { this.destroy(); reject(new Error('timeout')) })
  })
}

function getText(url) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http
    proto.get(url, { timeout: 15000 }, (res) => {
      let data = ''
      res.on('data', (c) => (data += c))
      res.on('end', () => resolve({ status: res.statusCode, data, headers: res.headers }))
    }).on('error', reject).on('timeout', function () { this.destroy(); reject(new Error('timeout')) })
  })
}

function check(label, ok, detail = '') {
  const icon = ok ? '✅' : '❌'
  console.log(`  ${icon} ${label}${detail ? ' — ' + detail : ''}`)
  return ok
}

console.log('='.repeat(60))
console.log('  音乐播放全链路诊断')
console.log('='.repeat(60))

let allOk = true

// 1. 检查 API 服务器
console.log('\n[1] API 服务器健康检查')
try {
  const r = await getJSON(`${API}/api/health`)
  allOk &= check('GET /api/health', r.status === 200 && r.data?.ok === true, `status=${r.status}`)
} catch (e) {
  allOk &= check('API 服务器', false, e.message)
}

// 2. 检查 manifest
console.log('\n[2] 音乐清单 (music.jsonl)')
try {
  const r = await getText(`${DEV}/music.jsonl`)
  const lines = r.data.trim().split('\n').filter(Boolean)
  const tracks = lines.map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  allOk &= check(`清单加载 (${tracks.length} 首)`, tracks.length > 0, `${tracks.length} tracks`)
  tracks.forEach((t, i) => {
    const hasTitle = !!(t.title || t.name)
    const hasArtist = !!t.artist
    console.log(`     #${i + 1} ${t.title || t.name || '(无标题)'} — ${t.artist || '(无歌手)'}  ${hasTitle && hasArtist ? '✅' : '⚠️'}`)
    if (!hasTitle) allOk = false
  })
} catch (e) {
  allOk &= check('清单加载', false, e.message)
}

// 3. 测试 resolve 接口
console.log('\n[3] B 站解析接口 (/api/resolve)')
const testCases = [
  { song: '晴天', singer: '周杰伦' },
  { song: '稻香', singer: '周杰伦' },
  { song: '夜曲', singer: '周杰伦' },
]
for (const tc of testCases) {
  const url = `${API}/api/resolve?song=${encodeURIComponent(tc.song)}&singer=${encodeURIComponent(tc.singer)}&duration=0`
  try {
    const r = await getJSON(url)
    const ok = r.status === 200 && r.data?.ok === true && !!r.data?.audioUrl
    const detail = ok
      ? `→ ${r.data.bvid} (${r.data.duration}s)`
      : `status=${r.status} ${r.data?.error || r.data || ''}`
    allOk &= check(`"${tc.song} — ${tc.singer}"`, ok, detail)
  } catch (e) {
    allOk &= check(`"${tc.song} — ${tc.singer}"`, false, e.message)
  }
}

// 4. 测试 Vite 代理
console.log('\n[4] Vite 代理检查')
try {
  const r = await getJSON(`${DEV}/api/resolve?song=${encodeURIComponent('晴天')}&singer=${encodeURIComponent('周杰伦')}&duration=0`)
  allOk &= check('代理 /api/resolve', r.status === 200 && r.data?.ok === true, `status=${r.status}`)
} catch (e) {
  allOk &= check('Vite 代理', false, e.message)
}

// 5. 测试音频流代理
console.log('\n[5] 音频流代理 (/api/bbstream)')
try {
  const resolveR = await getJSON(`${API}/api/resolve?song=${encodeURIComponent('晴天')}&singer=${encodeURIComponent('周杰伦')}&duration=0`)
  if (resolveR.data?.audioUrl) {
    const streamUrl = `${API}/api/bbstream?url=${encodeURIComponent(resolveR.data.audioUrl)}`
    const r = await getText(streamUrl)
    const ok = r.status === 200 || r.status === 206
    const contentType = r.headers['content-type'] || ''
    allOk &= check('音频流代理', ok, `status=${r.status} content-type=${contentType} size=${r.data.length}B`)
  } else {
    check('音频流代理', false, '无可用音频 URL')
  }
} catch (e) {
  allOk &= check('音频流代理', false, e.message)
}

// 6. 检查移动端访问
console.log('\n[6] 移动端访问提示')
console.log('  💡 确保手机和电脑在同一局域网')
console.log('  💡 Vite 已绑定 0.0.0.0，手机可通过电脑 IP:5173 访问')
console.log('  💡 API 服务器绑定 0.0.0.0:8787')
try {
  const ifconfig = await getText('http://127.0.0.1:8787/api/health')
  if (ifconfig.status === 200) {
    console.log('  ✅ API 服务器响应正常')
  }
} catch {
  console.log('  ⚠️ 本地 API 服务器未响应')
}

console.log('\n' + '='.repeat(60))
console.log(allOk ? '🎉 全链路测试通过' : '⚠️ 存在问题，请查看上方失败项')
console.log('='.repeat(60))
process.exit(allOk ? 0 : 1)
