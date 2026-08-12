import { readFileSync } from 'node:fs'

export function extractTitle(file, fallback) {
  try {
    const text = readFileSync(file, 'utf8')
    const m = text.match(/^#\s+(.+)$/m)
    if (m) return m[1].trim()
  } catch {
    /* ignore */
  }
  return fallback
}

// 字数：中文字符逐字计数 + 英文/数字按词计数
export function countWords(md) {
  const cjk = (md.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length
  const words = (md.match(/[A-Za-z0-9_]+/g) || []).length
  return cjk + words
}

// 去掉行内的 markdown 语法，得到纯文本（统一卡片摘要的显示规格）
export function cleanExcerptLine(line) {
  let s = String(line || '').trim()
  // 块引用 / 无序 / 有序列表前缀
  s = s.replace(/^>\s?/, '')
  s = s.replace(/^[-*+]\s+/, '')
  s = s.replace(/^\d+[.、)]\s+/, '')
  // 链接 -> 文字，行内代码 / 加粗 / 斜体去掉标记
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  s = s.replace(/`([^`]*)`/g, '$1')
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1')
  s = s.replace(/__([^_]+)__/g, '$1')
  s = s.replace(/\*([^*]+)\*/g, '$1')
  s = s.replace(/_([^_]+)_/g, '$1')
  // 简单 HTML 标签
  s = s.replace(/<[^>]+>/g, '')
  return s.trim()
}

// 从 markdown 文件提取日期、简介、分类。
// 摘要规则：跳过代码围栏与其中的内容，优先取正文首段；
// 无正文段落时依次回退到块引用、代码块首条有效命令，避免出现裸的 ```bash。
export function extractMeta(file) {
  let date = ''
  let excerpt = ''
  let category = '记录'
  try {
    const raw = readFileSync(file, 'utf-8')
    const lines = raw.split('\n')
    let inFence = false
    let firstPlain = ''
    let firstQuote = ''
    let firstCode = ''
    for (const line of lines) {
      const t = line.trim()
      // 代码围栏：跳过围栏标记与内部所有行
      if (/^```/.test(t)) {
        inFence = !inFence
        continue
      }
      if (inFence) {
        // 记录代码块内第一条“有效”命令行（跳过注释与空行），供无正文文档回退
        if (!firstCode && t && !/^(#|\/\/)/.test(t)) firstCode = t
        continue
      }
      if (!t || /^#{1,6}\s/.test(t) || /^---$/.test(t)) continue
      // 尝试提取日期
      if (/^\d{4}[-/]\d{2}[-/]\d{2}/.test(t) && !date) { date = t.match(/^\d{4}[-/]\d{2}[-/]\d{2}/)[0] }
      if (!firstPlain) {
        // 块引用/提示语不算正文首段，仅作回退
        if (/^>/.test(t)) {
          if (!firstQuote) firstQuote = t
          continue
        }
        firstPlain = t
      }
    }
    const rawExcerpt = firstPlain || firstQuote || firstCode || ''
    excerpt = rawExcerpt ? cleanExcerptLine(rawExcerpt).slice(0, 180) : ''
    // 尝试从 frontmatter 或内容中提取分类
    const catMatch = raw.match(/(?:category|分类)[:\s]+(.+?)(?:\n|$)/i)
    if (catMatch) category = catMatch[1].trim()
  } catch { /* ignore */ }
  return { date, excerpt, category }
}
