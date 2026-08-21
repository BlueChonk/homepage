import { ref, computed, onMounted, onUnmounted } from 'vue'

/* ---- 类型定义 ---- */
/**
 * @typedef {Object} BlogPost
 * @property {string} slug       - 文章标识（文件名去掉 .md）
 * @property {string} title      - 文章标题
 * @property {string} date       - 发布日期 (YYYY-MM-DD)
 * @property {string} category   - 分类
 * @property {string[]} tags     - 标签数组
 * @property {string} summary    - 摘要
 * @property {string} body       - Markdown 正文
 * @property {number} wordCount  - 字数
 * @property {string} file       - 原始文件名
 */

/* 日志正文外链：一律新标签页打开 */
function externalizeLogLinks(a) {
  const href = a.getAttribute('href') || ''
  if (!/^https?:\/\//i.test(href)) return
  let external = true
  try {
    const u = new URL(href, location.href)
    external = u.origin !== location.origin
  } catch {
    external = true
  }
  if (external) {
    a.setAttribute('target', '_blank')
    a.setAttribute('rel', 'noopener noreferrer')
  }
}

/* useBlog：消费 blog.jsonl（结构化 JSON Lines） */
export function useBlog() {
  /* 标题闪动 */
  const blogTitle = ref('BLOG')
  let blogTitleTimer = null
  let blogVisible = true

  function blinkBlogTitle() {
    blogVisible = !blogVisible
    blogTitleTimer = setTimeout(blinkBlogTitle, 800)
  }

  /* 数据：博客文章列表 */
  /** @type {import('vue').Ref<BlogPost[]>} */
  const posts = ref([])
  const blogLoading = ref(true)
  const visiblePosts = computed(() => posts.value)

  /* 分类过滤 */
  const activeCategory = ref('all')
  const categories = computed(() => {
    const set = new Set(posts.value.map((p) => p.category).filter(Boolean))
    return ['all', ...Array.from(set)]
  })
  const filteredPosts = computed(() =>
    activeCategory.value === 'all'
      ? posts.value
      : posts.value.filter((p) => p.category === activeCategory.value)
  )

  async function loadPosts() {
    blogLoading.value = true
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}blog.jsonl`, { cache: 'no-cache' })
      const text = await res.text()
      posts.value = text.trim().split('\n').map((line) => JSON.parse(line))
    } catch (e) {
      console.error('读取 blog.jsonl 失败：', e)
      posts.value = []
    } finally {
      blogLoading.value = false
    }
  }

  onMounted(() => {
    blogTitleTimer = setTimeout(blinkBlogTitle, 600)
    loadPosts()
  })

  onUnmounted(() => {
    clearTimeout(blogTitleTimer)
  })

  function onBlogRendered(e) {
    const root = e.currentTarget
    if (!root) return
    root.querySelectorAll('a[href]').forEach(externalizeLogLinks)
  }

  function setCategory(cat) {
    activeCategory.value = cat
  }

  return {
    blogTitle,
    blogVisible,
    posts,
    blogLoading,
    visiblePosts,
    filteredPosts,
    categories,
    activeCategory,
    onBlogRendered,
    loadPosts,
    setCategory,
  }
}
