<script setup>
import { ref } from 'vue'
import { Tooltip } from 'ant-design-vue'
import { useRandomSound } from '../composables/useRandomSound'

const SOUNDS = ['/audio/ciallo_01.mp3', '/audio/ciallo_02.mp3', '/audio/ciallo_03.mp3']

const { play } = useRandomSound(SOUNDS)

const bouncing = ref(false)
const elRef = ref(null)

function greet() {
  play()
  bouncing.value = false
  void elRef.value?.offsetWidth
  bouncing.value = true
}
</script>

<template>
  <Tooltip title="点一下听听" placement="bottom">
    <button
      ref="elRef"
      type="button"
      class="cia-greet"
      :class="{ bouncing }"
      aria-label="播放 Ciallo 语音"
      @click="greet"
      @animationend="bouncing = false"
    >
      Ciallo～(∠・ω&lt; )⌒★
    </button>
  </Tooltip>
</template>

<style scoped>
.cia-greet {
  border: none;
  background: linear-gradient(120deg, var(--accent), var(--accent-strong));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  padding: 4px 8px;
  letter-spacing: 0.5px;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.18s ease;
  animation: cia-float 3s ease-in-out infinite;
}
.cia-greet:hover {
  transform: translateY(-2px);
}
.cia-greet:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 4px;
  border-radius: 8px;
}
.cia-greet.bouncing {
  animation: cia-bounce 0.5s ease;
}
@keyframes cia-float {
  0% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
  100% { transform: translateY(0); }
}
@keyframes cia-bounce {
  0% { transform: translateY(0) scale(1); }
  30% { transform: translateY(-8px) scale(1.08); }
  55% { transform: translateY(0) scale(0.97); }
  75% { transform: translateY(-3px) scale(1.02); }
  100% { transform: translateY(0) scale(1); }
}

@media (prefers-reduced-motion: reduce) {
  .cia-greet,
  .cia-greet.bouncing {
    animation: none;
    transition: none;
  }
}
</style>
