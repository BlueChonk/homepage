/**
 * QQ 音乐双语歌词测试脚本
 *
 * 测试链路：
 * 1. Meting API (type=search) → 获取 songmid
 * 2. Meting API (type=lrc) → 获取原始歌词
 * 3. QQ 音乐翻译 API → 获取翻译歌词
 * 4. 合并原文 + 翻译 = 双语歌词
 *
 * QQ 音乐歌词翻译 API:
 * https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=xxx&format=json&nobase64=1
 * 返回 { lyric: "原文LRC(base64)", trans: "翻译LRC(base64)" }
 *
 * 用法：node scripts/test-bilingual-lyrics.mjs [歌曲数量]
 */

const METING_SEARCH_API = 'https://api.i-meto.com/meting/api?server=tencent&type=search&id='

// QQ 音乐歌词 API（含翻译）
const QQ_LYRIC_API = 'https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid='

async function main() {
  const limit = parseInt(process.argv[2] || '3', 10)
  const fs = await import('node:fs')
  const path = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const __dirname = path.dirname(fileURLToPath(import.meta.url))

  // 1. 读取 music.jsonl
  const jsonlPath = path.resolve(__dirname, '..', 'public', 'music.jsonl')
  const text = fs.readFileSync(jsonlPath, 'utf-8')
  const tracks = text.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    try { return JSON.parse(l) } catch { return null }
  }).filter(Boolean)

  const sample = tracks.slice(0, limit)
  console.log(`测试 ${sample.length} 首歌曲\n`)

  for (let i = 0; i < sample.length; i++) {
    const track = sample[i]
    const song = track.title || track.name || ''
    const singer = track.artist || ''
    const songmid = track.songmid

    console.log(`=== ${i + 1}. ${song} - ${singer} ===`)
    console.log(`  songmid: ${songmid}`)

    // 2. 通过 Meting API 获取原始歌词 URL
    const keyword = `${song} ${singer}`.trim()
    console.log(`\n  [A] Meting API 搜索...`)
    let metingLrcUrl = ''
    try {
      const res = await fetch(METING_SEARCH_API + encodeURIComponent(keyword), { cache: 'no-store' })
      const data = await res.json()
      if (Array.isArray(data) && data.length > 0) {
        metingLrcUrl = data[0].lrc || ''
        console.log(`  Meting lrc URL: ${metingLrcUrl.substring(0, 100)}...`)
      }
    } catch (e) {
      console.error(`  Meting 搜索失败: ${e.message}`)
    }

    // 3. fetch Meting lrc URL 获取原始歌词
    let originalLrc = ''
    if (metingLrcUrl) {
      console.log(`\n  [B] fetch Meting lrc URL 获取原始歌词...`)
      try {
        const res = await fetch(metingLrcUrl, { cache: 'no-store' })
        originalLrc = await res.text()
        const lrcLines = originalLrc.split('\n').filter(l => /\[\d{1,2}:\d{1,2}/.test(l))
        console.log(`  原始歌词: ${originalLrc.length} chars, ${lrcLines.length} 行带时间标签`)
        console.log(`  前3行:`)
        lrcLines.slice(0, 3).forEach(l => console.log(`    ${l.substring(0, 80)}`))
      } catch (e) {
        console.error(`  fetch 原始歌词失败: ${e.message}`)
      }
    }

    // 4. QQ 音乐翻译 API
    console.log(`\n  [C] QQ 音乐歌词翻译 API...`)
    const qqUrl = `${QQ_LYRIC_API}${songmid}&format=json&nobase64=1`
    console.log(`  URL: ${qqUrl}`)

    let qqLyric = ''
    let qqTrans = ''
    try {
      const res = await fetch(qqUrl, {
        cache: 'no-store',
        headers: {
          'Referer': 'https://y.qq.com/',
          'User-Agent': 'Mozilla/5.0 (compatible; cecilia4412/homepage)',
        },
      })
      console.log(`  HTTP Status: ${res.status}`)
      console.log(`  Content-Type: ${res.headers.get('content-type')}`)
      const data = await res.json()
      console.log(`  Response keys: ${Object.keys(data).join(', ')}`)

      // nobase64=1 时直接是文本
      qqLyric = data.lyric || ''
      qqTrans = data.trans || ''
      console.log(`  lyric length: ${qqLyric.length}`)
      console.log(`  trans length: ${qqTrans.length}`)

      if (qqLyric) {
        const lrcLines = qqLyric.split('\n').filter(l => /\[\d{1,2}:\d{1,2}/.test(l))
        console.log(`  QQ 原始歌词: ${lrcLines.length} 行`)
        console.log(`  前3行:`)
        lrcLines.slice(0, 3).forEach(l => console.log(`    ${l.substring(0, 80)}`))
      }
      if (qqTrans) {
        const transLines = qqTrans.split('\n').filter(l => /\[\d{1,2}:\d{1,2}/.test(l))
        console.log(`  QQ 翻译歌词: ${transLines.length} 行`)
        console.log(`  前3行:`)
        transLines.slice(0, 3).forEach(l => console.log(`    ${l.substring(0, 80)}`))
      } else {
        console.log(`  ⚠️ 无翻译歌词`)
      }
    } catch (e) {
      console.error(`  QQ 音乐歌词 API 失败: ${e.message}`)
    }

    // 5. 合并双语歌词
    if (qqLyric && qqTrans) {
      console.log(`\n  [D] 合并双语歌词...`)
      const merged = mergeBilingualLrc(qqLyric, qqTrans)
      console.log(`  合并后: ${merged.length} 行`)
      console.log(`  前5行:`)
      merged.slice(0, 5).forEach(l => {
        console.log(`    [${l.time.toFixed(2)}] ${l.original}`)
        if (l.translation) console.log(`           → ${l.translation}`)
      })
    }

    console.log('\n' + '─'.repeat(60) + '\n')
  }
}

/**
 * 合并原文 LRC 和翻译 LRC
 * 返回 [{ time, original, translation }]
 */
function mergeBilingualLrc(originalLrc, translationLrc) {
  const timeRe = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/
  function parseLrc(lrcText) {
    const map = new Map()
    for (const line of lrcText.split('\n')) {
      const m = line.match(timeRe)
      if (!m) continue
      const min = parseInt(m[1], 10)
      const sec = parseInt(m[2], 10)
      const fracStr = m[3] || ''
      const frac = fracStr.length === 1 ? parseInt(fracStr, 10) / 10 :
        fracStr.length === 2 ? parseInt(fracStr, 10) / 100 :
        parseInt(fracStr, 10) / 1000
      const time = min * 60 + sec + frac
      const text = line.replace(timeRe, '').trim()
      if (text) map.set(time, text)
    }
    return map
  }

  const origMap = parseLrc(originalLrc)
  const transMap = parseLrc(translationLrc)
  const result = []

  for (const [time, original] of origMap) {
    // 找最接近的翻译时间戳
    let translation = ''
    let minDiff = Infinity
    for (const [tTime, tText] of transMap) {
      const diff = Math.abs(tTime - time)
      if (diff < minDiff && diff < 1) {
        minDiff = diff
        translation = tText
      }
    }
    result.push({ time, original, translation })
  }

  return result.sort((a, b) => a.time - b.time)
}

main().catch(e => {
  console.error('测试脚本异常:', e)
  process.exit(1)
})
