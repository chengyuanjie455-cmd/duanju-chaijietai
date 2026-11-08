#!/usr/bin/env node
/**
 * 自动拆解初稿（规则引擎，不调用大模型）
 *
 * 读取 meta.json / 拆解/stats.json / 拆解/事件索引.csv / 剧本逆推/分集表.csv，
 * 生成 剧库/<剧名>/拆解报告.md —— 明确标注「自动初稿」。
 *
 * 用法：
 *   node bin/auto-report.mjs --series "剧名"
 */
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`)
  return index > 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}
const NAME = arg('series', '')
if (!NAME) {
  console.error('[auto-report] 需要 --series "剧名"')
  process.exit(1)
}

const DIR = join(ROOT, '剧库', NAME)
const readJson = async (file) => {
  try { return JSON.parse(await readFile(file, 'utf8')) } catch { return null }
}

function csvRows(text) {
  const out = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1 }
      else if (ch === '"') quoted = false
      else cell += ch
      continue
    }
    if (ch === '"') { quoted = true; continue }
    if (ch === ',') { row.push(cell); cell = ''; continue }
    if (ch === '\n') { row.push(cell); out.push(row); row = []; cell = ''; continue }
    if (ch === '\r') continue
    cell += ch
  }
  if (cell.length || row.length) { row.push(cell); out.push(row) }
  return out.filter((line) => line.some((item) => item !== ''))
}

const num = (value, digits = 2) => (Number.isFinite(Number(value)) ? Number(Number(value).toFixed(digits)) : '-')
const pct = (value) => (Number.isFinite(Number(value)) ? `${Math.round(Number(value) * 10) / 10}%` : '-')

async function main() {
  const meta = (await readJson(join(DIR, 'meta.json'))) ?? {}
  const stats = await readJson(join(DIR, '拆解', 'stats.json'))
  if (!stats) {
    console.error('[auto-report] 缺少 拆解/stats.json，先跑 node bin/stats.mjs --series "' + NAME + '"')
    process.exit(1)
  }
  const beatsFile = join(DIR, '拆解', '事件索引.csv')
  const beats = existsSync(beatsFile) ? csvRows(await readFile(beatsFile, 'utf8')) : []
  const beatHead = beats[0] ?? []
  const beatRows = beats.slice(1).map((row) => Object.fromEntries(beatHead.map((key, index) => [key, row[index] ?? ''])))

  const dialogue = stats.dialogue ?? {}
  const cuts = stats.cuts_per_min ?? {}
  const epDur = stats.ep_duration ?? {}
  const hooks = stats.hooks ?? {}
  const segments = stats.segments ?? []
  const episodes = stats.episodes_detail ?? []
  const ends = stats.ends ?? stats.ending_types ?? {}

  // 事件分布：每 10 集一段，统计各标签的总词频
  const labels = ['战斗', '危机', '感情', '朝堂', '计谋', '穿越', '结盟', '喜剧']
  const buckets = new Map()
  for (const row of beatRows) {
    const ep = Number(row['集'] ?? 0)
    if (!ep) continue
    const bucket = Math.floor((ep - 1) / 10) * 10 + 1
    if (!buckets.has(bucket)) buckets.set(bucket, Object.fromEntries(labels.map((label) => [label, 0])))
    const target = buckets.get(bucket)
    for (const label of labels) target[label] += Number(row[label] ?? 0) || 0
  }

  const fastest = (stats.fastest_eps ?? []).slice(0, 5)
  const slowest = (stats.slowest_eps ?? []).slice(0, 5)
  const quick = episodes.filter((row) => Number(row.shots) <= 6)
  const longest = episodes.reduce((best, row) => (!best || Number(row.duration) > Number(best.duration) ? row : best), null)
  const shortest = episodes.reduce((best, row) => (!best || Number(row.duration) < Number(best.duration) ? row : best), null)

  const hotLabel = [...labels]
    .map((label) => ({ label, total: beatRows.reduce((sum, row) => sum + (Number(row[label]) || 0), 0) }))
    .sort((a, b) => b.total - a.total)
  const tagCount = new Map()
  for (const row of beatRows) for (const key of ['主标签', '次标签']) {
    const tag = String(row[key] ?? '').trim()
    if (tag) tagCount.set(tag, (tagCount.get(tag) ?? 0) + 1)
  }
  const genre = [...tagCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([tag]) => tag)
  const platformTags = (meta.tags ?? []).join(' / ')

  const lines = []
  lines.push(`# 《${NAME}》自动拆解初稿`, '')
  lines.push('> 这份报告由规则引擎从 `meta.json` + `stats.json` + `事件索引.csv` 直接生成，**没有人工或大模型深读**。')
  lines.push('> 结论只用于快速体检和排期判断；要写成可复用的剧作分析，请再跑人工/AI 精读。', '')

  lines.push('## 一、档案', '')
  lines.push('| 项 | 值 |', '|---|---|')
  lines.push(`| 剧名 | ${meta.title ?? NAME} |`)
  if (meta.heat) lines.push(`| 平台热度 | ${(Number(meta.heat) / 10000).toFixed(1)} 万 |`)
  lines.push(`| 集数 | ${stats.episodes ?? meta.episode_count ?? '-'} |`)
  lines.push(`| 总时长 | ${num(stats.total_minutes, 1)} 分钟 |`)
  lines.push(`| 主事件标签 | ${genre.join(' / ') || '-'} |`)
  if (platformTags) lines.push(`| 平台标签 | ${platformTags} |`)
  if (meta.description) lines.push('', `> ${String(meta.description).replace(/\s+/g, ' ').slice(0, 160)}…`)

  lines.push('', '## 二、节奏体检', '')
  lines.push('| 指标 | 值 | 读法 |', '|---|---:|---|')
  lines.push(`| 秒/镜 | ${num(stats.sec_per_shot)} | ${Number(stats.sec_per_shot) <= 3 ? '偏快，靠切碎维持注意力' : Number(stats.sec_per_shot) >= 4 ? '偏慢，长镜多，注意注水感' : '常规'} |`)
  lines.push(`| 切镜率 | ${num(cuts.mean, 1)} 次/分（${num(cuts.min, 1)}–${num(cuts.max, 1)}） | ${Number(cuts.mean) >= 22 ? '高密度' : Number(cuts.mean) <= 15 ? '低密度' : '常规'} |`)
  lines.push(`| 均集时长 | ${num(epDur.mean, 1)} 秒（${num(epDur.min, 1)}–${num(epDur.max, 1)}） | ${Number(epDur.mean) <= 80 ? '短集，靠集数堆时长' : Number(epDur.mean) >= 130 ? '长集，单集信息重' : '常规'} |`)
  lines.push(`| <3 秒镜头 | ${pct(stats.under3_ratio)} | 越高越碎 |`)
  lines.push(`| 最长单镜 | ${num(stats.longest_shot, 1)} 秒 | 超过 20 秒要查是否空镜撑场 |`)
  if (longest) lines.push(`| 最长/最短集 | EP${longest.ep} ${num(longest.duration, 1)}s / EP${shortest?.ep ?? '-'} ${num(shortest?.duration, 1)}s | 极值差 ${num(Number(longest.duration) / Math.max(Number(shortest?.duration ?? 1), 1), 2)} 倍 |`)

  lines.push('', '## 三、台词语音', '')
  lines.push(`- 总台词 ${dialogue.chars_total ?? '-'} 字，密度 **${num(dialogue.chars_per_min, 1)} 字/分**（中位 ${num(dialogue.per_ep_median, 0)} 字/集）。`)
  lines.push(`- 承载台词的镜头占 ${pct(dialogue.with_dialogue_ratio)}，台词覆盖 ${pct(dialogue.coverage_ratio)} 的镜头时长。`)

  lines.push('', '## 四、钩子体检', '')
  lines.push('| 指标 | 值 | 判断 |', '|---|---:|---|')
  lines.push(`| 首句落在 00:00 | ${hooks.zero_start ?? '-'} 集 | ${Number(hooks.zero_start_ratio) >= 80 ? '开口即进戏' : '开场有留白，需查是否拖'} |`)
  lines.push(`| 集首复读上集末句 | ${hooks.repeat_first_line ?? '-'} 集 | ${Number(hooks.repeat_ratio) > 5 ? '复读偏多，像在补时长' : '基本无复读'} |`)
  lines.push(`| 末句均字数 | ${num(hooks.last_line_len_mean, 1)} 字 | ${Number(hooks.last_line_len_mean) <= 6 ? '短促卡点' : '末句偏长，钩子变软'} |`)
  lines.push(`| 末句后留白 | ${num(hooks.tail_silence_mean)} 秒 | ${Number(hooks.tail_silence_mean) >= 3 ? '留白足，情绪有余味' : '收得急'} |`)

  const endKeys = Object.keys(ends)
  if (endKeys.length) {
    lines.push('', '## 五、结尾类型分布', '', '| 类型 | 集数 | 占比 |', '|---|---:|---:|')
    const total = endKeys.reduce((sum, key) => sum + Number(ends[key] ?? 0), 0)
    for (const key of endKeys.sort((a, b) => Number(ends[b]) - Number(ends[a]))) {
      lines.push(`| ${key} | ${ends[key]} | ${pct((Number(ends[key]) / Math.max(total, 1)) * 100)} |`)
    }
  }

  if (buckets.size) {
    lines.push('', '## 六、事件分布（每 10 集）', '')
    lines.push(`| 集段 | ${labels.join(' | ')} |`, `|---|${labels.map(() => '---:').join('|')}|`)
    for (const [start, row] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
      lines.push(`| EP${start}-${start + 9} | ${labels.map((label) => row[label]).join(' | ')} |`)
    }
    lines.push('', `- 词频最高：${hotLabel.slice(0, 3).map((item) => `${item.label} ${item.total}`).join('、')}。`)
  }

  lines.push('', '## 七、节奏异常集', '')
  lines.push(`- 最快：${fastest.map((row) => `EP${row.ep}（${num(row.cpm, 1)} 次/分）`).join('、') || '-'}`)
  lines.push(`- 最慢：${slowest.map((row) => `EP${row.ep}（${num(row.cpm, 1)} 次/分）`).join('、') || '-'}`)
  if (quick.length) lines.push(`- 镜数 ≤6 的集共 ${quick.length} 个：${quick.slice(0, 10).map((row) => `EP${row.ep}（${row.shots} 镜）`).join('、')}${quick.length > 10 ? ' …' : ''}——长镜对话或产能压缩，抽看确认。`)

  if (segments.length) {
    lines.push('', '## 八、分段节奏', '', '| 段 | 分钟 | 均集长 | 镜/集 | 切镜率 | <3s | 字/分 |', '|---|---:|---:|---:|---:|---:|---:|')
    for (const row of segments) {
      lines.push(`| ${row.range ?? `${row.from}-${row.to}`} | ${num(row.minutes, 1)} | ${num(row.avgDuration ?? row.avg_duration, 1)} | ${num(row.shotsPerEp ?? row.shots_per_ep, 1)} | ${num(row.cpm, 1)} | ${pct(row.under3Ratio ?? row.under3_ratio)} | ${num(row.charsPerMin ?? row.chars_per_min, 1)} |`)
    }
  }

  lines.push('', '## 九、机器结论', '')
  const verdict = []
  if (Number(stats.sec_per_shot) >= 4) verdict.push('镜头偏长：同长度素材的「碎度」不够，若对标同题材，先补反应镜和特写。')
  if (Number(cuts.mean) >= 22) verdict.push('切镜密度高：靠剪辑节奏抓人，剧本压力可以略低，但空镜会被立刻看出来。')
  if (Number(dialogue.chars_per_min) >= 185) verdict.push('台词密度高：信息靠嘴推进，声音/口型质量是硬门槛。')
  if (Number(dialogue.chars_per_min) <= 140) verdict.push('台词密度低：靠画面和动作叙事，适合动作/奇观题材，文戏容易散。')
  if (Number(hooks.last_line_len_mean) > 6.5) verdict.push('末句偏长：卡点不够狠，建议压到 4-6 字或改成动作断点。')
  if (Number(hooks.tail_silence_mean) < 3) verdict.push('末句后留白不足：情绪没落地就切走，观众容易断连。')
  if (quick.length >= 10) verdict.push(`低镜集 ${quick.length} 个：疑似产能压缩或单人长对白，需抽查是否伤戏。`)
  if (!verdict.length) verdict.push('各项落在常规区间：没有明显硬伤，也缺少突出长板，属于可交付但不易出圈的类型。')
  lines.push(...verdict.map((item) => `- ${item}`))

  lines.push('', '## 十、下一步', '')
  lines.push('- 想深拆：读 `剧本逆推/剧情结构逆推.md`（若已生成）与 `拆解/事件时间线.md`，再按 `prompts/季报写作.md` 的九节写正式报告。')
  lines.push('- 想做对标：把本剧 `data/trend.json` 里的名次变化与本报告节奏指标并列，看「快」是否伴随热度上升。')
  lines.push('- 本文件可被重复生成覆盖；人工精读版请另存 `拆解报告-精读.md`。')

  const out = join(DIR, '自动拆解初稿.md')
  await writeFile(out, lines.join('\n'))
  console.log(`[auto-report] ${NAME} → 自动拆解初稿.md（${lines.length} 行）`)
}

main().catch((error) => {
  console.error('[auto-report] failed:', error?.message ?? error)
  process.exit(1)
})
