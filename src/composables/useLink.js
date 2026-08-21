import { ref, computed, onMounted, onUnmounted } from 'vue'

/* 链接正文外链：一律新标签页打开 */
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

/* useLink：消费 link.jsonl（结构化 JSON Lines） */
export function useLink() {
  /* 标题闪动 */
  const linkTitle = ref('LINK')
  let linkTitleTimer = null
  let linkVisible = true

  function blinkLinkTitle() {
    linkVisible = !linkVisible
    linkTitleTimer = setTimeout(blinkLinkTitle, 800)
  }

  /* 数据：链接列表 */
  const myLinks = ref([])
  const linkLoading = ref(true)
  const visibleLinks = computed(() => myLinks.value)

  async function loadLinks() {
    linkLoading.value = true
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}link.jsonl`, { cache: 'no-cache' })
      const text = await res.text()
      myLinks.value = text.trim().split('\n').map((line) => JSON.parse(line))
    } catch (e) {
      console.error('读取 link.jsonl 失败：', e)
      myLinks.value = []
    } finally {
      linkLoading.value = false
    }
  }

  onMounted(() => {
    linkTitleTimer = setTimeout(blinkLinkTitle, 600)
    loadLinks()
  })

  onUnmounted(() => {
    clearTimeout(linkTitleTimer)
  })

  function onLinkRendered(e) {
    const root = e.currentTarget
    if (!root) return
    root.querySelectorAll('a[href]').forEach(externalizeLogLinks)
  }

  return { linkTitle, linkVisible, myLinks, linkLoading, visibleLinks, onLinkRendered, loadLinks }
}
