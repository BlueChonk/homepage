<script setup>
import MarkdownPreview from '../components/MarkdownPreview.vue'
import AppFooter from '../components/AppFooter.vue'
import { useBlog } from '../composables/useBlog'

const {
  blogTitle,
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
</script>

<template>
  <div class="blog-page">
    <section class="blog-header">
      <h1 class="blog-title">
        {{ blogTitle }}
        <span v-if="posts.length" class="blog-count">{{ posts.length }}</span>
      </h1>

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
    </section>

    <!-- 文章列表 -->
    <ul class="blog-list">
      <li v-for="post in filteredPosts" :key="post.slug" class="blog-item">
        <div class="blog-item-head">
          <h2 class="blog-item-title">{{ post.title }}</h2>
          <div class="blog-item-meta">
            <span class="blog-item-date">{{ formatDate(post.date) }}</span>
            <span v-if="post.category" class="blog-item-cat">{{ post.category }}</span>
          </div>
        </div>

        <p v-if="post.summary" class="blog-item-summary">{{ post.summary }}</p>

        <div class="blog-item-body">
          <MarkdownPreview class="blog-md" :source="post.body" variant="log" @md-rendered="onBlogRendered" />
        </div>

        <div v-if="post.tags?.length" class="blog-item-tags">
          <span v-for="tag in post.tags" :key="tag" class="tag">{{ tag }}</span>
        </div>
      </li>

      <li v-if="!blogLoading && filteredPosts.length === 0" class="blog-empty">
        暂无文章
      </li>
    </ul>

    <p v-show="blogLoading" class="blog-loading">加载中…</p>

    <AppFooter />
  </div>
</template>

<style scoped>
.blog-page {
  min-height: 100%;
  width: 100%;
  max-width: 840px;
  margin: 0 auto;
  padding: 48px 24px 0;
  color: var(--text);
}

.blog-header {
  margin-bottom: 32px;
}

.blog-title {
  font-size: clamp(28px, 5vw, 40px);
  font-weight: 700;
  margin: 0 0 16px;
  background: linear-gradient(90deg, var(--accent-strong), var(--accent));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.blog-count {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-tertiary);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 2px 10px;
  -webkit-text-fill-color: var(--text-tertiary);
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
}

.blog-item-body {
  margin-top: 12px;
}

.blog-item-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 16px;
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
