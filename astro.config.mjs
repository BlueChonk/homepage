import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import rehypeExternalLinks from 'rehype-external-links'

// https://astro.build
export default defineConfig({
  site: 'https://cecilia4412.github.io',
  base: '/',
  integrations: [react()],
  markdown: {
    rehypePlugins: [
      // 文档内 / 博客里的外链一律新标签页打开，避免覆盖当前页面
      [rehypeExternalLinks, { target: '_blank', rel: ['noopener', 'noreferrer'] }],
    ],
  },
})
