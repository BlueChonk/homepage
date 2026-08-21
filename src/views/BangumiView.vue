<script setup>
import { ref, computed, watch, reactive, onMounted } from 'vue'
import AppFooter from '../components/AppFooter.vue'

/* ===== 按需分页配置 ===== */
const BGM_API = 'https://api.bgm.tv'
const UA = 'BlueChonk/homepage (https://github.com/BlueChonk/homepage)'
const PAGE_SIZE = 30 // 每次请求拉取条数（API limit 上限 50），一次只渲染当前页

/* 类别 tab：番剧 / 漫画 / 游戏（subject_type: 1=书籍含漫画, 2=动画, 4=游戏） */
const activeCat = ref('anime')
const cats = [
  { key: 'anime', subjectType: 2, label: '番剧' },
  { key: 'manga', subjectType: 1, label: '漫画' },
  { key: 'game', subjectType: 4, label: '游戏' },
]

/* 状态筛选：全部 / 在看 / 想看 / 看过（type: 1=想看, 2=看过, 3=在看） */
const activeStatus = ref('all')
const statuses = [
  { key: 'all', label: '全部', type: null },
  { key: 'doing', label: '在看', type: 3 },
  { key: 'wish', label: '想看', type: 1 },
  { key: 'done', label: '看过', type: 2 },
]

const statusLabels = {
  wish: '想看',
  doing: '在看',
  done: '看过',
}

const catOf = (key) => cats.find((c) => c.key === key)
const statusOf = (key) => statuses.find((s) => s.key === key)

/* ===== 状态 ===== */
const BANGUMI_USERNAME = '799398'
const username = ref('')       // 硬编码，公开信息
const items = ref([])          // 当前类别+状态已分页加载的条目
const total = ref(0)           // 当前请求维度的总数
const loading = ref(true)      // 首次/切换加载
const loadingMore = ref(false) // 加载更多分页
const configMissing = ref(false)
const error = ref('')
const searchQuery = ref('')    // 搜索关键词
const searchResults = ref([])  // 搜索结果
const searching = ref(false)   // 搜索中

/* 类别 tab 与状态筛选的计数（按需、分页后从服务端 total 读取） */
const categoryTotals = reactive({ anime: null, manga: null, game: null })
const statusCounts = ref({ all: 0, doing: 0, wish: 0, done: 0 })

function apiHeaders() {
  return { 'User-Agent': UA, Accept: 'application/json' }
}

/* 单次请求超时：避免 api.bgm.tv 在 DNS 污染/路由被过滤的网络下无限挂起 */
const REQ_TIMEOUT = 8000
function withTimeout(promise, ms = REQ_TIMEOUT) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ])
}

/* 请求路由：直连优先，失败则转经公共代理（allorigins）绕过 api.bgm.tv 连接超时 */
const BGM_ROUTES = [
  (direct) => direct,
  (direct) => `https://api.allorigins.win/raw?url=${encodeURIComponent(direct)}`,
]

/* 带分页调用收藏接口。查看公开收藏无需 token。 */
async function fetchCollectionPage(catKey, statusKey, offset, limit = PAGE_SIZE) {
  const cat = catOf(catKey)
  const st = statusOf(statusKey)
  const q = new URLSearchParams()
  q.set('subject_type', cat.subjectType)
  if (st.type) q.set('type', st.type)
  q.set('limit', String(limit))
  q.set('offset', String(offset))
  const direct = `${BGM_API}/v0/users/${encodeURIComponent(username.value)}/collections?${q}`
  let lastErr
  for (const build of BGM_ROUTES) {
    try {
      const res = await withTimeout(fetch(build(direct), { headers: apiHeaders() }))
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
      return res.json() // { total, limit, offset, data }
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr || new Error('所有请求路由均失败')
}

/* 把 API 的集合项映射为前端展示对象（含内联的 subject 精简信息） */
function mapCollectionItem(item, catKey) {
  const s = item.subject || {}
  const images = s.images || {}
  return {
    subject_id: item.subject_id || s.id,
    type: catKey,
    collection: ({ 1: 'wish', 2: 'done', 3: 'doing' }[item.type] || 'other'),
    rate: item.rate || 0,
    comment: item.comment || '',
    tags: item.tags || [],
    ep_status: item.ep_status || 0,
    vol_status: item.vol_status || 0,
    updated_at: item.updated_at || '',
    name: s.name || '',
    name_cn: s.name_cn || '',
    summary: s.short_summary || '',
    date: s.date || '',
    eps: s.eps || 0,
    volumes: s.volumes || 0,
    score: s.score || 0,
    rank: s.rank || 0,
    image: images.common || images.large || images.medium || images.grid || '',
  }
}

/* 加载首页（切换类别/状态时调用） */
async function loadFirstPage() {
  loading.value = true
  error.value = ''
  try {
    const json = await fetchCollectionPage(activeCat.value, activeStatus.value, 0)
    items.value = json.data.map((it) => mapCollectionItem(it, activeCat.value))
    total.value = json.total || 0
    if (statusOf(activeStatus.value).type == null) categoryTotals[activeCat.value] = json.total
  } catch (e) {
    items.value = []
    total.value = 0
    error.value = `拉取失败：${e.message}`
  } finally {
    loading.value = false
  }
}

/* 加载更多（offset 分页追加） */
async function loadMore() {
  if (loading.value || loadingMore.value) return
  if (items.value.length >= total.value) return
  loadingMore.value = true
  try {
    const json = await fetchCollectionPage(activeCat.value, activeStatus.value, items.value.length)
    items.value.push(...json.data.map((it) => mapCollectionItem(it, activeCat.value)))
  } catch (e) {
    /* 静默失败，保留已加载数据 */
  } finally {
    loadingMore.value = false
  }
}

const hasMore = computed(() => !loading.value && items.value.length > 0 && items.value.length < total.value)

/* 当前类别各状态计数（limit=1 仅取 total，轻量请求） */
async function loadStatusCounts() {
  const catsCount = activeCat.value
  const jobs = statuses.map(async (st) => {
    try {
      const json = await fetchCollectionPage(catsCount, st.key, 0, 1)
      return { key: st.key, value: json.total || 0 }
    } catch {
      return { key: st.key, value: 0 }
    }
  })
  const res = await Promise.all(jobs)
  statusCounts.value = res.reduce((acc, { key, value }) => ({ ...acc, [key]: value }), { all: 0, doing: 0, wish: 0, done: 0 })
}

/* bangumi-api 搜索：使用 /v0/search/subjects 实时搜索 */
async function searchBangumi(keyword) {
  if (!keyword || !keyword.trim()) {
    searchResults.value = []
    return
  }
  searching.value = true
  try {
    const cat = catOf(activeCat.value)
    const body = { keyword: keyword.trim(), type: cat.subjectType }
    let lastErr
    for (const build of BGM_ROUTES) {
      try {
        const direct = `${BGM_API}/v0/search/subjects`
        const res = await withTimeout(fetch(build(direct), {
          method: 'POST',
          headers: { ...apiHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }))
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        searchResults.value = (json.data || []).map((item) => ({
          subject_id: item.id,
          type: activeCat.value,
          name: item.name || '',
          name_cn: item.name_cn || '',
          summary: item.summary || '',
          date: item.date || '',
          eps: item.eps || 0,
          score: item.score || 0,
          rank: item.rank || 0,
          image: item.images?.common || item.images?.large || item.images?.medium || '',
          collection: 'search',
        }))
        return
      } catch (e) {
        lastErr = e
      }
    }
    throw lastErr || new Error('搜索失败')
  } catch (e) {
    searchResults.value = []
    error.value = `搜索失败：${e.message}`
  } finally {
    searching.value = false
  }
}

function clearSearch() {
  searchQuery.value = ''
  searchResults.value = []
}

/* 首次进入：三个分类并行请求，按需分页加载 */
async function init() {
  loading.value = true
  username.value = BANGUMI_USERNAME
  configMissing.value = !username.value
  if (!username.value) {
    loading.value = false
    return
  }
  const cats = ['anime', 'manga', 'game']
  const results = await Promise.all(cats.map((cat) => fetchCollectionPage(cat.key, 'all', 0)))
  const allItems = results.flatMap((json, i) => json.data.map((it) => mapCollectionItem(it, cats[i].key)))
  const allTotals = results.map((json) => json.total || 0)
  items.value = allItems
  total.value = allTotals.reduce((a, b) => a + b, 0)
  categoryTotals.value = cats.reduce((acc, cat, i) => ({ ...acc, [cat.key]: allTotals[i] }), { anime: null, manga: null, game: null })
  statusCounts.value = { all: total.value, doing: 0, wish: 0, done: 0 }
  await loadStatusCounts()
  loading.value = false
}

let inited = false
onMounted(() => {
  init()
  inited = true
})

/* 切分类别/状态时按需重新请求 */
watch([activeCat, activeStatus], () => {
  if (!inited || !username.value) return
  loadFirstPage()
  loadStatusCounts()
})

/* ===== 暴露 reload 方法供下拉刷新调用 ===== */
defineExpose({ reload: init })

/* ===== 详情弹窗 ===== */
const selectedItem = ref(null)
const detailImgFailed = ref(false)

function openDetail(item) {
  selectedItem.value = item
  detailImgFailed.value = false
}

function closeDetail() {
  selectedItem.value = null
  detailImgFailed.value = false
}

/* 封面图加载失败（lain.bgm.tv 封面 CDN 可能受网络限制）→ 显示占位符 */
const failedImgs = ref(new Set())
function markImgFailed(id) {
  if (id == null) return
  const next = new Set(failedImgs.value)
  next.add(id)
  failedImgs.value = next
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
        <span class="bgm-tab-count">{{ categoryTotals[cat.key] ?? '–' }}</span>
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
        <span class="bgm-filter-count">{{ statusCounts[st.key] || 0 }}</span>
      </button>
    </div>

    <!-- 配置缺失 -->
    <div v-if="configMissing" class="bgm-state empty">
      <p>未配置 Bangumi 用户名</p>
      <p class="hint">请在构建环境设置 <code>BANGUMI_USERNAME</code></p>
      <p class="hint">本页面将在进入时按需分页请求 api.bgm.tv，不再一次性拉取全部数据</p>
    </div>

    <!-- 加载中 -->
    <div v-else-if="loading" class="bgm-state">加载中…</div>

    <!-- 请求出错 -->
    <div v-else-if="error && !searchResults.length" class="bgm-state empty">
      <p>加载失败</p>
      <p class="hint">{{ error }}</p>
    </div>

    <!-- 搜索栏 -->
    <div class="bgm-search">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="搜索番剧 / 漫画 / 游戏..."
        class="bgm-search-input"
        @keyup.enter="searchBangumi(searchQuery)"
      />
      <button class="bgm-search-btn" @click="searchBangumi(searchQuery)" :disabled="searching">
        {{ searching ? '搜索中...' : '搜索' }}
      </button>
      <button v-if="searchResults.length" class="bgm-search-clear" @click="clearSearch">清除</button>
    </div>

    <!-- 搜索结果 -->
    <div v-if="searchResults.length" class="bgm-grid">
      <div
        v-for="item in searchResults"
        :key="'search-' + item.subject_id"
        class="bgm-card"
        @click="openDetail(item)"
      >
        <div class="bgm-card-cover">
          <img v-if="item.image && !failedImgs.has(item.subject_id)" :src="item.image" :alt="displayName(item)" loading="lazy" @error="markImgFailed(item.subject_id)" />
          <span v-else class="bgm-cover-placeholder">♪</span>
          <span class="bgm-card-badge">搜索</span>
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

    <!-- 空状态 -->
    <div v-else-if="items.length === 0" class="bgm-state empty">
      <p>暂无数据</p>
    </div>

    <!-- 卡片网格（分页渲染：只渲染已加载页） -->
    <div v-else class="bgm-grid">

    <!-- 加载更多（分页） -->
    <div v-if="hasMore || loadingMore" class="bgm-loadmore">
      <button v-if="hasMore" class="bgm-loadmore-btn" :disabled="loadingMore" @click="loadMore">
        {{ loadingMore ? '加载中…' : '加载更多' }}
      </button>
      <span v-else class="bgm-loadmore-tip">加载中…</span>
    </div>

    <AppFooter />

    <!-- 详情弹窗 -->
    <Transition name="bgm-detail">
      <div v-if="selectedItem" class="bgm-detail-mask" @click.self="closeDetail">
        <div class="bgm-detail-panel">
          <button class="bgm-detail-close" @click="closeDetail" aria-label="关闭">✕</button>
          <div class="bgm-detail-cover">
            <img v-if="selectedItem.image && !detailImgFailed" :src="selectedItem.image" :alt="displayName(selectedItem)" @error="detailImgFailed = true" />
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

/* ===== 搜索栏 ===== */
.bgm-search {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
}
.bgm-search-input {
  flex: 1;
  padding: 8px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  font-size: 14px;
  outline: none;
  transition: border-color 0.15s ease;
}
.bgm-search-input:focus {
  border-color: var(--accent-border);
}
.bgm-search-btn {
  padding: 8px 18px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--accent-soft);
  color: var(--accent-strong);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}
.bgm-search-btn:hover {
  background: var(--accent-border);
}
.bgm-search-btn:disabled {
  opacity: 0.6;
  cursor: default;
}
.bgm-search-clear {
  padding: 8px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.bgm-search-clear:hover {
  border-color: var(--accent-border);
  color: var(--accent);
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

/* ===== 加载更多 ===== */
.bgm-loadmore {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px 0 8px;
}
.bgm-loadmore-btn {
  padding: 8px 28px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.18s ease;
}
.bgm-loadmore-btn:hover {
  border-color: var(--accent-border);
  color: var(--accent-strong);
}
.bgm-loadmore-btn:disabled {
  opacity: 0.6;
  cursor: default;
}
.bgm-loadmore-tip {
  font-size: 13px;
  color: var(--text-tertiary);
}

/* ===== 卡片网格：最少 2 列、最多 5 列，根据设备宽度自适应 ===== */
.bgm-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr); /* 大屏最多 5 列 */
  gap: 18px;
}
@media (max-width: 1200px) {
  .bgm-grid { grid-template-columns: repeat(4, 1fr); }
}
@media (max-width: 960px) {
  .bgm-grid { grid-template-columns: repeat(3, 1fr); }
}
@media (max-width: 760px) {
  .bgm-grid { grid-template-columns: repeat(2, 1fr); } /* 小屏最少 2 列 */
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
@media (max-width: 768px) {
  .bangumi-page { padding: 24px 16px 0; }
  .bgm-title { font-size: 20px; }
}
@media (max-width: 600px) {
  /* gap 改为 12px（列数沿用上面断点，最小 2 列） */
  .bgm-grid { gap: 12px; }
  .bgm-tabs { gap: 6px; }
  .bgm-tab { padding: 6px 14px; font-size: 13px; }
  .bgm-detail-panel { flex-direction: column; }
  .bgm-detail-cover { aspect-ratio: 3 / 1.5; }
}
</style>
