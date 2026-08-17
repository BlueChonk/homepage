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
  <div v-if="currentTrack" class="mini-player">
    <div class="mini-inner">
      <div class="mini-track" @click="$emit('goto-music')">
        <div class="mini-cover" :class="{ spinning: playing }">
          <img v-if="coverSrc" :src="coverSrc" alt="" />
          <span v-else class="mini-note">♪</span>
        </div>
        <div class="mini-meta">
          <span class="mini-title" :title="currentTrack.title">{{ currentTrack.title || currentTrack.name }}</span>
          <span v-if="currentTrack.artist" class="mini-artist">{{ currentTrack.artist }}</span>
          <span v-if="resolving" class="mini-state">🔍 B 站搜索中…</span>
          <span v-else-if="resolveError" class="mini-state error">⚠️ {{ resolveError }}</span>
        </div>
      </div>

      <div class="mini-center">
        <div class="mini-ctrs">
          <button class="mbtn" @click="prev" title="上一首">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>
          </button>
          <button class="mbtn play" @click="toggle" :title="playing ? '暂停' : '播放'">
            <svg v-if="playing" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zm8 0h4v14h-4z" /></svg>
            <svg v-else viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          </button>
          <button class="mbtn" @click="next" title="下一首">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zm9-12h2v12h-2z" /></svg>
          </button>
        </div>

        <div class="mini-seek">
          <span class="mini-time">{{ formatTime(currentTime) }}</span>
          <div
            ref="barRef"
            class="mini-bar"
            @pointerdown="onBarDown"
          >
            <div class="mini-bar-fill" :style="{ width: progressPct + '%' }"></div>
          </div>
          <span class="mini-time">{{ formatTime(duration) }}</span>
        </div>
      </div>

      <div class="mini-right">
        <div class="mini-vol" v-click-outside="() => (volOpen = false)">
          <button class="mbtn vol" @click="volOpen = !volOpen" :title="volume === 0 ? '取消静音' : '音量'">
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
  </div>
</template>

<style scoped>
.mini-player {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 100;
  background: var(--surface);
  border-top: 1px solid var(--border);
  box-shadow: 0 -2px 20px rgba(0, 0, 0, 0.08);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.mini-inner {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 24px;
  max-width: 1600px;
  margin: 0 auto;
  min-height: 64px;
}

.mini-track {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 0 1 auto;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 10px;
  transition: background 0.18s ease;
}
.mini-track:hover {
  background: var(--accent-soft);
}

.mini-cover {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  overflow: hidden;
  flex: 0 0 auto;
  background: var(--surface-hover);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
}
.mini-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.mini-cover.spinning img {
  animation: spin 8s linear infinite;
}
.mini-note {
  font-size: 18px;
  color: var(--text-tertiary);
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

.mini-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  max-width: 200px;
}
.mini-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mini-artist {
  font-size: 12px;
  color: var(--text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mini-state {
  font-size: 11px;
  color: var(--accent);
}
.mini-state.error {
  color: #e5484d;
}

.mini-center {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.mini-ctrs {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mbtn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  width: 36px;
  height: 36px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.18s ease;
}
.mbtn:hover {
  color: var(--accent);
  background: var(--accent-soft);
}
.mbtn svg {
  width: 18px;
  height: 18px;
}
.mbtn.play {
  width: 44px;
  height: 44px;
  background: linear-gradient(135deg, var(--accent), var(--accent-strong));
  color: #fff;
  box-shadow: 0 4px 14px var(--accent-soft);
}
.mbtn.play:hover {
  filter: brightness(1.08);
  transform: scale(1.05);
}
.mbtn.play svg {
  width: 22px;
  height: 22px;
}
.mbtn.vol {
  width: 32px;
  height: 32px;
}
.mbtn.vol svg {
  width: 16px;
  height: 16px;
}

.mini-seek {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  max-width: 500px;
}

.mini-time {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--text-tertiary);
  min-width: 32px;
  text-align: center;
}

.mini-bar {
  flex: 1 1 auto;
  height: 4px;
  background: var(--border-light);
  border-radius: 999px;
  cursor: pointer;
  position: relative;
  transition: height 0.15s ease;
}
.mini-bar:hover {
  height: 6px;
}
.mini-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--accent-strong));
  border-radius: 999px;
  transition: width 0.1s linear;
}

.mini-right {
  flex: 0 1 auto;
  display: flex;
  align-items: center;
}

.mini-vol {
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

@media (max-width: 768px) {
  .mini-inner {
    padding: 6px 12px;
    gap: 8px;
  }
  .mini-meta {
    max-width: 100px;
  }
  .mini-cover {
    width: 40px;
    height: 40px;
  }
  .mbtn {
    width: 32px;
    height: 32px;
  }
  .mbtn.play {
    width: 40px;
    height: 40px;
  }
  .mbtn svg {
    width: 16px;
    height: 16px;
  }
  .mbtn.play svg {
    width: 20px;
    height: 20px;
  }
  .mini-seek {
    max-width: 200px;
  }
}

@media (max-width: 520px) {
  .mini-right {
    display: none;
  }
  .mini-meta {
    max-width: 80px;
  }
  .mini-artist {
    display: none;
  }
}
</style>
