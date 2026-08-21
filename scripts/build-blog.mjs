/* 博客(blog) 构建脚本
 * 将 public/blog/ 下每个 *.md 解析 frontmatter + 正文，
 * 输出为 public/blog.jsonl（JSON Lines），供前端运行时直接消费。
 *
 * 每行结构：{ slug, title, date, category, tags, summary, top, body, wordCount, file }
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const blogDir = path.resolve(__dirname, '..', 'public', 'blog')
export const blogOut = path.resolve(__dirname, '..', 'public', 'blog.jsonl')

/* ---- Zod Schema 定义 ---- */
const BlogSchema = z.object({
  title: z.string().min(1, '标题不能为空'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD'),
  category: z.string().default(''),
  tags: z.array(z.string()).default([]),
  summary: z.string().default(''),
  draft: z.boolean().default(false),
  top: z.boolean().default(false),
})

/* ---- 极简 YAML frontmatter 解析 ---- */
function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return { frontmatter: {}, body: raw }
  const yaml = match[1]
  const body = match[2]
  const fm = {}
  for (const line of yaml.split('\n')) {
    const m = line.match(/^(\w[\w-]*):\s*(.*)$/)
    if (!m) continue
    const key = m[1]
    let val = m[2].trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (val.startsWith('[') && val.endsWith(']')) {
      const inner = val.slice(1, -1).trim()
      fm[key] = inner ? inner.split(',').map((s) => s.trim()) : []
    } else if (val === 'true') {
      fm[key] = true
    } else if (val === 'false') {
      fm[key] = false
    } else {
      fm[key] = val
    }
  }
  return { frontmatter: fm, body }
}

export function buildBlog() {
  try {
    if (!fs.existsSync(blogDir)) {
      console.log('[blog] 跳过（目录不存在）: public/blog')
      return
    }
    const files = fs
      .readdirSync(blogDir)
      .filter((f) => /\.md$/.test(f))
      .sort()
      .reverse()

    const lines = []
    for (const f of files) {
      const raw = fs.readFileSync(path.join(blogDir, f), 'utf-8')
      const { frontmatter, body } = parseFrontmatter(raw)

      // Zod schema 校验
      const result = BlogSchema.safeParse(frontmatter)
      if (!result.success) {
        console.warn(`[blog] ⚠ ${f} frontmatter 校验失败:`)
        for (const err of result.error.errors) {
          console.warn(`     ${err.path.join('.')}: ${err.message}`)
        }
        console.warn(`     跳过该文件`)
        continue
      }

      const data = result.data
      lines.push(
        JSON.stringify({
          slug: f.replace(/\.md$/, ''),
          title: data.title,
          date: data.date,
          category: data.category,
          tags: data.tags,
          summary: data.summary,
          top: data.top,
          body: body.trim(),
          wordCount: body.trim().replace(/\s/g, '').length,
          file: f,
        })
      )
    }

    fs.writeFileSync(blogOut, lines.join('\n') + '\n')
    console.log(`[blog] 生成 ${lines.length} 篇 → public/blog.jsonl`)
  } catch (e) {
    console.error('[blog] 构建失败:', e)
  }
}

// 兼容旧导出名
export { blogDir as feedsDir, blogOut as feedsOut, buildBlog as mergeFeeds }
