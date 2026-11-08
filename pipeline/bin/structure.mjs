#!/usr/bin/env node
/**
 * 05 结构逆推：把「镜头表 + 字幕」合成为逐集可读的逆推稿
 *
 * 输出（剧库/<剧名>/剧本逆推/）：
 *   EPxxx.md      逐镜表：时间码 / 时长 / 台词 / 关键帧
 *   EPxxx.json    机器可读（shots + dialogue）
 *   分集表.csv    全季一览：时长、镜头数、台词字数、首尾台词（钩子分析用）
 *
 * 用法：
 *   node bin/structure.mjs --series 示例剧
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

const pad = (n) => String(n).padStart(3, '0')
const stamp = () => new Date().toLocaleTimeString('zh-CN', { hour12: false })
const log = (m) => console.log(`${stamp()} ${m}`)
const tc = (s) => {
  const m = Math.floor(s / 60)
  const sec = s - m * 60
  return `${pad(m)}:${sec.toFixed(1).padStart(4, '0')}`
}

function parseSrt(srt) {
  const out = []
  for (const block of srt.split(/\n\s*\n/)) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean)
    const timeLine = lines.find((l) => l.includes('-->'))
    if (!timeLine) continue
    const text = lines.filter((l) => l !== timeLine && !/^\d+$/.test(l)).join(' ')
    if (!text) continue
    const [a, b] = timeLine.split('-->').map((s) => s.trim())
    const toSec = (t) => {
      const [hh, mm, rest] = t.replace(',', '.').split(':')
      return Number(hh) * 3600 + Number(mm) * 60 + Number(rest)
    }
    out.push({ start: toSec(a), end: toSec(b), text })
  }
  return out
}

async function main() {
  if (!SERIES) throw new Error('需要 --series <剧名目录>')
  const dir = join(ROOT, '剧库', SERIES)
  const meta = JSON.parse(await readFile(join(dir, 'meta.json'), 'utf8'))
  const outDir = join(dir, '剧本逆推')
  await mkdir(outDir, { recursive: true })

  const eps = (await readdir(join(dir, '拆解')))
    .map((f) => f.match(/^EP(\d+)$/))
    .filter(Boolean)
    .map((m) => Number(m[1]))
    .sort((a, b) => a - b)

  const rows = []
  for (const n of eps) {
    const base = `EP${pad(n)}`
    const shotsJson = JSON.parse(await readFile(join(dir, '拆解', base, 'shots.json'), 'utf8'))
    let cues = []
    try {
      cues = parseSrt(await readFile(join(dir, '字幕', `${base}.srt`), 'utf8'))
    } catch {}

    const shots = shotsJson.shots.map((s) => ({ ...s, lines: [] }))
    for (const cue of cues) {
      const hit = shots.find((s) => cue.start < s.end && cue.end > s.start)
      if (hit) hit.lines.push(cue.text)
      else {
        const last = shots[shots.length - 1]
        if (last) last.lines.push(cue.text)
      }
    }

    const chars = cues.map((c) => c.text.replace(/\s/g, '').length).reduce((a, b) => a + b, 0)
    const dialogueShots = shots.filter((s) => s.lines.length).length
    const md = []
    md.push(`# 第${n}集 · 逐镜逆推`)
    md.push('')
    md.push(`> 时长 ${shotsJson.meta.duration}s　|　${shots.length} 镜　|　台词 ${chars} 字　|　有台词镜头 ${dialogueShots}`)
    md.push('')
    md.push('| # | 时间 | 时长 | 台词 | 关键帧 |')
    md.push('|---|---|---|---|---|')
    for (const s of shots) {
      const img = s.keyframe.replace(/^shots\//, `../拆解/${base}/shots/`)
      md.push(
        `| ${s.no} | ${tc(s.start)} | ${s.dur}s | ${s.lines.join(' / ').replace(/\|/g, '\\|') || '—'} | ![](${img}) |`,
      )
    }
    md.push('')
    await writeFile(join(outDir, `${base}.md`), md.join('\n'))
    await writeFile(join(outDir, `${base}.json`), JSON.stringify({ number: n, meta: shotsJson.meta, shots }, null, 2))

    const first = cues[0]?.text ?? ''
    const last = cues[cues.length - 1]?.text ?? ''
    rows.push({
      n,
      duration: shotsJson.meta.duration,
      shots: shots.length,
      chars,
      dialogueShots,
      firstLine: first.replace(/,/g, '，'),
      lastLine: last.replace(/,/g, '，'),
    })
    log(`${base} → ${shots.length} 镜 / ${chars} 字`)
  }

  const csv = ['集,时长s,镜头数,台词字数,有台词镜头,开场台词,结尾台词']
  for (const r of rows) {
    csv.push(
      [r.n, r.duration, r.shots, r.chars, r.dialogueShots, `"${r.firstLine}"`, `"${r.lastLine}"`].join(','),
    )
  }
  await writeFile(join(outDir, '分集表.csv'), csv.join('\n'))
  await writeFile(join(outDir, '分集表.json'), JSON.stringify(rows, null, 2))
  log(`[done] ${rows.length} 集 → ${outDir}`)
}

main().catch((e) => {
  console.error('[structure] 失败：', e.message ?? e)
  process.exit(1)
})
