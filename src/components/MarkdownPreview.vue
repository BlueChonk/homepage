<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import MarkdownIt from 'markdown-it'
import anchor from 'markdown-it-anchor'
import { getShikiPlugin } from '../composables/useShiki'

const props = defineProps({
  source: { type: String, default: '' },
  variant: { type: String, default: '' },
})

const mdRef = ref(null)
const html = ref('')

let md = null
let ready = false

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * 标题锚点 slug：同时支持中文与英文，重复标题自动追加序号，
 * 保证每个标题 id 唯一（目录跳转/滚动高亮的根基）。
 */
const usedSlugs = new Map()
function uniqueSlug(s) {
  const raw = String(s)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}\-_\u4e00-\u9fa5]+/gu, '')
    .replace(/^-+|-+$/g, '')
  const base = raw || 'section'
  const n = (usedSlugs.get(base) || 0) + 1
  usedSlugs.set(base, n)
  return n === 1 ? base : `${base}-${n}`
}

function createMd(shikiPlugin) {
  const instance = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    breaks: false,
    highlight: shikiPlugin
      ? undefined
      : (code, lang) =>
          `<pre class="shiki shiki-fallback language-${escapeHtml(lang || 'text')}"><code>${escapeHtml(code)}</code></pre>`,
  })

  instance.use(anchor, {
    permalink: false,
    slugify: uniqueSlug,
    callback: (token, info) => {
      token.attrSet('id', info.slug)
    },
  })

  if (shikiPlugin) instance.use(shikiPlugin)

  // 表格包一层滚动容器，窄屏下不撑破版面
  const defaultTableRender =
    instance.renderer.rules.table_open ||
    ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options))
  instance.renderer.rules.table_open = (tokens, idx, options, env, self) =>
    '<div class="table-wrap">' + defaultTableRender(tokens, idx, options, env, self)
  instance.renderer.rules.table_close = (tokens, idx, options, env, self) =>
    defaultTableRender(tokens, idx, options, env, self) + '</div>'

  // 相对图片路径补全 base 前缀（部署到子路径时仍可用）
  const defaultRender =
    instance.renderer.rules.image ||
    ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options))
  instance.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    const src = token.attrGet('src') || ''
    if (src && !/^(https?:|data:|blob:|\/)/i.test(src)) {
      const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '/')
      token.attrSet('src', base.replace(/\/$/, '') + '/' + src.replace(/^\.?\//, ''))
    }
    return defaultRender(tokens, idx, options, env, self)
  }
  return instance
}

async function ensureMd() {
  if (ready) return
  usedSlugs.clear()
  const shikiPlugin = await getShikiPlugin().catch(() => null)
  md = createMd(shikiPlugin)
  ready = true
}

async function render() {
  await ensureMd()
  html.value = md.render(props.source || '')
  await nextTick()
  decorateCodeBlocks()
  mdRef.value?.dispatchEvent(new CustomEvent('md-rendered', { bubbles: true }))
}

/**
 * 代码块增强：语言标签 + 复制按钮 + 横向滚动容器。
 * Shiki 结构：pre.shiki > code > .line...
 */
function decorateCodeBlocks() {
  const root = mdRef.value
  if (!root) return
  root.querySelectorAll('pre.shiki').forEach((pre) => {
    if (pre.dataset.enhanced === '1') return
    pre.dataset.enhanced = '1'

    // 去掉 Shiki 写入 pre 上的内联背景/文字色，统一由主题变量控制
    pre.removeAttribute('style')
    pre.classList.add('shiki-themed')

    const codeEl = pre.querySelector('code')
    const codeText = codeEl
      ? (codeEl.textContent || '')
          .replace(/\n$/, '')
          .split('\n')
          .map((l) => l.replace(/\s+$/, ''))
          .join('\n')
      : ''

    // Shiki 在每行之间输出换行文本节点，white-space: pre 下会额外渲染出行框导致行距翻倍；
    // .line 已是块级元素，这些换行节点是冗余的，直接移除
    if (codeEl) {
      ;[...codeEl.childNodes].forEach((node) => {
        if (node.nodeType === 3 && node.textContent.trim() === '') node.remove()
      })
      // 每行末尾追加 3 个空格：超长行横向滚动到底时，右侧仍保留固定间距
      codeEl.querySelectorAll('.line').forEach((line) => {
        if (!line.textContent.endsWith('   ')) line.append(document.createTextNode('   '))
      })
    }

    let lang = 'text'
    const cls = codeEl?.getAttribute('class') || pre.getAttribute('class') || ''
    const m = cls.match(/language-([\w+#-]+)/)
    if (m) lang = m[1]

    const header = document.createElement('div')
    header.className = 'shiki-header'

    const langLabel = document.createElement('span')
    langLabel.className = 'shiki-lang'
    langLabel.textContent = lang
    header.appendChild(langLabel)

    const copyBtn = document.createElement('button')
    copyBtn.type = 'button'
    copyBtn.className = 'shiki-copy'
    copyBtn.setAttribute('aria-label', '复制代码')
    copyBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
        <path fill="currentColor" d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z"/>
      </svg>
      <span class="shiki-copy-text">复制</span>
    `
    copyBtn.addEventListener('click', async () => {
      const label = copyBtn.querySelector('.shiki-copy-text')
      const ok = await copyToClipboard(codeText)
      if (label) label.textContent = ok ? '已复制' : '复制失败'
      copyBtn.classList.toggle('copied', ok)
      copyBtn.classList.toggle('failed', !ok)
      setTimeout(() => {
        if (label) label.textContent = '复制'
        copyBtn.classList.remove('copied', 'failed')
      }, 1500)
    })
    header.appendChild(copyBtn)

    const scroll = document.createElement('div')
    scroll.className = 'shiki-scroll'
    if (codeEl) scroll.appendChild(codeEl)

    pre.appendChild(header)
    pre.appendChild(scroll)
  })
}

async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

onMounted(render)
watch(() => props.source, render)

const rootClass = computed(() =>
  ['md-render', props.variant && `md-render--${props.variant}`].filter(Boolean).join(' ')
)
</script>

<template>
  <div :class="rootClass">
    <div ref="mdRef" class="md-render-inner" v-html="html"></div>
  </div>
</template>
