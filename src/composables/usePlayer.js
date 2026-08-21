import { ref, computed, watch } from 'vue'

const audio = new Audio()
audio.preload = 'none'

/* MetingJS 公共 API（QQ音乐）— 根据歌名+歌手搜索，返回真实播放地址、封面、歌词 */
const METING_API = 'https://api.i-meto.com/meting/api?server=tencent&type=search&id='

const tracks = ref([])
const loading = ref(true)
const current = ref(0)
const playing = ref(false)
const progress = ref(0)
const currentTime = ref(0)
const duration = ref(0)
const volume = ref(0.7)
let activeSrc = ''
let activeKey = ''
let bound = false
let initialized = false
let pendingSeek = null
let pendingRatio = null

const resolving = ref(false)
const resolveError = ref('')
const onlineCover = ref('')
const onlineLrc = ref('')

// URL 缓存: { trackKey: { audioUrl, cover, lrc, expiresAt } }
const resolveCache = new Map()

const currentTrack = computed(() => tracks.value[current.value] || null)
const total = computed(() => tracks.value.length)

function trackKey(track) {
  return `${track.title || track.name || ''}|${track.artist || ''}`
}

let resolveFetchId = 0

async function resolveOnline(track, forceRefresh = false) {
  if (!track) return null
  const song = track.title || track.name || ''
  const singer = track.artist || ''
  if (!song) return null

  const key = trackKey(track)
  // 不缓存 audioUrl（含短效 auth token），只缓存 cover 和 lrc
  if (!forceRefresh) {
    const cached = resolveCache.get(key)
    if (cached && cached.expiresAt > Date.now()) {
      onlineCover.value = cached.cover || ''
      onlineLrc.value = cached.lrc || ''
    }
  }

  const myId = ++resolveFetchId
  resolving.value = true
  resolveError.value = ''
  try {
    const keyword = `${song} ${singer}`.trim()
    const res = await fetch(METING_API + encodeURIComponent(keyword), { cache: 'no-store' })
    if (myId !== resolveFetchId) return null
    if (!res.ok) {
      // 任何非 200 状态（401/403/404）→ 返回 null，由调用方处理跳过
      return null
    }
    const data = await res.json()
    if (myId !== resolveFetchId) return null
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error(`未找到"${song}"的匹配音频`)
    }
    // 取第一个搜索结果
    const s = data[0]
    const entry = {
      audioUrl: s.url || s.audioUrl || '', // 每次重新获取，含新鲜 auth token
      cover: s.pic || s.cover || '',
      lrc: s.lrc || '',
      expiresAt: Date.now() + 30 * 60 * 1000,
    }
    // 缓存不含 audioUrl 的 entry
    resolveCache.set(key, entry)
    // 限制缓存大小，防止内存无限增长
    if (resolveCache.size > 50) {
      const firstKey = resolveCache.keys().next().value
      resolveCache.delete(firstKey)
    }
    onlineCover.value = entry.cover
    onlineLrc.value = entry.lrc
    return entry
  } catch (e) {
    resolveError.value = e.message
    onlineCover.value = ''
    onlineLrc.value = ''
    return null
  } finally {
    resolving.value = false
  }
}

function bindAudio() {
  if (bound) return
  bound = true
  audio.volume = volume.value
  audio.addEventListener('timeupdate', () => {
    if (audio.duration) progress.value = (audio.currentTime / audio.duration) * 100
    currentTime.value = audio.currentTime || 0
  })
  audio.addEventListener('loadedmetadata', () => {
    duration.value = audio.duration || 0
    currentTime.value = 0
    if (pendingSeek !== null) {
      audio.currentTime = Math.min(audio.duration || 0, pendingSeek)
      currentTime.value = audio.currentTime
      pendingSeek = null
    } else if (pendingRatio !== null) {
      audio.currentTime = Math.min(audio.duration || 0, pendingRatio * (audio.duration || 0))
      currentTime.value = audio.currentTime
      pendingRatio = null
    }
  })
  audio.addEventListener('durationchange', () => {
    duration.value = audio.duration || 0
  })
  audio.addEventListener('ended', () => next())
  audio.addEventListener('play', () => {
    playing.value = true
    duration.value = audio.duration || duration.value
  })
  audio.addEventListener('pause', () => (playing.value = false))

  audio.addEventListener('error', async () => {
    const errType = audio.error?.code
    if (!errType) return
    // code 1 = 加载中止（用户切歌/pause），非 URL 失效，忽略
    if (errType === 1) return
    const track = currentTrack.value
    if (!track) return

    const key = trackKey(track)

    // code 2/3/4 = 网络/解码/源不支持 → URL 失效，强制重新解析
    resolveCache.delete(key)

    // 尝试重新解析一次（forceRefresh=true），如果仍然失败则跳过
    try {
      const fresh = await resolveOnline(track, true)
      if (fresh?.audioUrl) {
        audio.src = fresh.audioUrl
        activeSrc = fresh.audioUrl
        resolveError.value = ''
        audio.play().catch(() => {})
      }
    } catch {
      // 任何非 200 状态（401/403/404/网络错误等）→ 跳过到下一首
      resolveError.value = ''
      if (current.value < tracks.value.length - 1) {
        current.value++
      } else {
        current.value = 0
      }
      audio.src = ''
      activeSrc = ''
      if (!audio.paused) audio.play().catch(() => {})
    }
  })
}

async function load() {
  if (initialized) return
  initialized = true
  loading.value = true
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}music.jsonl`, { cache: 'no-cache' })
    const text = await res.text()
    const parsed = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l)
        } catch {
          return null
        }
      })
      .filter(Boolean)
    tracks.value = parsed
    if (tracks.value.length) bindAudio()
  } catch (e) {
    tracks.value = []
    initialized = false
  } finally {
    loading.value = false
  }
}

async function play(i) {
  if (i !== undefined) current.value = i
  const track = currentTrack.value
  if (!track) return

  // 同曲判断用 trackKey（streamUrl 是 token 路径，不含歌名）
  const sameTrack = activeSrc && activeKey === trackKey(track)
  if (sameTrack && !resolving.value) {
    if (audio.paused) {
      audio.play().catch(() => {})
    } else {
      audio.pause()
    }
    return
  }

  audio.pause()
  audio.currentTime = 0
  pendingSeek = null
  progress.value = 0
  currentTime.value = 0
  duration.value = 0
  activeKey = trackKey(track)

  if (track.url && track.online === false) {
    const base = import.meta.env.BASE_URL || '/'
    const s = track.url.startsWith('/') ? base.replace(/\/$/, '') + track.url : track.url
    audio.src = s
    activeSrc = s
    audio.play().catch(() => {})
    return
  }

  const result = await resolveOnline(track)
  const onlineSrc = result?.audioUrl || ''
  if (onlineSrc) {
    audio.src = onlineSrc
    activeSrc = onlineSrc
    audio.play().catch(() => {})
  } else if (track.url) {
    const base = import.meta.env.BASE_URL || '/'
    const s = track.url.startsWith('/') ? base.replace(/\/$/, '') + track.url : track.url
    audio.src = s
    activeSrc = s
    audio.play().catch(() => {})
  }
}

function toggle() {
  const track = currentTrack.value
  if (!track) return
  if (!activeSrc) {
    play()
    return
  }
  if (audio.paused) audio.play().catch(() => {})
  else audio.pause()
}

function next() {
  if (!tracks.value.length) return
  current.value = (current.value + 1) % tracks.value.length
  play()
}

function prev() {
  if (!tracks.value.length) return
  current.value = (current.value - 1 + tracks.value.length) % tracks.value.length
  play()
}

function seek(e) {
  const track = currentTrack.value
  if (!track) return
  if (!e.currentTarget) return
  const rect = e.currentTarget.getBoundingClientRect()
  if (!rect.width) return
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  if (!activeSrc) {
    play()
    pendingRatio = ratio
    return
  }
  if (audio.duration) {
    audio.currentTime = Math.max(0, Math.min(audio.duration, ratio * audio.duration))
    currentTime.value = audio.currentTime
  } else {
    pendingRatio = ratio
  }
  audio.play().catch(() => {})
}

function seekTo(sec) {
  if (!isFinite(sec)) return
  const t = Math.max(0, sec)
  if (audio.duration) {
    audio.currentTime = Math.min(audio.duration, t)
    currentTime.value = audio.currentTime
  } else {
    pendingSeek = t
  }
}

function setVolume(v) {
  const val = Math.min(1, Math.max(0, v))
  volume.value = val
  audio.volume = val
}

const progressListeners = new Set()
let progressRaf = 0

function progressLoop() {
  const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0
  const t = audio.currentTime || 0
  for (const cb of progressListeners) cb(pct, t)
  progressRaf = requestAnimationFrame(progressLoop)
}

watch(playing, (on) => {
  if (on && progressListeners.size && !progressRaf) {
    progressRaf = requestAnimationFrame(progressLoop)
  } else if (!on && progressRaf) {
    cancelAnimationFrame(progressRaf)
    progressRaf = 0
  }
})

function onProgress(cb) {
  progressListeners.add(cb)
  if (playing.value) {
    if (!progressRaf) progressRaf = requestAnimationFrame(progressLoop)
  } else {
    const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0
    cb(pct, audio.currentTime || 0)
  }
  return () => {
    progressListeners.delete(cb)
    if (!progressListeners.size && progressRaf) {
      cancelAnimationFrame(progressRaf)
      progressRaf = 0
    }
  }
}

export function usePlayer() {
  return {
    tracks,
    loading,
    current,
    playing,
    progress,
    currentTime,
    duration,
    volume,
    currentTrack,
    total,
    resolving,
    resolveError,
    onlineCover,
    onlineLrc,
    load,
    play,
    toggle,
    next,
    prev,
    seek,
    seekTo,
    setVolume,
    onProgress,
  }
}
