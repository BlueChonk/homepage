import { ref, onMounted, onUnmounted } from 'vue'

/* useProjects：静态项目列表（前端硬编码，无实时请求） */
export function useProjects() {
  /* 标题闪动 */
  const projectsTitle = ref('PROJECTS')
  let titleTimer = null
  let titleVisible = true

  function blinkTitle() {
    titleVisible = !titleVisible
    titleTimer = setTimeout(blinkTitle, 800)
  }

  /* 静态项目数据 */
  const projects = ref([])
  const loading = ref(true)

  async function loadProjects() {
    loading.value = true
    try {
      projects.value = [
        {
          name: 'EchoBot',
          desc: 'Your Anime AI Companion',
          stars: 0,
          lang: null,
          url: 'https://github.com/BlueChonk/EchoBot',
        },
        {
          name: 'homepage',
          desc: 'Cecilia 的个人主页：Vue 3 + Vite 个人网站。',
          stars: 1,
          lang: 'Vue',
          url: 'https://github.com/BlueChonk/homepage',
        },
        {
          name: 'LingChat',
          desc: 'Immersive AI-driven Galgame chat with emotional expressions, desktop pet, scheduling, and interactive story modules.',
          stars: 0,
          lang: null,
          url: 'https://github.com/BlueChonk/LingChat',
        },
        {
          name: 'qqmusic-credential-reverse-engineering',
          desc: 'Reverse engineering of QQ Music desktop client\'s local credential storage on Windows — AES-128-CBC encryption analysis, binary key extraction, MMKV/ConfigInfo/Cookie decryption research.',
          stars: 1,
          lang: 'JavaScript',
          url: 'https://github.com/BlueChonk/qqmusic-credential-reverse-engineering',
        },
        {
          name: 'skills',
          desc: 'Windows-focused AI-agent skills',
          stars: 1,
          lang: 'Python',
          url: 'https://github.com/BlueChonk/skills',
        },
        {
          name: 'trae-credential-reverse-engineering',
          desc: 'Reverse engineering of TraeWork CN desktop client\'s local credential storage on Windows — methodology, findings, and research notes.',
          stars: 1,
          lang: null,
          url: 'https://github.com/BlueChonk/trae-credential-reverse-engineering',
        },
        {
          name: 'trae-daily-checkin',
          desc: 'Trae SOLO CN daily check-in automation via Chrome DevTools Protocol (CDP). Zero dependencies, clicks the avatar and the daily check-in button automatically.',
          stars: 1,
          lang: 'JavaScript',
          url: 'https://github.com/BlueChonk/trae-daily-checkin',
        },
      ]
    } catch (e) {
      console.error('加载项目列表失败：', e)
      projects.value = []
    } finally {
      loading.value = false
    }
  }

  onMounted(() => {
    titleTimer = setTimeout(blinkTitle, 600)
    loadProjects()
  })

  onUnmounted(() => {
    clearTimeout(titleTimer)
  })

  return { projectsTitle, titleVisible, projects, loading, loadProjects }
}
