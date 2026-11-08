#!/usr/bin/env node
/**
 * 08 系列总览：把同一前缀的多季拆解结果汇总成一张系列表
 *
 * 用法：node bin/series-stats.mjs --prefix 示例剧
 * 输出：剧库/<前缀>·系列总览.md + 剧库/<前缀>·series.json
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback
}
const PREFIX = arg('prefix', '')
if (!PREFIX) {
  console.error('需要 --prefix <剧名前缀，如 示例剧>')
  process.exit(1)
}

const END_RULES = [
  ['危机', /危险|快跑|小心|来不及|糟糕|坏了|救我|别过来|住手|杀|死/],
  ['反转', /原来|竟然|没想到|其实|居然/],
  ['悬念', /到底|究竟|为什么|谁|怎么|难道|\?|？/],
  ['情感', /喜欢|爱|想你|别走|等我|对不起|谢谢|娘|爹|家/],
  ['甜点', /好|行|可以|开心|笑|走|回家|吃饭/],
]

function classifyEnd(last, tail) {
  if (!last) return tail > 6 ? '纯视觉' : '无台词'
  for (const [k, re] of END_RULES) if (re.test(last)) return k
  return '其他'
}

const round = (v, n = 1) => Math.round(v * 10 ** n) / 10 ** n
const pct = (a, b) => (b ? round((a / b) * 100) : 0)
const pad = (n) => String(n).padStart(3, '0')

async function readMaybe(p) {
  try {
    return await readFile(p, 'utf8')
  } catch {
    return null
  }
}

const CN_NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
function seasonNo(name) {
  const m = name.match(/第([一二三四五六七八九十]+)季/)
  if (!m) return 99
  const s = m[1]
  if (s === '十') return 10
  if (s.startsWith('十')) return 10 + (CN_NUM[s[1]] ?? 0)
  if (s.endsWith('十')) return (CN_NUM[s[0]] ?? 0) * 10
  return CN_NUM[s] ?? 0
}

async function main() {
  const lib = join(ROOT, '剧库')
  const dirs = (await readdir(lib, { withFileTypes: true }))
    .filter((d) => d.isDirectory() && d.name.startsWith(PREFIX))
    .map((d) => d.name)
    .sort((a, b) => seasonNo(a) - seasonNo(b))

  const rows = []
  for (const name of dirs) {
    const dir = join(lib, name)
    const raw = await readMaybe(join(dir, '拆解/stats.json'))
    if (!raw) continue
    const st = JSON.parse(raw)
    const eps = st.episodes_detail ?? []
    const ends = new Map()
    for (const e of eps) {
      const k = classifyEnd(e.last, e.tail ?? 0)
      ends.set(k, (ends.get(k) ?? 0) + 1)
    }
    // 事件索引里的主标签分布（可选）
    const csv = await readMaybe(join(dir, '拆解/事件索引.csv'))
    const tagCount = new Map()
    if (csv) {
      const lines = csv.split('\n').slice(1).filter(Boolean)
      for (const l of lines) {
        const cells = l.split(',')
        const top = cells[cells.length - 4]
        if (top && top !== '—') tagCount.set(top, (tagCount.get(top) ?? 0) + 1)
      }
    }
    rows.push({
      name,
      episodes: st.episodes,
      minutes: st.total_minutes,
      shots: st.total_shots,
      sec_per_shot: st.sec_per_shot,
      shot_median: st.shot_median,
      cpm: st.cuts_per_min?.mean,
      under3: st.under3_ratio,
      chars_min: st.dialogue?.chars_per_min,
      dialogue_shots: st.dialogue?.with_dialogue_ratio,
      zero_start: st.hooks?.zero_start_ratio,
      repeat: st.hooks?.repeat_ratio,
      last6: st.hooks?.last_line_le6_ratio,
      tail: st.hooks?.tail_silence_mean,
      ends: Object.fromEntries([...ends.entries()].sort((a, b) => b[1] - a[1])),
      top_tags: [...tagCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k}×${v}`),
    })
  }

  const tot = rows.reduce(
    (a, r) => ({
      episodes: a.episodes + r.episodes,
      minutes: a.minutes + r.minutes,
      shots: a.shots + r.shots,
      chars: a.chars + (r.chars_min ?? 0) * r.minutes,
    }),
    { episodes: 0, minutes: 0, shots: 0, chars: 0 },
  )

  const md = []
  md.push(`# ${PREFIX} · 系列总览`)
  md.push('')
  md.push(`> ${rows.length} 季 / ${tot.episodes} 集 / ${round(tot.minutes)} 分钟 / ${tot.shots} 镜　｜　数据由拆解脚本自动汇总`)
  md.push('')
  md.push('## 各季硬指标')
  md.push('')
  md.push('| 季 | 集数 | 分钟 | 镜数 | 秒/镜 | 切镜率 | 台词密度 | 首句 0.5s 内 | 集首复读 | 结尾 ≤6 字 | 说完留白 |')
  md.push('|---|---|---|---|---|---|---|---|---|---|---|')
  for (const r of rows) {
    md.push(
      `| ${r.name.replace(PREFIX, '')} | ${r.episodes} | ${r.minutes} | ${r.shots} | ${r.sec_per_shot} | ${r.cpm} 次/分 | ${r.chars_min} 字/分 | ${r.zero_start}% | ${r.repeat}% | ${r.last6}% | ${r.tail}s |`,
    )
  }
  md.push('')
  md.push('## 结尾类型（规则判定）')
  md.push('')
  md.push('| 季 | 分布 | 主标签 |')
  md.push('|---|---|---|')
  for (const r of rows) {
    md.push(
      `| ${r.name.replace(PREFIX, '')} | ${Object.entries(r.ends).map(([k, v]) => `${k} ${v}`).join('、')} | ${r.top_tags.join('、') || '—'} |`,
    )
  }
  md.push('')
  md.push(`## 汇总`)
  md.push('')
  md.push(`- 全系列 ${tot.episodes} 集、${round(tot.minutes)} 分钟、${tot.shots} 镜，平均 ${round(tot.minutes / Math.max(1, tot.episodes), 1)} 分钟/集。`)
  md.push(`- 总台词约 ${Math.round(tot.chars)} 字，平均 ${round(tot.chars / Math.max(1, tot.minutes))} 字/分。`)
  md.push('')
  await writeFile(join(lib, `${PREFIX}·系列总览.md`), md.join('\n'))
  await writeFile(join(lib, `${PREFIX}·series.json`), JSON.stringify({ prefix: PREFIX, rows, total: tot }, null, 2))
  console.log(`[series] ${rows.length} 季 / ${tot.episodes} 集 → ${PREFIX}·系列总览.md`)
}

main().catch((e) => {
  console.error(String(e?.message ?? e))
  process.exit(1)
})
