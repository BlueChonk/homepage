/* 动态(feeds) 合并脚本
 * 将 public/feeds/ 下每个「# YYYY-MM-DD」的独立 md 按日期倒序合并成 public/feeds.md，
 * 供主页「动态」模块运行时读取与渲染。新增/修改日志只需往 public/feeds/ 加/改一个 md，
 * 重新构建（或 dev 启动/保存）时会据此重新生成合并文件。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const feedsDir = path.resolve(__dirname, '..', 'public', 'feeds')
export const feedsOut = path.resolve(__dirname, '..', 'public', 'feeds.md')

export function mergeFeeds() {
  try {
    if (!fs.existsSync(feedsDir)) {
      console.log('[feed] 跳过（目录不存在）: public/feeds')
      return
    }
    // 文件名即日期（YYYY-MM-DD.md），倒序 = 最新在前
    const files = fs
      .readdirSync(feedsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .sort()
      .reverse()

    const parts = files
      .map((f) => fs.readFileSync(path.join(feedsDir, f), 'utf-8').trim())
      .filter(Boolean)

    // 用两空行分隔各日志，最后以换行收尾（保持与单文件一致的空行解析）
    fs.writeFileSync(feedsOut, parts.join('\n\n') + '\n')
    console.log(`[feed] 合并 ${files.length} 条日志 → public/feeds.md`)
  } catch (e) {
    console.error('[feed] 合并失败:', e)
  }
}