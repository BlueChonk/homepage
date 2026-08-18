<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { usePlayer } from '../composables/usePlayer'

const {
  tracks, loading, current, playing, progress, currentTime, duration,
  volume, currentTrack, load, play, toggle, next, prev, seek, setVolume, onProgress,
  resolving, resolveError, onlineCover,
} = usePlayer()

function resolveUrl(u) {
  if (!u) return ''
  const base = import.meta.env.BASE_URL || '/'
  return u.startsWith('/') ? base.replace(/\/$/, '') + u : u
}

const coverSrc = computed(() => {
  if (onlineCover.value) return onlineCover.value
  return currentTrack.value?.cover ? resolveUrl(currentTrack.value.cover) : ''
})

/* 折叠状态：默认折叠（紧凑条），展开后显示完整控制栏 */
const collapsed = ref(true)

const listOpen = ref(false)
const volOpen = ref(false)
const volDragging = ref(false)

const vClickOutside = {
  mounted(el, binding) {
    el._clickOutside = (e) => {
      if (!el.contains(e.target)) binding.value()
    }
    document.addEventListener('click', el._clickOutside)
  },
  unmounted(el) {
    document.removeEventListener('click', el._clickOutside)
  },
}

function formatTime(sec) {
  if (!isFinite(sec) || sec <= 0) return '--:--'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/* ---- 拖动进度条 ---- */
const scrubbing = ref(false)
const scrubRatio = ref(null)
const barRef = ref(null)
const barFillEl = ref(null)
const barKnobEl = ref(null)
const miniFillEl = ref(null)
let unsubProgress = null

function paintBar(percent) {
  if (barFillEl.value) barFillEl.value.style.width = percent + '%'
  if (barKnobEl.value) barKnobEl.value.style.left = percent + '%'
  if (miniFillEl.value) miniFillEl.value.style.width = percent + '%'
}

function ratioFromEvent(e) {
  const rect = barRef.value.getBoundingClientRect()
  return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
}

function onBarDown(e) {
  e.preventDefault()
  scrubbing.value = true
  scrubRatio.value = ratioFromEvent(e)
  paintBar(scrubRatio.value * 100)
  barRef.value?.setPointerCapture?.(e.pointerId)
}

function onBarMove(e) {
  if (!scrubbing.value) return
  scrubRatio.value = ratioFromEvent(e)
  paintBar(scrubRatio.value * 100)
}

function onBarUp(e) {
  if (!scrubbing.value) return
  scrubbing.value = false
  scrubRatio.value = null
  seek({ currentTarget: barRef.value, clientX: e.clientX })
}

/* ---- 音量 ---- */
function onVolSeek(e) {
  const rect = e.currentTarget.getBoundingClientRect()
  const ratio = 1 - (e.clientY - rect.top) / rect.height
  setVolume(Math.max(0, Math.min(1, ratio)))
}

function onVolDragStart(e) {
  volDragging.value = true
  onVolSeek(e)
  window.addEventListener('pointermove', onVolDragMove)
  window.addEventListener('pointerup', onVolDragEnd)
  e.preventDefault()
}

function onVolDragMove(e) {
  if (!volDragging.value) return
  const track = document.querySelector('.gp-vol-track')
  if (!track) return
  const rect = track.getBoundingClientRect()
  const ratio = 1 - (e.clientY - rect.top) / rect.height
  setVolume(Math.max(0, Math.min(1, ratio)))
}

function onVolDragEnd() {
  volDragging.value = false
  window.removeEventListener('pointermove', onVolDragMove)
  window.removeEventListener('pointerup', onVolDragEnd)
}

const shownTime = computed(() => {
  if (scrubbing.value && scrubRatio.value !== null) return scrubRatio.value * duration.value
  return currentTime.value
})

onMounted(() => {
  load()
  unsubProgress = onProgress((pct) => {
    if (!scrubbing.value) paintBar(pct)
  })
  paintBar(progress.value)
})

onUnmounted(() => {
  unsubProgress?.()
  window.removeEventListener('pointermove', onVolDragMove)
  window.removeEventListener('pointerup', onVolDragEnd)
})
</script>

<template>
  <div v-if="!loading && tracks.length" class="global-player" :class="{ collapsed, expanded: !collapsed }">
    <!-- 折叠状态：仅显示底部进度条，点击展开 -->
    <div v-if="collapsed" class="gp-mini" @click="collapsed = false" title="点击展开播放器">
      <div class="gp-mini-progress">
        <div ref="miniFillEl" class="gp-mini-fill"></div>
      </div>
    </div>

    <!-- 展开状态：完整控制栏 -->
    <div v-else class="gp-full">
      <div class="gp-seek-row">
        <span class="gp-time">{{ formatTime(shownTime) }}</span>
        <div
          ref="barRef"
          class="gp-bar"
          @pointerdown="onBarDown"
          @pointermove="onBarMove"
          @pointerup="onBarUp"
          @pointercancel="scrubbing = false"
        >
          <div ref="barFillEl" class="gp-bar-fill"></div>
          <div ref="barKnobEl" class="gp-bar-knob"></div>
        </div>
        <span class="gp-time">{{ formatTime(duration) }}</span>
      </div>

      <div class="gp-ctrls">
        <div class="gp-info">
          <img v-if="coverSrc" :src="coverSrc" alt="" class="gp-cover" />
          <span v-else class="gp-cover gp-cover-note">♪</span>
          <div class="gp-meta">
            <span class="gp-title" :title="currentTrack?.title">{{ currentTrack?.title || currentTrack?.name }}</span>
            <span v-if="currentTrack?.artist" class="gp-artist">{{ currentTrack.artist }}</span>
          </div>
          <span v-if="resolving" class="gp-resolving">解析中…</span>
        </div>

        <div class="gp-ctrls-center">
          <button class="gp-ctrl" @click="prev" title="上一首">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>
          </button>
          <button class="gp-play" @click="toggle" :title="playing ? '暂停' : '播放'">
            <svg v-if="playing" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zm8 0h4v14h-4z" /></svg>
            <svg v-else viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          </button>
          <button class="gp-ctrl" @click="next" title="下一首">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zm9-12h2v12h-2z" /></svg>
          </button>
        </div>

        <div class="gp-ctrls-right">
          <div class="gp-vol" v-click-outside="() => (volOpen = false)">
            <button class="gp-ctrl" @click="volOpen = !volOpen" :title="volume === 0 ? '取消静音' : '音量'">
              <svg v-if="volume === 0" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.6 3l2.7-2.7-1.4-1.4L15.2 10.6 12.5 7.9 11 9.3l2.7 2.7L11 14.7l1.5 1.4 2.7-2.7 2.7 2.7 1.4-1.4z" /></svg>
              <svg v-else-if="volume < 0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13 3a4 4 0 00-2-3.5v7A4 4 0 0016 12z" /></svg>
              <svg v-else viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13 3a4 4 0 00-2-3.5v7A4 4 0 0016 12zm-2-8.2v2.1a6 6 0 010 12.2v2.1A8 8 0 0014 3.8z" /></svg>
            </button>
            <div v-if="volOpen" class="gp-vol-pop" @pointerdown.stop>
              <div class="gp-vol-track" @pointerdown.prevent="onVolDragStart">
                <div class="gp-vol-fill" :style="{ height: volume * 100 + '%' }"></div>
                <div class="gp-vol-knob" :style="{ bottom: 'calc(' + volume * 100 + '% - 6px)' }"></div>
              </div>
              <span class="gp-vol-pct">{{ Math.round(volume * 100) }}</span>
            </div>
          </div>

          <button class="gp-ctrl" :class="{ active: listOpen }" @click="listOpen = !listOpen" title="播放列表">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h10v2H4z" /></svg>
          </button>

          <button class="gp-ctrl gp-btn-collapse" @click="collapsed = true" title="折叠">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z" /></svg>
          </button>
        </div>
      </div>

      <!-- 播放列表面板 -->
      <Transition name="gp-drawer">
        <div v-if="listOpen" class="gp-list-panel">
          <div class="gp-list-head">
            <span class="gp-list-title">在线曲库</span>
            <span class="gp-list-count">{{ tracks.length }} 首</span>
            <button class="gp-list-close" @click="listOpen = false">✕</button>
          </div>
          <ul class="gp-list">
            <li
              v-for="(t, i) in tracks"
              :key="t.url || i"
              :class="{ active: i === current }"
              @click="play(i)"
            >
              <span class="gp-list-idx">
                <span v-if="i === current && playing" class="gp-eq"><i></i><i></i><i></i></span>
                <span v-else>{{ i + 1 }}</span>
              </span>
              <span class="gp-list-meta">
                <span class="gp-list-name">{{ t.title || t.name }}</span>
                <span v-if="t.artist" class="gp-list-by">{{ t.artist }}</span>
              </span>
              <span class="gp-list-dur">{{ formatTime(t.duration) }}</span>
            </li>
          </ul>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.global-player {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 80;
  background: var(--surface);
  border-top: 1px solid var(--border);
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.08);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

/* ===== 折叠状态：仅底部进度条 ===== */
.gp-mini {
  cursor: pointer;
}
.gp-mini-progress {
  height: 3px;
  background: var(--border-light);
  transition: height 0.2s ease;
}
.gp-mini:hover .gp-mini-progress {
  height: 5px;
}
.gp-mini-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--accent-strong));
  transition: width 0.15s linear;
}

/* ===== 展开状态 ===== */
.gp-full {
  padding: 10px 20px 12px;
  position: relative;
}
.gp-seek-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}
.gp-time {
  flex: 0 0 auto;
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  color: var(--text-tertiary);
  min-width: 36px;
  text-align: center;
}
.gp-bar {
  position: relative;
  flex: 1 1 auto;
  height: 6px;
  border-radius: 999px;
  background: var(--border-light);
  cursor: pointer;
  touch-action: none;
}
.gp-bar-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--accent), var(--accent-strong));
}
.gp-bar-knob {
  position: absolute;
  top: 50%;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--surface);
  border: 2px solid var(--accent);
  transform: translate(-50%, -50%);
  opacity: 0;
  transition: opacity 0.15s ease;
  pointer-events: none;
}
.gp-bar:hover .gp-bar-knob,
.gp-bar:active .gp-bar-knob {
  opacity: 1;
}

.gp-ctrls {
  display: flex;
  align-items: center;
  gap: 16px;
}
.gp-info {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1 1 auto;
  max-width: 30%;
}
.gp-cover {
  flex: 0 0 auto;
  width: 44px;
  height: 44px;
  border-radius: 8px;
  object-fit: cover;
  background: var(--bg-soft);
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}
.gp-cover-note {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  color: var(--text-tertiary);
}
.gp-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.gp-title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}
.gp-artist {
  font-size: 11.5px;
  color: var(--text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.gp-resolving {
  font-size: 11px;
  color: var(--accent);
  white-space: nowrap;
}

.gp-ctrls-center {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 12px;
}
.gp-ctrl {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-secondary);
  width: 40px;
  height: 40px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.18s, color 0.18s, background 0.18s;
}
.gp-ctrl:hover {
  border-color: var(--accent-border);
  color: var(--accent);
  background: var(--accent-soft);
}
.gp-ctrl svg {
  width: 16px;
  height: 16px;
}
.gp-ctrl.active {
  color: var(--accent);
  border-color: var(--accent-border);
  background: var(--accent-soft);
}
.gp-play {
  flex: 0 0 auto;
  background: linear-gradient(135deg, var(--accent), var(--accent-strong));
  border: none;
  border-radius: 50%;
  color: #fff;
  width: 48px;
  height: 48px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 14px var(--accent-soft);
  transition: transform 0.15s ease, filter 0.15s ease;
}
.gp-play:hover {
  filter: brightness(1.08);
  transform: scale(1.05);
}
.gp-play svg {
  width: 20px;
  height: 20px;
}

.gp-ctrls-right {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
}
.gp-vol {
  position: relative;
}
.gp-vol-pop {
  position: absolute;
  bottom: calc(100% + 12px);
  right: 0;
  width: 40px;
  padding: 10px 0 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  z-index: 90;
}
.gp-vol-track {
  position: relative;
  width: 5px;
  height: 80px;
  border-radius: 999px;
  background: var(--border-light);
  cursor: pointer;
}
.gp-vol-fill {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(180deg, var(--accent-strong), var(--accent));
  border-radius: 999px;
}
.gp-vol-knob {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--surface);
  border: 2px solid var(--accent);
}
.gp-vol-pct {
  font-size: 10px;
  color: var(--text-tertiary);
}

/* ===== 播放列表面板 ===== */
.gp-list-panel {
  position: absolute;
  bottom: 100%;
  right: 20px;
  width: min(380px, 80vw);
  max-height: 420px;
  margin-bottom: 8px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 85;
}
.gp-list-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px 10px;
  border-bottom: 1px solid var(--border);
}
.gp-list-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
}
.gp-list-count {
  flex: 1 1 auto;
  font-size: 12px;
  color: var(--text-tertiary);
}
.gp-list-close {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.gp-list-close:hover {
  color: var(--accent);
  border-color: var(--accent-border);
}
.gp-list {
  list-style: none;
  margin: 0;
  padding: 6px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--accent) transparent;
}
.gp-list::-webkit-scrollbar {
  width: 5px;
}
.gp-list::-webkit-scrollbar-thumb {
  background: var(--accent);
  border-radius: 999px;
}
.gp-list li {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 10px;
  cursor: pointer;
  border-radius: 8px;
  transition: background 0.15s ease;
}
.gp-list li:hover {
  background: var(--surface-hover);
}
.gp-list li.active {
  background: var(--accent-soft);
}
.gp-list-idx {
  flex: 0 0 28px;
  text-align: center;
  font-size: 12px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}
.gp-eq {
  display: inline-flex;
  align-items: flex-end;
  gap: 2px;
  height: 12px;
}
.gp-eq i {
  width: 2.5px;
  background: var(--accent);
  border-radius: 2px;
  animation: gp-eq 0.9s ease-in-out infinite;
}
.gp-eq i:nth-child(1) { height: 5px; animation-delay: 0s; }
.gp-eq i:nth-child(2) { height: 12px; animation-delay: 0.2s; }
.gp-eq i:nth-child(3) { height: 8px; animation-delay: 0.4s; }
@keyframes gp-eq {
  0%, 100% { transform: scaleY(0.4); }
  50% { transform: scaleY(1); }
}
.gp-list-meta {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.gp-list-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.gp-list li:not(.active) .gp-list-name {
  color: var(--text-secondary);
}
.gp-list-by {
  font-size: 11px;
  color: var(--text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.gp-list-dur {
  flex: 0 0 auto;
  font-size: 11px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}

.gp-drawer-enter-active,
.gp-drawer-leave-active {
  transition: transform 0.25s ease, opacity 0.25s ease;
}
.gp-drawer-enter-from,
.gp-drawer-leave-to {
  transform: translateY(12px);
  opacity: 0;
}

/* ===== 响应式 ===== */
@media (max-width: 640px) {
  .gp-full {
    padding: 8px 12px 10px;
  }
  .gp-info {
    max-width: 35%;
  }
  .gp-ctrls {
    gap: 10px;
  }
  .gp-ctrls-center {
    gap: 8px;
  }
  .gp-ctrl {
    width: 36px;
    height: 36px;
  }
  .gp-play {
    width: 44px;
    height: 44px;
  }
  .gp-ctrls-right {
    gap: 6px;
  }
}
@media (max-width: 460px) {
  .gp-mini-artist {
    display: none;
  }
  .gp-artist {
    display: none;
  }
  .gp-info {
    max-width: 40%;
  }
  .gp-vol {
    display: none;
  }
}
</style>
