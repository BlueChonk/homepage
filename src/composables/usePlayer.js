import { ref, computed, watch } from 'vue'

const API_BASE = import.meta.env.VITE_API_BASE || ''

const audio = new Audio()
audio.preload = 'none'

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

// URL 缓存: { trackKey: { audioUrl, expiresAt, bvid, ... } }
const resolveCache = new Map()

const currentTrack = computed(() => tracks.value[current.value] || null)
const total = computed(() => tracks.value.length)

function trackKey(track) {
  return `${track.title || track.name || ''}|${track.artist || ''}`
}

function api(path) {
  return `${API_BASE}${path}`
}

function streamSrcOf(entry) {
  // 服务端返回的路径 token 形式（推荐）：预览环境中间代理会破坏 query 里的
  // 百分号编码（CDN URL 在 & 处截断 → 403），路径形式不受影响
  if (entry?.streamUrl) return api(entry.streamUrl)
  if (entry?.audioUrl) return api(`/api/bbstream?url=${encodeURIComponent(entry.audioUrl)}`)
  return ''
}

async function resolveOnline(track, forceRefresh = false) {
  if (!track) return null
  const song = track.title || track.name || ''
  const singer = track.artist || ''
  const dur = track.duration || 0
  if (!song) return null

  const key = trackKey(track)
  if (!forceRefresh) {
    const cached = resolveCache.get(key)
    if (cached && cached.expiresAt > Date.now() && cached.audioUrl) {
      onlineCover.value = cached.cover || ''
      return cached
    }
  }

  resolving.value = true
  resolveError.value = ''
  try {
    // POST + JSON body：查询串里的中文会被预览环境的代理解码成裸 UTF-8，
    // Node HTTP 解析器会直接拒绝（空响应 400），改走请求体可彻底规避
    const res = await fetch(api('/api/resolve'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ song, singer, duration: dur }),
      cache: 'no-store',
    })
    const text = await res.text()
    let data = null
    try {
      data = JSON.parse(text)
    } catch {
      throw new Error(`服务器响应异常 (${res.status})`)
    }
    if (!res.ok || !data?.ok) {
      const msg = data?.error || `B 站解析失败 (${res.status})`
      throw new Error(msg)
    }
    const expiresAt = data.expiresAt || (Date.now() + 4 * 60 * 1000)
    const entry = { ...data, expiresAt }
    resolveCache.set(key, entry)
    onlineCover.value = data.cover || ''
    return entry
  } catch (e) {
    resolveError.value = e.message
    onlineCover.value = ''
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
    const track = currentTrack.value
    if (!track) return

    const key = trackKey(track)
    const cached = resolveCache.get(key)

    // code 1/2/3 = 加载中止/网络/解码错误；code 4 = 源不支持（B站URL过期被代理
    // 映射为 410 时浏览器也报 4）→ 均视为 URL 失效，强制重新解析一次
    if (errType === 1 || errType === 2 || errType === 3 || errType === 4) {
      if (!cached) return
      resolveCache.delete(key)
      const fresh = await resolveOnline(track, true)
      const streamUrl = streamSrcOf(fresh)
      if (streamUrl) {
        audio.src = streamUrl
        activeSrc = streamUrl
        resolveError.value = ''
        audio.play().catch(() => {})
      }
    }
  })
}

async function load() {
  if (initialized) return
  initialized = true
  loading.value = true
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}music-manifest.jsonl`, { cache: 'no-cache' })
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
  const onlineSrc = streamSrcOf(result)
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
  const rect = e.currentTarget.getBoundingClientRect()
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
