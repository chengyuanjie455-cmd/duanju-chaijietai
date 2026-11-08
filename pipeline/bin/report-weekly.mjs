#!/usr/bin/env node
// 每周排行汇报：读 data/trend.json（bin/week.mjs 生成），输出 reports/weekly/<to>-周报.md
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.join(ROOT, 'data', 'trend.json')
if (!existsSync(src)) { console.error('[weekly] 缺 data/trend.json，先跑 bin/week.mjs'); process.exit(1) }
const t = JSON.parse(readFileSync(src, 'utf8'))
const { from, to, days } = t.meta.coverage
const champ = t.champions?.rows ?? []
const entered = t.turnover?.entered ?? []
const exited = t.turnover?.exited ?? []
const up = t.movers?.up ?? []
const down = t.movers?.down ?? []
const matrix = t.matrix ?? []
const genres = t.genres ?? []

const switches = champ.reduce((n, r, i) => (i && r.title !== champ[i - 1].title ? n + 1 : n), 0)
const onBoard = matrix.filter((m) => m.ranks.filter((x) => x !== null).length >= Math.ceil(days / 2))
const fmtHeat = (n) => (n >= 10000 ? `${(n / 10000).toFixed(2)}亿` : `${n}万`)

const lines = []
lines.push(`# ${from} ~ ${to} 红果短剧周报`, '')
lines.push(`- 覆盖：${days} 天（平台不提供历史榜，缺的天无法倒补）`)
lines.push(`- 冠军换手：${switches} 次`)
lines.push(`- 榜内换血：新进 ${entered.length} 条 / 掉榜 ${exited.length} 条`)
lines.push('- 剧名已归一：全角逗号统一、`第五部` 与 `5` 视为同一部；报告里的 `荣耀五` 就是 `第五部`。')
lines.push('')
lines.push('## 一、冠军线', '')
lines.push('| 日期 | 冠军 | 题材 | 热度 | 数据源 |', '|---|---|---|---:|---|')
for (const r of champ) lines.push(`| ${r.date} | ${r.title} | ${r.genre ?? '-'} | ${r.heat ? fmtHeat(r.heat) : '-'} | ${r.source === 'archive' ? '日更档案' : '实时热播榜'} |`)
lines.push('')
lines.push('## 二、这一周在榜最稳的剧', '')
lines.push('| 剧名 | 最好名次 | 在榜天数 | 逐日名次 |', '|---|---:|---:|---|')
for (const m of onBoard.sort((a, b) => b.ranks.filter((x) => x !== null).length - a.ranks.filter((x) => x !== null).length).slice(0, 12)) {
  lines.push(`| ${m.title} | ${m.best} | ${m.ranks.filter((x) => x !== null).length} | ${m.ranks.map((x) => x ?? '-').join(' / ')} |`)
}
lines.push('')
lines.push('## 三、上升最快', '')
for (const r of up.slice(0, 8)) lines.push(`- ${r.title}：${r.from} → ${r.to}（${r.delta > 0 ? '+' : ''}${r.delta}，${r.days} 天在榜）`)
if (!up.length) lines.push('- 无')
lines.push('')
lines.push('## 四、下滑最多', '')
for (const r of down.slice(0, 8)) lines.push(`- ${r.title}：${r.from} → ${r.to}（${r.delta}，${r.days} 天在榜）`)
if (!down.length) lines.push('- 无')
lines.push('')
lines.push('## 五、题材结构（每日 Top100 里的部数）', '')
const dates = champ.map((r) => r.date)
lines.push('| 题材 | ' + dates.map((d) => d.slice(5)).join(' | ') + ' |', '|---|' + dates.map(() => '---:').join('|') + '|')
for (const g of genres.slice(0, 6)) {
  const by = new Map(g.byDate.map((x) => [x.date, x.count]))
  lines.push(`| ${g.genre} | ${dates.map((d) => by.get(d) ?? '-').join(' | ')} |`)
}
lines.push('')
lines.push('## 六、本周读法', '')
lines.push(`- ${switches === 0 ? `冠军 ${champ[0]?.title ?? '-'} 全程在位，头部没有换手，属于「一部剧撑一周」的盘面。` : `冠军换手 ${switches} 次，头部不稳，说明没有绝对爆款在压盘。`}`)
lines.push(`- 新进 ${entered.length} 条、掉榜 ${exited.length} 条，换血率约 ${days ? Math.round((entered.length / (days * 10)) * 100) : 0}%（按每日 Top10 估算）。`)
lines.push(`- 下周要盯：${up[0]?.title ? `上升最快的《${up[0].title}》能否进前三` : '暂无明确上升势头'}。`)
lines.push('')
lines.push(`> 数据：\`data/trend.json\`（${t.meta.generatedAt}）；报告由 \`bin/report-weekly.mjs\` 生成。`)

const out = path.join(ROOT, 'reports', 'weekly', `${to}-周报.md`)
mkdirSync(path.dirname(out), { recursive: true })
writeFileSync(out, lines.join('\n') + '\n', 'utf8')
console.log(`[weekly] ${from}~${to} → ${out}`)
