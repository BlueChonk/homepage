import { ref, computed, watch } from 'vue'
import { usePlayer } from './usePlayer'

/* ===== LRC 解析 =====
   支持：
   - [mm:ss.xx] / [mm:ss.xxx] / [mm:ss.x] 时间标签
   - 一行多个时间标签（重复段落）
   - [ti:] [ar:] [al:] [offset:] 等元信息
   - 同一时间戳的多语言行（日文+中文翻译）合并为同一歌词块
   返回 { lines: [{ time, texts: [] }], meta: {} }，按时间升序排序
*/
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
      for (const t of stamps) lines.push({ time: t, text: content })
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
    if (l.time !== null && last && last.time === l.time) {
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

/* ===== 歌词状态：优先使用 MetingJS 返回的在线歌词，回退到本地 lyric URL ===== */
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

      // 优先使用 MetingJS 返回的 LRC 文本
      if (lrc) {
        raw.value = lrc
        loading.value = false
        return
      }

      // 回退：从 track.lyric URL 加载本地歌词
      if (!track || !track.lyric) {
        loading.value = false
        return
      }
      loading.value = true
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
