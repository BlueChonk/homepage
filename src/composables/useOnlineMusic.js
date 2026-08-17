/**
 * 在线音乐：QQ 音乐搜索歌曲列表 + B 站解析音频直链并在线播放（经后端代理）。
 *
 * 后端路径（dev 由 Vite 反代 /api，线上由部署的 server/ 提供，可用 VITE_API_BASE 覆盖）：
 *   /api/qq/search?keyword=       QQ 音乐搜索结果
 *   /api/resolve?song=&singer=    按歌名/歌手去 B 站匹配并解析音频
 *   /api/bbstream?url=            代理音频流（支持 seek）
 */
import { ref, computed } from 'vue'

const API_BASE = import.meta.env.VITE_API_BASE || ''

function api(path) {
  return `${API_BASE}${path}`
}

async function getJSON(path) {
  const res = await fetch(api(path), { cache: 'no-store' })
  let data = null
  try {
    data = await res.json()
  } catch {
    /* ignore */
  }
  if (!res.ok || !data) {
    throw new Error(data?.error || `请求失败（HTTP ${res.status}）`)
  }
  return data
}

// 单例播放器：在线试听使用独立 Audio，不影响本地 music-manifest 播放器
const onlineAudio = new Audio()
onlineAudio.preload = 'none'

const keyword = ref('')
const results = ref([])
const loading = ref(false)
const error = ref('')
const playingIndex = ref(-1)
const playing = ref(false)
const resolving = ref(-1) // 正在解析音频的行号
const currentCover = ref('')

let currentKey = ''

onlineAudio.addEventListener('play', () => (playing.value = true))
onlineAudio.addEventListener('pause', () => (playing.value = false))
onlineAudio.addEventListener('ended', () => (playing.value = false))

function stop() {
  onlineAudio.pause()
  onlineAudio.currentTime = 0
  onlineAudio.removeAttribute('src')
  playingIndex.value = -1
  playing.value = false
  currentCover.value = ''
}

async function search(kw) {
  const q = (kw ?? keyword.value).trim()
  if (!q) {
    results.value = []
    error.value = ''
    return
  }
  loading.value = true
  error.value = ''
  try {
    const data = await getJSON(`/api/qq/search?keyword=${encodeURIComponent(q)}`)
    results.value = data.items || []
    if (!results.value.length) error.value = '未找到相关歌曲'
  } catch (e) {
    error.value = e.message
    results.value = []
  } finally {
    loading.value = false
  }
}

async function play(index) {
  const item = results.value[index]
  if (!item) return
  // 点击同一首再次触发时重播
  if (playingIndex.value === index && onlineAudio.src) {
    onlineAudio.currentTime = 0
    void onlineAudio.play()
    return
  }
  resolving.value = index
  error.value = ''
  try {
    const query = new URLSearchParams({
      song: item.name || '',
      singer: item.singer || '',
      duration: String(item.interval || 0),
    })
    const audio = await getJSON(`/api/resolve?${query.toString()}`)
    const streamUrl = `/api/bbstream?url=${encodeURIComponent(audio.audioUrl)}`
    currentKey = `${item.name}-${item.singer}`
    onlineAudio.src = api(streamUrl)
    currentCover.value = audio.cover || item.cover || ''
    playingIndex.value = index
    await onlineAudio.play()
  } catch (e) {
    error.value = `在线播放失败：${e.message}`
    playingIndex.value = -1
  } finally {
    resolving.value = -1
  }
}

const currentTrack = computed(() => {
  if (playingIndex.value < 0) return null
  return results.value[playingIndex.value] || null
})

export function useOnlineMusic() {
  return {
    keyword,
    results,
    loading,
    error,
    playingIndex,
    playing,
    resolving,
    currentCover,
    currentTrack,
    search,
    play,
    stop,
  }
}