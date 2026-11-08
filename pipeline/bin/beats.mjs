#!/usr/bin/env node
/**
 * 07 事件索引：把每集台词按「战斗/危机/感情/朝堂/计谋/穿越/结盟/喜剧」打标签，
 * 生成季内事件时间线，用来快速定位重场戏、挑选精读集。
 *
 * 输出（剧库/<剧名>/拆解/）：
 *   事件索引.csv     每集：时长/镜数/切镜率/字数/各类词频/主标签/开场/结尾
 *   事件时间线.md    每 10 集一段的标签分布 + 该段最"重"的 5 集 + 首尾台词
 *
 * 用法：node bin/beats.mjs --series 示例剧·第一季
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
const SERIES = arg('series', '')
if (!SERIES) {
  console.error('需要 --series <剧名目录>')
  process.exit(1)
}

const TAGS = {
  战斗: /打|杀|冲|埋伏|敌军|箭|刀|枪|血|战|攻城|骑兵|炸|开火|射击|掩护|突围|阵/,
  危机: /危险|快跑|小心|撤退|救|受伤|中毒|包围|来不及|糟糕|坏了|快走/,
  感情: /喜欢|成亲|婚|抱|亲|姑娘|脸红|吃醋|想你|媳妇|夫君|娘子|心动/,
  朝堂: /官家|皇帝|宰相|圣旨|朝堂|知府|县令|枢密|经略|使君|大人|朝廷/,
  计谋: /计|骗|诈|策|阴谋|试探|内应|埋伏|设局|圈套|假的/,
  穿越: /穿越|现代|特种|狙击|对讲机|无人机|手枪|子弹|手机|公元/,
  结盟: /结盟|投靠|收编|兄弟|自己人|合作|联手|归顺/,
  喜剧: /咋|啥|俺|整|扯|闹|笑|哈哈|得嘞|中不中/,
}

const pad = (n) => String(n).padStart(3, '0')

async function readTxt(dir, n) {
  try {
    return await readFile(join(dir, '字幕', `EP${pad(n)}.txt`), 'utf8')
  } catch {
    return ''
  }
}

function parseTxt(txt) {
  return txt
    .split('\n')
    .map((l) => l.match(/^\[(\d{2}):(\d{2}):(\d{2}),(\d{3})\]\s*(.+)$/))
    .filter(Boolean)
    .map((m) => ({
      t: Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000,
      text: m[5].trim(),
    }))
}

const clean = (s) => s.replace(/\s+/g, '').slice(0, 60)

async function main() {
  const dir = join(ROOT, '剧库', SERIES)
  const outDir = join(dir, '拆解')
  await mkdir(outDir, { recursive: true })
  const files = (await readdir(join(dir, 'raw'))).filter((f) => /^EP\d+\.mp4$/.test(f))
  const nums = files.map((f) => Number(f.match(/\d+/)[0])).sort((a, b) => a - b)

  let detail = new Map()
  try {
    const stats = JSON.parse(await readFile(join(outDir, 'stats.json'), 'utf8'))
    detail = new Map(stats.episodes_detail.map((e) => [e.ep, e]))
  } catch {}

  const rows = []
  for (const n of nums) {
    const cues = parseTxt(await readTxt(dir, n))
    const text = cues.map((c) => c.text).join('')
    const counts = {}
    for (const [tag, re] of Object.entries(TAGS)) counts[tag] = (text.match(new RegExp(re.source, 'g')) ?? []).length
    const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1])
    const d = detail.get(n) ?? {}
    rows.push({
      ep: n,
      duration: d.duration ?? null,
      shots: d.shots ?? null,
      cpm: d.cpm ?? null,
      chars: text.replace(/\s/g, '').length,
      ...counts,
      top: ranked[0][1] ? ranked[0][0] : '—',
      second: ranked[1][1] ? ranked[1][0] : '—',
      first: clean(cues[0]?.text ?? ''),
      last: clean(cues.at(-1)?.text ?? ''),
    })
  }

  const headers = ['集', '时长s', '镜数', '切镜率', '字数', ...Object.keys(TAGS), '主标签', '次标签', '开场', '结尾']
  const csv = [headers.join(',')]
  for (const r of rows) {
    csv.push(
      [
        r.ep,
        r.duration ?? '',
        r.shots ?? '',
        r.cpm ?? '',
        r.chars,
        ...Object.keys(TAGS).map((t) => r[t]),
        r.top,
        r.second,
        `"${r.first.replace(/"/g, '""')}"`,
        `"${r.last.replace(/"/g, '""')}"`,
      ].join(','),
    )
  }
  await writeFile(join(outDir, '事件索引.csv'), csv.join('\n'))

  const md = []
  md.push(`# ${SERIES} · 事件时间线`)
  md.push('')
  md.push(`> ${rows.length} 集，按 10 集一段统计；词频是「台词提及次数」，不是场次，仅用于定位重场戏。`)
  md.push('')
  for (let i = 0; i < rows.length; i += 10) {
    const part = rows.slice(i, i + 10)
    if (!part.length) continue
    const tagSum = Object.keys(TAGS)
      .map((t) => [t, part.reduce((a, b) => a + b[t], 0)])
      .sort((a, b) => b[1] - a[1])
      .filter(([, v]) => v > 0)
      .slice(0, 5)
    const byCuts = [...part].sort((a, b) => (b.cpm ?? 0) - (a.cpm ?? 0)).slice(0, 3)
    const byChars = [...part].sort((a, b) => b.chars - a.chars).slice(0, 3)
    const byQuiet = [...part].sort((a, b) => a.chars - b.chars).slice(0, 2)
    md.push(`## EP${part[0].ep}–EP${part.at(-1).ep}`)
    md.push('')
    md.push(`- 词频：${tagSum.map(([t, v]) => `${t} ${v}`).join('　')}`)
    md.push(
      `- 最快：${byCuts.map((r) => `EP${r.ep}（${r.cpm ?? '-'} 次/分）`).join('、')}　｜　话最密：${byChars
        .map((r) => `EP${r.ep}（${r.chars} 字）`)
        .join('、')}　｜　最静：${byQuiet.map((r) => `EP${r.ep}（${r.chars} 字）`).join('、')}`,
    )
    md.push(`- 段首：EP${part[0].ep}「${part[0].first || '（无台词）'}」`)
    md.push(`- 段尾：EP${part.at(-1).ep}「${part.at(-1).last || '（无台词）'}」`)
    md.push('')
  }
  await writeFile(join(outDir, '事件时间线.md'), md.join('\n'))
  console.log(`[beats] ${rows.length} 集 → 拆解/事件索引.csv + 事件时间线.md`)
}

main().catch((e) => {
  console.error(String(e?.message ?? e))
  process.exit(1)
})
