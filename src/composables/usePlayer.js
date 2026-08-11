import { ref, computed, watch } from 'vue'

// 单例 Audio：不挂在任意组件模板上，因此即使 MusicView 被卸载（切到其他模块），
// 播放也不会中断，实现“后台继续播放”。
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
let bound = false
let initialized = false
// 点击歌词跳转时，若音频元数据尚未就绪，先记下目标时间，等 loadedmetadata 后应用
let pendingSeek = null
let pendingRatio = null

const currentTrack = computed(() => tracks.value[current.value] || null)
const total = computed(() => tracks.value.length)

function srcOf(track) {
  if (!track) return ''
  const base = import.meta.env.BASE_URL || '/'
  return track.url.startsWith('/') ? base.replace(/\/$/, '') + track.url : track.url
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

function play(i) {
  if (i !== undefined) current.value = i
  const track = currentTrack.value
  if (!track) return
  const s = srcOf(track)
  // 切换曲目：先停掉当前正在播放的音频，保证同一时刻只有一首在播
    if (s !== activeSrc) {
      audio.pause()
      audio.currentTime = 0
      audio.src = s
      activeSrc = s
      pendingSeek = null
      progress.value = 0
      currentTime.value = 0
      duration.value = 0
    }
  audio.play().catch(() => {})
}

function toggle() {
  const track = currentTrack.value
  if (!track) return
  if (!activeSrc) {
    audio.src = srcOf(track)
    activeSrc = srcOf(track)
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
    audio.src = srcOf(track)
    activeSrc = srcOf(track)
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
    // 元数据未就绪：挂起跳转，待 loadedmetadata 后定位
    pendingSeek = t
  }
}

function setVolume(v) {
  const val = Math.min(1, Math.max(0, v))
  volume.value = val
  audio.volume = val
}

/* ===== 进度条 60fps 直写：避免 timeupdate（约 4Hz）+ Vue 重渲染造成的视觉卡顿 ===== */
const progressListeners = new Set()
let progressRaf = 0

function progressLoop() {
  const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0
  const t = audio.currentTime || 0
  for (const cb of progressListeners) cb(pct, t)
  progressRaf = requestAnimationFrame(progressLoop)
}

/* 只在播放时跑 60fps 循环，暂停/停止后立即停掉，避免无谓空转 */
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
