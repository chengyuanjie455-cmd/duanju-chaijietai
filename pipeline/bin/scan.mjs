#!/usr/bin/env node
/**
 * 01 扫榜：红果短剧全榜单抓取
 *
 * 数据源：openhongguo SDK 的 shortRank（匿名设备，与「摸鱼短剧」插件共用同一份设备档案）
 * 输出：
 *   data/rankings/<date>.json   原始榜单（全部 content × board）
 *   reports/<date>-红果榜单.md   可读榜单报告
 *
 * 用法：
 *   node bin/scan.mjs                 # 今天
 *   node bin/scan.mjs --date 2026-11-07
 *   node bin/scan.mjs --top 30        # 每榜保留前 N
 *   node bin/scan.mjs --only human,ai_playlet
 */
import { createClient } from 'openhongguo'
import { mkdir, writeFile, appendFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PROFILE =
  process.env.OHG_PROFILE ??
  join(ROOT, 'data', 'ohg-profile.json')

const argv = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback
}
const TOP = Number(arg('top', '50'))
const ONLY = arg('only', '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())
const DATE = arg('date', today)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 把「998万推荐」「1.2亿热度」这类中文计数换成分数，仅用于交叉排序。 */
function parseScore(raw) {
  if (!raw) return 0
  const text = String(raw)
  const m = text.match(/([\d.]+)\s*(亿|万)?/)
  if (!m) return 0
  const n = Number(m[1])
  const unit = m[2] === '亿' ? 1e8 : m[2] === '万' ? 1e4 : 1
  return Math.round(n * unit)
}

async function main() {
  const client = await createClient({
    profile: PROFILE,
    retryAttempts: 3,
    timeoutMs: 30_000,
    log: () => {},
  })

  const catalog = await client.shortRank()
  const contents = (catalog.contents ?? []).filter(
    (c) => (!ONLY.length || ONLY.includes(c.id)) && Array.isArray(c.boards) && c.boards.length,
  )

  const snapshot = {
    meta: {
      source: '红果短剧 · shortRank（openhongguo 匿名设备）',
      date: DATE,
      fetched_at: new Date().toISOString(),
      note: '榜单为平台实时值；score 为平台展示的推荐/热度文案，numeric 仅作粗排序。',
    },
    contents: [],
    errors: [],
  }

  for (const content of contents) {
    const entry = { id: content.id, name: content.name, boards: [] }
    for (const board of content.boards) {
      try {
        const page = await client.shortRank({ content: content.id, board: board.id })
        const items = (page.items ?? []).slice(0, TOP).map((it) => ({
          // 演员榜的条目是 {actor, actor_id, intro, details}，没有 title
          kind: it.actor ? 'actor' : 'series',
          rank: it.rank ?? it.position,
          series_id: it.series_id ?? it.id ?? it.actor_id,
          title: it.title ?? it.actor ?? '(未知)',
          episode_count: it.episode_count,
          score: it.score,
          score_num: parseScore(it.score),
          intro: it.intro,
          details: it.details,
          cover: it.cover_url ?? it.avatar_url,
        }))
        entry.boards.push({ id: board.id, name: board.name, count: items.length, items })
        console.log(
          `[scan] ${content.name}/${board.name} → ${items.length} 条` +
            (items[0] ? `，第1《${items[0].title}》` : ''),
        )
      } catch (error) {
        entry.boards.push({ id: board.id, name: board.name, count: 0, items: [], error: String(error?.message ?? error) })
        snapshot.errors.push({ content: content.id, board: board.id, error: String(error?.message ?? error) })
        console.warn(`[scan] 失败 ${content.id}/${board.id}:`, error?.message ?? error)
      }
      await sleep(250)
    }
    snapshot.contents.push(entry)
  }

  await mkdir(join(ROOT, 'data/rankings'), { recursive: true })
  await mkdir(join(ROOT, 'reports'), { recursive: true })
  const rawPath = join(ROOT, 'data/rankings', `${DATE}.json`)
  await writeFile(rawPath, JSON.stringify(snapshot, null, 2))

  // ---- 快照留存：同日多次抓取按时间另存，历史不覆盖
  const snapDir = join(ROOT, 'data/rankings/snapshots')
  await mkdir(snapDir, { recursive: true })
  const stamp = String(snapshot.meta.fetched_at).replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
  await writeFile(join(snapDir, `${DATE}_${stamp}.json`), JSON.stringify(snapshot, null, 2))
  const histDir = join(ROOT, 'data/history')
  await mkdir(histDir, { recursive: true })
  const hotTop = snapshot.contents.find((c) => c.name === '全部')?.boards.find((b) => /热播/.test(b.name))?.items?.[0]
  const titles = new Set()
  for (const c of snapshot.contents) for (const b of c.boards) for (const i of b.items) if (i.title) titles.add(i.title)
  await appendFile(
    join(histDir, 'snapshots.jsonl'),
    JSON.stringify({
      date: DATE,
      fetchedAt: snapshot.meta.fetched_at,
      channels: snapshot.contents.length,
      boards: snapshot.contents.reduce((s2, c) => s2 + c.boards.length, 0),
      uniqueTitles: titles.size,
      champion: hotTop ? { title: hotTop.title, heat: hotTop.score } : null,
    }) + '\n',
  )

  // ---- Markdown 报告
  const lines = []
  lines.push(`# 红果短剧榜单 · ${DATE}`)
  lines.push('')
  lines.push(`> 抓取时间：${snapshot.meta.fetched_at}　|　来源：红果 shortRank（匿名设备）`)
  lines.push('> 用途：个人选题研究。score 为平台原文案，不跨榜直接比较。')
  lines.push('')
  const seenSeries = new Map()
  for (const content of snapshot.contents) {
    lines.push(`## ${content.name}`)
    for (const board of content.boards) {
      lines.push('')
      lines.push(`### ${board.name}（${board.count} 条）`)
      lines.push('')
      if (!board.items.length) {
        lines.push(`- 空${board.error ? `：${board.error}` : ''}`)
        continue
      }
      if (board.items[0]?.kind === 'actor') {
        lines.push('| # | 演员 | 榜值 | 代表作 |')
        lines.push('|---|---|---|---|')
        for (const it of board.items) {
          lines.push(
            `| ${it.rank} | ${it.title} | ${it.score ?? '-'} | ${String(it.intro ?? '').replace(/\|/g, '\\|').slice(0, 60)} |`,
          )
        }
        continue
      }
      lines.push('| # | 剧名 | 集数 | 榜单值 | series_id |')
      lines.push('|---|---|---|---|---|')
      for (const it of board.items) {
        lines.push(
          `| ${it.rank} | ${String(it.title).replace(/\|/g, '\\|')} | ${it.episode_count ?? '-'} | ${it.score ?? '-'} | ${it.series_id} |`,
        )
        if (!seenSeries.has(it.series_id)) {
          seenSeries.set(it.series_id, { title: it.title, count: 0, episode_count: it.episode_count })
        }
        seenSeries.get(it.series_id).count += 1
      }
    }
    lines.push('')
  }

  // 跨榜出现的剧 = 平台真实热度信号
  const cross = [...seenSeries.entries()]
    .filter(([, v]) => v.count > 1)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 40)
  lines.push('## 附：跨榜命中（出现 ≥2 个榜，热度交叉验证）')
  lines.push('')
  lines.push('| 上榜次数 | 剧名 | 集数 | series_id |')
  lines.push('|---|---|---|---|')
  for (const [id, v] of cross) {
    lines.push(`| ${v.count} | ${v.title} | ${v.episode_count ?? '-'} | ${id} |`)
  }
  lines.push('')

  const mdPath = join(ROOT, 'reports', `${DATE}-红果榜单.md`)
  await writeFile(mdPath, lines.join('\n'))
  console.log(`\n[scan] 原始数据 → ${rawPath}`)
  console.log(`[scan] 榜单报告 → ${mdPath}`)
  console.log(`[scan] 覆盖 ${snapshot.contents.length} 个频道 / ${snapshot.contents.reduce((n, c) => n + c.boards.length, 0)} 个榜 / ${seenSeries.size} 部剧`)
}

main().catch((error) => {
  console.error('[scan] 失败：', error)
  process.exit(1)
})
