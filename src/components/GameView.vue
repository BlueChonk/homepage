<script setup>
import { onMounted, ref } from 'vue'
import { Card, Button } from 'ant-design-vue'

// 游戏数据来自 public/games.json（数组）：
// [{ title, desc, cover, tag, href }]
// 若不存在或为空，展示占位提示。
const games = ref([])
const loading = ref(true)

async function load() {
  loading.value = true
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}games.json`, { cache: 'no-cache' })
    const data = await res.json()
    games.value = Array.isArray(data) ? data : []
  } catch (e) {
    games.value = []
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <section class="view">
    <header class="view-head">
      <h1>游戏</h1>
      <p>平时在玩的 &amp; 想安利给你的</p>
    </header>

    <div v-if="loading" class="state">加载中…</div>

    <div v-else-if="games.length" class="grid">
      <Card v-for="g in games" :key="g.title" class="game-card" :bordered="false">
        <div class="cover" :style="g.cover ? { backgroundImage: `url(${g.cover})` } : {}">
          <span v-if="!g.cover" class="cover-emoji">🎮</span>
        </div>
        <div class="meta">
          <span v-if="g.tag" class="tag">{{ g.tag }}</span>
          <h3>{{ g.title }}</h3>
          <p>{{ g.desc }}</p>
          <Button v-if="g.href" type="link" :href="g.href" target="_blank" rel="noopener">
            了解更多 →
          </Button>
        </div>
      </Card>
    </div>

    <div v-else class="state empty">
      <div class="empty-emoji">🎮</div>
      <p>还没有添加游戏。</p>
      <p class="hint">在 <code>public/games.json</code> 写入 <code>[{ title, desc, cover, tag, href }]</code> 即可在这里展示。</p>
    </div>
  </section>
</template>

<style scoped>
.view {
  padding: 32px 0 64px;
}
.view-head h1 {
  margin: 0;
  font-size: 28px;
  letter-spacing: 0.06em;
}
.view-head p {
  margin: 6px 0 28px;
  color: var(--muted);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 18px;
}
.game-card {
  background: var(--subtle) !important;
  border-radius: 16px !important;
  overflow: hidden;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.game-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
}
.cover {
  height: 130px;
  background: linear-gradient(135deg, #2a2f3a, #1c2029);
  background-size: cover;
  background-position: center;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40px;
}
.meta {
  padding: 14px 4px 6px;
}
.tag {
  display: inline-block;
  font-size: 11px;
  color: var(--accent);
  border: 1px solid var(--accent);
  border-radius: 999px;
  padding: 1px 9px;
  margin-bottom: 8px;
}
.meta h3 {
  margin: 0 0 6px;
  font-size: 16px;
}
.meta p {
  margin: 0 0 8px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
}
.state {
  color: var(--muted);
  padding: 40px 0;
  text-align: center;
}
.empty .empty-emoji {
  font-size: 48px;
  margin-bottom: 12px;
}
.empty .hint {
  font-size: 13px;
}
.empty code {
  background: var(--subtle);
  padding: 1px 6px;
  border-radius: 6px;
  color: var(--text);
}
</style>
