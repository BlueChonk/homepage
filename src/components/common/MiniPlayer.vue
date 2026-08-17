<script setup>
import { ref, computed } from 'vue'
import { usePlayer } from '../../composables/usePlayer'

const emit = defineEmits(['goto-music'])

const {
  playing, currentTrack, currentTime, duration,
  toggle, next, prev, seek, setVolume, volume,
  resolving, resolveError, onlineCover,
} = usePlayer()

const coverSrc = computed(() => {
  if (onlineCover.value) return onlineCover.value
  const t = currentTrack.value
  return t?.cover ? t.cover : ''
})

const barRef = ref(null)
const dragging = ref(false)

function formatTime(sec) {
  if (!isFinite(sec) || sec <= 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function onBarDown(e) {
  dragging.value = true
  seek({ currentTarget: barRef.value, clientX: e.clientX })
  const onMove = (ev) => {
    if (!dragging.value) return
    seek({ currentTarget: barRef.value, clientX: ev.clientX })
  }
  const onUp = () => {
    dragging.value = false
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

const progressPct = computed(() => {
  if (!duration.value) return 0
  return (currentTime.value / duration.value) * 100
})

const volOpen = ref(false)

function onVolSeek(e) {
  const rect = e.currentTarget.getBoundingClientRect()
  const ratio = 1 - (e.clientY - rect.top) / rect.height
  setVolume(Math.max(0, Math.min(1, ratio)))
}

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
</script>

<template>
  <transition name="mp-pop">
    <div v-if="currentTrack" class="mini-player">
      <div class="mp-head" @click="$emit('goto-music')">
        <div class="mp-cover" :class="{ spinning: playing }">
          <img v-if="coverSrc" :src="coverSrc" alt="" />
          <span v-else class="mp-note">♪</span>
        </div>
        <div class="mp-meta">
          <span class="mp-title" :title="currentTrack.title">{{ currentTrack.title || currentTrack.name }}</span>
          <span v-if="currentTrack.artist" class="mp-artist">{{ currentTrack.artist }}</span>
          <span v-if="resolving" class="mp-state">🔍 B 站搜索中…</span>
          <span v-else-if="resolveError" class="mp-state error">⚠️ {{ resolveError }}</span>
        </div>
      </div>

      <div class="mp-seek">
        <span class="mp-time">{{ formatTime(currentTime) }}</span>
        <div ref="barRef" class="mp-bar" @pointerdown="onBarDown">
          <div class="mp-bar-fill" :style="{ width: progressPct + '%' }"></div>
        </div>
        <span class="mp-time">{{ formatTime(duration) }}</span>
      </div>

      <div class="mp-ctrs">
        <button class="mpbtn" @click="prev" title="上一首">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>
        </button>
        <button class="mpbtn play" @click="toggle" :title="playing ? '暂停' : '播放'">
          <svg v-if="playing" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zm8 0h4v14h-4z" /></svg>
          <svg v-else viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
        </button>
        <button class="mpbtn" @click="next" title="下一首">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zm9-12h2v12h-2z" /></svg>
        </button>
        <div class="mp-vol" v-click-outside="() => (volOpen = false)">
          <button class="mpbtn" @click="volOpen = !volOpen" :title="volume === 0 ? '取消静音' : '音量'">
            <svg v-if="volume === 0" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.6 3l2.7-2.7-1.4-1.4L15.2 10.6 12.5 7.9 11 9.3l2.7 2.7L11 14.7l1.5 1.4 2.7-2.7 2.7 2.7 1.4-1.4z" /></svg>
            <svg v-else-if="volume < 0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13 3a4 4 0 00-2-3.5v7A4 4 0 0016 12z" /></svg>
            <svg v-else viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13 3a4 4 0 00-2-3.5v7A4 4 0 0016 12zm-2-8.2v2.1a6 6 0 010 12.2v2.1A8 8 0 0014 3.8z" /></svg>
          </button>
          <div v-if="volOpen" class="vol-pop" @pointerdown.stop>
            <div class="vol-track" @pointerdown.prevent="onVolSeek">
              <div class="vol-fill" :style="{ height: volume * 100 + '%' }"></div>
              <div class="vol-knob" :style="{ bottom: 'calc(' + volume * 100 + '% - 6px)' }"></div>
            </div>
            <span class="vol-pct">{{ Math.round(volume * 100) }}</span>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.mini-player {
  position: fixed;
  top: 88px;
  right: 16px;
  z-index: 100;
  width: 300px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.18);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mp-head {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  cursor: pointer;
  padding: 2px;
  border-radius: 10px;
  transition: background 0.18s ease;
}
.mp-head:hover {
  background: var(--accent-soft);
}

.mp-cover {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  overflow: hidden;
  flex: 0 0 auto;
  background: var(--surface-hover);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
}
.mp-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.mp-cover.spinning img {
  animation: spin 8s linear infinite;
}
.mp-note {
  font-size: 18px;
  color: var(--text-tertiary);
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

.mp-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  line-height: 1.3;
}
.mp-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mp-artist {
  font-size: 12px;
  color: var(--text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mp-state {
  font-size: 11px;
  color: var(--accent);
}
.mp-state.error {
  color: #e5484d;
}

.mp-seek {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}
.mp-time {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--text-tertiary);
  min-width: 30px;
  text-align: center;
}
.mp-bar {
  flex: 1 1 auto;
  height: 4px;
  background: var(--border-light);
  border-radius: 999px;
  cursor: pointer;
  position: relative;
  transition: height 0.15s ease;
}
.mp-bar:hover {
  height: 6px;
}
.mp-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--accent-strong));
  border-radius: 999px;
  transition: width 0.1s linear;
}

.mp-ctrs {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.mpbtn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  width: 34px;
  height: 34px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.18s ease;
}
.mpbtn:hover {
  color: var(--accent);
  background: var(--accent-soft);
}
.mpbtn svg {
  width: 18px;
  height: 18px;
}
.mpbtn.play {
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, var(--accent), var(--accent-strong));
  color: #fff;
  box-shadow: 0 4px 14px var(--accent-soft);
}
.mpbtn.play:hover {
  filter: brightness(1.08);
  transform: scale(1.05);
}
.mpbtn.play svg {
  width: 22px;
  height: 22px;
}

.mp-vol {
  position: relative;
}
.vol-pop {
  position: absolute;
  bottom: calc(100% + 10px);
  right: 0;
  width: 40px;
  padding: 8px 0 12px;
  background: var(--surface);
  border: 1px solid var(--accent-border);
  border-radius: 10px;
  box-shadow: var(--shadow-md);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  z-index: 110;
}
.vol-pop::after {
  content: "";
  position: absolute;
  bottom: -5px;
  right: 10px;
  transform: rotate(45deg);
  width: 10px;
  height: 10px;
  background: var(--surface);
  border-left: 1px solid var(--accent-border);
  border-bottom: 1px solid var(--accent-border);
}
.vol-track {
  position: relative;
  width: 4px;
  height: 80px;
  border-radius: 999px;
  background: var(--border-light);
  cursor: pointer;
}
.vol-fill {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(180deg, var(--accent-strong), var(--accent));
  border-radius: 999px;
}
.vol-knob {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--surface);
  border: 2px solid var(--accent);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
}
.vol-pct {
  font-size: 10px;
  color: var(--text-tertiary);
}

/* 入场动画 */
.mp-pop-enter-active,
.mp-pop-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.mp-pop-enter-from,
.mp-pop-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

@media (max-width: 640px) {
  .mini-player {
    top: 76px;
    right: 8px;
    left: auto;
    width: 248px;
    padding: 10px;
  }
  .mp-vol {
    display: none;
  }
}
</style>