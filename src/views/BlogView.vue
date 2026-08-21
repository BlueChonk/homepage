<script setup>
import { ref } from 'vue'
import MarkdownPreview from '../components/MarkdownPreview.vue'
import AppFooter from '../components/AppFooter.vue'
import { useBlog } from '../composables/useBlog'

/* 卡片内展开/收起：默认只显示摘要，slug 集合记录已展开的文章 */
const expanded = ref(new Set())
function togglePost(slug) {
  const next = new Set(expanded.value)
  if (next.has(slug)) next.delete(slug)
  else next.add(slug)
  expanded.value = next
}
const isExpanded = (slug) => expanded.value.has(slug)

const {
  blogTitle,
  blogVisible,
  posts,
  blogLoading,
  filteredPosts,
  categories,
  activeCategory,
  onBlogRendered,
  loadPosts,
  setCategory,
} = useBlog()

/* 暴露 reload 方法供下拉刷新调用 */
defineExpose({ reload: loadPosts })

function formatDate(dateStr) {
  if (!dateStr) return ''
  const m = String(dateStr).match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : dateStr
}

/* 阅读时长估算：中文约 400 字/分钟，不足 1 分钟按 1 分钟计 */
function readMinutes(wordCount) {
  return Math.max(1, Math.round((wordCount || 0) / 400))
}
</script>

<template>
  <div class="blog-page">
    <section class="my-log">
      <div class="my-log-head">
        <h2 class="my-log-title">
          <span :style="{ opacity: blogVisible ? 1 : 0 }">{{ blogTitle }}</span>
          <span v-if="posts.length" class="my-log-count">{{ posts.length }}</span>
        </h2>
        <!-- 分类筛选 -->
        <div v-if="categories.length > 2" class="blog-cats">
          <button
            v-for="cat in categories"
            :key="cat"
            class="cat-btn"
            :class="{ active: activeCategory === cat }"
            @click="setCategory(cat)"
          >
            {{ cat === 'all' ? '全部' : cat }}
          </button>
        </div>
      </div>

      <!-- 文章列表 -->
      <ul class="blog-list">
        <li v-for="post in filteredPosts" :key="post.slug" class="blog-item">
          <div class="blog-item-head">
            <h2 class="blog-item-title">
              <span v-if="post.top" class="blog-item-pin">置顶</span>
              {{ post.title }}
            </h2>
            <div class="blog-item-meta">
              <span class="blog-item-date">{{ formatDate(post.date) }}</span>
              <span v-if="post.category" class="blog-item-cat">{{ post.category }}</span>
              <span v-if="post.wordCount" class="blog-item-time">约 {{ readMinutes(post.wordCount) }} 分钟</span>
            </div>
          </div>

          <p v-if="post.summary" class="blog-item-summary">{{ post.summary }}</p>

          <!-- 全文懒渲染：展开时才挂载 MarkdownPreview，列表页不为每篇跑高亮 -->
          <div v-if="isExpanded(post.slug)" class="blog-item-body">
            <MarkdownPreview class="my-log-md" :source="post.body" variant="log" @md-rendered="onBlogRendered" />
          </div>

          <div class="blog-item-foot">
            <button
              type="button"
              class="blog-toggle"
              :aria-expanded="isExpanded(post.slug)"
              @click="togglePost(post.slug)"
            >
              {{ isExpanded(post.slug) ? '收起' : '阅读全文' }}
              <svg
                viewBox="0 0 24 24"
                width="13"
                height="13"
                aria-hidden="true"
                :class="{ open: isExpanded(post.slug) }"
              >
                <path fill="currentColor" d="M7.4 8.6 12 13.2l4.6-4.6L18 10l-6 6-6-6z" />
              </svg>
            </button>
            <div v-if="post.tags?.length" class="blog-item-tags">
              <span v-for="tag in post.tags" :key="tag" class="tag">{{ tag }}</span>
            </div>
          </div>
        </li>

        <li v-if="!blogLoading && filteredPosts.length === 0" class="blog-empty">
          暂无文章
        </li>
      </ul>

      <p v-show="blogLoading" class="blog-loading">加载中…</p>
    </section>

    <AppFooter />
  </div>
</template>

<style scoped>
.blog-page {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  width: 100%;
  padding-top: 40px;
}



/* 分类筛选 */
.blog-cats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.cat-btn {
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  padding: 6px 16px;
  border-radius: 999px;
  font-size: 13px;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}
.cat-btn:hover {
  border-color: var(--accent-border);
  color: var(--accent);
}
.cat-btn.active {
  background: var(--accent-soft);
  border-color: var(--accent-border);
  color: var(--accent-strong);
  font-weight: 500;
}

/* 文章列表 */
.blog-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 28px;
}
.blog-item {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 24px;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.blog-item:hover {
  border-color: var(--accent-border);
  box-shadow: var(--shadow-sm);
}
.blog-item-head {
  margin-bottom: 8px;
}
.blog-item-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 6px;
  color: var(--text);
}
.blog-item-pin {
  display: inline-block;
  vertical-align: 3px;
  margin-right: 8px;
  padding: 1px 7px;
  border-radius: 4px;
  background: var(--accent-soft);
  color: var(--accent-strong);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.blog-item-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--text-tertiary);
}
.blog-item-cat {
  background: var(--accent-soft);
  color: var(--accent);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
}
.blog-item-summary {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0 0 12px;
  line-height: 1.6;
  /* 摘要最多两行，保证卡片高度整齐 */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.blog-item-body {
  margin-top: 12px;
}

/* 底部行：展开/收起 + 标签 */
.blog-item-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 14px;
}
.blog-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  padding: 2px 0;
  font-size: 13px;
  font-family: inherit;
  color: var(--accent);
  cursor: pointer;
  transition: color 0.15s;
}
.blog-toggle:hover {
  color: var(--accent-strong);
}
.blog-toggle svg {
  transition: transform 0.2s ease;
}
.blog-toggle svg.open {
  transform: rotate(180deg);
}
.blog-item-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.tag {
  font-size: 11px;
  color: var(--text-tertiary);
  background: var(--surface);
  border: 1px solid var(--border);
  padding: 2px 8px;
  border-radius: 4px;
}
.blog-empty {
  text-align: center;
  color: var(--text-tertiary);
  padding: 40px 0;
}
.blog-loading {
  text-align: center;
  color: var(--text-tertiary);
  font-size: 13px;
}

@media (max-width: 768px) {
  .blog-page {
    padding: 24px 16px 0;
  }
  .blog-item {
    padding: 16px;
  }
  .blog-item-title {
    font-size: 17px;
  }
}
</style>
