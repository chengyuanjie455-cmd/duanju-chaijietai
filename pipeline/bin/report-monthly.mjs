#!/usr/bin/env node
// 月度排行总结：聚合 data/rankings/<YYYY-MM-*>.json，输出 reports/monthly/<YYYY-MM>-月报.md
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const RANK = path.join(ROOT, 'data', 'rankings')
const arg = process.argv.slice(2)
const month = arg.includes('--month') ? arg[arg.indexOf('--month') + 1] : new Date().toISOString().slice(0, 7)

const files = existsSync(RANK) ? readdirSync(RANK).filter((f) => new RegExp(`^${month}-\\d{2}\\.json$`).test(f)).sort() : []
if (!files.length) { console.error(`[monthly] ${month} 没有快照，先跑 bin/scan.mjs`); process.exit(1) }

const num = (it) => {
  if (typeof it.score_num === 'number' && it.score_num > 0) return it.score_num
  const m = String(it.score ?? '').match(/([\d.]+)\s*(亿|万)?/)
  return m ? Math.round(Number(m[1]) * (m[2] === '亿' ? 1e8 : 1e4)) : 0
}
const fmt = (n) => (!n ? '-' : n >= 1e8 ? `${(n / 1e8).toFixed(2)}亿` : `${Math.round(n / 1e4)}万`)
const board = (json, channel, re) => (json.contents ?? []).find((c) => c.name === channel)?.boards?.find((b) => re.test(b.name))
const clean = (b, n = 10) => {
  const seen = new Set(); const out = []
  for (const i of b?.items ?? []) {
    const t = String(i.title ?? '').trim()
    if (!t || seen.has(t) || num(i) <= 0) continue
    seen.add(t); out.push({ ...i, title: t, rank: out.length + 1 })
    if (out.length >= n) break
  }
  return out
}

const days = []
const appear = new Map()
const firstSeen = new Map()
const champs = []
for (const f of files) {
  const date = f.replace('.json', '')
  const json = JSON.parse(readFileSync(path.join(RANK, f), 'utf8'))
  const hot = board(json, '全部', /热播/)
  const top = clean(hot)
  if (!top.length) continue
  days.push({ date, fetchedAt: json.meta?.fetched_at ?? null, champ: top[0], top })
  champs.push({ date, title: top[0].title, heat: num(top[0]) })
  for (const i of top) {
    appear.set(i.title, (appear.get(i.title) ?? 0) + 1)
    if (!firstSeen.has(i.title)) firstSeen.set(i.title, date)
  }
}
if (!days.length) { console.error('[monthly] 快照里没有可用的全部热播榜'); process.exit(1) }

const champCount = new Map()
for (const c of champs) champCount.set(c.title, (champCount.get(c.title) ?? 0) + 1)
const topChamp = [...champCount.entries()].sort((a, b) => b[1] - a[1])[0]
const last = days.at(-1)
const lastJson = JSON.parse(readFileSync(path.join(RANK, `${last.date}.json`), 'utf8'))
const humanTop = clean(board(lastJson, '真人剧', /热播/), 5)
const aiTop = clean(board(lastJson, 'AI剧', /热播/), 5)
const newest = [...firstSeen.entries()].filter(([, d]) => d >= `${month}-${String(Math.max(1, new Date(last.date).getDate() - 6)).padStart(2, '0')}`)

const lines = []
lines.push(`# ${month} 红果短剧月度总结`, '')
lines.push(`- 覆盖：${days.length} 天（${days[0].date} ~ ${last.date}）`)
lines.push(`- 数据：平台实时榜快照，多榜不加权；缺天无法倒补`)
lines.push(`- 月度冠军：**《${topChamp?.[0] ?? '-'}》**，${topChamp?.[1] ?? 0} 天位居全部热播第 1`)
lines.push('')
lines.push('## 一、每日冠军线', '')
lines.push('| 日期 | 冠军 | 热度 |', '|---|---|---:|')
for (const c of champs) lines.push(`| ${c.date} | ${c.title} | ${fmt(c.heat)} |`)
lines.push('')
lines.push('## 二、本月在榜最久 Top10', '')
lines.push('| 剧名 | 在榜天数 | 首次出现 |', '|---|---:|---|')
for (const [title, n] of [...appear.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
  lines.push(`| ${title} | ${n} | ${firstSeen.get(title)} |`)
}
lines.push('')
lines.push('## 三、最新一天的分题材头部', '')
lines.push(`- 真人剧：${humanTop.map((i) => `${i.rank}.${i.title}（${fmt(num(i))}）`).join('｜') || '-'}`)
lines.push(`- AI 剧：${aiTop.map((i) => `${i.rank}.${i.title}（${fmt(num(i))}）`).join('｜') || '-'}`)
lines.push('')
lines.push('## 四、本月新面孔', '')
for (const [t, d] of newest.slice(0, 10)) lines.push(`- ${t}（${d} 首次进 Top10）`)
if (!newest.length) lines.push('- 暂无')
lines.push('')
lines.push('## 五、月度结论', '')
lines.push(`- 头部${champCount.size <= 2 ? '高度集中' : '较为分散'}：${champCount.size} 部剧拿过日冠，${topChamp?.[0] ?? ''} 占 ${topChamp?.[1] ?? 0}/${days.length} 天。`)
lines.push(`- 滚动最久的是《${[...appear.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '-'}》，说明它的热度不是脉冲式冲榜。`)
lines.push(`- 下月观察点：${humanTop[0]?.title ? `真人《${humanTop[0].title}》` : '真人头部'}与${aiTop[0]?.title ? `AI《${aiTop[0].title}》` : 'AI 头部'}谁先换人。`)
lines.push('')
lines.push(`> 快照目录：\`data/rankings/\`；逐次快照：\`data/rankings/snapshots/\`；报告由 \`bin/report-monthly.mjs\` 生成。`)

const out = path.join(ROOT, 'reports', 'monthly', `${month}-月报.md`)
mkdirSync(path.dirname(out), { recursive: true })
writeFileSync(out, lines.join('\n') + '\n', 'utf8')
console.log(`[monthly] ${month}（${days.length} 天）→ ${out}`)
