import { createHighlighter } from 'shiki'
import { fromHighlighter } from '@shikijs/markdown-it'
import MarkdownIt from 'markdown-it'

const h = await createHighlighter({ themes: ['github-dark'], langs: ['bash', 'json'] })
const md = new MarkdownIt()
md.use(fromHighlighter(h, { theme: 'github-dark' }))
const out = md.render(
  '```bash\ncurl -X POST https://api.example.com \\\n  -H "Content-Type: application/json"\necho done\n```'
)
console.log(out)
