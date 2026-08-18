<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { usePlayer } from '../composables/usePlayer'
import { useLyrics } from '../composables/useLyrics'

const {
  tracks, loading, current, playing, progress, currentTime, duration,
  volume, currentTrack, load, play, toggle, next, prev, seek, setVolume, onProgress,
  resolving, resolveError, onlineCover,
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
const coverStyle = computed(() =>
  coverSrc.value ? { backgroundImage: `url("${coverSrc.value}")` } : {}
)

function formatTime(sec) {
  if (!isFinite(sec) || sec <= 0) return '--:--'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/* ---- 移动端封面/歌词切换 ---- */
const mobileView = ref('cover') // 'cover' | 'lyrics'
const isMobile = ref(false)
let mobileMq = null

function updateMobile(e) {
  isMobile.value = e.matches
  if (!e.matches) mobileView.value = 'cover'
}

function toggleMobileView() {
  if (!isMobile.value) return
  mobileView.value = mobileView.value === 'cover' ? 'lyrics' : 'cover'
}

/* ---- 播放列表 ---- */
const listOpen = ref(false)

/* ---- 音量 ---- */
const volOpen = ref(false)
const volDragging = ref(false)
const volTrackRef = ref(null)

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
  const track = volTrackRef.value
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

/* ---- 歌词滚动 ---- */
const lyricBoxRef = ref(null)
let lyricScrollRaf = 0
watch(activeIndex, () => {
  if (lyricScrollRaf) cancelAnimationFrame(lyricScrollRaf)
  lyricScrollRaf = requestAnimationFrame(() => {
    const box = lyricBoxRef.value
    if (!box) return
    const el = box.querySelectorAll('.lyric-line')[activeIndex.value]
    if (!el) return
    const maxTop = box.scrollHeight - box.clientHeight
    const target = Math.max(0, Math.min(maxTop, el.offsetTop - box.clientHeight / 2 + el.offsetHeight / 2))
    const jump = Math.abs(target - box.scrollTop)
    box.scrollTo({ top: target, behavior: jump > box.clientHeight * 0.6 ? 'auto' : 'smooth' })
  })
})

onMounted(() => {
  load()
  unsubProgress = onProgress((pct) => {
    if (!scrubbing.value) paintBar(pct)
  })
  paintBar(progress.value)
  mobileMq = window.matchMedia('(max-width: 960px)')
  updateMobile(mobileMq)
  if (mobileMq.addEventListener) mobileMq.addEventListener('change', updateMobile)
  else mobileMq.addListener(updateMobile)
})

onUnmounted(() => {
  unsubProgress?.()
  window.removeEventListener('pointermove', onVolDragMove)
  window.removeEventListener('pointerup', onVolDragEnd)
  if (mobileMq) {
    if (mobileMq.removeEventListener) mobileMq.removeEventListener('change', updateMobile)
    else mobileMq.removeListener(updateMobile)
  }
})
</script>

<template>
  <section class="view">
    <div class="stage-bg" :class="{ cover: !!coverSrc }" :style="coverStyle"></div>
    <div class="stage-overlay"></div>

    <template v-if="loading">
      <div class="state">加载中…</div>
    </template>

    <template v-else-if="tracks.length">
      <div class="player-main">
        <!-- 歌词列表面板（浮层） -->
        <Transition name="drawer">
          <div v-if="listOpen" class="list-panel" v-click-outside="() => listOpen = false">
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

        <!-- 主区域：封面 + 歌词 -->
        <div
          class="player-hero"
          :class="{ 'mobile-toggle': isMobile, 'show-lyrics': isMobile && mobileView === 'lyrics' }"
        >
          <!-- 左侧：封面/碟片 -->
          <div class="hero-left" @click="toggleMobileView">
            <div class="disc" :class="{ spinning: playing }">
              <img v-if="coverSrc" :src="coverSrc" alt="" class="disc-cover" />
              <span v-else class="disc-note">♪</span>
            </div>
            <div class="track-info">
              <span class="track-title">{{ currentTrack?.title || currentTrack?.name }}</span>
              <span v-if="currentTrack?.artist" class="track-artist">{{ currentTrack.artist }}</span>
            </div>
            <div v-if="resolving" class="resolving-hint">🔍 QQ 音乐解析中…</div>
            <div v-else-if="resolveError" class="resolve-error">⚠️ {{ resolveError }}</div>
            <div v-if="isMobile && lyricAvailable" class="mobile-toggle-hint">
              {{ mobileView === 'cover' ? '点击封面查看歌词' : '点击返回封面' }}
            </div>
          </div>

          <!-- 右侧：歌词区 -->
          <div class="lyrics-zone">
            <div class="lyrics-head">
              <span v-if="isMobile && mobileView === 'lyrics'" class="lyrics-back" @click="toggleMobileView">‹ 封面</span>
              <span class="now-label">
                <span class="now-dot" :class="{ on: playing }"></span>
                {{ playing ? 'NOW PLAYING' : 'PAUSED' }}
              </span>
              <span v-if="lyricLoading" class="lyrics-state">加载中…</span>
              <span v-else-if="lyricAvailable" class="lyrics-state">点击歌词跳转播放</span>
              <span v-else class="lyrics-state">在线播放 · 暂无歌词</span>
            </div>

            <div v-if="lyricAvailable" ref="lyricBoxRef" class="lyrics-box">
              <div class="lyrics-inner">
                <p
                  v-for="(l, i) in lyricLines"
                  :key="i"
                  class="lyric-line"
                  :class="{ active: i === activeIndex }"
                  @click="seekLyric(l)"
                >
                  <span
                    v-for="(t, ti) in l.texts"
                    :key="ti"
                    class="lyric-text"
                    :class="ti === 0 ? 'lyric-original' : 'lyric-trans'"
                  >{{ t || '\u00A0' }}</span>
                </p>
              </div>
            </div>

            <div v-else class="lyrics-empty">
              <p class="lyrics-empty-main">{{ resolving ? '解析中…' : '暂无歌词' }}</p>
              <p v-if="!lyricLoading && !resolving" class="lyrics-empty-hint">在线模式下不显示歌词</p>
            </div>
          </div>
        </div>

        <!-- 底部控制栏 -->
        <div class="controls-bar">
          <!-- 进度条 -->
          <div class="seek-row">
            <span class="time">{{ formatTime(shownTime) }}</span>
            <div
              ref="barRef"
              class="seek-bar"
              @pointerdown="onBarDown"
              @pointermove="onBarMove"
              @pointerup="onBarUp"
              @pointercancel="scrubbing = false"
            >
              <div ref="barFillEl" class="seek-fill"></div>
              <div ref="barKnobEl" class="seek-knob"></div>
            </div>
            <span class="time">{{ formatTime(duration) }}</span>
          </div>

          <!-- 控制按钮 -->
          <div class="ctrls">
            <div class="ctrls-left">
              <div class="vol-wrap" v-click-outside="() => volOpen = false">
                <button class="btn" @click="volOpen = !volOpen" :title="volume === 0 ? '取消静音' : '音量'">
                  <svg v-if="volume === 0" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.6 3l2.7-2.7-1.4-1.4L15.2 10.6 12.5 7.9 11 9.3l2.7 2.7L11 14.7l1.5 1.4 2.7-2.7 2.7 2.7 1.4-1.4z" /></svg>
                  <svg v-else-if="volume < 0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13 3a4 4 0 00-2-3.5v7A4 4 0 0016 12z" /></svg>
                  <svg v-else viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13 3a4 4 0 00-2-3.5v7A4 4 0 0016 12zm-2-8.2v2.1a6 6 0 010 12.2v2.1A8 8 0 0014 3.8z" /></svg>
                </button>
                <div v-if="volOpen" class="vol-pop" @pointerdown.stop>
                  <div ref="volTrackRef" class="vol-track" @pointerdown.prevent="onVolDragStart">
                    <div class="vol-fill" :style="{ height: volume * 100 + '%' }"></div>
                    <div class="vol-knob" :style="{ bottom: 'calc(' + volume * 100 + '% - 6px)' }"></div>
                  </div>
                  <span class="vol-pct">{{ Math.round(volume * 100) }}</span>
                </div>
              </div>
            </div>

            <div class="ctrls-center">
              <button class="btn" @click="prev" title="上一首">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>
              </button>
              <button class="btn-play" @click="toggle" :title="playing ? '暂停' : '播放'">
                <svg v-if="playing" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zm8 0h4v14h-4z" /></svg>
                <svg v-else viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
              </button>
              <button class="btn" @click="next" title="下一首">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zm9-12h2v12h-2z" /></svg>
              </button>
            </div>

            <div class="ctrls-right">
              <button class="btn" :class="{ active: listOpen }" @click="listOpen = !listOpen" title="播放列表">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h10v2H4z" /></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="state empty">
        <div class="empty-emoji">🎵</div>
        <p>在线曲库暂无歌曲。</p>
        <p class="hint">编辑 <code>public/music.jsonl</code> 添加歌曲（仅需标题和歌手），播放时自动从 QQ 音乐解析。</p>
      </div>
    </template>
  </section>
</template>

<style scoped>
.view {
  position: relative;
  height: 100%;
  min-height: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.stage-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  background:
    radial-gradient(120% 150% at 15% -10%, var(--accent-soft) 0%, transparent 58%),
    radial-gradient(130% 150% at 85% 115%, var(--accent-soft) 0%, transparent 55%),
    var(--bg-soft);
}
.stage-bg.cover {
  background: center / cover no-repeat;
  filter: blur(36px) saturate(1.3);
  transform: scale(1.15);
  transition: background-image 0.4s ease;
}
.stage-overlay {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.66), rgba(255, 255, 255, 0.82));
}
html[data-theme="dark"] .stage-overlay {
  background: linear-gradient(180deg, rgba(13, 15, 20, 0.7), rgba(13, 15, 20, 0.86));
}

/* ===== 主区域 ===== */
.player-main {
  position: relative;
  z-index: 2;
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  max-width: 1320px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  padding: 10px 44px 0;
}

.player-hero {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
  gap: 72px;
  align-items: center;
  padding-bottom: 12px;
}

/* ===== 封面区 ===== */
.hero-left {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  text-align: center;
  min-width: 0;
}
.disc {
  position: relative;
  width: 280px;
  height: 280px;
  border-radius: 50%;
  border: 2px solid var(--border);
  background:
    repeating-radial-gradient(circle at 50% 50%, transparent 0 10px, var(--border-light) 10px 11px),
    radial-gradient(circle at 50% 50%, var(--accent-soft), transparent 62%),
    var(--bg);
  box-shadow: 0 22px 54px rgba(0, 0, 0, 0.2), 0 0 0 10px var(--accent-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.disc::after {
  content: "";
  position: absolute;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--surface);
  border: 2px solid var(--accent);
  z-index: 2;
}
.disc-cover {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.disc-note {
  position: relative;
  z-index: 1;
  font-size: 28px;
  color: var(--text-tertiary);
}
.disc.spinning {
  animation: spin 14s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.track-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.track-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
}
.track-artist {
  font-size: 13px;
  color: var(--text-tertiary);
}
.resolving-hint {
  font-size: 13px;
  color: var(--accent);
}
.resolve-error {
  font-size: 13px;
  color: var(--danger, #e5484d);
}

/* ===== 歌词区 ===== */
.lyrics-zone {
  min-width: 0;
  align-self: stretch;
  display: flex;
  flex-direction: column;
}
.lyrics-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 8px 10px;
}
.now-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  letter-spacing: 0.22em;
  color: var(--text-tertiary);
  font-weight: 600;
}
.now-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--border);
  transition: background 0.2s, box-shadow 0.2s;
}
.now-dot.on {
  background: var(--accent);
  box-shadow: 0 0 10px var(--accent);
  animation: pulse 1.4s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
.lyrics-state {
  font-size: 11px;
  color: var(--text-tertiary);
  white-space: nowrap;
}
.lyrics-box {
  position: relative;
  height: clamp(280px, 50vh, 540px);
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
  cursor: pointer;
  -webkit-mask-image: linear-gradient(180deg, transparent 0, #000 12%, #000 88%, transparent 100%);
  mask-image: linear-gradient(180deg, transparent 0, #000 12%, #000 88%, transparent 100%);
}
.lyrics-box::-webkit-scrollbar {
  display: none;
}
.lyrics-inner {
  position: relative;
  padding: 120px 12px;
  display: flex;
  flex-direction: column;
}
.lyric-line {
  margin: 0;
  padding: 7px 8px;
  min-height: 28px;
  text-align: center;
  border-radius: 10px;
  user-select: none;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
  transition: transform 0.25s ease, opacity 0.25s ease;
}
.lyric-text {
  display: block;
}
.lyric-original {
  font-size: 15px;
  line-height: 1.5;
  color: var(--text-secondary);
}
.lyric-trans {
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--text-tertiary);
  opacity: 0.85;
}
.lyric-line:hover .lyric-original {
  color: var(--text);
}
.lyric-line.active {
  transform: scale(1.05);
}
.lyric-line.active .lyric-original {
  color: var(--accent-strong);
  font-weight: 700;
}
.lyric-line.active .lyric-trans {
  color: var(--accent);
  font-weight: 500;
  opacity: 1;
}
.lyrics-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: clamp(280px, 50vh, 540px);
  padding: 0 16px;
  text-align: center;
  color: var(--text-tertiary);
}
.lyrics-empty-main {
  margin: 0;
  font-size: 13.5px;
}
.lyrics-empty-hint {
  margin: 0;
  font-size: 12px;
  opacity: 0.72;
}

/* ===== 底部控制栏 ===== */
.controls-bar {
  flex: 0 0 auto;
  padding: 8px 0 12px;
  border-top: 1px solid var(--border-light);
}
.seek-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}
.time {
  flex: 0 0 auto;
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  color: var(--text-tertiary);
  min-width: 36px;
  text-align: center;
}
.seek-bar {
  position: relative;
  flex: 1 1 auto;
  height: 6px;
  border-radius: 999px;
  background: var(--border-light);
  cursor: pointer;
  touch-action: none;
}
.seek-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--accent), var(--accent-strong));
}
.seek-knob {
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
.seek-bar:hover .seek-knob,
.seek-bar:active .seek-knob {
  opacity: 1;
}
.ctrls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.ctrls-left,
.ctrls-right {
  flex: 1 1 0;
  display: flex;
  align-items: center;
  gap: 10px;
}
.ctrls-right {
  justify-content: flex-end;
}
.ctrls-center {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 12px;
}
.btn {
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
.btn:hover {
  border-color: var(--accent-border);
  color: var(--accent);
  background: var(--accent-soft);
}
.btn svg {
  width: 16px;
  height: 16px;
}
.btn.active {
  color: var(--accent);
  border-color: var(--accent-border);
  background: var(--accent-soft);
}
.btn-play {
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
.btn-play:hover {
  filter: brightness(1.08);
  transform: scale(1.05);
}
.btn-play svg {
  width: 20px;
  height: 20px;
}

/* 音量弹出 */
.vol-wrap {
  position: relative;
}
.vol-pop {
  position: absolute;
  bottom: calc(100% + 12px);
  left: 50%;
  transform: translateX(-50%);
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
.vol-track {
  position: relative;
  width: 5px;
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
}
.vol-pct {
  font-size: 10px;
  color: var(--text-tertiary);
}

/* ===== 播放列表面板 ===== */
.list-panel {
  position: absolute;
  top: 10px;
  right: 44px;
  width: min(380px, 80vw);
  max-height: 60%;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 85;
}
.list-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px 10px;
  border-bottom: 1px solid var(--border);
}
.list-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
}
.list-count {
  flex: 1 1 auto;
  font-size: 12px;
  color: var(--text-tertiary);
}
.list-close {
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
.list-close:hover {
  color: var(--accent);
  border-color: var(--accent-border);
}
.list-body {
  list-style: none;
  margin: 0;
  padding: 6px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--accent) transparent;
}
.list-body::-webkit-scrollbar {
  width: 5px;
}
.list-body::-webkit-scrollbar-thumb {
  background: var(--accent);
  border-radius: 999px;
}
.list-body li {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  cursor: pointer;
  border-radius: 8px;
  transition: background 0.15s ease;
}
.list-body li:hover {
  background: var(--surface-hover);
}
.list-body li.active {
  background: var(--accent-soft);
}
.list-idx {
  flex: 0 0 28px;
  text-align: center;
  font-size: 12px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}
.eq {
  display: inline-flex;
  align-items: flex-end;
  gap: 2px;
  height: 12px;
}
.eq i {
  width: 2.5px;
  background: var(--accent);
  border-radius: 2px;
  animation: eq-anim 0.9s ease-in-out infinite;
}
.eq i:nth-child(1) { height: 5px; animation-delay: 0s; }
.eq i:nth-child(2) { height: 12px; animation-delay: 0.2s; }
.eq i:nth-child(3) { height: 8px; animation-delay: 0.4s; }
@keyframes eq-anim {
  0%, 100% { transform: scaleY(0.4); }
  50% { transform: scaleY(1); }
}
.list-meta {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.list-name {
  font-size: 13px;
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
  font-size: 11px;
  color: var(--text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.list-dur {
  flex: 0 0 auto;
  font-size: 11px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}

.drawer-enter-active,
.drawer-leave-active {
  transition: transform 0.25s ease, opacity 0.25s ease;
}
.drawer-enter-from,
.drawer-leave-to {
  transform: translateY(-12px);
  opacity: 0;
}

.state {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  text-align: center;
}
.state.empty {
  flex-direction: column;
  gap: 8px;
  padding: 0 20px;
}
.empty .empty-emoji {
  font-size: 48px;
  opacity: 0.6;
}
.empty .hint {
  font-size: 13px;
}
.empty code {
  background: var(--surface);
  padding: 1px 6px;
  border-radius: 6px;
  color: var(--text-secondary);
}

/* ===== 响应式：平板 ===== */
@media (max-width: 960px) {
  .player-main {
    padding: 8px 22px 0;
  }
  .player-hero {
    grid-template-columns: 1fr;
    gap: 16px;
    justify-items: center;
  }
  .disc {
    width: 200px;
    height: 200px;
  }
  .lyrics-zone {
    width: 100%;
    max-width: 620px;
  }
  .lyrics-box,
  .lyrics-empty {
    height: clamp(180px, 36vh, 340px);
  }

  /* 移动端封面/歌词切换模式 */
  .player-hero.mobile-toggle {
    position: relative;
    gap: 0;
  }
  .player-hero.mobile-toggle .hero-left {
    cursor: pointer;
  }
  .player-hero.mobile-toggle:not(.show-lyrics) .lyrics-zone {
    display: none;
  }
  .player-hero.mobile-toggle.show-lyrics .hero-left {
    display: none;
  }
  .player-hero.mobile-toggle.show-lyrics .lyrics-zone {
    display: flex;
    flex: 1 1 auto;
    min-height: 0;
  }
  .player-hero.mobile-toggle.show-lyrics .lyrics-box,
  .player-hero.mobile-toggle.show-lyrics .lyrics-empty {
    height: clamp(280px, 50vh, 480px);
  }
  .mobile-toggle-hint {
    margin-top: 6px;
    font-size: 12px;
    color: var(--text-tertiary);
    opacity: 0.7;
    animation: pulse 2s ease-in-out infinite;
  }
  .lyrics-back {
    flex: 0 0 auto;
    font-size: 13px;
    font-weight: 500;
    color: var(--accent);
    cursor: pointer;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }
  .list-panel {
    right: 22px;
    width: min(360px, calc(100vw - 44px));
    max-height: 55%;
  }
}

/* ===== 响应式：手机 ===== */
@media (max-width: 560px) {
  .player-main {
    padding: 6px 12px 0;
  }
  .disc {
    width: 170px;
    height: 170px;
  }
  .track-title {
    font-size: 15px;
  }
  .track-artist {
    font-size: 12px;
  }
  .lyrics-inner {
    padding: 80px 6px;
  }
  .lyric-original {
    font-size: 13.5px;
  }
  .lyric-trans {
    font-size: 11.5px;
  }
  .seek-row {
    gap: 8px;
    margin-bottom: 6px;
  }
  .time {
    font-size: 11px;
    min-width: 32px;
  }
  .seek-bar {
    height: 5px;
  }
  .ctrls {
    gap: 8px;
  }
  .btn {
    width: 36px;
    height: 36px;
  }
  .btn svg {
    width: 15px;
    height: 15px;
  }
  .btn-play {
    width: 44px;
    height: 44px;
  }
  .btn-play svg {
    width: 18px;
    height: 18px;
  }
  .list-panel {
    right: 12px;
    left: 12px;
    width: auto;
    max-height: 50%;
  }
}

/* ===== 响应式：小屏手机 ===== */
@media (max-width: 380px) {
  .disc {
    width: 140px;
    height: 140px;
  }
  .disc::after {
    width: 20px;
    height: 20px;
  }
  .track-title {
    font-size: 14px;
  }
  .lyric-original {
    font-size: 12.5px;
  }
  .lyric-trans {
    font-size: 10.5px;
  }
  .lyrics-head {
    padding: 0 4px 8px;
  }
  .now-label {
    font-size: 10px;
    letter-spacing: 0.16em;
  }
  .lyrics-state {
    font-size: 10px;
  }
  .btn {
    width: 34px;
    height: 34px;
  }
  .btn-play {
    width: 40px;
    height: 40px;
  }
  /* 小屏隐藏音量按钮 */
  .vol-wrap {
    display: none;
  }
}

@media (max-height: 700px) {
  .disc {
    width: 170px;
    height: 170px;
  }
  .player-hero {
    gap: 12px;
  }
  .lyrics-box,
  .lyrics-empty {
    height: clamp(140px, 30vh, 260px);
  }
}
</style>
