<script setup>
import AppFooter from '../components/AppFooter.vue'
import { useProjects } from '../composables/useProjects'

const { projectsTitle, titleVisible, projects, loading, loadProjects } = useProjects()

/* 暴露 reload 方法供下拉刷新调用 */
defineExpose({ reload: loadProjects })

function formatCount(n) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}
</script>

<template>
  <div class="projects-page">
    <section class="my-log">
      <div class="my-log-head">
        <h2 class="my-log-title">
          <span :style="{ opacity: titleVisible ? 1 : 0 }">{{ projectsTitle }}</span>
          <span v-if="projects.length" class="my-log-count">{{ projects.length }}</span>
        </h2>
      </div>
      <ul class="my-log-list">
        <li v-for="repo in projects" :key="repo.name" class="my-log-item">
          <div class="my-log-body">
            <a :href="repo.url" target="_blank" rel="noopener noreferrer" class="project-link">
              {{ repo.name }}
            </a>
            <span v-if="repo.stars > 0" class="project-stars">★ {{ formatCount(repo.stars) }}</span>
            <p v-if="repo.desc" class="project-desc">{{ repo.desc }}</p>
          </div>
        </li>
        <li v-if="!loading && projects.length === 0" class="my-log-empty">
          暂无项目
        </li>
      </ul>
      <p v-show="loading" class="my-log-loading">加载中…</p>
    </section>

    <AppFooter />
  </div>
</template>

<style scoped>
.projects-page {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  width: 100%;
  padding-top: 40px;
}

.project-link {
  color: var(--accent);
  text-decoration: none;
  font-weight: 600;
}
.project-link:hover {
  text-decoration: underline;
}
.project-stars {
  margin-left: 8px;
  font-size: 12px;
  color: var(--text-tertiary);
}
.project-desc {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
}

@media (max-width: 768px) {
  .projects-page { padding-top: 24px; }
}
</style>
