<script setup>
import { computed } from 'vue'
import { Select, Button, Input } from 'ant-design-vue'
import { SendOutlined } from '@ant-design/icons-vue'

const props = defineProps({
  text: { type: String, default: '' },
  mode: { type: String, default: '快速' },
})

const emit = defineEmits(['update:text', 'update:mode', 'send'])

// 两种模式：
// - 快速：检索知识库回答
// - 专家：模型自主调用工具、深度推理
const modes = [
  { value: '快速', label: '快速模式', placeholder: '快速模式，检索知识库回答...' },
  { value: '专家', label: '专家模式', placeholder: '专家模式，模型自主调用工具、深度推理...' },
]

// AntD Select v4 options 格式：下拉只显示单行 label
const modeOptions = modes.map((m) => ({ value: m.value, label: m.label }))

// 当前模式对应的输入框提示文字
const currentPlaceholder = computed(() => {
  return modes.find((m) => m.value === props.mode)?.placeholder
    || '说点什么...（Enter 发送，Shift + Enter 换行）'
})

function onInput(e) {
  emit('update:text', e.target.value)
}

function onKey(e) {
  // Enter 发送，Shift+Enter 换行
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    emit('send')
  }
}

function onSend() {
  if (!props.text.trim()) return
  emit('send')
}
</script>

<template>
  <div class="composer">
    <Input.TextArea
      :value="text"
      :auto-size="{ minRows: 1, maxRows: 6 }"
      :placeholder="currentPlaceholder"
      class="composer-input"
      @input="onInput"
      @keydown="onKey"
    />

    <div class="composer-toolbar">
      <Select
        :value="mode"
        :options="modeOptions"
        :bordered="false"
        class="mode-select"
        @change="(v) => emit('update:mode', v)"
      />
      <Button
        type="primary"
        class="send-btn"
        :disabled="!text.trim()"
        @click="onSend"
      >
        <SendOutlined />
        发送
      </Button>
    </div>
  </div>
</template>

<style scoped>
.composer {
  width: 100%;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  overflow: hidden;
}

.composer:focus-within {
  border-color: var(--accent);
  box-shadow: 0 12px 32px rgba(99, 102, 241, 0.14);
}

.composer-input {
  border: none !important;
  box-shadow: none !important;
  background: transparent !important;
  padding: 16px 18px 6px !important;
  font-size: 15px;
  line-height: 1.6;
  resize: none;
}

.composer-input :deep(textarea) {
  background: transparent;
  box-shadow: none;
}

.composer-input :deep(.ant-input) {
  color: var(--text);
}

.composer-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px 10px 16px;
  border-top: 1px solid var(--border-light);
}

.mode-select {
  font-size: 13px;
  min-width: 132px;
}

.mode-select :deep(.ant-select-selector) {
  height: 34px !important;
  padding: 0 8px !important;
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  display: flex !important;
  align-items: center !important;
}

.mode-select :deep(.ant-select-selection-item) {
  color: var(--text-secondary);
  font-size: 13px;
  text-overflow: clip;
  overflow: visible;
}

.mode-select :deep(.ant-select-arrow) {
  color: var(--text-tertiary);
}

.send-btn {
  height: 36px;
  padding: 0 18px;
  border-radius: var(--radius-md);
  font-size: 14px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

@media (max-width: 640px) {
  .composer-toolbar {
    padding: 6px 10px 10px 12px;
  }

  .send-btn {
    padding: 0 14px;
  }
}
</style>
