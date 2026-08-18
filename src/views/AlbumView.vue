<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Image } from 'ant-design-vue'
import AppFooter from '../components/common/AppFooter.vue'

// 每次翻页展示多少张
const PAGE_SIZE = 12

const all = ref([])             // manifest 中的全部图片
const loading = ref(true)
const page = ref(1)             // 当前页码（从 1 开始）
const jumpInput = ref('')       // 跳转输入框的值
const pageKey = ref(0)          // 翻页动画 key（触发内容淡入）
const animating = ref(false)    // 是否正在执行自定义滚动动画
const skeleton = ref(false)     // 翻页时显示骨架 loading
let skeletonTimer = 0
const skeletonCells = Array.from({ length: PAGE_SIZE }, (_, i) => i)

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
    // 若数据不足一页且默认 1 已超出，纠正到 1
    if (page.value > totalPages.value) page.value = totalPages.value || 1
  } catch (e) {
    console.error('[album] 读取清单失败', e)
    all.value = []
  } finally {
    loading.value = false
  }
}

const totalPages = computed(() => Math.max(1, Math.ceil(all.value.length / PAGE_SIZE)))
const pagedImages = computed(() => {
  const start = (page.value - 1) * PAGE_SIZE
  return all.value.slice(start, start + PAGE_SIZE)
})

/* ===== 滚动容器与自定义缓动滚动 =====
   原生 scrollTo({behavior:'smooth'}) 在长距离与移动端惯性场景下会卡顿，
   且与内容切换并发时容易产生跳动。这里用 rAF 手动缓动：
   - 曲线接近主流站点（快慢结合、收尾平缓）
   - 滚动期间用户触摸/滚轮可随时打断
   - 尊重 prefers-reduced-motion，直接瞬移 */
let scrollEl = null
let rafId = 0
let cancelHandler = null
let pendingAfter = null

function getScrollEl() {
  if (scrollEl && scrollEl.isConnected) return scrollEl
  scrollEl = document.querySelector('.app-body')
  return scrollEl
}

function cancelScrollAnimation() {
  if (rafId) {
    cancelAnimationFrame(rafId)
    rafId = 0
  }
  animating.value = false
  if (cancelHandler) {
    const el = getScrollEl()
    el?.removeEventListener('touchstart', cancelHandler)
    el?.removeEventListener('wheel', cancelHandler)
    cancelHandler = null
  }
  if (pendingAfter) {
    const cb = pendingAfter
    pendingAfter = null
    cb()
  }
}

function animateScrollTo(top, duration = 420, after) {
  const el = getScrollEl()
  if (!el) return
  cancelScrollAnimation()
  pendingAfter = after || null

  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (reduceMotion || duration <= 0) {
    el.scrollTop = top
    const cb = pendingAfter
    pendingAfter = null
    cb?.()
    return
  }

  const startTop = el.scrollTop
  const delta = top - startTop
  if (Math.abs(delta) < 1) {
    const cb = pendingAfter
    pendingAfter = null
    cb?.()
    return
  }

  const startTime = performance.now()
  cancelHandler = () => cancelScrollAnimation()
  el.addEventListener('touchstart', cancelHandler, { passive: true })
  el.addEventListener('wheel', cancelHandler, { passive: true })
  animating.value = true

  const easeOutQuint = (t) => 1 - Math.pow(1 - t, 4)
  const step = (now) => {
    const t = Math.min(1, (now - startTime) / duration)
    el.scrollTop = startTop + delta * easeOutQuint(t)
    if (t < 1) {
      rafId = requestAnimationFrame(step)
    } else {
      el.scrollTop = top
      rafId = 0
      animating.value = false
      if (cancelHandler) {
        el.removeEventListener('touchstart', cancelHandler)
        el.removeEventListener('wheel', cancelHandler)
        cancelHandler = null
      }
      const cb = pendingAfter
      pendingAfter = null
      cb?.()
    }
  }
  rafId = requestAnimationFrame(step)
}

// 翻页：先平滑回到顶部（旧内容保持稳定），滚动完成后再切换内容并淡入
function go(p, opts = {}) {
  if (p < 1 || p > totalPages.value || p === page.value) return
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const instant = opts.instant || reduceMotion
  animateScrollTo(0, instant ? 0 : 340, () => {
    page.value = p
    pageKey.value += 1
    jumpInput.value = ''
    // 显示骨架占位，等图片就绪后淡出（图片已在缓存时依旧保留短暂过渡，保证换页视觉连续）
    skeleton.value = true
    clearTimeout(skeletonTimer)
    skeletonTimer = setTimeout(() => {
      skeleton.value = false
    }, 380)
  })
}

// 跳转到输入框指定的页码
function jumpTo() {
  const n = parseInt(jumpInput.value, 10)
  if (Number.isNaN(n)) {
    jumpInput.value = ''
    return
  }
  // 越界则夹到合法范围
  const target = Math.min(Math.max(n, 1), totalPages.value)
  go(target, { instant: true })
}

// 拼接分页按钮：首尾、当前页前后省略，其余全部展开
const pageButtons = computed(() => {
  const total = totalPages.value
  const cur = page.value
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const set = new Set([1, total, cur, cur - 1, cur + 1])
  const list = [...set].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b)
  const out = []
  for (let i = 0; i < list.length; i++) {
    out.push(list[i])
    if (i < list.length - 1 && list[i + 1] - list[i] > 1) out.push('…')
  }
  return out
})

onMounted(loadManifest)
onUnmounted(() => {
  cancelScrollAnimation()
  clearTimeout(skeletonTimer)
})
</script>

<template>
  <div class="album-page">
    <div v-if="loading" class="album-state">加载中…</div>

    <template v-else-if="all.length">
      <!-- 响应式自动填充网格：每行能放几张放几张，最后一行用 flex 伸展填满，不留空位 -->
      <a-image-preview-group>
        <Transition name="album-fade" mode="out-in">
          <div :key="pageKey" class="album-grid">
            <a-image
              v-for="img in pagedImages"
              :key="img.name"
              :src="img.thumb || img.src"
              :preview="{ src: img.src }"
              :placeholder="true"
              class="album-card"
            />
            <Transition name="skeleton-fade">
              <div v-if="skeleton" class="skeleton-mask" aria-hidden="true">
                <span v-for="i in skeletonCells" :key="i" class="skeleton-cell"></span>
              </div>
            </Transition>
          </div>
        </Transition>
      </a-image-preview-group>

      <!-- 分页 -->
      <nav v-if="totalPages > 1" class="pager" aria-label="相册分页">
        <button
          class="pager-btn"
          :disabled="page === 1"
          @click="go(page - 1)"
          aria-label="上一页"
        >
          ‹
        </button>

        <button
          v-for="(item, i) in pageButtons"
          :key="'p-' + i"
          class="pager-btn"
          :class="{ active: item === page, gap: item === '…' }"
          :disabled="item === '…'"
          @click="typeof item === 'number' && go(item)"
        >
          {{ item }}
        </button>

        <button
          class="pager-btn"
          :disabled="page === totalPages"
          @click="go(page + 1)"
          aria-label="下一页"
        >
          ›
        </button>

        <span class="pager-info">第 {{ page }} / {{ totalPages }} 页</span>

        <span class="pager-jump">
          <input
            v-model="jumpInput"
            class="pager-jump-input"
            type="number"
            min="1"
            :max="totalPages"
            placeholder="页码"
            @keyup.enter="jumpTo"
          />
          <button class="pager-btn" @click="jumpTo">跳转</button>
        </span>
      </nav>
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

/* 翻页内容过渡：轻微上浮 + 淡入（主流图库常见的换页反馈） */
.album-fade-enter-active {
  transition: opacity 0.32s ease, transform 0.32s ease;
}
.album-fade-leave-active {
  transition: opacity 0.12s ease;
}
.album-fade-enter-from {
  opacity: 0;
  transform: translateY(10px);
}
.album-fade-leave-to {
  opacity: 0;
}

/* 翻页骨架：覆盖在网格上的占位卡片，带微光扫描动画 */
.album-grid {
  position: relative;
}
.skeleton-mask {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  pointer-events: none;
}
.skeleton-cell {
  border-radius: var(--radius-md);
  background:
    linear-gradient(100deg, transparent 20%, rgba(255, 255, 255, 0.35) 50%, transparent 80%),
    var(--bg-soft);
  background-size: 200% 100%;
  background-position: 100% 0;
  animation: skeleton-scan 0.9s linear infinite;
  aspect-ratio: 1 / 1;
}
html[data-theme="dark"] .skeleton-cell {
  background:
    linear-gradient(100deg, transparent 20%, rgba(255, 255, 255, 0.08) 50%, transparent 80%),
    var(--bg-soft);
  background-size: 200% 100%;
  background-position: 100% 0;
  animation: skeleton-scan 0.9s linear infinite;
}
@keyframes skeleton-scan {
  to { background-position: -100% 0; }
}
.skeleton-fade-enter-active,
.skeleton-fade-leave-active {
  transition: opacity 0.25s ease;
}
.skeleton-fade-enter-from,
.skeleton-fade-leave-to {
  opacity: 0;
}

@media (max-width: 1080px) {
  .skeleton-mask { grid-template-columns: repeat(3, 1fr); }
}
@media (max-width: 720px) {
  .skeleton-mask { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 480px) {
  .skeleton-mask { grid-template-columns: 1fr; }
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

/* 卡片样式由 .ant-image 容器承担（a-image 的 class 会落在内部 img 上） */
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
  .pager { gap: 4px; margin: 28px auto 6px; }
  .pager-btn { min-width: 30px; height: 32px; padding: 0 7px; }
  .pager-info { margin-left: 4px; }
  .pager-jump { margin-left: 2px; }
  .pager-jump-input { width: 52px; height: 32px; }
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

/* 骨架占位（a-image 内置灰色骨架）铺满卡片 */
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

/* 分页 */
.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 6px;
  margin: 36px auto 8px;
  max-width: 1040px;
}
.pager-btn {
  min-width: 34px;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, color 0.15s;
}
.pager-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}
.pager-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #0c0e12;
  font-weight: 600;
}
.pager-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.pager-btn.gap {
  border-color: transparent;
  background: transparent;
  cursor: default;
}
.pager-info {
  margin-left: 8px;
  font-size: 12px;
  color: var(--muted);
  letter-spacing: 0.04em;
}
.pager-jump {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: 4px;
}
.pager-jump-input {
  width: 60px;
  height: 34px;
  padding: 0 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  border-radius: 8px;
  font-size: 13px;
  text-align: center;
  outline: none;
  transition: border-color 0.15s;
}
.pager-jump-input:focus {
  border-color: var(--accent);
}
/* 去掉 number 输入框的上下箭头 */
.pager-jump-input::-webkit-outer-spin-button,
.pager-jump-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.pager-jump-input {
  -moz-appearance: textfield;
  appearance: textfield;
}
</style>
