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

  /* 数据：静态链接列表 */
  const myLinks = ref([])
  const linkLoading = ref(true)
  const visibleLinks = computed(() => myLinks.value)

  async function loadLinks() {
    linkLoading.value = true
    try {
      myLinks.value = [
        {
          date: '2026-08-22',
          body: '## Friends Link\n\n- [Ragnote](https://www.ragnote.top/) — 面向知识管理与 RAG 实践的个人博客\n- [纸鹿摸鱼处](https://blog.zhilu.site/) — 纸鹿至麓不知路，支炉制露不止漉\n- [kzhik](https://www.kzhik.cn) — kzhik 的个人网站\n- [小满的墨水瓶](https://www.yhdzz.cn) — 天上如是，地下亦然\n- [VnYzm的博客](https://vnyzm.top) — 分享技术心得和摸鱼感想\n- [爱情在线](https://aqzx.com/index.asp) — 应该是全世界第一对认真网恋的人……\n- [又见苍岚](https://www.zywvvd.com) — 蓝天依旧，明眸如初\n- [雾语](https://foglog.cn/) — 迷雾轻语，雅意深藏\n- [轻风blog](https://www.qingfengnb.cn) — 茫茫人海，多么幸运才能遇见你！\n- [Arthals\' ink](https://arthals.ink/) — 所见高山远木，阔云流风；所幸岁月盈余，了无拘束\n- [橙树志](https://citydatum.cn) — 城市数据记录',
        },
        {
          date: '2026-08-21',
          body: '## Tools Link\n\n- [GitHub](https://github.com) — 代码托管\n- [VS Code](https://code.visualstudio.com) — 编辑器\n- [Figma](https://figma.com) — 设计工具\n- [Stack Overflow](https://stackoverflow.com) — 技术问答',
        },
        {
          date: '2026-08-15',
          body: '## Resources Link\n\n- [MDN](https://developer.mozilla.org) — Web 文档\n- [Vue.js](https://vuejs.org) — 前端框架\n- [Rust](https://www.rust-lang.org) — 系统编程\n- [掘金](https://juejin.cn) — 技术社区',
        },
        {
          date: '2026-08-23',
          body: '## Game Link\n\n- [TouchGal](https://www.touchgal.ink) — 一站式 Galgame 文化社区\n- [蜜柑计划](https://mikanime.tv) — Mikan Project 动漫 RSS 订阅下载\n- [盘链](https://pinglian.lol/all-videos.php?type=30) — 影片资源分享\n- [稻荷GAL](https://inarigal.net) — 免费 Galgame 资源下载分享社区\n- [AI Hobbyist](https://res.acgnai.top) — AI 游戏资源库',
        },
      ]
    } catch (e) {
      console.error('加载链接列表失败：', e)
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
