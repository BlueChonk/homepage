/**
 * 歌词获取全流程测试脚本
 *
 * 测试链路：
 * 1. 读取 music.jsonl 获取歌曲列表
 * 2. 调用 Meting API 搜索歌曲（type=search）
 * 3. 检查返回的 lrc 字段是否为有效歌词文本
 * 4. 如果 lrc 字段是 URL 而非歌词文本，则尝试 fetch 该 URL 获取歌词
 * 5. 用 parseLrc 解析歌词文本
 *
 * 用法：node scripts/test-lyrics.mjs [歌曲数量]
 */

const METING_API = 'https://api.i-meto.com/meting/api?server=tencent&type=search&id='
const METING_LRC_API = 'https://api.i-meto.com/meting/api?server=tencent&type=lrc&id='

function parseLrc(text) {
  const lines = []
  const meta = {}
  const timeRe = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g

  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const metaMatch = line.match(/^\[(ti|ar|al|by|offset|re|ve):(.*)\]$/i)
    if (metaMatch) {
      meta[metaMatch[1].toLowerCase()] = metaMatch[2].trim()
      continue
    }
    let lastIndex = 0
    const stamps = []
    timeRe.lastIndex = 0
    let m
    while ((m = timeRe.exec(line))) {
      const min = parseInt(m[1], 10)
      const sec = parseInt(m[2], 10)
      const fracStr = m[3] || ''
      const frac =
        fracStr.length === 1 ? parseInt(fracStr, 10) / 10 :
        fracStr.length === 2 ? parseInt(fracStr, 10) / 100 :
        parseInt(fracStr, 10) / 1000
      stamps.push(min * 60 + sec + frac)
      lastIndex = timeRe.lastIndex
    }
    if (stamps.length) {
      const content = line.slice(lastIndex).trim()
      for (const t of stamps) lines.push({ time: t, text: content })
    }
  }

  lines.sort((a, b) => a.time - b.time)
  return { lines, meta }
}

async function main() {
  const limit = parseInt(process.argv[2] || '3', 10)

  // 1. 读取 music.jsonl
  console.log('=== Step 1: 读取 music.jsonl ===')
  const fs = await import('node:fs')
  const path = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const jsonlPath = path.resolve(__dirname, '..', 'public', 'music.jsonl')

  let tracks = []
  try {
    const text = fs.readFileSync(jsonlPath, 'utf-8')
    tracks = text.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      try { return JSON.parse(l) } catch { return null }
    }).filter(Boolean)
    console.log(`  读取到 ${tracks.length} 首歌曲`)
  } catch (e) {
    console.error('  读取 music.jsonl 失败:', e.message)
    process.exit(1)
  }

  // 取前 N 首
  const sample = tracks.slice(0, limit)
  console.log(`  测试前 ${sample.length} 首\n`)

  // 2. 逐首测试
  for (let i = 0; i < sample.length; i++) {
    const track = sample[i]
    const song = track.title || track.name || ''
    const singer = track.artist || ''
    const keyword = `${song} ${singer}`.trim()

    console.log(`=== Step 2.${i + 1}: 搜索 "${keyword}" ===`)
    console.log(`  API: ${METING_API}${encodeURIComponent(keyword)}`)

    let data = null
    try {
      const res = await fetch(METING_API + encodeURIComponent(keyword), { cache: 'no-store' })
      console.log(`  HTTP Status: ${res.status}`)
      console.log(`  Content-Type: ${res.headers.get('content-type')}`)

      const text = await res.text()
      console.log(`  Response length: ${text.length} chars`)
      console.log(`  Response preview: ${text.substring(0, 200)}...`)

      try {
        data = JSON.parse(text)
      } catch {
        console.error(`  ⚠️ 响应不是 JSON！`)
        console.log()
        continue
      }
    } catch (e) {
      console.error(`  ⚠️ 请求失败: ${e.message}`)
      console.log()
      continue
    }

    if (!Array.isArray(data) || data.length === 0) {
      console.error(`  ⚠️ 搜索结果为空`)
      console.log()
      continue
    }

    console.log(`  搜索结果: ${data.length} 条`)
    const s = data[0]
    console.log(`  第一条结果:`)
    console.log(`    name: ${s.name || s.title}`)
    console.log(`    artist: ${s.artist || s.author}`)
    console.log(`    url: ${s.url ? s.url.substring(0, 80) + '...' : '(空)'}`)
    console.log(`    pic: ${s.pic ? s.pic.substring(0, 80) + '...' : '(空)'}`)
    console.log(`    lrc: ${s.lrc ? s.lrc.substring(0, 120) + '...' : '(空)'}`)
    console.log(`    lrc type: ${typeof s.lrc}, length: ${s.lrc ? s.lrc.length : 0}`)

    // 3. 检查 lrc 字段
    console.log(`\n=== Step 3.${i + 1}: 分析 lrc 字段 ===`)
    if (!s.lrc) {
      console.error(`  ⚠️ lrc 字段为空！歌词无法获取`)

      // 尝试用 type=lrc 直接请求歌词
      if (s.url_id || s.songmid) {
        const lrcId = s.url_id || s.songmid
        const lrcUrl = `${METING_LRC_API}${lrcId}&auth=f`
        console.log(`  尝试直接获取歌词: ${lrcUrl}`)
        try {
          const lrcRes = await fetch(lrcUrl, { cache: 'no-store' })
          console.log(`  LRC HTTP Status: ${lrcRes.status}`)
          const lrcText = await lrcRes.text()
          console.log(`  LRC Response length: ${lrcText.length}`)
          console.log(`  LRC Response preview: ${lrcText.substring(0, 200)}`)
        } catch (e) {
          console.error(`  LRC 直接获取也失败: ${e.message}`)
        }
      }
      console.log()
      continue
    }

    // 检查 lrc 是 URL 还是歌词文本
    const isUrl = s.lrc.startsWith('http://') || s.lrc.startsWith('https://')
    const hasTimeTag = /\[\d{1,2}:\d{1,2}/.test(s.lrc)

    if (isUrl) {
      console.log(`  ⚠️ lrc 字段是 URL 而非歌词文本！`)
      console.log(`  URL: ${s.lrc}`)

      // 尝试 fetch 该 URL
      console.log(`  尝试 fetch 该 URL...`)
      try {
        const lrcRes = await fetch(s.lrc, { cache: 'no-store' })
        console.log(`  HTTP Status: ${lrcRes.status}`)
        console.log(`  Content-Type: ${lrcRes.headers.get('content-type')}`)
        const lrcText = await lrcRes.text()
        console.log(`  Response length: ${lrcText.length}`)
        console.log(`  Response preview: ${lrcText.substring(0, 200)}`)

        if (/\[\d{1,2}:\d{1,2}/.test(lrcText)) {
          console.log(`  ✅ fetch 获取到了有效歌词文本！`)
          const parsed = parseLrc(lrcText)
          console.log(`  解析得到 ${parsed.lines.length} 行歌词`)
        } else {
          console.error(`  ⚠️ fetch 获取的内容不是有效 LRC 格式`)
        }
      } catch (e) {
        console.error(`  ⚠️ fetch lrc URL 失败: ${e.message}`)
        console.error(`  这就是歌词显示 URL 而非歌词的原因 — 前端拿到 URL 但无法 fetch（可能是 CORS 问题）`)
      }
    } else if (hasTimeTag) {
      console.log(`  ✅ lrc 字段是有效的歌词文本`)
      const parsed = parseLrc(s.lrc)
      console.log(`  解析得到 ${parsed.lines.length} 行歌词`)
      if (parsed.lines.length > 0) {
        console.log(`  前 3 行:`)
        parsed.lines.slice(0, 3).forEach((l, idx) => {
          console.log(`    [${l.time.toFixed(2)}] ${l.text}`)
        })
      }
    } else {
      console.error(`  ⚠️ lrc 字段既不是 URL 也不是标准 LRC 格式`)
      console.error(`  lrc 内容: ${s.lrc.substring(0, 200)}`)
    }

    console.log()
  }

  // 4. 总结
  console.log('=== 总结 ===')
  console.log('歌词获取链路: usePlayer.resolveOnline() → Meting API (type=search) → data[0].lrc → useLyrics.watch(onlineLrc)')
  console.log('问题可能:')
  console.log('  1. Meting API 返回的 lrc 字段为空')
  console.log('  2. lrc 字段是 URL 而非文本（前端没有二次 fetch）')
  console.log('  3. CORS 导致前端无法 fetch lrc URL')
  console.log('  4. API 本身不可用或返回错误')
}

main().catch(e => {
  console.error('测试脚本异常:', e)
  process.exit(1)
})
