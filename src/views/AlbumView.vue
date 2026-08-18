<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import AppFooter from '../components/AppFooter.vue'

const all = ref([])
const loading = ref(true)

function parseJsonl(text) {
  return text
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
}

async function loadManifest() {
  loading.value = true
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}album.jsonl`, { cache: 'no-cache' })
    const text = await res.text()
    all.value = parseJsonl(text).map((item) => ({
      src: item.url,
      thumb: item.thumb || item.url,
      name: item.name,
    }))
  } catch (e) {
    console.error('[album] 读取清单失败', e)
    all.value = []
  } finally {
    loading.value = false
  }
}

onMounted(loadManifest)

/* 轻量 Lightbox：原生实现，不依赖 Ant Design Vue Image 组件 */
const previewIndex = ref(-1)
const previewOpen = computed(() => previewIndex.value >= 0)

function openPreview(index) {
  previewIndex.value = index
  document.body.style.overflow = 'hidden'
}

function closePreview() {
  previewIndex.value = -1
  document.body.style.overflow = ''
}

function prevImage() {
  if (previewIndex.value > 0) previewIndex.value--
}

function nextImage() {
  if (previewIndex.value < all.value.length - 1) previewIndex.value++
}

function onKeydown(e) {
  if (!previewOpen.value) return
  if (e.key === 'Escape') closePreview()
  else if (e.key === 'ArrowLeft') prevImage()
  else if (e.key === 'ArrowRight') nextImage()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <div class="album-page">
    <div v-if="loading" class="album-state">加载中…</div>

    <template v-else-if="all.length">
      <div class="album-grid">
        <div
          v-for="(img, i) in all"
          :key="img.name"
          class="album-card"
          @click="openPreview(i)"
        >
          <img :src="img.thumb" :alt="img.name" loading="lazy" />
        </div>
      </div>
    </template>

    <div v-else class="album-state empty">
      <p>相册还是空的。</p>
      <p class="hint">把图片放进 <code>public/album/</code> 后运行 <code>npm run gen:manifest</code>。</p>
    </div>

    <AppFooter />

    <!-- 轻量 Lightbox -->
    <Transition name="lb-fade">
      <div v-if="previewOpen" class="lb-mask" @click.self="closePreview">
        <button class="lb-btn lb-close" @click="closePreview" aria-label="关闭">✕</button>
        <button v-if="previewIndex > 0" class="lb-btn lb-prev" @click.stop="prevImage" aria-label="上一张">‹</button>
        <img
          :src="all[previewIndex]?.src"
          :alt="all[previewIndex]?.name"
          class="lb-img"
          @click.stop
        />
        <button v-if="previewIndex < all.length - 1" class="lb-btn lb-next" @click.stop="nextImage" aria-label="下一张">›</button>
        <div class="lb-counter">{{ previewIndex + 1 }} / {{ all.length }}</div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.album-page {
  min-height: 100%;
  color: var(--text);
  padding: 40px 32px 96px;
  font-family: inherit;
}

.album-state {
  color: var(--text-tertiary);
  text-align: center;
  padding: 80px 0;
}
.album-state.empty .hint {
  font-size: 13px;
}
.album-state code {
  background: var(--subtle);
  padding: 1px 6px;
  border-radius: 6px;
  color: var(--text);
}

/* 网格布局 */
.album-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  width: 100%;
  margin: 0 auto;
}

.album-card {
  border-radius: var(--radius-md);
  overflow: hidden;
  cursor: pointer;
  border: 1px solid var(--border);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  aspect-ratio: 1 / 1;
  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}
.album-card:hover {
  transform: translateY(-4px);
  border-color: var(--accent-border);
  box-shadow: var(--shadow-md);
}
.album-card img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;
}
.album-card:hover img {
  transform: scale(1.06);
}

@media (max-width: 1080px) {
  .album-grid { grid-template-columns: repeat(3, 1fr); }
}
@media (max-width: 720px) {
  .album-grid { grid-template-columns: repeat(2, 1fr); }
  .album-page { padding: 24px 14px 0; }
}
@media (max-width: 480px) {
  .album-grid { grid-template-columns: 1fr; }
  .album-page { padding: 18px 12px 0; }
}

/* ===== Lightbox ===== */
.lb-mask {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0, 0, 0, 0.88);
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(8px);
}
.lb-img {
  max-width: 90vw;
  max-height: 86vh;
  object-fit: contain;
  border-radius: 4px;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.5);
}
.lb-btn {
  position: absolute;
  border: none;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease, transform 0.15s ease;
  backdrop-filter: blur(4px);
}
.lb-btn:hover {
  background: rgba(255, 255, 255, 0.22);
}
.lb-close {
  top: 20px;
  right: 20px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  font-size: 16px;
}
.lb-prev,
.lb-next {
  top: 50%;
  transform: translateY(-50%);
  width: 48px;
  height: 48px;
  border-radius: 50%;
  font-size: 28px;
  line-height: 1;
}
.lb-prev { left: 20px; }
.lb-next { right: 20px; }
.lb-prev:hover { transform: translateY(-50%) translateX(-3px); }
.lb-next:hover { transform: translateY(-50%) translateX(3px); }
.lb-counter {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.lb-fade-enter-active,
.lb-fade-leave-active {
  transition: opacity 0.2s ease;
}
.lb-fade-enter-from,
.lb-fade-leave-to {
  opacity: 0;
}

@media (max-width: 480px) {
  .lb-prev { left: 8px; width: 40px; height: 40px; font-size: 24px; }
  .lb-next { right: 8px; width: 40px; height: 40px; font-size: 24px; }
  .lb-close { top: 12px; right: 12px; }
}
</style>
