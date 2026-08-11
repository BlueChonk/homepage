<script setup>
import { Empty } from 'ant-design-vue'

defineProps({
  title: { type: String, default: '' },
  desc: { type: String, default: '' },
})
</script>

<template>
  <div class="placeholder">
    <Empty :description="false">
      <template #description>
        <div class="p-title">{{ title }}</div>
        <div class="p-desc">{{ desc }}</div>
      </template>
    </Empty>
  </div>
</template>

<style scoped>
.placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
}
.p-title {
  font-size: 30px;
  font-weight: 600;
  color: var(--text);
}
.p-desc {
  font-size: 15px;
  color: var(--text-tertiary);
  margin-top: 8px;
}
</style>
