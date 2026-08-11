<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { usePlayer } from '../composables/usePlayer'
import { useLyrics } from '../composables/useLyrics'

const {
  tracks, loading, current, playing, progress, currentTime, duration,
  volume, currentTrack, load, play, toggle, next, prev, seek, setVolume, onProgress,
} = usePlayer()

const {
  lyricLines, lyricAvailable, lyricLoading, activeIndex, seekLyric,
} = useLyrics()

function resolveUrl(u) {
  if (!u) return ''
  const base = import.meta.env.BASE_URL || '/'
  return u.startsWith('/') ? base.replace(/\/$/, '') + u : u
}

/* 封面：清单中同名封面图（用于沉浸式背景 + 唱片封面），无封面时回退主题渐变 */
const coverSrc = computed(() => (currentTrack.value?.cover ? resolveUrl(currentTrack.value.cover) : ''))
const coverStyle = computed(() =>
  coverSrc.value ? { backgroundImage: `url("${coverSrc.value}")` } : {}
)

const volOpen = ref(false)
const volDragging = ref(false)
const listOpen = ref(false)

/* 点击面板外部自动收起音量弹层（与 QQ 音乐一致：再点按钮或点空白处取消） */
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

/* ===== 时长 ===== */
const durations = ref({})
const durationProbes = []

function formatTime(sec) {
  if (!isFinite(sec) || sec <= 0) return '--:--'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function probeDurations() {
  tracks.value.forEach((t, i) => {
    if (durations.value[t.url] || durationProbes[i]) return
    const a = new Audio()
    durationProbes[i] = a
    a.preload = 'metadata'
    const base = import.meta.env.BASE_URL || '/'
    const src = t.url.startsWith('/') ? base.replace(/\/$/, '') + t.url : t.url
    a.addEventListener('loadedmetadata', () => {
      if (a.duration && isFinite(a.duration)) {
        durations.value = { ...durations.value, [t.url]: a.duration }
      }
    })
    a.src = src
  })
}

/* ===== 进度条拖动（指针事件，移动端友好） ===== */
const scrubbing = ref(false)
const scrubRatio = ref(null)
const barRef = ref(null)
const barFillEl = ref(null)
const barKnobEl = ref(null)
let unsubProgress = null

/* 直接写进度条 DOM（60fps），不经过 Vue 重渲染，保证播放时顺滑无卡顿 */
function paintBar(percent) {
  if (barFillEl.value) barFillEl.value.style.width = percent + '%'
  if (barKnobEl.value) barKnobEl.value.style.left = percent + '%'
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

/* ===== 音量 ===== */
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
  const track = document.querySelector('.vol-track')
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

/* ===== 歌词自动滚动：高亮行居中 ===== */
const lyricBoxRef = ref(null)
watch(activeIndex, () => {
  requestAnimationFrame(() => {
    const box = lyricBoxRef.value
    if (!box) return
    const el = box.querySelectorAll('.lyric-line')[activeIndex.value]
    if (!el) return
    // .lyrics-inner 已设置 position: relative，offsetTop 相对滚动容器内容计算
    const maxTop = box.scrollHeight - box.clientHeight
    const target = Math.max(0, Math.min(maxTop, el.offsetTop - box.clientHeight / 2 + el.offsetHeight / 2))
    // 大跨度（用户拖进度条/点歌词跳转）用瞬时定位，逐行推进用平滑滚动
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
})

/* 播放清单加载后探测每首歌时长（默认歌曲进入即读取出时间） */
watch(tracks, () => probeDurations(), { immediate: true })

onUnmounted(() => {
  unsubProgress?.()
  durationProbes.forEach((a) => a && (a.src = ''))
  window.removeEventListener('pointermove', onVolDragMove)
  window.removeEventListener('pointerup', onVolDragEnd)
})
</script>

<template>
  <section class="view">
    <!-- 沉浸背景：铺满整个音乐页（播放器 + 列表融为一体） -->
    <div class="stage-bg" :class="{ cover: !!coverSrc }" :style="coverStyle"></div>
    <div class="stage-overlay"></div>

    <template v-if="loading">
      <div class="state">加载中…</div>
    </template>

    <template v-else-if="tracks.length">
      <!-- ===== 主播放区：封面与歌词铺满整个页面 ===== -->
      <div class="player-main">
        <div class="player-hero">
          <div class="hero-left">
            <div class="disc" :class="{ spinning: playing }">
              <img v-if="coverSrc" :src="coverSrc" alt="" class="disc-cover" />
              <span v-else class="disc-note">♪</span>
            </div>
          </div>

          <div class="lyrics-zone">
            <div class="lyrics-head">
              <span class="now-label">
                <span class="now-dot" :class="{ on: playing }"></span>
                {{ playing ? 'NOW PLAYING' : 'PAUSED' }}
              </span>
              <span v-if="lyricLoading" class="lyrics-state">加载中…</span>
              <span v-else-if="lyricAvailable" class="lyrics-state">点击歌词跳转播放</span>
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
              <p class="lyrics-empty-main">{{ lyricLoading ? '加载中…' : '暂无歌词' }}</p>
              <p v-if="!lyricLoading" class="lyrics-empty-hint">将同名 .lrc 文件放入 public/music/ 即可自动显示</p>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== 底部进度控制条 ===== -->
      <div class="player-bar">
        <div class="seek-row">
          <span class="time">{{ formatTime(shownTime) }}</span>
          <div
            ref="barRef"
            class="bar"
            @pointerdown="onBarDown"
            @pointermove="onBarMove"
            @pointerup="onBarUp"
            @pointercancel="scrubbing = false"
          >
            <div ref="barFillEl" class="bar-fill"></div>
            <div ref="barKnobEl" class="bar-knob"></div>
          </div>
          <span class="time">{{ formatTime(duration) }}</span>
        </div>

        <div class="ctrls">
          <div class="bar-info">
            <img v-if="coverSrc" :src="coverSrc" alt="" class="bar-cover" />
            <span v-else class="bar-cover bar-cover-note">♪</span>
            <div class="bar-meta">
              <span class="bar-title" :title="currentTrack.title">{{ currentTrack.title }}</span>
              <span v-if="currentTrack.artist" class="bar-artist">{{ currentTrack.artist }}</span>
            </div>
          </div>
          <div class="ctrls-left">
            <button class="ctrl" @click="prev" title="上一首" aria-label="上一首">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>
            </button>
            <button class="play" @click="toggle" :title="playing ? '暂停' : '播放'" aria-label="播放/暂停">
              <svg v-if="playing" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zm8 0h4v14h-4z" /></svg>
              <svg v-else viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            </button>
            <button class="ctrl" @click="next" title="下一首" aria-label="下一首">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zm9-12h2v12h-2z" /></svg>
            </button>
          </div>

          <div class="ctrls-right">
            <div class="vol" v-click-outside="() => (volOpen = false)">
              <button class="ctrl vol-btn" @click="volOpen = !volOpen" :title="volume === 0 ? '取消静音' : '音量'" aria-label="音量">
                <svg v-if="volume === 0" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.6 3l2.7-2.7-1.4-1.4L15.2 10.6 12.5 7.9 11 9.3l2.7 2.7L11 14.7l1.5 1.4 2.7-2.7 2.7 2.7 1.4-1.4z" /></svg>
                <svg v-else-if="volume < 0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13 3a4 4 0 00-2-3.5v7A4 4 0 0016 12z" /></svg>
                <svg v-else viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13 3a4 4 0 00-2-3.5v7A4 4 0 0016 12zm-2-8.2v2.1a6 6 0 010 12.2v2.1A8 8 0 0014 3.8z" /></svg>
              </button>
              <div v-if="volOpen" class="vol-pop" @pointerdown.stop>
                <div class="vol-track" @pointerdown.prevent="onVolDragStart">
                  <div class="vol-fill" :style="{ height: volume * 100 + '%' }"></div>
                  <div class="vol-knob" :style="{ bottom: 'calc(' + volume * 100 + '% - 6px)' }"></div>
                </div>
                <span class="vol-pct">{{ Math.round(volume * 100) }}</span>
              </div>
            </div>

            <button
              class="ctrl list-btn"
              :class="{ active: listOpen }"
              @click="listOpen = !listOpen"
              title="播放列表"
              aria-label="播放列表"
            >
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h10v2H4z" /></svg>
            </button>
          </div>
        </div>
      </div>

      <!-- ===== 播放列表抽屉：右下角列表按钮唤起 ===== -->
      <Transition name="drawer">
        <div v-if="listOpen" class="playlist-mask" @click.self="listOpen = false">
          <aside class="playlist-drawer">
            <div class="drawer-head">
              <span class="list-title">播放列表</span>
              <span class="drawer-count">{{ tracks.length }} 首</span>
              <button class="drawer-close" @click="listOpen = false" aria-label="关闭播放列表">✕</button>
            </div>
            <ul class="list">
              <li
                v-for="(t, i) in tracks"
                :key="t.url"
                :class="{ active: i === current }"
                @click="play(i)"
              >
                <span class="idx">
                  <span v-if="i === current && playing" class="eq"><i></i><i></i><i></i></span>
                  <svg v-else viewBox="0 0 24 24" fill="currentColor" class="idx-play"><path d="M8 5v14l11-7z" /></svg>
                  <span class="idx-num">{{ i + 1 }}</span>
                </span>
                <span class="meta">
                  <span class="name">{{ t.title }}</span>
                  <span v-if="t.artist" class="by">{{ t.artist }}</span>
                </span>
                <span class="duration">{{ formatTime(durations[t.url]) }}</span>
                <span class="status">{{ i === current ? (playing ? '播放中' : '已暂停') : '' }}</span>
              </li>
            </ul>
          </aside>
        </div>
      </Transition>

    </template>

    <template v-else>
      <div class="state empty">
        <div class="empty-emoji">🎵</div>
        <p>还没有音乐。</p>
        <p class="hint">把音频放进 <code>public/music/</code>（支持 mp3/wav/ogg/flac/m4a/aac）后，运行 <code>npm run gen:manifest</code> 即可出现在这里。</p>
      </div>
    </template>
  </section>
</template>

<style scoped>
/* ===== 页面容器：播放器固定、列表独立滚动 ===== */
.view {
  position: relative;
  height: 100%;
  min-height: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ===== 沉浸式氛围背景（铺满整个音乐页，无外框） ===== */
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

/* ===== 播放器固定区域 ===== */
.player-main {
  position: relative;
  z-index: 2;
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  max-width: 1320px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 44px 6px;
}
.player-hero {
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns: minmax(360px, 1fr) minmax(0, 1.2fr);
  gap: 72px;
  align-items: center;
  width: 100%;
}
.hero-left {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  text-align: center;
  min-width: 0;
}
.disc {
  position: relative;
  width: 320px;
  height: 320px;
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
  width: 28px;
  height: 28px;
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

/* ===== 歌词：无边框沉浸展示 ===== */
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

/* ===== 底部进度控制条 ===== */
.player-bar {
  position: relative;
  z-index: 2;
  flex: 0 0 auto;
  width: 100%;
  max-width: 1320px;
  margin: 0 auto;
  padding: 6px 44px 18px;
  background: linear-gradient(
    180deg,
    transparent 0%,
    color-mix(in srgb, var(--bg-soft) 62%, transparent) 34%
  );
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}
.seek-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
}
.time {
  flex: 0 0 auto;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--text-tertiary);
  min-width: 38px;
  text-align: center;
}
.bar {
  position: relative;
  flex: 1 1 auto;
  height: 6px;
  border-radius: 999px;
  background: var(--border-light);
  cursor: pointer;
  touch-action: none;
}
.bar-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--accent), var(--accent-strong));
}
.bar-knob {
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
.bar:hover .bar-knob,
.bar:active .bar-knob {
  opacity: 1;
}

/* 控制按钮：左侧歌曲信息，主控居中，音量与列表按钮靠右 */
.ctrls {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-height: 60px;
}
.bar-info {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  max-width: 34%;
  margin-right: auto;
  overflow: hidden;
}
.bar-cover {
  flex: 0 0 auto;
  width: 48px;
  height: 48px;
  border-radius: 10px;
  object-fit: cover;
  background: var(--surface);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.16);
}
.bar-cover-note {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  color: var(--text-tertiary);
}
.bar-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.bar-title {
  font-size: 14.5px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bar-artist {
  font-size: 12px;
  color: var(--text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ctrls-left {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 16px;
}
.ctrls-right {
  display: flex;
  align-items: center;
  gap: 14px;
}
.ctrl {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-secondary);
  width: 46px;
  height: 46px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.18s, color 0.18s, background 0.18s, transform 0.15s ease, box-shadow 0.18s ease;
}
.ctrl:hover {
  border-color: var(--accent-border);
  color: var(--accent);
  background: var(--accent-soft);
  transform: translateY(-2px);
  box-shadow: 0 6px 16px var(--accent-soft);
}
.ctrl:active {
  transform: translateY(0) scale(0.9);
  box-shadow: none;
}
.ctrl svg {
  width: 18px;
  height: 18px;
}
.ctrls .play {
  flex: 0 0 auto;
  background: linear-gradient(135deg, var(--accent), var(--accent-strong));
  border-color: transparent;
  border-radius: 50%;
  color: #fff;
  width: 58px;
  height: 58px;
  box-shadow: 0 6px 20px var(--accent-soft), 0 0 0 0 color-mix(in srgb, var(--accent-soft) 40%, transparent);
  transition: transform 0.18s ease, box-shadow 0.18s ease, filter 0.18s ease;
}
.ctrls .play:hover {
  filter: brightness(1.08);
  color: #fff;
  transform: translateY(-2px) scale(1.04);
  box-shadow: 0 10px 28px var(--accent-soft), 0 0 0 8px color-mix(in srgb, var(--accent-soft) 45%, transparent);
}
.ctrls .play:active {
  transform: translateY(0) scale(0.94);
  filter: brightness(1);
  box-shadow: 0 4px 14px var(--accent-soft);
}
.ctrls .play svg {
  width: 24px;
  height: 24px;
}
.list-btn svg {
  width: 20px;
  height: 20px;
}
.list-btn.active {
  color: var(--accent);
  border-color: var(--accent-border);
  background: var(--accent-soft);
}

/* ===== 音量 ===== */
.vol {
  position: relative;
  display: flex;
  align-items: center;
}
.vol-pop {
  position: absolute;
  bottom: calc(100% + 14px);
  right: 0;
  width: 44px;
  padding: 10px 0 14px;
  background: var(--surface);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  z-index: 40;
}
.vol-pop::after {
  content: "";
  position: absolute;
  bottom: -6px;
  right: 14px;
  transform: rotate(45deg);
  width: 12px;
  height: 12px;
  background: var(--surface);
  border-left: 1px solid var(--accent-border);
  border-bottom: 1px solid var(--accent-border);
}
.vol-track {
  position: relative;
  width: 6px;
  height: 96px;
  border-radius: 999px;
  background: var(--border-light);
  cursor: pointer;
  overflow: visible;
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
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--surface);
  border: 2px solid var(--accent);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}
.vol-pct {
  font-size: 11px;
  color: var(--text-tertiary);
}

/* ===== 播放列表（独立滚动区域） ===== */
/* ===== 播放列表抽屉：右下角列表按钮唤起 ===== */
.playlist-mask {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: flex;
  justify-content: flex-end;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
}
.playlist-drawer {
  display: flex;
  flex-direction: column;
  width: min(400px, 86vw);
  height: 100%;
  background: var(--surface);
  border-left: 1px solid var(--border);
  box-shadow: var(--shadow-lg);
  padding: 18px 18px 10px;
}
.drawer-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 2px 6px 12px;
}
.drawer-count {
  flex: 1 1 auto;
  font-size: 12px;
  color: var(--text-tertiary);
}
.drawer-close {
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.16s ease, border-color 0.16s ease, background 0.16s ease;
}
.drawer-close:hover {
  color: var(--accent);
  border-color: var(--accent-border);
  background: var(--accent-soft);
}
/* 抽屉内列表独立滚动 */
.playlist-drawer .list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--accent) transparent;
  padding-right: 4px;
}
.playlist-drawer .list::-webkit-scrollbar {
  width: 6px;
}
.playlist-drawer .list::-webkit-scrollbar-track {
  background: transparent;
}
.playlist-drawer .list::-webkit-scrollbar-thumb {
  background: var(--accent);
  border-radius: 999px;
}
/* 抽屉动画：桌面右侧滑入，移动端底部滑出 */
.drawer-enter-active,
.drawer-leave-active {
  transition: transform 0.28s ease, opacity 0.28s ease;
}
.drawer-enter-from,
.drawer-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
@media (max-width: 560px) {
  .playlist-mask {
    justify-content: stretch;
    align-items: flex-end;
  }
  .playlist-drawer {
    width: 100%;
    height: 62%;
    border-left: none;
    border-top: 1px solid var(--border);
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  }
  .drawer-enter-from,
  .drawer-leave-to {
    transform: translateY(100%);
  }
}
.list-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.list li {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 13px 12px;
  cursor: pointer;
  border-radius: 10px;
  margin-bottom: 6px;
  background: color-mix(in srgb, var(--surface) 46%, transparent);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid color-mix(in srgb, var(--border) 45%, transparent);
  transition: background 0.15s ease, border-color 0.15s ease;
}
.list li:hover {
  background: color-mix(in srgb, var(--surface-hover) 72%, transparent);
}
.list li.active {
  background: color-mix(in srgb, var(--accent-soft) 70%, var(--surface) 30%);
  border-color: var(--accent-border);
  box-shadow: inset 2px 0 0 var(--accent);
}
.idx {
  flex: 0 0 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.idx-play {
  width: 16px;
  height: 16px;
  color: var(--text-tertiary);
  display: none;
}
.list li:hover .idx-num,
.list li.active .idx-num {
  display: none;
}
.list li:hover .idx-play,
.list li.active .idx-play {
  display: block;
  color: var(--accent);
}
.eq {
  display: inline-flex;
  align-items: flex-end;
  gap: 2px;
  height: 14px;
}
.eq i {
  width: 2.5px;
  background: var(--accent);
  border-radius: 2px;
  animation: eq 0.9s ease-in-out infinite;
}
.eq i:nth-child(1) { height: 6px; animation-delay: 0s; }
.eq i:nth-child(2) { height: 14px; animation-delay: 0.2s; }
.eq i:nth-child(3) { height: 9px; animation-delay: 0.4s; }
@keyframes eq {
  0%, 100% { transform: scaleY(0.4); }
  50% { transform: scaleY(1); }
}
.meta {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.name {
  font-size: 14.5px;
  font-weight: 500;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.list li:not(.active) .name {
  color: var(--text-secondary);
}
.by {
  font-size: 12px;
  color: var(--text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.duration {
  flex: 0 0 auto;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--text-tertiary);
}
.status {
  flex: 0 0 auto;
  width: 52px;
  font-size: 12px;
  color: var(--accent);
  text-align: right;
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

/* ===== 响应式 ===== */
@media (max-width: 960px) {
  .player-main {
    padding: 8px 22px 4px;
  }
  .player-hero {
    grid-template-columns: 1fr;
    gap: 22px;
    justify-items: center;
  }
  .disc {
    width: 190px;
    height: 190px;
  }
  .lyrics-zone {
    width: 100%;
    max-width: 620px;
  }
  .lyrics-box,
  .lyrics-empty {
    height: clamp(180px, 36vh, 340px);
  }
  .player-bar {
    padding: 4px 22px 14px;
  }
  .bar-info {
    max-width: 30%;
  }
}
@media (max-width: 560px) {
  .player-main {
    padding: 6px 12px 2px;
  }
  .disc {
    width: 150px;
    height: 150px;
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
  .ctrls-left {
    gap: 12px;
  }
  .ctrls-right {
    gap: 10px;
  }
  .ctrl {
    width: 42px;
    height: 42px;
  }
  .ctrls .play {
    width: 52px;
    height: 52px;
  }
  .time {
    min-width: 32px;
    font-size: 11px;
  }
  .list li {
    gap: 12px;
    padding: 12px 8px;
  }
  .duration {
    font-size: 11px;
  }
  .status {
    display: none;
  }
  .player-bar {
    padding: 4px 12px 10px;
  }
  .bar-info {
    gap: 8px;
    max-width: 32%;
  }
  .bar-cover {
    display: none;
  }
  .bar-title {
    font-size: 13px;
  }
  .bar-artist {
    font-size: 11px;
  }
}
@media (max-width: 380px) {
  .ctrls-left {
    gap: 8px;
  }
  .ctrl {
    width: 40px;
    height: 40px;
  }
  .ctrls .play {
    width: 50px;
    height: 50px;
  }
}
@media (max-height: 700px) {
  .disc {
    width: 180px;
    height: 180px;
  }
  .player-hero {
    gap: 16px;
  }
  .lyrics-box,
  .lyrics-empty {
    height: clamp(140px, 30vh, 260px);
  }
}
</style>
