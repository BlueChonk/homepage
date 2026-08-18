<script setup>
import MarkdownPreview from '../components/MarkdownPreview.vue'
import AppFooter from '../components/AppFooter.vue'
import { useLog } from '../composables/useLog'

/* 全部日志，不限制条数 */
const { logTitle, myLogs, logLoading, visibleLogs, onLogRendered } = useLog()
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
        <li v-for="(log, i) in visibleLogs" :key="i" class="my-log-item">
          <span class="my-log-time">{{ log.date }}</span>
          <span class="my-log-dash" aria-hidden="true">──</span>
          <div class="my-log-body">
            <MarkdownPreview class="my-log-md" :source="log.text" variant="log" @md-rendered="onLogRendered" />
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
</style>
