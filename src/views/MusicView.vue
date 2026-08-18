<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { usePlayer } from '../composables/usePlayer'
import { useLyrics } from '../composables/useLyrics'

const {
  tracks, loading, current, playing, progress, currentTime, duration,
  currentTrack, load, play, toggle, next, prev,
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
    if (!t.url) return
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

const lyricBoxRef = ref(null)
watch(activeIndex, () => {
  requestAnimationFrame(() => {
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
})

watch(tracks, () => probeDurations(), { immediate: true })

onUnmounted(() => {
  durationProbes.forEach((a) => a && (a.src = ''))
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
        <div class="player-hero">
          <div class="hero-left">
            <div class="disc" :class="{ spinning: playing }">
              <img v-if="coverSrc" :src="coverSrc" alt="" class="disc-cover" />
              <span v-else class="disc-note">♪</span>
            </div>
            <div v-if="resolving" class="resolving-hint">🔍 QQ 音乐解析中…</div>
            <div v-else-if="resolveError" class="resolve-error">⚠️ {{ resolveError }}</div>
          </div>

          <div class="lyrics-zone">
            <div class="lyrics-head">
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
  /* 底部留出全局播放器进度条空间 */
  padding-bottom: 6px;
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

.resolving-hint {
  margin-top: 12px;
  font-size: 13px;
  color: var(--accent);
  display: flex;
  align-items: center;
  gap: 6px;
}
.resolve-error {
  margin-top: 12px;
  font-size: 13px;
  color: var(--danger, #e5484d);
}

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
