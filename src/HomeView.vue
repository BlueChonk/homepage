<script setup>
import { ref, computed, inject, onMounted, onUnmounted, watch, nextTick } from 'vue'
import AppFooter from './AppFooter.vue'

const { projects } = inject('projects')

function resolveUrl(u) {
  if (!u) return ''
  if (/^(https?:)?\/\//i.test(u)) return u
  const base = import.meta.env.BASE_URL || '/'
  return u.startsWith('/') ? base.replace(/\/$/, '') + u : u
}
const socials = computed(() => {
  return [
    { icon: '/icon/github.svg', href: 'https://github.com/BlueChonk', label: 'GitHub' },
    { icon: '/icon/steam.ico', href: 'https://steamcommunity.com/profiles/76561198726425168/', label: 'Steam' },
    { icon: '/icon/bilibili.ico', href: 'https://space.bilibili.com/1920131239', label: '哔哩哔哩' },
  ]
})

/* 项目 */



/* ABOUT 编码效果 */
const aboutLines = [
  { text: '你好，我是 BlueChonk，一个热爱二次元与技术的全栈开发者。平时喜欢折腾前端工程化、捣鼓各种开发工具。', tag: 'text' },
]
const aboutTyped = ref([])
const aboutLineIdx = ref(0)
const aboutCharIdx = ref(0)
const aboutEditorRef = ref(null)
let aboutTimer = null
let aboutPaused = false

/* ABOUT 编辑器光标跟随 */
function scrollAboutCursor() {
  const el = aboutEditorRef.value
  if (!el) return
  const isMobile = window.innerWidth <= 520
  const textEl = el.querySelector('.token-text')
  if (!textEl) return

  if (!isMobile) {
    textEl.style.transform = ''
    return
  }

  const containerWidth = el.clientWidth
  const textWidth = textEl.scrollWidth

  // 文字能放下，不需要位移
  if (textWidth + 20 <= containerWidth) {
    textEl.style.transform = ''
    return
  }

  // 打字：光标在右侧，左侧被吞
  const cursorEl = el.querySelector('.cursor-mini')
  if (cursorEl) {
    const cursorRect = cursorEl.getBoundingClientRect()
    const containerRect = el.getBoundingClientRect()
    const overflow = cursorRect.right - containerRect.right + 4
    if (overflow > 0) {
      textEl.style.transform = `translateX(-${overflow}px)`
    }
  } else {
    // 文字已打完，靠右显示
    const overflow = textWidth - containerWidth + 20
    textEl.style.transform = `translateX(-${overflow}px)`
  }
}

function aboutTick() {
  if (aboutPaused) return

  if (aboutLineIdx.value >= aboutLines.length) {
    // 全部打完，暂停后重新开始
    aboutPaused = true
    aboutTimer = setTimeout(() => {
      aboutTyped.value = []
      aboutLineIdx.value = 0
      aboutCharIdx.value = 0
      aboutPaused = false
      aboutTick()
    }, 3000)
    return
  }

  const line = aboutLines[aboutLineIdx.value]
  if (aboutCharIdx.value === 0) {
    aboutTyped.value.push({ text: '', tag: line.tag, id: aboutLineIdx.value })
  }

  if (aboutCharIdx.value < line.text.length) {
    aboutTyped.value[aboutTyped.value.length - 1].text = line.text.slice(0, aboutCharIdx.value + 1)
    aboutCharIdx.value++
    aboutTimer = setTimeout(aboutTick, 50 + Math.random() * 50)
  } else {
    aboutLineIdx.value++
    aboutCharIdx.value = 0
    aboutTimer = setTimeout(aboutTick, 150)
  }
}

/* 监听打字变化，更新滚动目标 */
watch(aboutTyped, () => {
  nextTick(() => scrollAboutCursor())
}, { deep: true })

onMounted(() => {
  aboutTimer = setTimeout(aboutTick, 600)
})
onUnmounted(() => {
  if (aboutTimer) clearTimeout(aboutTimer)
})

/* About 工具组 */
const toolGroups = [
  {
    title: '代码全家桶',
    items: [
      { name: 'DSH', desc: '吃白饭的蓝色大肥鱼', icon: '/icon/deepseek.svg', href: 'https://www.deepseek.com/harness/' },
      { name: 'OpenClaw', desc: '养了只电子龙虾', icon: '/icon/openclaw.svg', href: 'https://openclaw.dev/' },
      { name: 'OpenCode', desc: '开源编码智能体', icon: '/icon/opencode.svg', href: 'https://opencode.ai/zh' },
      { name: 'Codex', desc: '脑子里全是哥布林', icon: '/icon/codex.ico', href: 'https://openai.com/codex' },
      { name: 'VS Code', desc: '装完插件重如泰山', icon: '/icon/vscode.ico', href: 'https://code.visualstudio.com/' },
      { name: 'Git', desc: '回滚失败就原地升天', icon: '/icon/git.ico', href: 'https://git-scm.com/' },
    ],
  },
  {
    title: '环境搬家队',
    items: [
      { name: 'DBX', desc: '七十种库一把全拿捏', icon: '/icon/dbx.png', href: 'https://dbxio.com/cn' },
      { name: 'Docker', desc: '打包一时爽排错火葬场', icon: '/icon/docker.ico', href: 'https://www.docker.com/' },
      { name: 'Miniconda', desc: '房间越开越多记不住', icon: '/icon/miniconda.ico', href: 'https://docs.anaconda.net.cn/miniconda/' },
      { name: 'uv', desc: 'Rust 写的飞快包管理器', icon: '/icon/uv.svg', href: 'https://uv.doczh.com/' },
      { name: 'Node.js', desc: '前端后端一把梭', icon: '/icon/nodejs.svg', href: 'https://nodejs.org/' },
      { name: 'Ubuntu', desc: '服务器常驻老油条', icon: '/icon/ubuntu.png', href: 'https://ubuntu.com/' },
    ],
  },
]

/* Skills 分类标签 */
const skillsCategories = [
  {
    category: 'Web',
    tags: ['Vue', 'TypeScript', 'JavaScript', 'HTML', 'CSS', 'Vite'],
  },
  {
    category: 'Backend',
    tags: ['Python', 'PyTorch', 'Node.js'],
  },
  {
    category: 'Database',
    tags: ['MySQL', 'PostgreSQL', 'Redis', 'Milvus', 'Chroma', 'Faiss', 'Qdrant'],
  },
  {
    category: 'Tools',
    tags: ['Nginx', 'Linux', 'Markdown', 'SSH', 'Nano'],
  },
]

const iconFailed = ref({})
function onIconError(name) {
  iconFailed.value = { ...iconFailed.value, [name]: true }
}
function openLink(href) {
  if (href) window.open(href, '_blank', 'noopener')
}
</script>

<template>
  <div class="home-page">
    <!-- hero -->
    <section class="hero">
      <!-- 装饰性星星 -->
      <div class="hero-sparkles" aria-hidden="true">
        <span class="sparkle sparkle-1">✦</span>
        <span class="sparkle sparkle-2">✧</span>
        <span class="sparkle sparkle-3">✦</span>
        <span class="sparkle sparkle-4">✧</span>
        <span class="sparkle sparkle-5">✦</span>
      </div>
      <div class="avatar-ring">
        <img src="/avatar.png" alt="BlueChonk" draggable="false" />
      </div>
      <div class="badge">技术二次元宅</div>

      <h1 class="title">Hi，我是 BlueChonk</h1>

      <!-- 联系方式 -->
      <div class="contact-bar">
        <a
          v-for="s in socials"
          :key="s.label"
          :href="s.href"
          :target="'_blank'"
          rel="noopener noreferrer"
          class="contact-chip"
        >
          <img v-if="s.icon" :src="resolveUrl(s.icon)" :alt="s.label" class="contact-chip-icon" />
          <span v-else class="contact-chip-icon contact-chip-emoji" aria-hidden="true">✉</span>
          <span>{{ s.label }}</span>
        </a>
      </div>
    </section>

    <!-- About 介绍 -->
    <section class="block">
      <h2 class="block-title">ABOUT</h2>
      <div class="about-box">
        <div class="code-editor-mini" ref="aboutEditorRef">
          <div class="code-line" v-for="line in aboutTyped" :key="line.id">
            <span :class="['token-' + line.tag]">{{ line.text }}</span>
            <span class="cursor-mini" v-if="aboutTyped.length === 1 && aboutTyped[0].text.length < aboutLines[0].text.length" />
          </div>
          <div class="code-line code-line-active" v-if="aboutTyped.length === 0">
            <span class="cursor-mini" />
          </div>
        </div>
        <p class="about-intro fallback-text">
          你好，我是 BlueChonk，一个热爱二次元与技术的全栈开发者。平时喜欢折腾前端工程化、捣鼓各种开发工具。
        </p>
      </div>
    </section>

    <!-- Skills 技术栈 -->
    <section class="block">
      <h2 class="block-title">SKILLS</h2>
      <div class="tool-group">
        <div
          v-for="c in skillsCategories"
          :key="c.category"
          class="skills-row"
        >
          <h3 class="group-title skills-category">{{ c.category }}</h3>
          <div class="skills-tags">
            <span
              v-for="t in c.tags"
              :key="t"
              class="skills-tag"
            >{{ t }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Tools -->
    <section class="block">
      <h2 class="block-title">DEV TOOLS</h2>
      <div
        v-for="g in toolGroups"
        :key="g.title"
        class="tool-group"
      >
        <h3 class="group-title">{{ g.title }}</h3>
        <div class="info-grid">
          <Card
            v-for="t in g.items"
            :key="t.name"
            :bordered="false"
            class="info-card"
            hoverable
            :class="{ 'is-link': t.href }"
            @click="openLink(t.href)"
          >
            <div class="info-row">
              <div class="info-icon-wrap">
                <img
                  v-if="t.icon && !iconFailed[t.name]"
                  class="info-icon"
                  :src="resolveUrl(t.icon)"
                  :alt="t.name"
                  @error="onIconError(t.name)"
                />
                <span v-else class="info-icon-fallback">
                  {{ t.name.slice(0, 1) }}
                </span>
              </div>
              <div class="info-text">
                <div class="info-name">{{ t.name }}</div>
                <div class="info-desc">{{ t.desc }}</div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </section>

    <!-- Projects -->
    <section class="block">
      <h2 class="block-title">
        PROJECTS
        <span v-if="projects.length" class="my-log-count">{{ projects.length }}</span>
      </h2>
      <div class="tool-group">
        <ul class="my-log-list">
          <li v-for="repo in projects" :key="repo.name" class="my-log-item">
            <div class="my-log-body">
              <div class="project-head">
                <a :href="repo.url" target="_blank" rel="noopener noreferrer" class="project-link">
                  {{ repo.name }}
                </a>
              </div>
              <p v-if="repo.desc" class="project-desc">{{ repo.desc }}</p>
              <div v-if="repo.topics?.length" class="project-topics">
                <span v-for="t in repo.topics" :key="t" class="project-topic">{{ t }}</span>
              </div>
            </div>
          </li>
        </ul>
      </div>
    </section>

    <AppFooter />
  </div>
</template>

<style scoped>
.home-page {
  position: relative;
  min-height: 100%;
  color: var(--text);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: 48px 24px 0;
  text-align: center;
  font-family: inherit;
}
/* hero 占满剩余空间：头像/描述垂直居中，页脚沉到最底部 */
.hero {
  flex: 1 1 auto;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

@media (max-width: 640px) {
  .home-page { padding: 24px 12px 0; }
  .avatar-ring {
    width: 108px;
    height: 108px;
    margin-bottom: 16px;
  }
  .badge {
    font-size: 12px;
    padding: 4px 12px;
    margin-bottom: 12px;
  }
}
@media (max-width: 440px) {
  .home-page { padding: 16px 6px 0; }
  .avatar-ring {
    width: 92px;
    height: 92px;
    margin-bottom: 12px;
  }
}

.avatar-ring {
  width: 132px;
  height: 132px;
  border-radius: 50%;
  padding: 4px;
  background: conic-gradient(from 180deg, var(--accent), var(--accent-strong), #7c5cff, var(--accent));
  animation: spin 12s linear infinite;
  margin-bottom: 22px;
  cursor: default;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
  position: relative;
  z-index: 1;
}

/* 装饰性星星 */
.hero-sparkles {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 260px;
  height: 60px;
  pointer-events: none;
  z-index: 0;
}
.sparkle {
  position: absolute;
  color: var(--accent);
  font-size: 14px;
  opacity: 0;
  animation: twinkle 3s ease-in-out infinite;
}
.sparkle-1 { left: 18%; top: 10%; animation-delay: 0s; font-size: 12px; }
.sparkle-2 { left: 35%; top: 35%; animation-delay: 0.6s; font-size: 10px; }
.sparkle-3 { left: 52%; top: 8%; animation-delay: 1.2s; font-size: 16px; }
.sparkle-4 { left: 68%; top: 30%; animation-delay: 0.3s; font-size: 11px; }
.sparkle-5 { left: 82%; top: 15%; animation-delay: 1.8s; font-size: 13px; }
@keyframes twinkle {
  0%, 100% { opacity: 0; transform: scale(0.8); }
  50% { opacity: 0.7; transform: scale(1.2); }
}
.avatar-ring img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  background: #15151c;
  display: block;
  user-select: none;
  -webkit-user-select: none;
  -webkit-user-drag: none;
  pointer-events: none;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

.badge {
  display: inline-block;
  padding: 5px 14px;
  border-radius: 999px;
  background: rgba(30, 30, 46, 0.75);
  backdrop-filter: blur(4px);
  border: 1px solid var(--accent-border);
  color: var(--accent);
  font-size: 13px;
  margin-bottom: 16px;
}

.title {
  font-size: clamp(28px, 5vw, 46px);
  font-weight: 700;
  margin: 0 0 10px;
  background: linear-gradient(90deg, var(--accent-strong), var(--accent));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.3));
}

/* contact bar – compact row above typed text */
.contact-bar {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin: 18px 0 22px;
}
.contact-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 999px;
  background: rgba(30, 30, 46, 0.7);
  backdrop-filter: blur(4px);
  border: 1px solid var(--border);
  text-decoration: none;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.contact-chip:hover {
  border-color: var(--accent-border);
  background: var(--accent-soft);
}
.contact-chip-icon {
  width: 18px;
  height: 18px;
  object-fit: contain;
  color: var(--text);
}
.contact-chip-emoji {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  line-height: 1;
  color: var(--text);
}
.contact-chip span {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
}

/* 窄屏时隐藏文字，只显示图标 */
@media (max-width: 480px) {
  .contact-chip {
    padding: 6px;
  }
  .contact-chip span:last-child {
    display: none;
  }
}

/* blocks */
.block {
  width: 100%;
  max-width: 880px;
  text-align: left;
  margin-top: 36px;
}
.block-title {
  font-size: 19px;
  font-weight: 600;
  color: var(--text);
  margin: 0 0 18px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

/* about section */
.about-box {
  border: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
  border-radius: 12px;
  padding: 20px 22px;
}
.about-intro {
  font-size: 15px;
  line-height: 1.8;
  color: var(--text-secondary);
  margin: 0;
}

/* 迷你代码编辑器效果 */
.code-editor-mini {
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 15px;
  line-height: 1.8;
  margin-bottom: 0;
  min-height: 1.8em;
}

/* 移动端：代码编辑器区域 */
@media (max-width: 520px) {
  .code-editor-mini {
    overflow-x: hidden;
    overflow-y: hidden;
    scrollbar-width: none;
    padding-bottom: 4px;
  }
  .code-editor-mini::-webkit-scrollbar {
    display: none;
  }
  .code-line {
    flex-wrap: nowrap;
  }
}
.code-line {
  display: flex;
  align-items: center;
  gap: 12px;
  white-space: pre;
}
.line-num {
  color: rgba(255, 255, 255, 0.25);
  font-size: 11px;
  min-width: 18px;
  text-align: right;
  user-select: none;
  flex-shrink: 0;
}
.token-text {
  color: var(--text-secondary);
  font-style: normal;
}
.code-line-active {
  display: flex;
  align-items: center;
}
.cursor-mini {
  display: inline-block;
  width: 2px;
  height: 16px;
  background: var(--accent);
  animation: blink 1s step-end infinite;
  margin-left: 2px;
}
.fallback-text {
  display: none;
}

/* 编码状态条 */
.coding-statusbar {
  display: none;
}

/* tools */
.tool-group {
  border: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
  border-radius: 16px;
  background: transparent;
  padding: 20px 22px 22px;
  margin-bottom: 18px;
}
.tool-group:last-child {
  margin-bottom: 0;
}
.group-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--accent);
  margin: 0 0 12px;
  text-align: left;
}
.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 14px;
}
.info-card {
  background: transparent !important;
  border: 1px solid transparent !important;
  border-radius: 14px !important;
  transition: background 0.15s, border-color 0.15s;
}
.info-card:hover {
  background: var(--surface) !important;
  border-color: var(--border) !important;
}
.info-card :deep(.ant-card-body) {
  padding: 16px 18px;
}
.info-card.is-link {
  cursor: pointer;
}

/* 工具卡片：图标在左、文字在右，水平排列 */
.info-row {
  display: flex;
  align-items: center;
  gap: 14px;
}
.info-icon-wrap {
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.info-icon {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  object-fit: contain;
}
.info-icon-fallback {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: linear-gradient(135deg, var(--accent), var(--accent-strong));
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}
.info-text {
  min-width: 0;
}
.info-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.2;
}
.info-desc {
  font-size: 13px;
  color: var(--text-tertiary);
  margin-top: 4px;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 移动端：允许描述文字换行 */
@media (max-width: 520px) {
  .info-desc {
    white-space: normal;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
}

.my-log-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  color: var(--accent-strong);
  background: var(--accent-soft);
  border-radius: 999px;
  padding: 2px 8px;
  min-width: 20px;
  height: 20px;
}
.my-log-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.my-log-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.my-log-body {
  flex: 1 1 auto;
  min-width: 0;
}
.my-log-empty {
  color: var(--text-tertiary);
  font-size: 14px;
}
.my-log-loading {
  color: var(--text-tertiary);
  font-size: 13px;
}

/* Projects */
.project-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 8px;
  min-width: 0;
  max-width: 100%;
}
.project-link {
  color: var(--accent);
  text-decoration: none;
  font-weight: 600;
  overflow-wrap: anywhere;
  word-break: break-word;
  min-width: 0;
}
.project-link:hover {
  text-decoration: underline;
}
.project-topics {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.project-topic {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 999px;
  border: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--surface);
}
.project-desc {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
  overflow-wrap: anywhere;
  word-break: break-word;
}

/* Skills 区块 */
.skills-row {
  display: flex;
  align-items: flex-start;
  gap: 18px;
  margin-bottom: 18px;
}
.skills-row:last-child {
  margin-bottom: 0;
}
.skills-category {
  flex: 0 0 96px;
  padding-top: 4px;
  margin-bottom: 0 !important;
}
.skills-tags {
  flex: 1 1 auto;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.skills-tag {
  display: inline-flex;
  align-items: center;
  padding: 5px 14px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.4;
}

@media (max-width: 768px) {
  .home-page {
    padding: 24px 16px 0;
  }
  .block {
    margin-top: 24px;
  }
  .skills-row {
    flex-direction: column;
    gap: 10px;
    margin-bottom: 14px;
  }
  .skills-category {
    flex: none;
    padding-top: 0;
  }
}
</style>
