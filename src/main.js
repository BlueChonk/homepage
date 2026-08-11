import { createApp } from 'vue'
import Antd, { ConfigProvider, theme } from 'ant-design-vue'
import App from './App.vue'
import 'ant-design-vue/dist/reset.css'
import './style.css'

const app = createApp(App)

app.use(Antd)

// 全站深色主题：使用 Ant Design Vue 自带的 darkAlgorithm
app.component('ConfigProvider', ConfigProvider)

app.provide('themeAlgorithm', theme.darkAlgorithm)

app.mount('#app')
