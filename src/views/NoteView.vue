<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import MarkdownPreview from '../components/MarkdownPreview.vue'
import AppFooter from '../components/AppFooter.vue'

/* ===== 状态 ===== */
const records = ref([])
const loading = ref(true)
const error = ref('')

const activeRecordId = ref('')
const content = ref('')
const contentLoading = ref(false)

const detailRef = ref(null)
const tocItems = ref([])
const activeTocId = ref('')
const tocOpen = ref(false)

const showBackTop = ref(false)
function onBodyScroll() {
  const body = document.querySelector('.app-body')
  if (!body) return
  showBackTop.value = isListView.value ? false : body.scrollTop > 320
}
function scrollToTop() {
  const body = document.querySelector('.app-body')
  if (body) body.scrollTo({ top: 0, behavior: 'smooth' })
}

/* ===== 解析 JSON Lines ===== */
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

/* ===== 计算属性 ===== */
const recordMap = computed(() => {
  const m = new Map()
  for (const p of records.value) m.set(p.id, p)
  return m
})

const activeRecord = computed(() => recordMap.value.get(activeRecordId.value) || null)
const isListView = computed(() => !activeRecordId.value)

/* ===== 详情 ===== */
async function openRecord(record) {
  activeRecordId.value = record.id
  content.value = ''
  contentLoading.value = true
  tocItems.value = []
  activeTocId.value = ''
  tocOpen.value = false
  try {
    const res = await fetch(encodeURI(record.file), { cache: 'no-cache' })
    if (!res.ok) throw new Error(`记录加载失败 (${res.status})`)
    content.value = await res.text()
    await nextTick()
    buildToc()
  } catch (e) {
    content.value = `# 加载失败\n\n${e.message}`
  } finally {
    contentLoading.value = false
  }
}

function backToList() {
  activeRecordId.value = ''
  content.value = ''
  tocItems.value = []
  activeTocId.value = ''
  tocOpen.value = false
}

/* ===== 目录（TOC）与滚动高亮 ===== */
let tocObserver = null
let tocBuildObserver = null

function buildToc() {
  if (tocBuildObserver) { tocBuildObserver.disconnect(); tocBuildObserver = null }
  const root = detailRef.value
  const previewEl = root?.querySelector('.md-render-inner')
  if (!previewEl) {
    // MarkdownPreview 异步渲染（Shiki 高亮），等出现标题后再构建
    if (tocBuildObserver) tocBuildObserver.disconnect()
    tocBuildObserver = new MutationObserver((_m, obs) => {
      if (detailRef.value?.querySelector('.md-render-inner h1, .md-render-inner h2, .md-render-inner h3')) {
        obs.disconnect()
        buildToc()
      }
    })
    tocBuildObserver.observe(root || document.body, { childList: true, subtree: true })
    return
  }

  const headings = previewEl.querySelectorAll('h1[id], h2[id], h3[id]')
  const items = []
  headings.forEach((el) => {
    const text = el.textContent.trim()
    if (!text || !el.id) return
    items.push({ id: el.id, text, level: parseInt(el.tagName[1]) })
  })
  tocItems.value = items
  nextTick(() => setupScrollSpy(previewEl))
}

function setupScrollSpy(container) {
  if (tocObserver) tocObserver.disconnect()
  const headings = container.querySelectorAll('h1[id], h2[id], h3[id]')
  if (!headings.length) return
  const root = document.querySelector('.app-body')
  if (!root) return
  tocObserver = new IntersectionObserver(
    (entries) => {
      let lastId = ''
      entries.forEach((entry) => {
        if (entry.isIntersecting) lastId = entry.target.id
      })
      if (lastId) activeTocId.value = lastId
    },
    {
      root,
      rootMargin: '-96px 0px -62% 0px',
      threshold: 0,
    }
  )
  headings.forEach((h) => tocObserver.observe(h))
}

function scrollToToc(id) {
  const el = document.getElementById(id)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  tocOpen.value = false
}

/* ===== 外链处理 ===== */
function externalizeLinks(root) {
  if (!root) return
  root.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href') || ''
    if (/^(#|mailto:|tel:|javascript:)/i.test(href)) return
    let external = true
    try {
      const u = new URL(href, location.href)
      external = u.origin !== location.origin
    } catch {
      external = false
    }
    if (external) {
      a.setAttribute('target', '_blank')
      a.setAttribute('rel', 'noopener noreferrer')
    }
  })
}

function onMdRendered(e) {
  const root = e.currentTarget
  if (!root) return
  externalizeLinks(root)
  nextTick(buildToc)
}

/* ===== 列表滚动 ===== */
async function loadNoteList() {
  loading.value = true
  error.value = ''
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}note.jsonl`, { cache: 'no-cache' })
    if (!res.ok) throw new Error(`清单加载失败 (${res.status})`)
    records.value = parseJsonl(await res.text())
  } catch (e) {
    error.value = e.message || '加载失败'
  } finally {
    loading.value = false
  }
}

/* 暴露 reload 方法供下拉刷新调用 */
defineExpose({ reload: loadNoteList })

onMounted(loadNoteList)

onMounted(() => {
  const body = document.querySelector('.app-body')
  if (body) {
    body.addEventListener('scroll', onBodyScroll, { passive: true })
    onBodyScroll()
  }
})

watch(isListView, (list) => {
  if (list) showBackTop.value = false
})

onUnmounted(() => {
  if (tocObserver) tocObserver.disconnect()
  if (tocBuildObserver) tocBuildObserver.disconnect()
  const body = document.querySelector('.app-body')
  if (body) body.removeEventListener('scroll', onBodyScroll)
})
</script>

<template>
  <div class="note-page">
    <!-- ===== 笔记列表视图 ===== -->
    <div v-show="isListView" class="note-list-view">
      <div v-if="loading" class="list-loading">
        <span class="loader-dot" /><span>加载中…</span>
      </div>
      <div v-else-if="error" class="list-error">{{ error }}</div>

      <template v-else>
        <div class="card-list">
          <article
            v-for="record in records"
            :key="record.id"
            class="record-card"
            @click="openRecord(record)"
          >
            <h3 class="card-title">
              <span class="card-title-bar" aria-hidden="true"></span>
              <span class="card-title-text">{{ record.title }}</span>
            </h3>
            <div class="card-meta">
              <span v-if="record.date" class="meta-date">{{ record.date }}</span>
              <span v-if="record.wordCount" class="meta-words">{{ record.wordCount.toLocaleString('en-US') }} 字</span>
            </div>
            <div v-if="record.excerpt" class="card-excerpt">
              <MarkdownPreview :source="record.excerpt" variant="note-excerpt" class="card-excerpt-md" />
            </div>
            <span class="card-chevron" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </span>
          </article>
        </div>

        <div v-if="!records.length" class="list-empty">暂无记录</div>
      </template>
    </div>

    <!-- ===== 笔记详情视图 ===== -->
    <section v-if="activeRecord && !isListView" ref="detailRef" class="note-detail">
      <div class="detail-topbar">
        <button class="back-btn" @click="backToList">&larr; 返回列表</button>
        <span class="detail-title">{{ activeRecord.title }}</span>
      </div>

      <div class="detail-layout">
        <article class="doc-main">
          <div v-if="contentLoading" class="detail-loading">
            <span class="loader-dot" /><span>正在加载记录…</span>
          </div>

          <MarkdownPreview
            v-else
            :source="content"
            variant="note"
            class="md-body"
            @md-rendered="onMdRendered"
          />
        </article>

        <aside v-if="tocItems.length" class="toc-sidebar">
          <button
            type="button"
            class="toc-toggle"
            :aria-expanded="tocOpen"
            aria-controls="toc-nav"
            @click="tocOpen = !tocOpen"
          >
            <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
              <path fill="currentColor" d="M3 5h12v2H3zm0 6h12v2H3zm0 6h8v2H3zm15-9h4v2h-4zm-2 9l-5-5 1.4-1.4L17 14.6l4.6-4.6L23 11.4z" />
            </svg>
            <span class="toc-toggle-text">目录</span>
            <span class="toc-count">{{ tocItems.length }}</span>
            <svg
              class="toc-chevron"
              :class="{ open: tocOpen }"
              viewBox="0 0 24 24"
              width="14"
              height="14"
              aria-hidden="true"
            >
              <path fill="currentColor" d="M7.4 8.6 12 13.2l4.6-4.6L18 10l-6 6-6-6z" />
            </svg>
          </button>

          <Transition name="toc-drop">
            <nav v-show="tocOpen" id="toc-nav" class="toc-nav">
              <a
                v-for="item in tocItems"
                :key="item.id"
                href="#"
                class="toc-item"
                :class="[`toc-level-${item.level}`, { active: item.id === activeTocId }]"
                @click.prevent="scrollToToc(item.id)"
              >
                <i class="toc-dot" aria-hidden="true"></i>
                <span class="toc-label">{{ item.text }}</span>
              </a>
            </nav>
          </Transition>
        </aside>
      </div>

      <transition name="bt-fade">
        <button v-if="showBackTop" class="back-top-btn" @click="scrollToTop" title="返回顶部">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M12 5l-7 7h4v7h6v-7h4z" fill="currentColor" />
          </svg>
        </button>
      </transition>
    </section>

    <!-- 全局页脚：列表与详情两种视图共用 -->
    <AppFooter />
  </div>
</template>

<style scoped>
/* ===== 容器 ===== */
.note-page {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  width: 100%;
}

/* ===== 列表视图 ===== */
.note-list-view {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  padding: 40px 36px 16px;
  max-width: 920px;
  margin: 0 auto;
  width: 100%;
}

.list-loading, .list-error, .list-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 64px 24px;
  color: var(--text-tertiary);
  font-size: 15px;
}
.loader-dot {
  width: 12px; height: 12px;
  border-radius: 50%;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  animation: spin 0.8s linear infinite;
  display: inline-block;
}
@keyframes spin { to { transform: rotate(360deg); } }
.list-error { color: #e5484d; }

.card-list { display: flex; flex-direction: column; gap: 14px; }

.record-card {
  position: relative;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 22px 26px 20px;
  cursor: pointer;
  transition: all 0.22s ease;
  overflow: hidden;
}
.record-card:hover {
  border-color: var(--accent-border);
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}
.card-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 17px;
  font-weight: 600;
  line-height: 1.45;
  color: var(--text);
  margin-bottom: 8px;
  transition: color 0.2s ease;
  overflow-wrap: anywhere;
}
.card-title-bar {
  flex: 0 0 auto;
  width: 4px;
  height: 1.1em;
  border-radius: 999px;
  background: linear-gradient(180deg, var(--accent), var(--accent-strong));
  box-shadow: 0 0 8px var(--accent-soft);
}
.card-title-text {
  min-width: 0;
  overflow-wrap: anywhere;
  padding-right: 44px;
}
.record-card:hover .card-title { color: var(--accent-strong); }
.card-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  font-size: 12px;
}
.meta-date { color: var(--text-tertiary); }
.meta-words {
  display: inline-flex;
  align-items: center;
  color: var(--text-tertiary);
}
.meta-words::before {
  content: "";
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--border);
  margin-right: 10px;
}
.card-excerpt {
  font-size: 14px;
  line-height: 1.65;
  color: var(--text-secondary);
  padding-right: 44px;
  overflow-wrap: anywhere;
}
.card-excerpt-md :deep(.md-render-inner) {
  background: transparent;
  padding: 0;
  font-size: 14px;
  line-height: 1.65;
  color: var(--text-secondary);
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.card-excerpt-md :deep(.md-render-inner > :first-child) { margin-top: 0; }
.card-excerpt-md :deep(.md-render-inner > :last-child) { margin-bottom: 0; }
.card-excerpt-md :deep(.md-render-inner p) { margin: 0; }
.card-excerpt-md :deep(.md-render-inner a) {
  color: var(--accent-strong);
  text-decoration: none;
  border-bottom: 1px solid var(--accent-border);
}
.card-excerpt-md :deep(.md-render-inner strong),
.card-excerpt-md :deep(.md-render-inner code) {
  color: var(--text);
}
/* 右侧 “>” 图标：悬停时变为主题色圆钮 */
.card-chevron {
  position: absolute;
  right: 20px;
  top: 50%;
  transform: translateY(-50%);
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s ease, background 0.2s ease, border-color 0.2s ease,
    transform 0.2s ease, box-shadow 0.2s ease;
}
.card-chevron svg {
  width: 15px;
  height: 15px;
}
.record-card:hover .card-chevron {
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-strong));
  border-color: transparent;
  box-shadow: 0 4px 14px var(--accent-soft);
  transform: translateY(-50%) translateX(2px);
}

/* ===== 详情视图 ===== */
.note-detail {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.detail-topbar {
  max-width: calc(var(--note-max) + 240px + 40px);
  margin: 0 auto;
  width: 100%;
  padding: 20px 24px 0;
  display: flex;
  align-items: center;
  gap: 16px;
}
.detail-title {
  font-size: 14px;
  color: var(--text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.back-btn {
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  background: var(--surface);
  border: 1px solid var(--border);
  padding: 7px 16px;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.18s ease;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
}
.back-btn:hover {
  color: var(--accent);
  border-color: var(--accent-border);
  background: var(--accent-soft);
}

.detail-layout {
  display: grid;
  grid-template-columns: minmax(0, var(--note-max)) 240px;
  gap: 36px;
  align-items: start;
  justify-content: center;
  width: 100%;
  padding: 24px 24px 24px;
}

.doc-main {
  position: relative;
  max-width: var(--note-max);
  width: 100%;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 44px 52px 60px;
  box-shadow: var(--shadow-md);
}
.doc-main::before {
  content: "";
  position: absolute;
  left: 0; right: 0; top: 0;
  height: 3px;
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  background: linear-gradient(90deg, transparent, var(--accent), transparent);
  opacity: 0.8;
}

.detail-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 80px 24px;
  color: var(--text-tertiary);
}

/* ---- 目录 ---- */
.toc-sidebar {
  position: sticky;
  top: 88px;
  align-self: start;
  max-height: calc(100vh - 120px);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 18px 14px 20px;
  overflow-y: auto;
  box-shadow: var(--shadow-sm);
}
/* 目录滚动条与全站设计一致（渐变细条） */
.toc-sidebar,
.toc-nav {
  scrollbar-width: thin;
  scrollbar-color: var(--accent) transparent;
}
.toc-sidebar::-webkit-scrollbar,
.toc-nav::-webkit-scrollbar {
  width: 8px;
}
.toc-sidebar::-webkit-scrollbar-track,
.toc-nav::-webkit-scrollbar-track {
  background: transparent;
}
.toc-sidebar::-webkit-scrollbar-thumb,
.toc-nav::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, var(--accent), var(--accent-strong));
  border-radius: 999px;
  border: 2px solid transparent;
  background-clip: padding-box;
}
.toc-sidebar::-webkit-scrollbar-thumb:hover,
.toc-nav::-webkit-scrollbar-thumb:hover {
  background: var(--accent-strong);
  background-clip: padding-box;
  border: 2px solid transparent;
}
.toc-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  border: none;
  background: transparent;
  font-family: inherit;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--text-tertiary);
  padding: 0 8px 12px;
  cursor: default;
}
.toc-count,
.toc-chevron {
  display: none;
}
.toc-nav { display: flex; flex-direction: column; gap: 2px; }
.toc-item {
  font-family: inherit;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-secondary);
  text-decoration: none;
  padding: 6px 12px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  transition: color 0.16s ease, background 0.16s ease;
}
/* 位置指示点：位于文字左侧、与文字行内对齐，高亮时文字不会移位 */
.toc-dot {
  flex: 0 0 auto;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: transparent;
  transition: background 0.16s ease, box-shadow 0.16s ease;
}
.toc-label {
  flex: 1 1 auto;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.toc-item:hover {
  color: var(--accent);
  background: var(--accent-soft);
}
.toc-item:hover .toc-dot {
  background: var(--accent-border);
}
.toc-item.active {
  color: var(--accent-strong);
  background: var(--accent-soft);
  font-weight: 600;
}
.toc-item.active .toc-dot {
  background: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.toc-level-3 { padding-left: 26px; font-size: 12.5px; }

/* 桌面端目录常驻显示（折叠逻辑仅作用于窄屏） */
@media (min-width: 1061px) {
  .toc-nav {
    display: flex !important;
  }
}

/* 目录面板展开动画 */
.toc-drop-enter-active,
.toc-drop-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
  transform-origin: top center;
}
.toc-drop-enter-from,
.toc-drop-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* 返回顶部 */
.back-top-btn {
  position: fixed;
  right: 28px;
  bottom: 28px;
  z-index: 70;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  cursor: pointer;
  color: var(--accent);
  border: 1px solid var(--accent-border);
  background: var(--surface);
  box-shadow: var(--shadow-md);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.back-top-btn:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-lg);
}
.bt-fade-enter-active, .bt-fade-leave-active { transition: opacity 0.25s ease, transform 0.25s ease; }
.bt-fade-enter-from, .bt-fade-leave-to { opacity: 0; transform: translateY(12px); }

@media (max-width: 720px) {
  .back-top-btn {
    right: 18px;
    bottom: calc(18px + env(safe-area-inset-bottom));
    width: 40px;
    height: 40px;
  }
}

/* ================================================================
   Markdown 渲染（流行的博客排版：清晰层级 + 舒适留白 + GitHub 风格代码块）
   ================================================================ */
.md-body :deep(.md-render-inner) {
  background: transparent;
  font-size: 16px;
  line-height: 1.8;
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC',
    'Microsoft YaHei', 'Noto Sans SC', sans-serif;
  letter-spacing: 0.01em;
  word-wrap: break-word;
  overflow-wrap: anywhere;
  scroll-behavior: smooth;
}
.md-body :deep(.md-render-inner > *:first-child) { margin-top: 0; }
.md-body :deep(.md-render-inner > *:last-child) { margin-bottom: 0; }

/* 标题 */
.md-body :deep(.md-render-inner h1),
.md-body :deep(.md-render-inner h2),
.md-body :deep(.md-render-inner h3),
.md-body :deep(.md-render-inner h4),
.md-body :deep(.md-render-inner h5),
.md-body :deep(.md-render-inner h6) {
  color: var(--text);
  font-weight: 700;
  line-height: 1.35;
  scroll-margin-top: 84px;
  letter-spacing: -0.01em;
  position: relative;
}
.md-body :deep(.md-render-inner h1) {
  font-size: 1.9em;
  margin: 0 0 1em;
  padding-bottom: 0.5em;
  border-bottom: 1px solid var(--border-light);
}
.md-body :deep(.md-render-inner h1)::after {
  content: "";
  position: absolute;
  left: 0;
  bottom: -1px;
  width: 64px;
  height: 3px;
  border-radius: 3px;
  background: linear-gradient(90deg, var(--accent), var(--accent-strong));
}
.md-body :deep(.md-render-inner h2) {
  font-size: 1.45em;
  margin: 1.8em 0 0.8em;
  padding: 0.05em 0 0.05em 14px;
}
.md-body :deep(.md-render-inner h2)::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0.2em;
  bottom: 0.2em;
  width: 4px;
  border-radius: 3px;
  background: linear-gradient(180deg, var(--accent), var(--accent-strong));
}
.md-body :deep(.md-render-inner h3) {
  font-size: 1.18em;
  margin: 1.5em 0 0.6em;
}
.md-body :deep(.md-render-inner h4) {
  font-size: 1.05em;
  margin: 1.3em 0 0.5em;
  color: var(--text-secondary);
}
.md-body :deep(.md-render-inner h5),
.md-body :deep(.md-render-inner h6) {
  font-size: 0.95em;
  margin: 1.2em 0 0.5em;
  color: var(--text-secondary);
}

/* 段落与强调 */
.md-body :deep(.md-render-inner p) { margin: 1em 0; }
.md-body :deep(.md-render-inner strong) { font-weight: 700; color: var(--text); }
.md-body :deep(.md-render-inner em) { color: var(--text-secondary); }

/* 链接 */
.md-body :deep(.md-render-inner a) {
  color: var(--accent-strong);
  text-decoration: none;
  border-bottom: 1px solid var(--accent-border);
  transition: color 0.15s ease, border-color 0.15s ease, background-color 0.15s ease;
  padding: 0 1px;
}
.md-body :deep(.md-render-inner a:hover) {
  color: var(--accent);
  border-bottom-color: var(--accent);
  background-color: var(--accent-soft);
  border-radius: 3px;
}
.md-body :deep(.md-render-inner a[target="_blank"])::after {
  content: "↗";
  display: inline-block;
  margin-left: 2px;
  font-size: 0.72em;
  color: var(--text-tertiary);
  vertical-align: super;
}

/* 引用 */
.md-body :deep(.md-render-inner blockquote) {
  margin: 1.4em 0;
  padding: 12px 18px;
  border-left: 3px solid var(--accent);
  background: var(--bg-soft);
  border-radius: 0 10px 10px 0;
  color: var(--text-secondary);
}
.md-body :deep(.md-render-inner blockquote p) { margin: 0.4em 0; }
.md-body :deep(.md-render-inner blockquote > :last-child) { margin-bottom: 0; }

/* 行内代码 */
.md-body :deep(.md-render-inner :not(pre) > code) {
  background: var(--md-inline-code-bg);
  color: var(--md-inline-code-fg);
  padding: 1px 7px;
  border-radius: 5px;
  font-size: 0.88em;
  font-family: 'SF Mono', 'JetBrains Mono', 'Fira Code', Menlo, Consolas, monospace;
  font-weight: 500;
  word-break: break-word;
}

/* 代码块（Shiki 渲染；背景与 token 跟随主题） */
.md-body :deep(.md-render-inner pre.shiki) {
  position: relative;
  display: block;
  margin: 1.5em 0;
  border: 1px solid var(--md-code-border);
  border-radius: 10px;
  background: var(--md-code-bg) !important;
  color: var(--md-code-fg) !important;
  font-size: 13.5px;
  line-height: 1.5;
  font-family: 'SF Mono', 'JetBrains Mono', 'Fira Code', Menlo, Consolas, monospace;
  overflow: hidden;
  box-shadow: var(--shadow-sm);
  tab-size: 4;
  -moz-tab-size: 4;
}
.md-body :deep(.md-render-inner pre.shiki),
.md-body :deep(.md-render-inner pre.shiki code) {
  --shiki-dark-bg: var(--md-code-bg);
  --shiki-light-bg: var(--md-code-bg);
  --shiki-dark: var(--md-code-fg);
  --shiki-light: var(--md-code-fg);
}
.md-body :deep(.md-render-inner pre.shiki code) {
  display: block;
  background: transparent !important;
  color: var(--md-code-fg) !important;
  padding: 0 24px 0 0;
  margin: 0;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  counter-reset: md-line;
}
/* 让 token 颜色跟随 --shiki-* 变量切换 */
.md-body :deep(.md-render-inner pre.shiki span) {
  color: var(--shiki-light, inherit);
}
html[data-theme="dark"] .md-body :deep(.md-render-inner pre.shiki span) {
  color: var(--shiki-dark, inherit) !important;
}
.md-body :deep(.md-render-inner pre.shiki .line) {
  display: block;
  padding-left: 14px;
}
.md-body :deep(.md-render-inner pre.shiki .line::before) {
  counter-increment: md-line;
  content: counter(md-line);
  display: inline-block;
  width: 2.2em;
  margin-left: -3.6em;
  margin-right: 1.4em;
  text-align: right;
  color: var(--text-tertiary);
  font-size: 0.85em;
  font-weight: 400;
  user-select: none;
  opacity: 0.7;
}

/* 代码块头部 */
.md-body :deep(.md-render-inner pre.shiki .shiki-header) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 14px;
  background: var(--md-code-header-bg);
  border-bottom: 1px solid var(--md-code-border);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif;
}
.md-body :deep(.md-render-inner pre.shiki .shiki-lang) {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-tertiary);
}
.md-body :deep(.md-render-inner pre.shiki .shiki-copy) {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  background: transparent;
  border: 1px solid var(--md-code-border);
  border-radius: 6px;
  color: var(--text-secondary);
  font-size: 11.5px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  font-family: inherit;
}
.md-body :deep(.md-render-inner pre.shiki .shiki-copy:hover) {
  background: var(--surface-hover);
  color: var(--text);
  border-color: var(--text-tertiary);
}
.md-body :deep(.md-render-inner pre.shiki .shiki-copy.copied) {
  background: var(--accent);
  border-color: transparent;
  color: #fff;
}
.md-body :deep(.md-render-inner pre.shiki .shiki-copy.failed) {
  background: #e5484d;
  border-color: transparent;
  color: #fff;
}

/* 代码横向滚动 */
.md-body :deep(.md-render-inner pre.shiki .shiki-scroll) {
  overflow-x: auto;
  overflow-y: hidden;
  padding: 12px 16px 14px 50px;
  scrollbar-width: thin;
  scrollbar-color: var(--text-tertiary) transparent;
}
.md-body :deep(.md-render-inner pre.shiki .shiki-scroll::-webkit-scrollbar) { height: 8px; }
.md-body :deep(.md-render-inner pre.shiki .shiki-scroll::-webkit-scrollbar-track) { background: transparent; }
.md-body :deep(.md-render-inner pre.shiki .shiki-scroll::-webkit-scrollbar-thumb) {
  background: var(--text-tertiary);
  border-radius: 4px;
}

/* 图片 */
.md-body :deep(.md-render-inner img) {
  display: block;
  border-radius: 10px;
  border: 1px solid var(--border);
  max-width: 100%;
  margin: 1.2em auto;
  box-shadow: var(--shadow-sm);
}

/* 表格 */
.md-body :deep(.md-render-inner .table-wrap) { overflow-x: auto; margin: 1.4em 0; }
.md-body :deep(.md-render-inner table) {
  border-collapse: collapse;
  width: 100%;
  font-size: 0.94em;
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
}
.md-body :deep(.md-render-inner th),
.md-body :deep(.md-render-inner td) {
  padding: 9px 14px;
  border-bottom: 1px solid var(--border-light);
  text-align: left;
}
.md-body :deep(.md-render-inner th) {
  background: var(--bg-soft);
  color: var(--text);
  font-weight: 700;
}
.md-body :deep(.md-render-inner tr:last-child td) { border-bottom: none; }
.md-body :deep(.md-render-inner tr:nth-child(even) td) { background: var(--bg-soft); }

/* 列表 */
.md-body :deep(.md-render-inner ul),
.md-body :deep(.md-render-inner ol) {
  padding-left: 1.7em;
  margin: 1.1em 0;
}
.md-body :deep(.md-render-inner li) {
  margin: 0.45em 0;
  line-height: 1.8;
  padding-left: 0.3em;
}
.md-body :deep(.md-render-inner li > p) { margin: 0.2em 0; }
.md-body :deep(.md-render-inner li > ul),
.md-body :deep(.md-render-inner li > ol) { margin: 0.4em 0; }
.md-body :deep(.md-render-inner li::marker) { color: var(--accent); font-weight: 600; }
.md-body :deep(.md-render-inner ol) { list-style: decimal; }
.md-body :deep(.md-render-inner ol li::marker) { font-variant-numeric: tabular-nums; }

/* 任务列表 */
.md-body :deep(.md-render-inner input[type="checkbox"]) {
  accent-color: var(--accent);
  margin-right: 6px;
  vertical-align: -1px;
}
.md-body :deep(.md-render-inner li:has(> input[type="checkbox"])) { list-style: none; margin-left: -1.3em; }

/* 分隔线 */
.md-body :deep(.md-render-inner hr) {
  border: none;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--border), transparent);
  margin: 2.4em 0;
}

/* ===== 响应式 ===== */
@media (max-width: 1060px) {
  .detail-layout {
    grid-template-columns: minmax(0, 1fr);
    padding: 20px 16px 56px;
    gap: 20px;
  }
  .doc-main { max-width: 100%; padding: 28px 24px 44px; }
  .toc-sidebar {
    position: static;
    max-height: none;
    order: -1;
    padding: 8px;
    overflow: visible;
  }
  .toc-toggle {
    cursor: pointer;
    justify-content: flex-start;
    gap: 8px;
    padding: 10px 14px;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: none;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    transition: border-color 0.18s ease, background 0.18s ease;
  }
  .toc-toggle:hover {
    border-color: var(--accent-border);
    background: var(--accent-soft);
  }
  .toc-toggle svg:first-child {
    color: var(--accent);
    flex: 0 0 auto;
  }
  .toc-toggle-text {
    flex: 1 1 auto;
    text-align: left;
  }
  .toc-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 22px;
    height: 20px;
    padding: 0 7px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0;
    color: var(--accent-strong);
    background: var(--accent-soft);
  }
  .toc-chevron {
    display: block;
    flex: 0 0 auto;
    color: var(--text-tertiary);
    transition: transform 0.2s ease;
  }
  .toc-chevron.open {
    transform: rotate(180deg);
  }
  .toc-nav {
    flex-direction: column;
    gap: 2px;
    margin-top: 8px;
    max-height: min(44vh, 320px);
    overflow-y: auto;
    padding: 4px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
    box-shadow: var(--shadow-sm);
  }
  .toc-label { white-space: normal; }
  .toc-level-3 { padding-left: 26px; }
}

@media (max-width: 720px) {
  .note-list-view { padding: 20px 16px 40px; }
  .record-card { padding: 18px 18px 16px; }
  .card-title { font-size: 15px; }
  .detail-topbar { padding: 14px 16px 0; }
  .detail-title { display: none; }
  .md-body :deep(.md-render-inner) { font-size: 15px; }
  .md-body :deep(.md-render-inner pre.shiki) { font-size: 12.5px; line-height: 1.5; }
  .doc-main { padding: 24px 18px 40px; }
}
</style>
