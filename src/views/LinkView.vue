<script setup>
import MarkdownPreview from '../components/MarkdownPreview.vue'
import AppFooter from '../components/AppFooter.vue'
import { useLink } from '../composables/useLink'

const { linkTitle, linkVisible, myLinks, linkLoading, visibleLinks, onLinkRendered, loadLinks } = useLink()

/* 暴露 reload 方法供下拉刷新调用 */
defineExpose({ reload: loadLinks })
</script>

<template>
  <div class="link-page">
    <section class="my-log">
      <div class="my-log-head">
        <h2 class="my-log-title">
          <span :style="{ opacity: linkVisible ? 1 : 0 }">{{ linkTitle }}</span>
          <span v-if="myLinks.length" class="my-log-count">{{ myLinks.length }}</span>
        </h2>
      </div>
      <ul class="my-log-list">
        <li
          v-for="(link, i) in visibleLinks"
          :key="i"
          class="my-log-item"
        >
          <span class="my-log-time">{{ link.date }}</span>
          <span class="my-log-dash" aria-hidden="true">──</span>
          <div class="my-log-body">
            <MarkdownPreview class="my-log-md" :source="link.body" variant="log" @md-rendered="onLinkRendered" />
          </div>
        </li>
        <li v-if="!linkLoading && myLinks.length === 0" class="my-log-empty">
          暂无链接
        </li>
      </ul>
      <p v-show="linkLoading" class="my-log-loading">加载中…</p>
    </section>

    <AppFooter />
  </div>
</template>

<style scoped>
.link-page {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  width: 100%;
  padding-top: 40px;
}

@media (max-width: 768px) {
  .link-page { padding-top: 24px; }
}
</style>
