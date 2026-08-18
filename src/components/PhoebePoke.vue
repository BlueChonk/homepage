<script setup>
import { computed, ref } from 'vue'
import { Tooltip } from 'ant-design-vue'
import { useRandomSound } from '../composables/useRandomSound'

const SOUNDS = ['/audio/phoebe_01.mp3', '/audio/phoebe_02.mp3', '/audio/phoebe_03.mp3']

const { play } = useRandomSound(SOUNDS)

const figRef = ref(null)
const poking = ref(false)
const count = ref(0)

const hint = computed(() => {
  if (count.value === 0) return '戳戳我～'
  if (count.value < 5) return '又被戳了'
  if (count.value < 10) return '还戳呀'
  if (count.value < 20) return '戳上瘾了吧'
  if (count.value < 50) return '菲比已经晕了'
  return `你已经戳了 ${count.value} 次`
})

function poke() {
  count.value += 1
  play()

  // 连点时需要让 CSS 动画重新播放：先移除类，强制一次重排刷新样式计算，再加回来。
  // 仅靠响应式赋值会被批量更新合并掉，动画不会重新触发。
  poking.value = false
  void figRef.value?.offsetWidth
  poking.value = true
}
</script>

<template>
  <div class="phoebe-poke">
    <Tooltip title="戳一下试试" placement="right">
      <button
        ref="figRef"
        type="button"
        class="poke-fig"
        :class="{ poking }"
        aria-label="戳菲比"
        @click="poke"
        @animationend="poking = false"
      >
        <img src="/image/phoebe.png" alt="菲比" draggable="false" />
      </button>
    </Tooltip>
    <div class="poke-hint">{{ hint }}</div>
  </div>
</template>

<style scoped>
.phoebe-poke {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.poke-fig {
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
  line-height: 0;
  border-radius: 24px;
  transition: transform 0.18s ease;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
}
.poke-fig:hover {
  transform: scale(1.04);
}
.poke-fig:active {
  transform: scale(0.96);
}
.poke-fig:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 6px;
}

.poke-fig img {
  position: relative;
  z-index: 1;
  width: 180px;
  height: auto;
  max-width: 46vw;
  user-select: none;
  /* 让点击事件始终落在 button 上，避免拖拽图片打断交互 */
  pointer-events: none;
  filter: drop-shadow(0 18px 40px var(--accent-soft));
}

.poke-fig.poking {
  animation: poke-shake 0.45s ease;
}
@keyframes poke-shake {
  0% { transform: rotate(0deg) scale(1); }
  20% { transform: rotate(-9deg) scale(1.06); }
  40% { transform: rotate(8deg) scale(1.06); }
  60% { transform: rotate(-6deg) scale(1.03); }
  80% { transform: rotate(4deg) scale(1.01); }
  100% { transform: rotate(0deg) scale(1); }
}

.poke-hint {
  font-size: 14px;
  font-weight: 600;
  color: var(--accent);
  animation: hint-blink 1.4s step-end infinite;
}
@keyframes hint-blink {
  50% { opacity: 0.35; }
}

@media (prefers-reduced-motion: reduce) {
  .poke-fig,
  .poke-fig.poking,
  .poke-hint {
    animation: none;
    transition: none;
  }
}
</style>
