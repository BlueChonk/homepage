<script setup>
import { ref, onMounted } from 'vue'
import { Image } from 'ant-design-vue'
import AppFooter from '../components/common/AppFooter.vue'

const all = ref([])
const loading = ref(true)

// 解析 JSON Lines
function parseJsonl(text) {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l))
}

async function loadManifest() {
  loading.value = true
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}album.jsonl`, { cache: 'no-cache' })
    const text = await res.text()
    all.value = parseJsonl(text).map((item) => ({
      src: item.url,
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
</script>

<template>
  <div class="album-page">
    <div v-if="loading" class="album-state">加载中…</div>

    <template v-else-if="all.length">
      <a-image-preview-group>
        <div class="album-grid">
          <a-image
            v-for="img in all"
            :key="img.name"
            :src="img.thumb || img.src"
            :preview="{ src: img.src }"
            :placeholder="true"
            class="album-card"
          />
        </div>
      </a-image-preview-group>
    </template>

    <div v-else class="album-state empty">
      <p>相册还是空的。</p>
      <p class="hint">把图片放进 <code>public/album/</code> 后运行 <code>npm run gen:manifest</code>。</p>
    </div>

    <AppFooter />
  </div>
</template>

<style scoped>
.album-page {
  min-height: 100%;
  color: var(--text);
  padding: 40px 32px 0;
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

/* 网格布局：默认每行 4 张；容器变窄时自动降为 3 / 2 / 1 张 */
.album-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  width: 100%;
  margin: 0 auto;
}

/* 卡片样式由 .ant-image 容器承担 */
.album-grid :deep(.ant-image) {
  margin: 0;
  border-radius: var(--radius-md);
  overflow: hidden;
  cursor: pointer;
  border: 1px solid var(--border);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  display: block;
  width: 100%;
  height: 100%;
  aspect-ratio: 1 / 1;
  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}
.album-grid :deep(.ant-image:hover) {
  transform: translateY(-4px);
  border-color: var(--accent-border);
  box-shadow: var(--shadow-md);
}

/* 中等屏：每行 3 张 */
@media (max-width: 1080px) {
  .album-grid { grid-template-columns: repeat(3, 1fr); }
}
/* 窄屏：每行 2 张 */
@media (max-width: 720px) {
  .album-grid { grid-template-columns: repeat(2, 1fr); }
}
/* 再窄：单列 */
@media (max-width: 480px) {
  .album-grid { grid-template-columns: 1fr; }
}

@media (max-width: 720px) {
  .album-page { padding: 24px 14px 0; }
}
@media (max-width: 480px) {
  .album-page { padding: 18px 12px 0; }
}

/* a-image 内部图片铺满卡片 */
.album-card {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;
}
.album-card:hover {
  transform: scale(1.06);
}

/* 骨架占位铺满卡片 */
.album-grid :deep(.ant-image-placeholder) {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}
.album-grid :deep(.ant-image-img-placeholder) {
  width: 100% !important;
  height: 100% !important;
  object-fit: cover;
}
</style>
