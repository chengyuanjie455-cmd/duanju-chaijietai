#!/usr/bin/env node
// 每日排行汇报：读 data/rankings/<date>.json，与上一份实时快照对比，输出 reports/daily/<date>-日报.md
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const RANK = path.join(ROOT, 'data', 'rankings')
const OUT = path.join(ROOT, 'reports', 'daily')

const arg = process.argv.slice(2)
const dateArg = arg.includes('--date') ? arg[arg.indexOf('--date') + 1] : null
const files = existsSync(RANK) ? readdirSync(RANK).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)) : []
if (!files.length) { console.error('[daily] 没有榜单快照，先跑 bin/scan.mjs'); process.exit(1) }

const date = dateArg ?? files.map((f) => f.replace('.json', '')).sort().at(-1)
const cur = JSON.parse(readFileSync(path.join(RANK, `${date}.json`), 'utf8'))
const prevDate = files.map((f) => f.replace('.json', '')).filter((d) => d < date).sort().at(-1)
const prev = prevDate ? JSON.parse(readFileSync(path.join(RANK, `${prevDate}.json`), 'utf8')) : null

const num = (it) => {
  if (typeof it.score_num === 'number' && it.score_num > 0) return it.score_num
  const m = String(it.score ?? '').match(/([\d.]+)\s*(亿|万)?/)
  if (!m) return 0
  return Math.round(Number(m[1]) * (m[2] === '亿' ? 1e8 : 1e4))
}
const fmt = (n) => (n >= 1e8 ? `${(n / 1e8).toFixed(2)}亿` : `${Math.round(n / 1e4)}万`)
const boards = (json, channelNames) => {
  const out = []
  for (const c of json.contents ?? []) {
    if (channelNames && !channelNames.includes(c.name)) continue
    for (const b of c.boards ?? []) out.push({ channel: c.name, board: b.name, items: b.items ?? [] })
  }
  return out
}
const findBoard = (json, channel, boardRe) => boards(json, [channel]).find((b) => boardRe.test(b.board))

// 平台榜偶尔有并列名次/零热度项：去重、丢零值、重排 1..10
const topOf = (b, n = 10) => {
  const seen = new Set()
  const out = []
  for (const i of b?.items ?? []) {
    const title = String(i.title ?? '').trim()
    if (!title || seen.has(title) || num(i) <= 0) continue
    seen.add(title)
    out.push({ ...i, title, rank: out.length + 1 })
    if (out.length >= n) break
  }
  return out
}
const rankMap = (b, n = 10) => new Map(topOf(b, n).map((i) => [i.title, i.rank]))

const table = (rows, withPrev) =>
  ['| # | 剧名 | 集数 | 热度 |' + (withPrev ? ' 名次变化 |' : ''), '|---:|---|---:|---:|' + (withPrev ? '---|' : '')]
    .concat(rows.map((r) => `| ${r.rank} | ${r.title} | ${r.episode_count ?? '-'} | ${fmt(num(r))} |` + (withPrev ? ` ${r.change} |` : '')))
    .join('\n')

function compare(curBoard) {
  if (!prev || !curBoard) return null
  const pb = (prev.contents ?? []).flatMap((c) => (c.boards ?? []).filter((b) => b.name === curBoard.board).map((b) => ({ c: c.name, b })))
    .find((x) => x.c === curBoard.channel)?.b
  if (!pb) return null
  const pm = rankMap(pb)
  const cm = rankMap(curBoard)
  const rows = topOf(curBoard).map((i) => {
    const was = pm.get(i.title)
    const change = was === undefined ? '新进' : was === i.rank ? '-' : was > i.rank ? `↑${was - i.rank}` : `↓${i.rank - was}`
    return { ...i, change }
  })
  const dropped = [...pm.entries()].filter(([t]) => !cm.has(t)).map(([t, r]) => `${t}（原 #${r}）`)
  return { rows, dropped }
}

const hotAll = findBoard(cur, '全部', /热播/)
const hotHuman = findBoard(cur, '真人剧', /热播/)
const hotAi = findBoard(cur, 'AI剧', /热播/)

const snapTime = cur.meta?.fetched_at ? new Date(cur.meta.fetched_at).toLocaleString('zh-CN', { hour12: false }) : '未知'
const champ = hotAll?.items?.[0]
const cmp = compare(hotAll)
const lines = []
lines.push(`# ${date} 红果短剧排行日报`, '')
lines.push(`- 数据源：红果短剧榜单（shortRank，平台原值，多榜不做加权）`)
lines.push(`- 抓取时间：${snapTime}`)
lines.push(`- 覆盖：${(cur.contents ?? []).length} 个频道 / ${(cur.contents ?? []).reduce((s, c) => s + (c.boards?.length ?? 0), 0)} 个榜`)
lines.push(`- 对比基准：${prev ? `${prevDate} 的实时快照` : '无更早的实时快照（首次日报）'}`)
lines.push('')
lines.push('## 一、今日冠军', '')
if (champ) lines.push(`**《${champ.title}》** · ${champ.episode_count ?? '?'} 集 · 全部热播榜第 1 · **${fmt(num(champ))}**`)
else lines.push('（未取到全部热播榜）')
lines.push('')
lines.push('## 二、全部·热播 Top10', '')
lines.push(table(cmp ? cmp.rows : topOf(hotAll), Boolean(cmp)))
lines.push('')
lines.push('## 三、真人剧·热播 Top10', '')
lines.push(table(topOf(hotHuman)))
lines.push('')
lines.push('## 四、AI剧·热播 Top10', '')
lines.push(table(topOf(hotAi)))
lines.push('')
if (cmp) {
  lines.push('## 五、相较上一份快照', '')
  lines.push(`- 新进 Top10：${cmp.rows.filter((r) => r.change === '新进').map((r) => r.title).join('、') || '无'}`)
  lines.push(`- 掉出 Top10：${cmp.dropped.join('、') || '无'}`)
  lines.push(`- 上升最多：${cmp.rows.filter((r) => r.change.startsWith('↑')).sort((a, b) => parseInt(b.change.slice(1)) - parseInt(a.change.slice(1))).slice(0, 3).map((r) => `${r.title} ${r.change}`).join('、') || '无'}`)
  lines.push(`- 下滑最多：${cmp.rows.filter((r) => r.change.startsWith('↓')).sort((a, b) => parseInt(b.change.slice(1)) - parseInt(a.change.slice(1))).slice(0, 3).map((r) => `${r.title} ${r.change}`).join('、') || '无'}`)
  lines.push('')
}
lines.push('## 六、各频道第一', '')
for (const c of cur.contents ?? []) {
  const b = (c.boards ?? []).find((x) => /热播/.test(x.name)) ?? (c.boards ?? []).find((x) => /推荐/.test(x.name)) ?? c.boards?.[0]
  const it = b?.items?.[0]
  if (it) lines.push(`- ${c.name}（${b.name}）：《${it.title}》${fmt(num(it))}`)
}
lines.push('')
const top10 = topOf(hotAll)
const sum = top10.reduce((s, i) => s + num(i), 0)
const top3 = top10.slice(0, 3).reduce((s, i) => s + num(i), 0)
lines.push('## 七、读法', '')
lines.push(`- 头部集中度：Top3 占 Top10 热度 ${sum ? ((top3 / sum) * 100).toFixed(1) : '-'}%（越高说明越靠一部剧撑盘）`)
lines.push(`- ${champ ? `《${champ.title}》以 ${fmt(num(champ))} 领跑，` : ''}${cmp ? '与上一份快照相比 Top10 结构见第五节。' : '这是第一份实时快照，明天起会自动给出名次变化。'}`)
lines.push('')
lines.push(`> 快照保留：\`data/rankings/${date}.json\`；本报告由 \`bin/report-daily.mjs\` 自动生成。`)

mkdirSync(OUT, { recursive: true })
const out = path.join(OUT, `${date}-日报.md`)
writeFileSync(out, lines.join('\n') + '\n', 'utf8')
console.log(`[daily] ${date} → ${out}`)
