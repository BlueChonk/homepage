import { createHighlighter } from 'shiki'
import { fromHighlighter } from '@shikijs/markdown-it'

// 需要高亮的常见语言（含别名），按需加载以控制体积
const LANGS = [
  'bash', 'shell', 'sh', 'zsh',
  'javascript', 'typescript', 'json',
  'vue', 'html', 'xml', 'css', 'scss',
  'python', 'markdown', 'yaml', 'docker', 'ini', 'sql',
]
// 额外别名补充
const LANG_ALIAS = {
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  sh: 'bash',
  shell: 'bash',
  yml: 'yaml',
  dockerfile: 'docker',
}

let shikiPluginPromise = null

/**
 * 构建 Shiki 高亮器，返回可直接 `md.use(...)` 的 markdown-it 插件。
 * Shiki 把每一行渲染为独立的 .line 节点，行号与代码行一一对应，
 * 从根本上避免“两套 DOM + 行高累积偏移”导致的行号错位问题。
 *
 * 该插件与具体编辑器无关，供封装的 MarkdownPreview 组件复用。
 */
export async function getShikiPlugin() {
  if (shikiPluginPromise) return shikiPluginPromise

  shikiPluginPromise = (async () => {
    const highlighter = await createHighlighter({
      themes: ['github-dark', 'github-light'],
      langs: LANGS,
      langAlias: LANG_ALIAS,
    })

    // 同时输出亮/暗两套主题，由外层 CSS 通过 .shiki 的 color-scheme 切换
    return fromHighlighter(highlighter, {
      themes: { dark: 'github-dark', light: 'github-light' },
      defaultLanguage: 'text',
      fallbackLanguage: 'text',
    })
  })()

  return shikiPluginPromise
}
