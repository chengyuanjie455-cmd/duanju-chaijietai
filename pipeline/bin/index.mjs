#!/usr/bin/env node
/**
 * 06 剧情库索引：扫描 剧库/ 下所有已拆解短剧，生成总索引
 *
 * 输出：
 *   剧库/README.md     人读索引（表格 + 每部剧的产出清单）
 *   剧库/index.json    机读索引
 *
 * 用法：node bin/index.mjs
 */
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const LIB = join(ROOT, '剧库')

async function exists(p) {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

async function readJson(p, fallback = null) {
  try {
    return JSON.parse(await readFile(p, 'utf8'))
  } catch {
    return fallback
  }
}

const round = (n, d = 1) => (n == null || Number.isNaN(n) ? null : Math.round(n * 10 ** d) / 10 ** d)

const CN_NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
function seasonOf(name) {
  const m = name.match(/^(.+?)·第([一二三四五六七八九十]+)季$/)
  if (!m) return { base: name, n: 1 }
  const s = m[2]
  const n = s === '十' ? 10 : s.startsWith('十') ? 10 + (CN_NUM[s[1]] ?? 0) : s.endsWith('十') ? (CN_NUM[s[0]] ?? 0) * 10 : CN_NUM[s] ?? 1
  return { base: m[1], n }
}
function bySeriesOrder(a, b) {
  const x = seasonOf(a), y = seasonOf(b)
  if (x.base !== y.base) return x.base.localeCompare(y.base, 'zh-Hans-CN')
  return x.n - y.n
}

async function main() {
  const dirs = (await readdir(LIB, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort(bySeriesOrder)

  const index = []
  for (const name of dirs) {
    const dir = join(LIB, name)
    const meta = await readJson(join(dir, 'meta.json'))
    if (!meta) continue
    const summary = await readJson(join(dir, '拆解/summary.json'))
    const report = await readJson(join(dir, 'download-report.json'))
    const card = await readJson(join(dir, '档案.json'))
    const episodes = summary?.episodes ?? []
    const totalSeconds = episodes.reduce((a, b) => a + (b.duration ?? 0), 0)
    const totalShots = episodes.reduce((a, b) => a + (b.shots ?? 0), 0)
    const avgShots = episodes.length ? totalShots / episodes.length : null
    const medianShot = episodes.length
      ? episodes.map((e) => e.shot_median).sort((a, b) => a - b)[Math.floor(episodes.length / 2)]
      : null

    let subtitleCount = 0
    try {
      subtitleCount = (await readdir(join(dir, '字幕'))).filter((f) => f.endsWith('.srt')).length
    } catch {}

    const entry = {
      name,
      title: meta.title ?? name,
      series_id: meta.series_id,
      tags: card?.tags ?? [],
      heat: card?.heat ?? null,
      rank: card?.rank ?? null,
      one_liner: card?.one_liner ?? null,
      hook: card?.hook ?? null,
      engine: card?.engine ?? null,
      ending: card?.ending ?? null,
      reuse: card?.reuse ?? null,
      caution: card?.caution ?? null,
      episode_count: meta.episodes?.length ?? null,
      downloaded: report?.downloaded ?? null,
      decomposed: episodes.length,
      subtitled: subtitleCount,
      total_minutes: round(totalSeconds / 60),
      total_shots: totalShots,
      sec_per_shot: totalShots ? round(totalSeconds / totalShots, 2) : null,
      avg_shots_per_ep: round(avgShots),
      median_shot_seconds: round(medianShot, 2),
      description: (meta.description ?? '').slice(0, 120),
      has_report: await exists(join(dir, '拆解报告.md')),
      has_script: await exists(join(dir, '剧本逆推/分集表.csv')),
      has_library_card: await exists(join(dir, '剧情库卡片.md')),
      has_stash: await exists(join(dir, '拆解/数据速览.md')),
      updated: new Date().toISOString(),
    }
    index.push(entry)
  }

  await writeFile(join(LIB, 'index.json'), JSON.stringify(index, null, 2))

  const md = []
  md.push('# 短剧剧情库')
  md.push('')
  md.push(`> 共 ${index.length} 部　|　更新 ${new Date().toISOString().slice(0, 10)}　|　数据源：红果短剧（仅个人研究，勿传播）`)
  md.push('')
  md.push('跨剧的模式库（开场钩子 / 冲突引擎 / 节奏基准 / 结局模板）见 [剧情库.md](./剧情库.md)。')
  md.push('')
  md.push('| 剧名 | 题材 | 集数 | 总时长 | 秒/镜 | 热度 | 一句话 |')
  md.push('|---|---|---|---|---|---|---|')
  for (const e of index) {
    md.push(
      `| [${e.title}](./${e.name}/拆解报告.md) | ${e.tags.join(' × ') || '-'} | ${e.episode_count ?? '-'} | ${e.total_minutes ?? '-'} 分 | ${e.sec_per_shot ?? '-'} | ${e.heat ?? '-'} | ${e.one_liner ?? '-'} |`,
    )
  }
  md.push('')
  md.push('## 产出清单')
  md.push('')
  md.push('| 剧名 | 已拆解 | 字幕 | 逐镜逆推 | 数据速览 | 拆解报告 | 剧情库卡片 |')
  md.push('|---|---|---|---|---|---|---|')
  for (const e of index) {
    md.push(
      `| ${e.title} | ${e.decomposed} 集 | ${e.subtitled} 集 | ${e.has_script ? `[分集表](./${e.name}/剧本逆推/分集表.csv)` : '—'} | ${e.has_stash ? `[速览](./${e.name}/拆解/数据速览.md)` : '—'} | ${e.has_report ? `[报告](./${e.name}/拆解报告.md)` : '—'} | ${e.has_library_card ? `[卡片](./${e.name}/剧情库卡片.md)` : '—'} |`,
    )
  }
  md.push('')
  md.push('## 每部剧的目录结构')
  md.push('')
  md.push('```')
  md.push('剧库/<剧名>/')
  md.push('  meta.json          剧集元数据（series_id、简介、分集 id）')
  md.push('  档案.json          题材标签、热度、一句话、钩子/引擎/结局/复用点（索引与模式库用）')
  md.push('  raw/EPxxx.mp4      原始分集（360p HEVC，解密后）')
  md.push('  拆解/EPxxx/        镜头表、关键帧、九宫格')
  md.push('  字幕/EPxxx.srt     听写字幕 + 全集字幕.md')
  md.push('  剧本逆推/EPxxx.md  逐镜台词逆推稿 + 分集表.csv + 剧情结构逆推.md')
  md.push('  拆解报告.md        结构/钩子/爆点/节奏/爆款原因/独特之处')
  md.push('  剧情库卡片.md      可复用配方卡（写新剧直接套）')
  md.push('```')
  md.push('')
  md.push('## 用法')
  md.push('')
  md.push('```bash')
  md.push('node bin/scan.mjs                       # 01 扫榜')
  md.push('node bin/download.mjs --search 剧名      # 02 下载全集')
  md.push('node bin/decompose.mjs --series 剧名     # 03 镜头拆解')
  md.push('node bin/asr.mjs --series 剧名           # 04 听写字幕')
  md.push('node bin/structure.mjs --series 剧名     # 05 逐镜逆推')
  md.push('node bin/index.mjs                      # 06 刷新本索引')
  md.push('```')

  await writeFile(join(LIB, 'README.md'), md.join('\n'))
  console.log(`[index] ${index.length} 部 → ${join(LIB, 'README.md')}`)
}

main().catch((e) => {
  console.error('[index] 失败：', e.message ?? e)
  process.exit(1)
})
