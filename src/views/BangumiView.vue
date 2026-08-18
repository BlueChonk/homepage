<script setup>
import { ref, computed, onMounted } from 'vue'
import AppFooter from '../components/AppFooter.vue'

/* ===== 数据 ===== */
const all = ref([])
const loading = ref(true)

/* 类别 tab：番剧 / 漫画 / 游戏 */
const activeCat = ref('anime')
const cats = [
  { key: 'anime', label: '番剧' },
  { key: 'manga', label: '漫画' },
  { key: 'game', label: '游戏' },
]

/* 状态筛选：全部 / 在看 / 想看 / 看过 */
const activeStatus = ref('all')
const statuses = [
  { key: 'all', label: '全部' },
  { key: 'doing', label: '在看' },
  { key: 'wish', label: '想看' },
  { key: 'done', label: '看过' },
]

const statusLabels = {
  wish: '想看',
  doing: '在看',
  done: '看过',
}

/* ===== JSONL 解析 ===== */
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

async function loadData() {
  loading.value = true
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}bangumi.jsonl`, { cache: 'no-cache' })
    const text = await res.text()
    all.value = parseJsonl(text)
  } catch (e) {
    console.error('[bangumi] 读取数据失败', e)
    all.value = []
  } finally {
    loading.value = false
  }
}

onMounted(loadData)

/* ===== 计算属性 ===== */
/** 按当前类别 + 状态筛选 */
const filtered = computed(() => {
  return all.value.filter((item) => {
    if (item.type !== activeCat.value) return false
    if (activeStatus.value !== 'all' && item.collection !== activeStatus.value) return false
    return true
  })
})

/** 各状态计数 */
const counts = computed(() => {
  const c = { anime: { all: 0, doing: 0, wish: 0, done: 0 }, manga: { all: 0, doing: 0, wish: 0, done: 0 }, game: { all: 0, doing: 0, wish: 0, done: 0 } }
  for (const item of all.value) {
    if (!c[item.type]) continue
    c[item.type].all++
    if (c[item.type][item.collection] !== undefined) c[item.type][item.collection]++
  }
  return c
})

const currentCounts = computed(() => counts.value[activeCat.value] || { all: 0, doing: 0, wish: 0, done: 0 })

/* ===== 详情弹窗 ===== */
const selectedItem = ref(null)

function openDetail(item) {
  selectedItem.value = item
}

function closeDetail() {
  selectedItem.value = null
}

/* ===== 工具函数 ===== */
function displayName(item) {
  return item.name_cn || item.name || `#${item.subject_id}`
}

function bangumiUrl(item) {
  return `https://bgm.tv/subject/${item.subject_id}`
}

function scoreColor(score) {
  if (score >= 8) return '#4f6ef7'
  if (score >= 6) return '#52c41a'
  if (score >= 4) return '#faad14'
  if (score > 0) return '#ff4d4f'
  return 'var(--text-tertiary)'
}

function formatDate(date) {
  if (!date) return ''
  return date
}
</script>

<template>
  <div class="bangumi-page">
    <!-- 标题 -->
    <div class="bgm-header">
      <h2 class="bgm-title">追番 · 追漫 · 游戏</h2>
      <p class="bgm-subtitle">来自 Bangumi 的收藏记录</p>
    </div>

    <!-- 类别 tab -->
    <div class="bgm-tabs">
      <button
        v-for="cat in cats"
        :key="cat.key"
        class="bgm-tab"
        :class="{ active: activeCat === cat.key }"
        @click="activeCat = cat.key; activeStatus = 'all'"
      >
        {{ cat.label }}
        <span class="bgm-tab-count">{{ counts[cat.key]?.all || 0 }}</span>
      </button>
    </div>

    <!-- 状态筛选 -->
    <div class="bgm-filters">
      <button
        v-for="st in statuses"
        :key="st.key"
        class="bgm-filter"
        :class="{ active: activeStatus === st.key }"
        @click="activeStatus = st.key"
      >
        {{ st.label }}
        <span class="bgm-filter-count">{{ currentCounts[st.key] || 0 }}</span>
      </button>
    </div>

    <!-- 加载中 -->
    <div v-if="loading" class="bgm-state">加载中…</div>

    <!-- 空状态 -->
    <div v-else-if="filtered.length === 0" class="bgm-state empty">
      <p>暂无数据</p>
      <p class="hint">请确认 <code>.env</code> 中已配置 BANGUMI_TOKEN 和 BANGUMI_USERNAME</p>
    </div>

    <!-- 卡片网格 -->
    <div v-else class="bgm-grid">
      <div
        v-for="item in filtered"
        :key="item.subject_id"
        class="bgm-card"
        @click="openDetail(item)"
      >
        <div class="bgm-card-cover">
          <img v-if="item.image" :src="item.image" :alt="displayName(item)" loading="lazy" />
          <span v-else class="bgm-cover-placeholder">♪</span>
          <span class="bgm-card-badge" :class="`badge-${item.collection}`">
            {{ statusLabels[item.collection] || item.collection }}
          </span>
          <span v-if="item.rate > 0" class="bgm-card-rate">
            ★ {{ item.rate }}
          </span>
        </div>
        <div class="bgm-card-info">
          <h3 class="bgm-card-name" :title="displayName(item)">{{ displayName(item) }}</h3>
          <div class="bgm-card-meta">
            <span v-if="item.date" class="bgm-meta-date">{{ formatDate(item.date) }}</span>
            <span v-if="item.score > 0" class="bgm-meta-score" :style="{ color: scoreColor(item.score) }">
              {{ item.score.toFixed(1) }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <AppFooter />

    <!-- 详情弹窗 -->
    <Transition name="bgm-detail">
      <div v-if="selectedItem" class="bgm-detail-mask" @click.self="closeDetail">
        <div class="bgm-detail-panel">
          <button class="bgm-detail-close" @click="closeDetail" aria-label="关闭">✕</button>
          <div class="bgm-detail-cover">
            <img v-if="selectedItem.image" :src="selectedItem.image" :alt="displayName(selectedItem)" />
            <span v-else class="bgm-cover-placeholder">♪</span>
          </div>
          <div class="bgm-detail-body">
            <div class="bgm-detail-head">
              <h3 class="bgm-detail-name">{{ displayName(selectedItem) }}</h3>
              <span v-if="selectedItem.name && selectedItem.name_cn" class="bgm-detail-orig">{{ selectedItem.name }}</span>
            </div>
            <div class="bgm-detail-tags">
              <span class="bgm-tag" :class="`badge-${selectedItem.collection}`">
                {{ statusLabels[selectedItem.collection] }}
              </span>
              <span v-if="selectedItem.date" class="bgm-tag">{{ selectedItem.date }}</span>
              <span v-if="selectedItem.eps > 0" class="bgm-tag">{{ selectedItem.eps }} 话</span>
              <span v-if="selectedItem.score > 0" class="bgm-tag" :style="{ color: scoreColor(selectedItem.score) }">
                ★ {{ selectedItem.score.toFixed(1) }}
              </span>
              <span v-if="selectedItem.rank > 0" class="bgm-tag">#{{ selectedItem.rank }}</span>
            </div>
            <div v-if="selectedItem.tags && selectedItem.tags.length" class="bgm-detail-user-tags">
              <span v-for="t in selectedItem.tags" :key="t" class="bgm-user-tag">{{ t }}</span>
            </div>
            <p v-if="selectedItem.comment" class="bgm-detail-comment">{{ selectedItem.comment }}</p>
            <p v-if="selectedItem.summary" class="bgm-detail-summary">{{ selectedItem.summary }}</p>
            <a :href="bangumiUrl(selectedItem)" target="_blank" rel="noopener" class="bgm-detail-link">
              在 Bangumi 查看 →
            </a>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.bangumi-page {
  min-height: 100%;
  width: 100%;
  padding: 40px 32px 0;
  box-sizing: border-box;
}

/* ===== 标题 ===== */
.bgm-header {
  margin-bottom: 24px;
}
.bgm-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--text);
  margin: 0 0 6px;
}
.bgm-subtitle {
  font-size: 14px;
  color: var(--text-tertiary);
  margin: 0;
}

/* ===== 类别 tab ===== */
.bgm-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
}
.bgm-tab {
  padding: 8px 18px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.18s ease;
  display: flex;
  align-items: center;
  gap: 6px;
}
.bgm-tab:hover {
  border-color: var(--accent-border);
  color: var(--text);
}
.bgm-tab.active {
  background: var(--accent-soft);
  border-color: var(--accent-border);
  color: var(--accent-strong);
  font-weight: 600;
}
.bgm-tab-count {
  font-size: 12px;
  opacity: 0.7;
  font-variant-numeric: tabular-nums;
}

/* ===== 状态筛选 ===== */
.bgm-filters {
  display: flex;
  gap: 6px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}
.bgm-filter {
  padding: 5px 12px;
  border: 1px solid var(--border-light);
  border-radius: 6px;
  background: transparent;
  color: var(--text-tertiary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  gap: 4px;
}
.bgm-filter:hover {
  border-color: var(--border);
  color: var(--text-secondary);
}
.bgm-filter.active {
  background: var(--surface);
  border-color: var(--accent);
  color: var(--accent-strong);
  font-weight: 600;
}
.bgm-filter-count {
  font-size: 11px;
  opacity: 0.6;
  font-variant-numeric: tabular-nums;
}

/* ===== 加载/空状态 ===== */
.bgm-state {
  color: var(--text-tertiary);
  text-align: center;
  padding: 80px 0;
}
.bgm-state.empty .hint {
  font-size: 13px;
  margin-top: 8px;
}
.bgm-state code {
  background: var(--subtle);
  padding: 1px 6px;
  border-radius: 6px;
  color: var(--text);
}

/* ===== 卡片网格 ===== */
.bgm-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 18px;
}

.bgm-card {
  border-radius: var(--radius-md);
  overflow: hidden;
  cursor: pointer;
  border: 1px solid var(--border);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}
.bgm-card:hover {
  transform: translateY(-4px);
  border-color: var(--accent-border);
  box-shadow: var(--shadow-md);
}

.bgm-card-cover {
  position: relative;
  aspect-ratio: 3 / 4;
  overflow: hidden;
  background: var(--bg-soft);
}
.bgm-card-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;
}
.bgm-card:hover .bgm-card-cover img {
  transform: scale(1.06);
}
.bgm-cover-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 36px;
  color: var(--text-tertiary);
}

/* 状态徽章 */
.bgm-card-badge {
  position: absolute;
  top: 6px;
  left: 6px;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  backdrop-filter: blur(4px);
}
.badge-wish { background: rgba(250, 173, 20, 0.85); }
.badge-doing { background: rgba(79, 110, 247, 0.85); }
.badge-done { background: rgba(82, 196, 26, 0.85); }

/* 评分 */
.bgm-card-rate {
  position: absolute;
  top: 6px;
  right: 6px;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
}

.bgm-card-info {
  padding: 10px 12px 12px;
}
.bgm-card-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  margin: 0 0 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bgm-card-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--text-tertiary);
}
.bgm-meta-score {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

/* ===== 详情弹窗 ===== */
.bgm-detail-mask {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.bgm-detail-panel {
  position: relative;
  width: min(680px, 100%);
  max-height: 86vh;
  overflow-y: auto;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
}
.bgm-detail-close {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 3;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, 0.3);
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease;
}
.bgm-detail-close:hover {
  background: rgba(0, 0, 0, 0.5);
}

.bgm-detail-cover {
  width: 100%;
  aspect-ratio: 3 / 2;
  overflow: hidden;
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  background: var(--bg-soft);
  display: flex;
  align-items: center;
  justify-content: center;
}
.bgm-detail-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.bgm-detail-cover .bgm-cover-placeholder {
  position: static;
  font-size: 48px;
}

.bgm-detail-body {
  padding: 20px 24px 24px;
}
.bgm-detail-head {
  margin-bottom: 12px;
}
.bgm-detail-name {
  font-size: 20px;
  font-weight: 700;
  color: var(--text);
  margin: 0 0 4px;
}
.bgm-detail-orig {
  font-size: 13px;
  color: var(--text-tertiary);
}

.bgm-detail-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}
.bgm-tag {
  padding: 3px 10px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  background: var(--surface-hover);
  color: var(--text-secondary);
}
.bgm-detail-user-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 14px;
}
.bgm-user-tag {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  background: var(--accent-soft);
  color: var(--accent-strong);
}

.bgm-detail-comment {
  font-size: 14px;
  color: var(--text);
  line-height: 1.6;
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  background: var(--surface-hover);
  margin: 0 0 12px;
}
.bgm-detail-summary {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.7;
  margin: 0 0 16px;
}
.bgm-detail-link {
  display: inline-block;
  font-size: 13px;
  color: var(--accent);
  text-decoration: none;
  font-weight: 500;
  transition: color 0.15s ease;
}
.bgm-detail-link:hover {
  color: var(--accent-strong);
}

/* 弹窗动画 */
.bgm-detail-enter-active,
.bgm-detail-leave-active {
  transition: opacity 0.2s ease;
}
.bgm-detail-enter-from,
.bgm-detail-leave-to {
  opacity: 0;
}

/* ===== 响应式 ===== */
@media (max-width: 1080px) {
  .bgm-grid { grid-template-columns: repeat(4, 1fr); }
}
@media (max-width: 840px) {
  .bgm-grid { grid-template-columns: repeat(3, 1fr); }
}
@media (max-width: 768px) {
  .bangumi-page { padding: 24px 16px 0; }
  .bgm-title { font-size: 20px; }
}
@media (max-width: 600px) {
  .bgm-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
  .bgm-tabs { gap: 6px; }
  .bgm-tab { padding: 6px 14px; font-size: 13px; }
  .bgm-detail-panel { flex-direction: column; }
  .bgm-detail-cover { aspect-ratio: 3 / 1.5; }
}
@media (max-width: 380px) {
  .bgm-grid { grid-template-columns: 1fr; }
}
</style>
