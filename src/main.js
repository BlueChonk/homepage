import { createApp } from 'vue'
import { Card, ConfigProvider } from 'ant-design-vue'
import 'ant-design-vue/es/style/reset.css'
import 'ant-design-vue/es/card/style/index.js'
import 'ant-design-vue/es/config-provider/style/index.js'
import App from './App.vue'
import './style.css'

/* ---- Projects (静态数据) ---- */
const projects = [
  { name: 'trae-credential-reverse-engineering', desc: 'TraeWork CN Windows 客户端本地凭据存储逆向分析 — 4/4 解密成功，98 个 API 发现，ECDSA P-256 Token 刷新，每日签到', topics: ['reverse-engineering', 'windows', 'security', 'cdp'], url: 'https://github.com/BlueChonk/trae-credential-reverse-engineering' },
  { name: 'trae-daily-checkin', desc: 'TraeWork CN 每日签到自动化，基于 CDP 零依赖实现', topics: ['automation', 'cdp', 'reverse-engineering'], url: 'https://github.com/BlueChonk/trae-daily-checkin' },
]

/* ---- App ---- */
const app = createApp(App)

app.component('ConfigProvider', ConfigProvider)
app.component('Card', Card)

app.provide('projects', { projects })

app.mount('#app')
