import { ref, computed, watch } from 'vue'
import { usePlayer } from './usePlayer'

/* ===== LRC 解析 =====
   支持：
   - [mm:ss.xx] / [mm:ss.xxx] / [mm:ss.x] 时间标签
   - 一行多个时间标签（重复段落）
   - [ti:] [ar:] [al:] [offset:] 等元信息
   - 同一时间戳的多语言行（日文+中文翻译）合并为同一歌词块
   - 内联翻译拆分：原文 (翻译) → 同时间戳两行，渲染为原文+翻译
   返回 { lines: [{ time, texts: [] }], meta: {} }，按时间升序排序
*/

/**
 * 拆分内联翻译：网易云歌词格式 "原文 (翻译)"
 * 仅当原文含日文（平假名/片假名）或纯拉丁字母，且括号内为中文时才拆分
 */
function splitInlineTranslation(content) {
  const match = content.match(/^(.+?)\s*[(（]([^)）]+)[)）]\s*$/)
  if (!match) return null

  const original = match[1].trim()
  const translation = match[2].trim()

  // 原文含日文假名 → 括号内很可能是中文翻译
  const hasJapanese = /[\u3040-\u309f\u30a0-\u30ff]/.test(original)
  // 原文为纯拉丁/英文
  const isLatin = /^[a-zA-Z0-9\s'.,!?…\-–—]+$/.test(original)
  // 翻译含 CJK 汉字
  const hasCJK = /[\u4e00-\u9fff]/.test(translation)
  // 翻译不含日文假名（排除日文括号注释）
  const isNotJapanese = !/[\u3040-\u309f\u30a0-\u30ff]/.test(translation)

  if ((hasJapanese || isLatin) && hasCJK && isNotJapanese) {
    return { original, translation }
  }
  return null
}

export function parseLrc(text) {
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
        fracStr.length === 1
          ? parseInt(fracStr, 10) / 10
          : fracStr.length === 2
            ? parseInt(fracStr, 10) / 100
            : parseInt(fracStr, 10) / 1000
      stamps.push(min * 60 + sec + frac)
      lastIndex = timeRe.lastIndex
    }

    if (stamps.length) {
      const content = line.slice(lastIndex).trim()
      // 检测内联翻译格式：原文 (翻译) → 拆分为两行同时间戳
      const split = splitInlineTranslation(content)
      if (split) {
        for (const t of stamps) {
          lines.push({ time: t, text: split.original })
          lines.push({ time: t, text: split.translation })
        }
      } else {
        for (const t of stamps) lines.push({ time: t, text: content })
      }
    } else {
      // 无时间标签的普通文本（如标题行），排到歌词末尾
      lines.push({ time: null, text: line })
    }
  }

  lines.sort((a, b) => {
    if (a.time === null) return b.time === null ? 0 : 1
    if (b.time === null) return -1
    return a.time - b.time
  })

  // 合并同一时间戳的多语言行，渲染时作为同一块歌词（原文 + 翻译）
  const merged = []
  for (const l of lines) {
    const last = merged[merged.length - 1]
    if (l.time !== null && last && Math.abs(last.time - l.time) < 0.01) {
      last.texts.push(l.text)
    } else {
      merged.push({ time: l.time, text: l.text, texts: [l.text] })
    }
  }

  return { lines: merged, meta }
}

function resolveUrl(u) {
  if (!u) return ''
  const base = import.meta.env.BASE_URL || '/'
  return u.startsWith('/') ? base.replace(/\/$/, '') + u : u
}

/* ===== 歌词状态：优先网易云双语歌词 → QQ 音乐歌词 → 本地 lyric URL ===== */

const NETEASE_SEARCH_API = 'https://api.i-meto.com/meting/api?server=netease&type=search&id='

/**
 * 从网易云搜索并获取歌词（通常含内联翻译，双语）
 * 返回 LRC 文本或 null
 */
async function fetchNeteaseLyrics(track) {
  const song = track?.title || track?.name || ''
  const singer = track?.artist || ''
  if (!song) return null

  const keyword = `${song} ${singer}`.trim()
  const res = await fetch(NETEASE_SEARCH_API + encodeURIComponent(keyword), { cache: 'no-store' })
  const data = await res.json()
  if (!Array.isArray(data) || data.length === 0) return null

  const lrcUrl = data[0].lrc
  if (!lrcUrl) return null

  if (lrcUrl.startsWith('http')) {
    const lrcRes = await fetch(lrcUrl, { cache: 'no-store' })
    const text = await lrcRes.text()
    if (text && /\[\d{1,2}:\d{1,2}/.test(text)) return text
  } else if (/\[\d{1,2}:\d{1,2}/.test(lrcUrl)) {
    return lrcUrl
  }
  return null
}

export function useLyrics() {
  const { currentTrack, currentTime, seekTo, play, onlineLrc } = usePlayer()

  const raw = ref('')
  const loading = ref(false)
  const failed = ref(false)
  let fetchId = 0

  watch(
    [currentTrack, onlineLrc],
    async ([track, lrc]) => {
      const id = ++fetchId
      raw.value = ''
      failed.value = false
      loading.value = true

      // 1. 优先从网易云获取双语歌词
      if (track) {
        try {
          const neteaseLrc = await fetchNeteaseLyrics(track)
          if (id !== fetchId) return
          if (neteaseLrc) {
            raw.value = neteaseLrc
            loading.value = false
            return
          }
        } catch {
          // 网易云失败，继续尝试其他来源
        }
      }

      // 2. 回退到 QQ 音乐歌词（MetingJS 返回的 lrc）
      if (lrc) {
        const isUrl = typeof lrc === 'string' && (lrc.startsWith('http://') || lrc.startsWith('https://'))
        if (isUrl) {
          try {
            const res = await fetch(lrc, { cache: 'no-store' })
            const text = await res.text()
            if (id !== fetchId) return
            if (text && (/\[\d{1,2}:\d{1,2}/.test(text) || text.includes('[ti:') || text.includes('[ar:'))) {
              raw.value = text
            } else {
              failed.value = true
            }
          } catch {
            if (id === fetchId) failed.value = true
          } finally {
            if (id === fetchId) loading.value = false
          }
        } else {
          raw.value = lrc
          loading.value = false
        }
        return
      }

      // 3. 最后回退到本地歌词文件
      if (!track || !track.lyric) {
        loading.value = false
        return
      }
      try {
        const res = await fetch(resolveUrl(track.lyric), { cache: 'no-cache' })
        const text = await res.text()
        if (id !== fetchId) return
        raw.value = text
      } catch {
        if (id === fetchId) failed.value = true
      } finally {
        if (id === fetchId) loading.value = false
      }
    },
    { immediate: true }
  )

  const parsed = computed(() =>
    raw.value ? parseLrc(raw.value) : { lines: [], meta: {} }
  )
  const lyricLines = computed(() => parsed.value.lines)
  const offsetMs = computed(() => parseInt(parsed.value.meta.offset || '0', 10) || 0)

  // 当前高亮行：最后一个 time <= 当前时间的歌词行
  const activeIndex = computed(() => {
    const lines = lyricLines.value
    if (!lines.length) return -1
    const t = currentTime.value - offsetMs.value / 1000
    let idx = -1
    for (let i = 0; i < lines.length; i++) {
      const lineTime = lines[i].time
      if (lineTime === null) continue
      if (lineTime <= t) idx = i
      else break
    }
    return idx
  })

  const lyricAvailable = computed(
    () => lyricLines.value.length > 0 && !loading.value && !failed.value
  )

  function seekLyric(line) {
    if (line.time === null) return
    // 先确保当前曲目已加载并开始播放，再定位到歌词时间点
    play()
    seekTo(line.time + offsetMs.value / 1000)
  }

  return {
    lyricLines,
    lyricAvailable,
    lyricLoading: loading,
    lyricFailed: failed,
    activeIndex,
    seekLyric,
  }
}
