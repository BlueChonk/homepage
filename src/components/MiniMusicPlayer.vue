<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { usePlayer } from '../composables/usePlayer'
import { useLyrics } from '../composables/useLyrics'

const {
  tracks, loading, current, playing, progress, currentTime, duration,
  volume, currentTrack, load, play, toggle, next, prev, seek, setVolume, onProgress,
  onlineCover, playMode, cyclePlayMode,
} = usePlayer()

const {
  lyricLines, lyricAvailable, lyricLoading, activeIndex, seekLyric,
} = useLyrics()

function resolveUrl(u) {
  if (!u) return ''
  const base = import.meta.env.BASE_URL || '/'
  return u.startsWith('/') ? base.replace(/\/$/, '') + u : u
}

const coverSrc = computed(() => {
  if (onlineCover.value) return onlineCover.value
  return currentTrack.value?.cover ? resolveUrl(currentTrack.value.cover) : ''
})

function formatTime(sec) {
  if (!isFinite(sec) || sec <= 0) return '--:--'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

const playModeLabel = computed(() => {
  const labels = {
    'list': '列表循环',
    'repeat-one': '单曲循环',
    'shuffle': '随机播放',
    'sequential': '顺序播放',
  }
  return labels[playMode.value] || '播放模式'
})

/* ---- 播放列表 ---- */
const listOpen = ref(false)

/* ---- 音量控制 ---- */
const volDragging = ref(false)

function onVolSeek(e) {
  const rect = e.currentTarget.getBoundingClientRect()
  const ratio = (e.clientX - rect.left) / rect.width
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
  const slider = document.querySelector('.mini-vol-slider')
  if (!slider) return
  const rect = slider.getBoundingClientRect()
  const ratio = (e.clientX - rect.left) / rect.width
  setVolume(Math.max(0, Math.min(1, ratio)))
}

function onVolDragEnd() {
  volDragging.value = false
  window.removeEventListener('pointermove', onVolDragMove)
  window.removeEventListener('pointerup', onVolDragEnd)
}

/* ---- 拖动进度条 ---- */
const scrubbing = ref(false)
const scrubRatio = ref(null)
const barRef = ref(null)
const barFillEl = ref(null)
const barKnobEl = ref(null)
let unsubProgress = null

function paintBar(percent) {
  if (barFillEl.value) barFillEl.value.style.width = percent + '%'
  if (barKnobEl.value) barKnobEl.value.style.left = percent + '%'
}

function ratioFromEvent(e) {
  if (!barRef.value) return 0
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

const shownTime = computed(() => {
  if (scrubbing.value && scrubRatio.value !== null) return scrubRatio.value * duration.value
  return currentTime.value
})

onMounted(() => {
  setVolume(1)  // 默认音量 100%
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
  <div class="mini-player">
    <!-- 播放列表面板（浮层） -->
    <div v-if="listOpen" class="list-backdrop" @click="listOpen = false"></div>
    <Transition name="drawer">
      <div v-if="listOpen" class="list-panel">
        <div class="list-head">
          <span class="list-title">在线曲库</span>
          <span class="list-count">{{ tracks.length }} 首</span>
          <button class="list-close" @click="listOpen = false">✕</button>
        </div>
        <ul class="list-body">
          <li
            v-for="(t, i) in tracks"
            :key="t.url || i"
            :class="{ active: i === current }"
            @click="play(i)"
          >
            <span class="list-idx">
              <span v-if="i === current && playing" class="eq"><i></i><i></i><i></i></span>
              <span v-else>{{ i + 1 }}</span>
            </span>
            <span class="list-meta">
              <span class="list-name">{{ t.title || t.name }}</span>
              <span v-if="t.artist" class="list-by">{{ t.artist }}</span>
            </span>
            <span class="list-dur">{{ formatTime(t.duration) }}</span>
          </li>
        </ul>
      </div>
    </Transition>

    <!-- 主播放器 -->
    <div v-if="!loading && tracks.length" class="player-main">
      <!-- 封面 + 歌曲信息 -->
      <div class="player-left">
        <div class="mini-cover">
          <img v-if="coverSrc" :src="coverSrc" alt="" />
          <span v-else class="mini-note">♪</span>
        </div>
        <div class="mini-info">
          <span class="mini-title">{{ currentTrack?.title || currentTrack?.name }}</span>
          <span v-if="currentTrack?.artist" class="mini-artist">{{ currentTrack.artist }}</span>
        </div>
      </div>

      <!-- 控制区 -->
      <div class="player-center">
        <!-- 进度条 -->
        <div class="mini-seek-row">
          <span class="mini-time">{{ formatTime(shownTime) }}</span>
          <div
            ref="barRef"
            class="mini-seek-bar"
            @pointerdown="onBarDown"
            @pointermove="onBarMove"
            @pointerup="onBarUp"
            @pointercancel="scrubbing = false"
          >
            <div ref="barFillEl" class="mini-seek-fill"></div>
            <div ref="barKnobEl" class="mini-seek-knob"></div>
          </div>
          <span class="mini-time">{{ formatTime(duration) }}</span>
        </div>

        <!-- 控制按钮 -->
        <div class="mini-ctrls">
          <button class="mini-btn" @click.stop="listOpen = !listOpen" title="播放列表">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h10v2H4z" /></svg>
          </button>
          <button class="mini-btn" @click="prev" title="上一首">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>
          </button>
          <button class="mini-btn-play" @click="toggle" :title="playing ? '暂停' : '播放'">
            <svg v-if="playing" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zm8 0h4v14h-4z" /></svg>
            <svg v-else viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          </button>
          <button class="mini-btn" @click="next" title="下一首">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zm9-12h2v12h-2z" /></svg>
          </button>
          <button class="mini-btn" @click="cyclePlayMode" :title="playModeLabel">
            <svg v-if="playMode === 'list'" viewBox="0 0 24 24" fill="currentColor"><path d="M3 6h13v2H3zm0 5h13v2H3zm0 5h10v2H3zm14 0l4-3-4-3z" /></svg>
            <svg v-else-if="playMode === 'repeat-one'" viewBox="0 0 24 24" fill="currentColor"><path d="M3 6h13v2H3zm0 5h13v2H3zm0 5h10v2H3zm14 0l4-3-4-3z" /><text x="10" y="15" font-size="8" fill="currentColor">1</text></svg>
            <svg v-else-if="playMode === 'shuffle'" viewBox="0 0 24 24" fill="currentColor"><path d="M4 6h4l12 12h-4L4 6zm0 12h4l3-3-2-2zm12-12h4l-3 3-2-2z" /></svg>
            <svg v-else viewBox="0 0 24 24" fill="currentColor"><path d="M3 6h13v2H3zm0 5h13v2H3zm0 5h10v2H3z" /></svg>
          </button>
          <div class="mini-vol-wrap">
            <button class="mini-btn mini-vol-btn" @click="setVolume(volume === 0 ? 1 : 0)" :title="volume === 0 ? '取消静音' : '静音'">
              <svg v-if="volume === 0" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.6 3l2.7-2.7-1.4-1.4L15.2 10.6 12.5 7.9 11 9.3l2.7 2.7L11 14.7l1.5 1.4 2.7-2.7 2.7 2.7 1.4-1.4z" /></svg>
              <svg v-else-if="volume < 0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13 3a4 4 0 00-2-3.5v7A4 4 0 0016 12z" /></svg>
              <svg v-else viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13 3a4 4 0 00-2-3.5v7A4 4 0 0016 12zm-2-8.2v2.1a6 6 0 010 12.2v2.1A8 8 0 0014 3.8z" /></svg>
            </button>
            <div class="mini-vol-slider" @pointerdown="onVolDragStart">
              <div class="mini-vol-track">
                <div class="mini-vol-fill" :style="{ width: volume * 100 + '%' }"></div>
                <div class="mini-vol-knob" :style="{ left: 'calc(' + volume * 100 + '% - 5px)' }"></div>
              </div>
            </div>
            <span class="mini-vol-num">{{ Math.round(volume * 100) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else-if="!loading" class="player-empty">
      <span class="empty-icon">🎵</span>
      <span class="empty-text">暂无歌曲</span>
    </div>
  </div>
</template>

<style scoped>
.mini-player {
  position: relative;
  display: flex;
  align-items: center;
  height: 100%;
}

/* ---- 主播放器 ---- */
.player-main {
  display: flex;
  align-items: center;
  gap: 16px;
  height: 100%;
  flex: 1 1 auto;
  min-width: 0;
}

/* 封面 + 信息 */
.player-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
  min-width: 0;
}
.mini-cover {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
  background: var(--surface);
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
}
.mini-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.mini-note {
  font-size: 16px;
  color: var(--text-tertiary);
}
/* 封面不旋转 */
.mini-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.mini-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
}
.mini-artist {
  font-size: 11px;
  color: var(--text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
}

/* 控制区 */
.player-center {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* 进度条 */
.mini-seek-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.mini-time {
  flex: 0 0 auto;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  color: var(--text-tertiary);
  min-width: 32px;
  text-align: center;
}
.mini-seek-bar {
  position: relative;
  flex: 1 1 auto;
  height: 4px;
  border-radius: 999px;
  background: var(--border-light);
  cursor: pointer;
  touch-action: none;
}
.mini-seek-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--accent), var(--accent-strong));
}
.mini-seek-knob {
  position: absolute;
  top: 50%;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--surface);
  border: 2px solid var(--accent);
  transform: translate(-50%, -50%);
  opacity: 0;
  transition: opacity 0.15s ease;
  pointer-events: none;
}
.mini-seek-bar:hover .mini-seek-knob,
.mini-seek-bar:active .mini-seek-knob {
  opacity: 1;
}

/* 控制按钮 */
.mini-ctrls {
  display: flex;
  align-items: center;
  gap: 6px;
}
.mini-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  width: 28px;
  height: 28px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.15s, background 0.15s;
}
.mini-btn:hover {
  color: var(--accent);
  background: var(--accent-soft);
}
.mini-btn svg {
  width: 14px;
  height: 14px;
}
.mini-btn-play {
  background: linear-gradient(135deg, var(--accent), var(--accent-strong));
  border: none;
  border-radius: 50%;
  color: #fff;
  width: 32px;
  height: 32px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.15s ease, filter 0.15s ease;
}
.mini-btn-play:hover {
  filter: brightness(1.08);
  transform: scale(1.05);
}
.mini-btn-play svg {
  width: 14px;
  height: 14px;
}

/* 音量控制 */
.mini-vol-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
}
.mini-vol-btn {
  flex: 0 0 auto;
}
.mini-vol-slider {
  position: relative;
  width: 60px;
  height: 4px;
  border-radius: 999px;
  background: var(--border-light);
  cursor: pointer;
  touch-action: none;
  flex: 0 0 auto;
}
.mini-vol-track {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 999px;
}
.mini-vol-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--accent), var(--accent-strong));
}
.mini-vol-knob {
  position: absolute;
  top: 50%;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--surface);
  border: 2px solid var(--accent);
  transform: translateY(-50%);
  pointer-events: none;
}
.mini-vol-num {
  font-size: 10px;
  color: var(--text-tertiary);
  min-width: 24px;
  text-align: center;
  flex: 0 0 auto;
}

/* 空状态 */
.player-empty {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-tertiary);
  font-size: 12px;
}
.empty-icon {
  font-size: 16px;
  opacity: 0.6;
}

/* ---- 播放列表 ---- */
.list-backdrop {
  position: fixed;
  inset: 0;
  z-index: 84;
}
.list-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  bottom: auto;
  width: min(320px, 70vw);
  max-height: 400px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 85;
}
.list-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px 8px;
  border-bottom: 1px solid var(--border);
}
.list-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
}
.list-count {
  flex: 1 1 auto;
  font-size: 11px;
  color: var(--text-tertiary);
}
.list-close {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  font-size: 11px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.list-close:hover {
  color: var(--accent);
  border-color: var(--accent-border);
}
.list-body {
  list-style: none;
  margin: 0;
  padding: 4px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--accent) transparent;
}
.list-body::-webkit-scrollbar {
  width: 4px;
}
.list-body::-webkit-scrollbar-thumb {
  background: var(--accent);
  border-radius: 999px;
}
.list-body li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.15s ease;
}
.list-body li:hover {
  background: var(--surface-hover);
}
.list-body li.active {
  background: var(--accent-soft);
}
.list-idx {
  flex: 0 0 24px;
  text-align: center;
  font-size: 11px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}
.eq {
  display: inline-flex;
  align-items: flex-end;
  gap: 2px;
  height: 10px;
}
.eq i {
  width: 2px;
  background: var(--accent);
  border-radius: 2px;
  animation: eq-anim 0.9s ease-in-out infinite;
}
.eq i:nth-child(1) { height: 4px; animation-delay: 0s; }
.eq i:nth-child(2) { height: 10px; animation-delay: 0.2s; }
.eq i:nth-child(3) { height: 6px; animation-delay: 0.4s; }
@keyframes eq-anim {
  0%, 100% { transform: scaleY(0.4); }
  50% { transform: scaleY(1); }
}
.list-meta {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.list-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.list-body li:not(.active) .list-name {
  color: var(--text-secondary);
}
.list-by {
  font-size: 10px;
  color: var(--text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.list-dur {
  flex: 0 0 auto;
  font-size: 10px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}

.drawer-enter-active,
.drawer-leave-active {
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.drawer-enter-from,
.drawer-leave-to {
  transform: translateY(-8px);
  opacity: 0;
}

/* 响应式 */
@media (max-width: 760px) {
  .player-left {
    display: none;
  }
  .mini-ctrls {
    gap: 4px;
  }
  .mini-btn {
    width: 24px;
    height: 24px;
  }
  .mini-btn svg {
    width: 12px;
    height: 12px;
  }
  .mini-btn-play {
    width: 28px;
    height: 28px;
  }
  .mini-btn-play svg {
    width: 12px;
    height: 12px;
  }
}
</style>
