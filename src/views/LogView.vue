<script setup>
import { ref, reactive, nextTick, watch } from 'vue'
import MarkdownPreview from '../components/MarkdownPreview.vue'
import AppFooter from '../components/AppFooter.vue'
import { useLog } from '../composables/useLog'

/* 全部日志，不限制条数 */
const { logTitle, myLogs, logLoading, visibleLogs, onLogRendered, loadLogs } = useLog()

/* 暴露 reload 方法供下拉刷新调用 */
defineExpose({ reload: loadLogs })

/* 折叠高度阈值：内容超过此高度才自动折叠 */
const COLLAPSE_THRESHOLD = 300
/* 收起后保留的高度 */
const COLLAPSED_HEIGHT = 150

/* 折叠状态：key = 日志索引，value = 是否折叠 */
const collapsed = reactive({})
/* 已检测过高度的日志索引 */
const checked = reactive(new Set())

/* 检测每条日志：内容超 threshold 才折叠，否则完整展示 */
function checkCollapse() {
  nextTick(() => {
    visibleLogs.value.forEach((_, i) => {
      if (checked.has(i)) return
      const el = document.querySelector(`[data-log-idx="${i}"] .my-log-md`)
      if (el) {
        checked.add(i)
        // 只有内容高度超过阈值时才折叠
        collapsed[i] = el.scrollHeight > COLLAPSE_THRESHOLD
      }
    })
  })
}

function isCollapsed(i) {
  return collapsed[i] === true
}

function toggleLog(i) {
  collapsed[i] = !collapsed[i]
}

/* 渲染完成后检测高度 */
function handleRendered(e) {
  onLogRendered(e)
  checkCollapse()
}

watch(() => myLogs.value.length, () => checkCollapse())
</script>

<template>
  <div class="log-page">
    <section class="my-log">
      <div class="my-log-head">
        <h2 class="my-log-title">
          {{ logTitle }}
          <span v-if="myLogs.length" class="my-log-count">{{ myLogs.length }}</span>
        </h2>
      </div>
      <ul class="my-log-list">
        <li
          v-for="(log, i) in visibleLogs"
          :key="i"
          class="my-log-item"
          :data-log-idx="i"
        >
          <span class="my-log-time">{{ log.date }}</span>
          <span class="my-log-dash" aria-hidden="true">──</span>
          <div class="my-log-body">
            <div
              class="my-log-content"
              :class="{ collapsed: isCollapsed(i) }"
            >
              <MarkdownPreview class="my-log-md" :source="log.body" variant="log" @md-rendered="handleRendered" />
            </div>
            <button
              v-if="collapsed[i]"
              class="my-log-expand"
              @click="toggleLog(i)"
            >
              {{ isCollapsed(i) ? '展开 ↓' : '收起 ↑' }}
            </button>
          </div>
        </li>
        <li v-if="!logLoading && myLogs.length === 0" class="my-log-empty">
          暂无日志
        </li>
      </ul>
      <p v-show="logLoading" class="my-log-loading">加载中…</p>
    </section>

    <AppFooter />
  </div>
</template>

<style scoped>
.log-page {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  width: 100%;
  padding-top: 40px;
}

/* 日志内容折叠容器 */
.my-log-content {
  overflow: hidden;
  transition: max-height 0.35s ease;
  max-height: 5000px;
}
.my-log-content.collapsed {
  max-height: 150px;
  -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 32px), transparent);
  mask-image: linear-gradient(to bottom, #000 calc(100% - 32px), transparent);
}

/* 展开/收起按钮 */
.my-log-expand {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  padding: 2px 12px;
  border: none;
  border-radius: 6px;
  background: var(--accent-soft);
  color: var(--accent-strong);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s ease;
}
.my-log-expand:hover {
  background: var(--accent-border);
}

@media (max-width: 768px) {
  .log-page { padding-top: 24px; }
}
</style>
