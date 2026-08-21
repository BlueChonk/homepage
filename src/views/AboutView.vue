<script setup>
import { ref } from 'vue'
import { Card } from 'ant-design-vue'
import AppFooter from '../components/AppFooter.vue'

// 个人头像，仅用于个人资料展示
const myAvatar = '/avatar.png'

// 站点可能部署在子路径（如 GitHub Pages 的 /homepage/），
// 绝对路径会落到域名根目录导致 404；统一用 BASE_URL 拼接成相对路径。
function resolveUrl(u) {
  if (!u) return ''
  if (/^(https?:)?\/\//i.test(u)) return u
  const base = import.meta.env.BASE_URL || '/'
  // base 为 './' 时拼接会变成 './/icon/...'，在子路由下会被解析为相对路径而 404
  // 直接用 '/' 兜底，保证所有页面都从根路径加载资源
  return u.startsWith('/') ? '/' + u.replace(/^\//, '') : u
}

// 工具按类别分组，每个类别以一个卡片式外框展示。
// 图标优先引用各平台官方 favicon（远程 URL，符合项目规范）。
const toolGroups = [
  {
    title: 'AI 打工团',
    items: [
      { name: 'Hermes', desc: '全能助手，能写代码能管服务器', icon: '/icon/hermes.png', href: 'https://hermes-agent.nousresearch.com/' },
      { name: 'DSH', desc: '便宜又能打，算力刺客', icon: '/icon/deepseek.svg', href: 'https://www.deepseek.com/harness/' },
      { name: 'Codex', desc: '主力生产力，写码如喝水，摸鱼终结者', icon: '/icon/codex.ico', href: 'https://openai.com/codex' },
    ],
  },
  {
    title: '写码装备',
    items: [
      { name: 'VS Code', desc: '插件比代码还多的编辑器', icon: '/icon/vscode.ico', href: 'https://code.visualstudio.com/' },
      { name: 'Git', desc: '后悔药批发商', icon: '/icon/git.ico', href: 'https://git-scm.com/' },
      { name: 'Apifox', desc: '前后端对线的和事佬', icon: '/icon/apifox.ico', href: 'https://apifox.com/' },
    ],
  },
  {
    title: '环境搬家队',
    items: [
      { name: 'Docker', desc: '一键打包，走哪跑哪', icon: '/icon/docker.ico', href: 'https://www.docker.com/' },
      { name: 'Miniconda', desc: '给每个项目单独开间房', icon: '/icon/miniconda.ico', href: 'https://docs.anaconda.net.cn/miniconda/' },
      { name: 'Ubuntu', desc: '命令行钉子户', icon: '/icon/ubuntu.png', href: 'https://ubuntu.com/' },
    ],
  },
  {
    title: '数据库观光团',
    items: [
      { name: 'DBX', desc: '一拖七十，数据库大管家', icon: '/icon/dbx.png', href: 'https://dbxio.com/cn' },
    ],
  },
]

// 图标加载失败时显示首字母徽章作为兜底
const iconFailed = ref({})
function onIconError(name) {
  iconFailed.value = { ...iconFailed.value, [name]: true }
}

// 点击带链接的工具卡片时新窗口打开
function openLink(href) {
  if (href) window.open(href, '_blank', 'noopener')
}

// 下拉刷新：重新加载页面（相当于重新进入当前 URL）
defineExpose({ reload: () => window.location.reload() })
</script>

<template>
  <div class="about-page">
    <!-- 顶部介绍 -->
    <header class="about-hero">
      <div class="hero-inner">
        <div class="avatar-ring">
          <img :src="resolveUrl(myAvatar)" alt="BlueChonk" draggable="false" />
        </div>
        <div class="hero-text">
          <div class="hello">Hi, 我是</div>
          <h1 class="name">BlueChonk</h1>
          <p class="tagline">技术宅 · 二次元 · 全栈开发</p>
          <p class="hero-sub">前端全栈二次元</p>
        </div>
      </div>
    </header>

    <main class="about-main">
      <!-- 1. About / 自我介绍 -->
      <section class="block">
        <h2 class="block-title">About</h2>
        <p class="about-intro">
          你好，我是 BlueChonk，一个热爱二次元与技术的全栈开发者。平时喜欢折腾前端工程化、捣鼓各种开发工具，也喜欢把生活里的美食和光影记录下来。这个站点是我的小角落，用来分享作品、笔记和一些不成熟的想法。
        </p>
      </section>

      <!-- 2. Tools / 常用工具（按类别分卡片式外框展示） -->
      <section class="block">
        <h2 class="block-title">Tools</h2>
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

    </main>

    <AppFooter />
  </div>
</template>

<style scoped>
.about-page {
  min-height: 100%;
  color: var(--text);
  font-family: inherit;
}

/* hero */
.about-hero {
  padding: 72px 24px 36px;
  display: flex;
  justify-content: center;
}
.hero-inner {
  display: flex;
  align-items: center;
  gap: 28px;
  max-width: 880px;
  width: 100%;
}
.avatar-ring {
  width: 116px;
  height: 116px;
  border-radius: 50%;
  padding: 4px;
  background: conic-gradient(from 180deg, var(--accent), var(--accent-strong), #7c5cff, var(--accent));
  animation: spin 12s linear infinite;
  flex-shrink: 0;
  cursor: default;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
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
.hello {
  font-size: 15px;
  color: var(--text-secondary);
  letter-spacing: 1px;
}
.name {
  font-size: 38px;
  font-weight: 700;
  margin: 4px 0 8px;
  background: linear-gradient(90deg, var(--accent-strong), var(--accent));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.tagline {
  color: var(--text-tertiary);
  font-size: 15px;
  margin: 0 0 12px;
}
.hero-sub {
  color: var(--text-secondary);
  font-size: 14px;
  margin: 0 0 12px;
}
.about-intro {
  font-size: 15px;
  line-height: 1.8;
  color: var(--text-secondary);
  margin: 0;
}

/* blocks */
.about-main {
  max-width: 880px;
  margin: 0 auto;
  padding: 12px 24px 8px;
  display: flex;
  flex-direction: column;
  gap: 36px;
}
.block-title {
  font-size: 19px;
  font-weight: 600;
  color: var(--text);
  margin: 0 0 18px;
}

/* tools / hobbies (AntD Card) */
.tool-group {
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--surface);
  padding: 20px 22px 22px;
  margin-bottom: 18px;
}
.tool-group:last-child {
  margin-bottom: 0;
}
.group-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--accent);
  margin: 0 0 16px;
}
.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 14px;
}
.info-card {
  background: var(--surface) !important;
  border: 1px solid var(--border) !important;
  border-radius: 14px !important;
}
.info-card :deep(.ant-card-body) {
  padding: 16px 18px;
}
.info-card:hover {
  border-color: var(--accent-border) !important;
  background: var(--accent-soft) !important;
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

/* contact */
.contact-section {
  padding: 8px 0 4px;
}
.contact-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 14px;
}
.contact-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 18px;
  border-radius: var(--radius-md);
  background: var(--surface);
  border: 1px solid var(--border);
  text-decoration: none;
  transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}
.contact-card:hover {
  transform: translateY(-3px);
  border-color: var(--accent-border);
  background: var(--accent-soft);
}
.contact-icon {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: var(--accent);
}
.contact-icon img {
  width: 22px;
  height: 22px;
  object-fit: contain;
  border-radius: 5px;
}
.contact-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}

@media (max-width: 640px) {
  .hero-inner {
    flex-direction: column;
    text-align: center;
  }
  .name {
    font-size: 30px;
  }
}
</style>
