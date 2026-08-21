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
          desc: 'BlueChonk\'s Home',
          stars: 1,
          lang: 'Vue',
          url: 'https://github.com/BlueChonk/homepage',
        },
        {
          name: 'qqmusic-credential-reverse-engineering',
          desc: 'QQ Music Windows 客户端本地凭据存储逆向：AES-128-CBC 加密分析、密钥提取、MMKV/ConfigInfo/Cookie 解密。',
          stars: 1,
          lang: 'JavaScript',
          url: 'https://github.com/BlueChonk/qqmusic-credential-reverse-engineering',
        },
        {
          name: 'skills',
          desc: 'Windows 平台 AI Agent 技能集。',
          stars: 1,
          lang: 'Python',
          url: 'https://github.com/BlueChonk/skills',
        },
        {
          name: 'trae-credential-reverse-engineering',
          desc: 'TraeWork CN Windows 客户端本地凭据存储逆向：方法与发现。',
          stars: 1,
          lang: null,
          url: 'https://github.com/BlueChonk/trae-credential-reverse-engineering',
        },
        {
          name: 'trae-daily-checkin',
          desc: 'TraeWork CN 每日签到自动化，基于 CDP 零依赖实现。',
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
