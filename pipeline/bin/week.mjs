#!/usr/bin/env node
/**
 * 近七日榜单趋势
 *
 * 数据源（优先用用户既有日更档案，缺失时用本流水线自己抓的实时榜）：
 *   <archive>/<date>/scan.json        { meta, day_over_day, top100:[{rank,title,platform,genre,signal_value,flags,prev_rank,delta}] }
 *   data/rankings/<date>.json         { meta, contents:[{boards:[{items:[{rank,title,score_num}]}]}] }
 *
 * 产物：
 *   data/trend.json
 *   reports/<date>-七日趋势.md
 *
 * 用法：
 *   node bin/week.mjs --days 7
 *   node bin/week.mjs --archive "/Users/…/国内日更" --days 7
 */
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`)
  return index > 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}
const DAYS = Number(arg('days', 7))
const ARCHIVE = arg('archive', '')
const today = new Date().toISOString().slice(0, 10)

const iso = (date) => date.toISOString().slice(0, 10)
const shift = (date, days) => new Date(date.getTime() + days * 86400000)

/** 把「1.06亿」「9388万」换成以万为单位 */
// 同一部剧在档案/实时榜里写法不同（第五部 vs 5、全角逗号、完结标记），统一成同一把 key
function numToCn(n) {
  const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']
  if (n < 10) return digits[n]
  if (n < 20) return `十${n % 10 ? digits[n % 10] : ''}`
  return `${digits[Math.floor(n / 10)]}十${n % 10 ? digits[n % 10] : ''}`
}
function canonTitle(raw) {
  return String(raw ?? '')
    .replace(/[，、,]/g, '，')
    .replace(/\s+/g, '')
    .replace(/（完）|\(完\)|完结/g, '')
    .replace(/第([0-9]+)(部|季)/g, (m, n, unit) => `第${numToCn(Number(n))}${unit}`)
    .replace(/第([一二三四五六七八九十]+)部$/, '$1')
    .replace(/([^0-9])([0-9]{1,3})$/, (m, prefix, n) => `${prefix}${numToCn(Number(n))}`)
}

function heatOf(text) {
  const source = String(text ?? '')
  const match = source.match(/(\d+(?:\.\d+)?)\s*(亿|万)/)
  if (!match) return null
  const value = Number(match[1])
  return match[2] === '亿' ? Math.round(value * 10000) : Math.round(value)
}

function platformOf(platform) {
  const text = String(platform ?? '')
  if (text.includes('抖音')) return '抖音'
  if (text.includes('红果')) return '红果'
  return text || '其他'
}

function genreOf(genre, platform) {
  const text = String(genre ?? '')
  if (text) return text.split(/[·(（:：/]/)[0].trim()
  return platformOf(platform)
}

async function readArchive(date) {
  const file = join(ARCHIVE, date, 'scan.json')
  if (!existsSync(file)) return null
  const json = JSON.parse(await readFile(file, 'utf8'))
  const rows = (json.top100 ?? []).map((row) => ({
    rank: Number(row.rank),
    title: canonTitle(String(row.title ?? '').trim()),
    platform: platformOf(row.platform),
    genre: genreOf(row.genre, row.platform),
    heat: heatOf(row.signal_value),
    signal: String(row.signal_value ?? ''),
    flags: Array.isArray(row.flags) ? row.flags : [],
    prevRank: Number.isFinite(Number(row.prev_rank)) ? Number(row.prev_rank) : null,
  })).filter((row) => row.title)
  if (!rows.length) return null
  return { date, source: 'archive', rows, note: json.meta?.data_window ?? '' }
}

async function readLiveRanking(date) {
  const file = join(ROOT, 'data', 'rankings', `${date}.json`)
  if (!existsSync(file)) return null
  const json = JSON.parse(await readFile(file, 'utf8'))
  const seen = new Map()
  for (const content of json.contents ?? []) {
    for (const board of content.boards ?? []) {
      const weight = /热播|推荐|热搜/.test(board.name) ? 1 : 0.5
      for (const item of board.items ?? []) {
        const title = canonTitle(String(item.title ?? '').trim())
        if (!title) continue
        const score = Number(item.score_num ?? 0) * weight
        const kept = seen.get(title)
        if (!kept || kept.score < score) {
          seen.set(title, { title, score, score_num: Number(item.score_num ?? 0), board: `${content.name}/${board.name}` })
        }
      }
    }
  }
  const rows = [...seen.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 100)
    .map((item, index) => ({
      rank: index + 1,
      title: canonTitle(item.title),
      platform: '红果',
      genre: item.board.split('/')[0],
      heat: Math.round(item.score_num / 10000) || null,
      signal: item.board,
      flags: [],
      prevRank: null,
    }))
  if (!rows.length) return null
  // 平台口径的冠军：全部·热播榜第 1（不是多榜加权后的合成第 1）
  const allChannel = (json.contents ?? []).find((c) => c.id === 'all') ?? (json.contents ?? [])[0]
  const hotBoard = (allChannel?.boards ?? []).find((b) => /热播/.test(b.name)) ?? allChannel?.boards?.[0]
  const hotTop = (hotBoard?.items ?? [])[0]
  return {
    date,
    source: 'live',
    rows,
    note: '本流水线实时抓取（多榜合并排序；冠军按平台热播榜）',
    fetchedAt: json.meta?.fetched_at ?? null,
    champion: hotTop ? { title: canonTitle(String(hotTop.title ?? '')), heat: Math.round(Number(hotTop.score_num ?? 0) / 10000) || null, board: `${allChannel?.name ?? '全部'}/${hotBoard?.name ?? '热播榜'}` } : null,
  }
}

async function daysAvailable() {
  const found = new Set()
  const limit = shift(new Date(`${today}T00:00:00Z`), 0)
  for (let i = 0; i < DAYS + 6; i += 1) {
    const date = iso(shift(limit, -i))
    if (existsSync(join(ARCHIVE, date, 'scan.json'))) found.add(date)
    if (existsSync(join(ROOT, 'data', 'rankings', `${date}.json`))) found.add(date)
  }
  return [...found].sort().slice(-DAYS)
}

function pct(part, total) {
  if (!total) return '0%'
  return `${Math.round((part / total) * 1000) / 10}%`
}

async function main() {
  await mkdir(join(ROOT, 'data'), { recursive: true })
  await mkdir(join(ROOT, 'reports'), { recursive: true })
  const dates = await daysAvailable()
  if (!dates.length) {
    console.log('[week] 没有可用的榜单快照')
    return
  }

  const days = []
  for (const date of dates) {
    let day = await readArchive(date)
    if (!day) {
      try { day = await readLiveRanking(date) } catch { day = null }
    }
    if (day) days.push(day)
  }
  if (!days.length) {
    console.log('[week] 快照均无法解析')
    return
  }

  const top10 = (day) => day.rows.filter((row) => row.rank <= 10)
  const champions = days.map((day) => {
    if (day.source === 'live' && day.champion?.title) {
      return { date: day.date, title: day.champion.title, genre: day.champion.board, heat: day.champion.heat, source: 'live', fetchedAt: day.fetchedAt ?? null }
    }
    const first = day.rows.find((row) => row.rank === 1) ?? day.rows[0]
    return { date: day.date, title: first?.title ?? '', genre: first?.genre ?? '', heat: first?.heat ?? null, source: day.source }
  })

  // 连续霸榜天数
  let streak = 0
  for (let i = days.length - 1; i >= 0; i -= 1) {
    if (champions[i].title && champions[i].title === champions[champions.length - 1].title) streak += 1
    else break
  }

  // 冠军更替
  const changes = []
  for (let i = 1; i < champions.length; i += 1) {
    if (champions[i].title !== champions[i - 1].title) {
      changes.push({ date: champions[i].date, from: champions[i - 1].title, to: champions[i].title })
    }
  }

  // 进出榜（以各日 top100 标题集合比较）
  const setOf = (day) => new Set(day.rows.map((row) => row.title))
  const entered = []
  const left = []
  for (let i = 1; i < days.length; i += 1) {
    const prev = setOf(days[i - 1])
    const now = setOf(days[i])
    for (const title of now) if (!prev.has(title)) entered.push({ date: days[i].date, title })
    for (const title of prev) if (!now.has(title)) left.push({ date: days[i].date, title })
  }

  // 名次升降（同一天有 prevRank 的按 prevRank 算；否则跨日按 title 匹配）
  const index = new Map()
  for (const day of days) for (const row of day.rows) {
    if (!index.has(row.title)) index.set(row.title, [])
    index.get(row.title).push({ date: day.date, rank: row.rank })
  }
  const movers = []
  for (const [title, track] of index) {
    if (track.length < 2) continue
    const first = track[0]
    const last = track[track.length - 1]
    movers.push({ title, from: first.rank, to: last.rank, delta: first.rank - last.rank, days: track.length })
  }
  movers.sort((a, b) => b.delta - a.delta)
  const up = movers.filter((item) => item.delta > 0).slice(0, 10)
  const down = movers.filter((item) => item.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 10)

  // 题材温度
  const genreMap = new Map()
  for (const day of days) {
    for (const row of day.rows) {
      if (!genreMap.has(row.genre)) genreMap.set(row.genre, new Map())
      const bucket = genreMap.get(row.genre)
      bucket.set(day.date, (bucket.get(day.date) ?? 0) + 1)
    }
  }
  const genres = [...genreMap.entries()]
    .map(([genre, bucket]) => ({
      genre,
      total: [...bucket.values()].reduce((a, b) => a + b, 0),
      byDate: days.map((day) => ({ date: day.date, count: bucket.get(day.date) ?? 0 })),
      last: bucket.get(days[days.length - 1].date) ?? 0,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 12)

  // top10 矩阵
  const matrixTitles = [...new Set(days.flatMap((day) => top10(day).map((row) => row.title)))]
  const matrix = matrixTitles
    .map((title) => ({
      title,
      ranks: days.map((day) => {
        const hit = day.rows.find((row) => row.title === title)
        return hit ? hit.rank : null
      }),
      best: Math.min(...days.map((day) => {
        const hit = day.rows.find((row) => row.title === title)
        return hit ? hit.rank : Infinity
      })),
    }))
    .filter((row) => Number.isFinite(row.best))
    .sort((a, b) => a.best - b.best)
    .slice(0, 14)

  const coverage = { days: days.length, requested: DAYS, from: days[0].date, to: days[days.length - 1].date }
  const trend = {
    meta: { generatedAt: new Date().toISOString(), archive: ARCHIVE, coverage, note: '只统计实际采集到的快照；平台不提供历史榜，缺的天无法倒补。' },
    days: days.map((day) => ({ date: day.date, source: day.source, entries: day.rows.length, top: day.rows[0]?.title ?? '', note: day.note })),
    champions: { rows: champions, streak, changes },
    turnover: { entered: entered.slice(-30), left: left.slice(-30), enteredCount: entered.length, leftCount: left.length },
    movers: { up, down },
    genres,
    matrix,
  }
  await writeFile(join(ROOT, 'data', 'trend.json'), JSON.stringify(trend, null, 2))

  // ---------- 中文报告 ----------
  const lines = []
  lines.push(`# 近七日红果榜单趋势（${coverage.from} ~ ${coverage.to}）`, '')
  lines.push(`> 覆盖 ${coverage.days}/${coverage.requested} 天：${days.map((day) => day.date).join('、')}。`)
  lines.push('> 口径：每日快照取该日 top100 与冠军；「升降」用同一部剧在窗口内首末名次差。平台不提供历史榜，未采集的日期无法倒补。', '')
  lines.push('## 一、冠军线', '')
  lines.push('| 日期 | 冠军 | 题材 | 热度（万） | 数据源 |', '|---|---|---|---:|---|')
  for (const row of champions) lines.push(`| ${row.date} | ${row.title} | ${row.genre || '-'} | ${row.heat ?? '-'} | ${row.source === 'archive' ? '日更档案' : `实时·热播榜${row.fetchedAt ? '（' + row.fetchedAt.slice(11, 16) + 'Z）' : ''}`} |`)
  lines.push('')
  if (streak > 1) lines.push(`- 当前冠军已连续 **${streak}** 天在位：**${champions[champions.length - 1].title}**。`)
  if (changes.length) {
    lines.push(`- 窗口内换榜 ${changes.length} 次：` + changes.map((item) => `${item.date} ${item.from} → ${item.to}`).join('；'))
  } else {
    lines.push('- 窗口内冠军未变。')
  }
  lines.push('')

  lines.push('## 二、榜内换血', '')
  lines.push(`- 新进榜 **${entered.length}** 次、掉榜 **${left.length}** 次（按日对比 top100）。`)
  if (entered.length) lines.push(`- 最近新进：` + entered.slice(-6).map((item) => `${item.title}（${item.date}）`).join('、'))
  if (left.length) lines.push(`- 最近掉出：` + left.slice(-6).map((item) => `${item.title}（${item.date}）`).join('、'))
  lines.push('')

  lines.push('## 三、升幅与跌幅', '')
  lines.push('| 类型 | 剧名 | 首日 → 末日 | 净变化 |', '|---|---|---|---:|')
  for (const row of up.slice(0, 8)) lines.push(`| 上升 | ${row.title} | ${row.from} → ${row.to} | +${row.delta} |`)
  for (const row of down.slice(0, 8)) lines.push(`| 下滑 | ${row.title} | ${row.from} → ${row.to} | ${row.delta} |`)
  lines.push('')

  lines.push('## 四、top10 名次矩阵', '')
  lines.push(`| 剧名 | ${days.map((day) => day.date.slice(5)).join(' | ')} |`, `|---|${days.map(() => '---:').join('|')}|`)
  for (const row of matrix) lines.push(`| ${row.title} | ${row.ranks.map((rank) => rank ?? '·').join(' | ')} |`)
  lines.push('')

  lines.push('## 五、题材温度（该题材进 top100 的部数）', '')
  lines.push(`| 题材 | 合计 | 末日 | ${days.map((day) => day.date.slice(5)).join(' | ')} |`, `|---|---:|---:|${days.map(() => '---:').join('|')}|`)
  for (const row of genres) lines.push(`| ${row.genre} | ${row.total} | ${row.last}（${pct(row.last, days[days.length - 1].rows.length)}） | ${row.byDate.map((item) => item.count).join(' | ')} |`)
  lines.push('')

  lines.push('## 六、读法结论', '')
  const lastDay = days[days.length - 1]
  const top3 = lastDay.rows.slice(0, 3)
  lines.push(`- 末日前三：${top3.map((row) => `${row.title}（${row.genre}）`).join('、')}。`)
  const risingGenre = [...genres].sort((a, b) => (b.byDate.at(-1).count - b.byDate[0].count) - (a.byDate.at(-1).count - a.byDate[0].count))[0]
  if (risingGenre && days.length > 1) lines.push(`- 题材升温最快：**${risingGenre.genre}**（${risingGenre.byDate[0].count} → ${risingGenre.byDate.at(-1).count} 部）。`)
  if (up.length) lines.push(`- 值得盯的爬升：${up.slice(0, 3).map((row) => `${row.title}（${row.from}→${row.to}）`).join('、')}，适合进拉片候选。`)
  if (coverage.days < coverage.requested) lines.push(`- 覆盖缺口：只拿到 ${coverage.days}/${coverage.requested} 天，缺的日期平台不给历史，趋势结论按现有样本读。`)
  lines.push('')

  const mdPath = join(ROOT, 'reports', `${today}-七日趋势.md`)
  await writeFile(mdPath, lines.join('\n'))
  const short = `[week] ${days.length} 天 · 冠军 ${champions.at(-1)?.title ?? '-'} · 进 ${entered.length} / 出 ${left.length} → ${mdPath}`
  console.log(short)
}

main().catch((error) => {
  console.error('[week] failed:', error?.message ?? error)
  process.exit(1)
})
