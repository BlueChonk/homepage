/* 日志(log) 合并脚本
 * 将 public/log/ 下每个 YYYY-MM-DD.md 的正文按日期倒序合并成 public/log.md，
 * 供主页「日志」模块和 LogView 运行时读取与渲染。新增/修改日志只需往 public/log/ 加/改一个 md，
 * 重新构建（或 dev 启动/保存）时会据此重新生成合并文件。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const logDir = path.resolve(__dirname, '..', 'public', 'log')
export const logOut = path.resolve(__dirname, '..', 'public', 'log.md')

export function mergeLogs() {
  try {
    if (!fs.existsSync(logDir)) {
      console.log('[log] 跳过（目录不存在）: public/log')
      return
    }
    // 文件名即日期（YYYY-MM-DD.md），倒序 = 最新在前
    const files = fs
      .readdirSync(logDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .sort()
      .reverse()

    const parts = files
      .map((f) => {
        const date = f.replace(/\.md$/, '')
        const body = fs.readFileSync(path.join(logDir, f), 'utf-8').trim()
        // 在正文前加回 # 日期标题（由文件名获取），前端解析逻辑不变
        return `# ${date}\n${body}`
      })
      .filter(Boolean)

    // 用两空行分隔各日志，最后以换行收尾（保持与单文件一致的空行解析）
    fs.writeFileSync(logOut, parts.join('\n\n') + '\n')
    console.log(`[log] 合并 ${files.length} 条日志 → public/log.md`)
  } catch (e) {
    console.error('[log] 合并失败:', e)
  }
}

// 向后兼容旧导出名
export const feedsDir = logDir
export const feedsOut = logOut
export const mergeFeeds = mergeLogs
