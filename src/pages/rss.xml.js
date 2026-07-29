import rss from '@astrojs/rss'
import { getCollection } from 'astro:content'

export async function GET(context) {
  const posts = (await getCollection('blog')).sort(
    (a, b) => b.data.date.valueOf() - a.data.date.valueOf()
  )
  return rss({
    title: 'cecilia 的技术博客',
    description: 'Docker / FRP / MinIO / HTTPS / 向量模型等部署笔记',
    site: context.site,
    items: posts.map((p) => ({
      title: p.data.title,
      pubDate: p.data.date,
      description: p.data.summary,
      link: `/blog/${p.slug}/`,
    })),
  })
}
