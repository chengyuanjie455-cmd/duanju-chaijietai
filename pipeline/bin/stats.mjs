#!/usr/bin/env node
/**
 * 05b 数据速览：不靠 LLM，纯统计出「节奏 + 钩子」硬指标
 *
 * 输入：剧库/<剧名>/拆解/summary.json、拆解/EPxxx/shots.json、字幕/EPxxx.srt
 * 输出：剧库/<剧名>/拆解/数据速览.md、拆解/stats.json
 *
 * 用法：
 *   node bin/stats.mjs --series 示例剧
 *   node bin/stats.mjs --series 示例剧 --segments 5
 */
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const LIB = join(ROOT, '剧库')

const argv = process.argv.slice(2)
const arg = (name, def = null) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def
}
const SERIES = arg('series')
const SEGMENTS = Number(arg('segments', 5))

if (!SERIES) {
  console.error('用法：node bin/stats.mjs --series <剧名> [--segments 5]')
  process.exit(1)
}

const DIR = join(LIB, SERIES)
const round = (n, d = 2) => (n == null || Number.isNaN(n) ? null : Math.round(n * 10 ** d) / 10 ** d)
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null)
const quantile = (a, q) => {
  if (!a.length) return null
  const s = [...a].sort((x, y) => x - y)
  const pos = (s.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return s[lo] + (s[hi] - s[lo]) * (pos - lo)
}
const corr = (xs, ys) => {
  const n = Math.min(xs.length, ys.length)
  if (n < 3) return null
  const mx = mean(xs.slice(0, n))
  const my = mean(ys.slice(0, n))
  let num = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx
    const b = ys[i] - my
    num += a * b
    dx += a * a
    dy += b * b
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : null
}

const CJK = /[\u3400-\u9fff\uf900-\ufaff]/
const cleanLine = (s) =>
  (s || '')
    .replace(/\([^)]*\)|（[^）]*）/g, '')
    .replace(/[\s，。！？、…“”‘’"'：；,.!?~—\-·]/g, '')
    .trim()

function parseSrt(text) {
  const cues = []
  const blocks = text.replace(/\r/g, '').split('\n\n')
  for (const b of blocks) {
    const lines = b.split('\n').filter(Boolean)
    if (!lines.length) continue
    let idx = lines.findIndex((l) => l.includes('-->'))
    if (idx < 0) continue
    const m = lines[idx].match(/(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)/)
    if (!m) continue
    const toSec = (h, mi, s, ms) => Number(h) * 3600 + Number(mi) * 60 + Number(s) + Number(ms) / 1000
    const start = toSec(m[1], m[2], m[3], m[4])
    const end = toSec(m[5], m[6], m[7], m[8])
    const body = lines.slice(idx + 1).join(' ').trim()
    if (!body) continue
    cues.push({ start, end, text: body })
  }
  return cues
}

async function readJson(p, fallback = null) {
  try {
    return JSON.parse(await readFile(p, 'utf8'))
  } catch {
    return fallback
  }
}

async function exists(p) {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

async function main() {
  if (!(await exists(join(DIR, 'meta.json')))) {
    console.error(`找不到剧库/${SERIES}/meta.json——先用 download.mjs 下载`)
    process.exit(1)
  }
  const meta = await readJson(join(DIR, 'meta.json'))
  const summary = await readJson(join(DIR, '拆解/summary.json'))
  if (!summary?.episodes?.length) {
    console.error(`找不到剧库/${SERIES}/拆解/summary.json——先跑 decompose.mjs`)
    process.exit(1)
  }

  const srtFiles = (await readdir(join(DIR, '字幕')).catch(() => []))
    .filter((f) => /^EP\d+\.srt$/.test(f))
    .sort()

  const eps = []
  for (const e of summary.episodes) {
    const epNo = e.number
    const srt = srtFiles.includes(`EP${String(epNo).padStart(3, '0')}.srt`)
      ? parseSrt(await readFile(join(DIR, '字幕', `EP${String(epNo).padStart(3, '0')}.srt`), 'utf8'))
      : []
    const spoken = srt.filter((c) => CJK.test(c.text))
    const chars = spoken.reduce((a, c) => a + cleanLine(c.text).length, 0)
    const first = spoken[0] ?? null
    const last = spoken.length ? spoken[spoken.length - 1] : null
    const shots = await readJson(join(DIR, '拆解', `EP${String(epNo).padStart(3, '0')}`, 'shots.json'))
    const shotsArr = shots?.shots ?? []
    const dur = e.duration
    eps.push({
      ep: epNo,
      duration: dur,
      shots: e.shots,
      cpm: e.cuts_per_minute,
      median: e.shot_median,
      under3: e.under_3s,
      under1: e.under_1s,
      longest: e.longest,
      longShots: shotsArr.filter((s) => s.dur >= 10).length,
      cues: spoken.length,
      chars,
      charsPerMin: dur ? (chars / dur) * 60 : null,
      firstStart: first?.start ?? null,
      firstText: first?.text ?? null,
      lastEnd: last?.end ?? null,
      lastText: last?.text ?? null,
      tailSilence: last ? Math.max(0, dur - last.end) : null,
      withDialogue: new Set(
        spoken
          .map((c) => shotsArr.find((s) => c.start >= s.start && c.start < s.end)?.no ?? shotsArr.at(-1)?.no)
          .filter(Boolean),
      ).size,
      coveredShots: shotsArr.filter((s) => spoken.some((c) => c.start < s.end && c.end > s.start)).length,
    })
  }

  const epsWithSrt = eps.filter((e) => e.cues > 0)
  const totalSeconds = eps.reduce((a, b) => a + b.duration, 0)
  const totalShots = eps.reduce((a, b) => a + b.shots, 0)
  const cpmList = eps.map((e) => e.cpm).filter((v) => v != null)
  const charsTotal = eps.reduce((a, b) => a + b.chars, 0)

  const lastLen = epsWithSrt.map((e) => cleanLine(e.lastText).length)
  const lcs = (a, b) => {
    const n = a.length
    const m = b.length
    if (!n || !m) return 0
    let prev = new Array(m + 1).fill(0)
    for (let i = 1; i <= n; i++) {
      const cur = new Array(m + 1).fill(0)
      for (let j = 1; j <= m; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1])
      prev = cur
    }
    return prev[m]
  }
  const sim = (a, b) => {
    const x = cleanLine(a)
    const y = cleanLine(b)
    if (!x || !y) return 0
    return lcs(x, y) / Math.max(x.length, y.length)
  }
  const rep = eps.filter(
    (e, i) => i > 0 && cleanLine(e.firstText) && sim(e.firstText, eps[i - 1].lastText) >= 0.7,
  )
  const zeroStart = epsWithSrt.filter((e) => e.firstStart != null && e.firstStart < 0.5)
  const tail = epsWithSrt.map((e) => e.tailSilence).filter((v) => v != null)
  const shotDur = totalShots ? totalSeconds / totalShots : null

  const buckets = [
    ['<90s', (d) => d < 90],
    ['90–120s', (d) => d >= 90 && d < 120],
    ['120–150s', (d) => d >= 120 && d < 150],
    ['≥150s', (d) => d >= 150],
  ].map(([label, f]) => [label, eps.filter((e) => f(e.duration)).length])

  const segs = []
  const per = Math.ceil(eps.length / SEGMENTS)
  for (let i = 0; i < SEGMENTS; i++) {
    const part = eps.slice(i * per, (i + 1) * per)
    if (!part.length) continue
    const sp = part.reduce((a, b) => a + b.duration, 0)
    const sh = part.reduce((a, b) => a + b.shots, 0)
    const ch = part.reduce((a, b) => a + b.chars, 0)
    segs.push({
      range: `EP${part[0].ep}–EP${part[part.length - 1].ep}`,
      minutes: round(sp / 60, 1),
      avgDuration: round(sp / part.length, 1),
      shotsPerEp: round(sh / part.length, 1),
      cpm: round(mean(part.map((e) => e.cpm)), 1),
      under3Ratio: round((part.reduce((a, b) => a + b.under3, 0) / Math.max(1, sh)) * 100, 1),
      charsPerMin: round((ch / sp) * 60, 1),
    })
  }

  const stats = {
    series: meta.title ?? SERIES,
    episodes: eps.length,
    total_minutes: round(totalSeconds / 60, 1),
    total_shots: totalShots,
    sec_per_shot: round(shotDur),
    shot_median: round(quantile(eps.flatMap((e) => (e.median != null ? [e.median] : [])), 0.5)),
    cuts_per_min: {
      mean: round(mean(cpmList), 1),
      q1: round(quantile(cpmList, 0.25), 1),
      median: round(quantile(cpmList, 0.5), 1),
      q3: round(quantile(cpmList, 0.75), 1),
      min: round(Math.min(...cpmList), 1),
      max: round(Math.max(...cpmList), 1),
    },
    under3_ratio: round((eps.reduce((a, b) => a + b.under3, 0) / totalShots) * 100, 1),
    under1_shots: eps.reduce((a, b) => a + b.under1, 0),
    longest_shot: Math.max(...eps.map((e) => e.longest ?? 0)),
    ep_duration: {
      min: round(Math.min(...eps.map((e) => e.duration)), 1),
      max: round(Math.max(...eps.map((e) => e.duration)), 1),
      mean: round(mean(eps.map((e) => e.duration)), 1),
      buckets,
      shortest_ep: eps.reduce((a, b) => (b.duration < a.duration ? b : a)).ep,
      longest_ep: eps.reduce((a, b) => (b.duration > a.duration ? b : a)).ep,
    },
    dialogue: {
      chars_total: charsTotal,
      chars_per_min: round((charsTotal / totalSeconds) * 60, 1),
      per_ep_median: round(quantile(eps.map((e) => e.chars), 0.5), 1),
      with_dialogue_ratio: round(
        (eps.reduce((a, b) => a + b.withDialogue, 0) / Math.max(1, eps.reduce((a, b) => a + b.shots, 0))) * 100,
        1,
      ),
      coverage_ratio: round(
        (eps.reduce((a, b) => a + b.coveredShots, 0) / Math.max(1, eps.reduce((a, b) => a + b.shots, 0))) * 100,
        1,
      ),
      peak: epsWithSrt
        .map((e) => [e.ep, round(e.charsPerMin, 1)])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3),
      valley: epsWithSrt
        .map((e) => [e.ep, round(e.charsPerMin, 1)])
        .sort((a, b) => a[1] - b[1])
        .slice(0, 3),
    },
    hooks: {
      eps_with_subs: epsWithSrt.length,
      zero_start: zeroStart.length,
      zero_start_ratio: round((zeroStart.length / Math.max(1, epsWithSrt.length)) * 100, 1),
      no_dialogue_30s: epsWithSrt.filter((e) => (e.firstStart ?? 99) >= 30).map((e) => e.ep),
      repeat_first_line: rep.length,
      repeat_ratio: round((rep.length / Math.max(1, epsWithSrt.length - 1)) * 100, 1),
      repeat_eps: rep.map((e) => e.ep),
      last_line_len_mean: round(mean(lastLen), 1),
      last_line_len_median: round(quantile(lastLen, 0.5), 1),
      last_line_le4: lastLen.filter((n) => n <= 4).length,
      last_line_le4_ratio: round((lastLen.filter((n) => n <= 4).length / Math.max(1, lastLen.length)) * 100, 1),
      last_line_le6_ratio: round((lastLen.filter((n) => n <= 6).length / Math.max(1, lastLen.length)) * 100, 1),
      tail_silence_mean: round(mean(tail), 2),
      tail_silence_median: round(quantile(tail, 0.5), 2),
      tail_gt3: tail.filter((v) => v > 3).length,
      tail_gt6: tail.filter((v) => v > 6).length,
      tail_max: round(Math.max(...tail), 1),
      tail_max_ep: epsWithSrt.reduce((a, b) => ((b.tailSilence ?? 0) > (a.tailSilence ?? 0) ? b : a)).ep,
    },
    correlation: {
      ep_duration_vs_cpm: round(corr(eps.map((e) => e.duration), eps.map((e) => e.cpm)), 3),
      ep_duration_vs_shots: round(corr(eps.map((e) => e.duration), eps.map((e) => e.shots)), 3),
    },
    segments: segs,
    fastest_eps: eps
      .map((e) => [e.ep, round(e.cpm, 1)])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8),
    slowest_eps: eps
      .map((e) => [e.ep, round(e.cpm, 1)])
      .sort((a, b) => a[1] - b[1])
      .slice(0, 6),
    episodes_detail: eps.map((e) => ({
      ep: e.ep,
      duration: round(e.duration, 1),
      shots: e.shots,
      cpm: round(e.cpm, 1),
      chars: e.chars,
      first: e.firstText,
      last: e.lastText,
      tail: round(e.tailSilence, 2),
    })),
  }

  await writeFile(join(DIR, '拆解/stats.json'), JSON.stringify(stats, null, 2))

  const md = []
  md.push(`# 《${stats.series}》数据速览`)
  md.push('')
  md.push(`> ${stats.episodes} 集 / ${stats.total_minutes} 分钟 / ${stats.total_shots} 镜　|　由 \`bin/stats.mjs\` 自动统计，全部可复算`)
  md.push('> 台词统计基于本地 Whisper 听写，会因漏字偏低，绝对值偏保守、趋势可用。')
  md.push('')
  md.push('## 一、节奏基础盘')
  md.push('')
  md.push('| 指标 | 值 |')
  md.push('|---|---|')
  md.push(`| 秒/镜 | ${stats.sec_per_shot} |`)
  md.push(`| 镜头中位 | ${stats.shot_median}s |`)
  md.push(`| 切镜率 | 均 ${stats.cuts_per_min.mean} 次/分（${stats.cuts_per_min.q1} / ${stats.cuts_per_min.median} / ${stats.cuts_per_min.q3}） |`)
  md.push(`| 最低 / 最高切镜率 | ${stats.cuts_per_min.min} / ${stats.cuts_per_min.max} 次/分 |`)
  md.push(`| <3 秒镜头 | ${stats.under3_ratio}% |`)
  md.push(`| <1 秒镜头 | ${stats.under1_shots} 个 |`)
  md.push(`| 最长单镜 | ${stats.longest_shot}s |`)
  md.push(`| 单集时长 | ${stats.ep_duration.min}–${stats.ep_duration.max}s，均 ${stats.ep_duration.mean}s |`)
  md.push(
    `| 集长分布 | ${stats.ep_duration.buckets.map(([k, v]) => `${k} ${v} 集`).join('；')} |`,
  )
  md.push(`| 最短 / 最长 | EP${stats.ep_duration.shortest_ep} / EP${stats.ep_duration.longest_ep} |`)
  md.push('')
  md.push('**相关性**（推断依据）')
  md.push('')
  md.push(`- corr(集长, 切镜率) = ${stats.correlation.ep_duration_vs_cpm} → 长集不是靠拖长镜头`)
  md.push(`- corr(集长, 镜头数) = ${stats.correlation.ep_duration_vs_shots} → 长集靠多塞镜头`)
  md.push('')
  md.push('## 二、台词')
  md.push('')
  md.push('| 指标 | 值 |')
  md.push('|---|---|')
  md.push(`| 总字数 | ${stats.dialogue.chars_total} |`)
  md.push(`| 台词密度 | ${stats.dialogue.chars_per_min} 字/分 |`)
  md.push(`| 单集字数中位 | ${stats.dialogue.per_ep_median} |`)
  md.push(`| 承载台词镜头（按中点归属） | ${stats.dialogue.with_dialogue_ratio}% |`)
  md.push(`| 台词时间覆盖镜头 | ${stats.dialogue.coverage_ratio}% |`)
  md.push(`| 峰值集 | ${stats.dialogue.peak.map(([e, v]) => `EP${e} ${v}`).join('、')} 字/分 |`)
  md.push(`| 谷值集 | ${stats.dialogue.valley.map(([e, v]) => `EP${e} ${v}`).join('、')} 字/分 |`)
  md.push('')
  md.push('## 三、钩子硬指标')
  md.push('')
  md.push('| 指标 | 值 |')
  md.push('|---|---|')
  md.push(`| 首句落在 00:00 | ${stats.hooks.zero_start}/${stats.hooks.eps_with_subs} 集（${stats.hooks.zero_start_ratio}%） |`)
  md.push(
    `| 前 30 秒无台词 | ${stats.hooks.no_dialogue_30s.length ? stats.hooks.no_dialogue_30s.map((n) => `EP${n}`).join('、') : '无'} |`,
  )
  md.push(`| 集首复读上集末句 | ${stats.hooks.repeat_first_line} 集（${stats.hooks.repeat_ratio}%） |`)
  md.push(`| 结尾台词字数 | 均 ${stats.hooks.last_line_len_mean} 字，中位 ${stats.hooks.last_line_len_median} 字 |`)
  md.push(`| ≤4 字结尾 | ${stats.hooks.last_line_le4_ratio}%　| ≤6 字 | ${stats.hooks.last_line_le6_ratio}% |`)
  md.push(
    `| 末句后静默 | 均 ${stats.hooks.tail_silence_mean}s（中位 ${stats.hooks.tail_silence_median}s）；>3s ${stats.hooks.tail_gt3} 集，>6s ${stats.hooks.tail_gt6} 集，最长 EP${stats.hooks.tail_max_ep} ${stats.hooks.tail_max}s |`,
  )
  md.push('')
  md.push('## 四、分段节奏')
  md.push('')
  md.push('| 段落 | 时长 | 均集长 | 镜/集 | 切镜率 | <3s 占比 | 台词密度 |')
  md.push('|---|---|---|---|---|---|---|')
  for (const s of stats.segments) {
    md.push(
      `| ${s.range} | ${s.minutes} 分 | ${s.avgDuration}s | ${s.shotsPerEp} | ${s.cpm} | ${s.under3Ratio}% | ${s.charsPerMin} 字/分 |`,
    )
  }
  md.push('')
  md.push('**加速集**：' + stats.fastest_eps.map(([e, v]) => `EP${e} ${v}`).join('、'))
  md.push('')
  md.push('**减速集**：' + stats.slowest_eps.map(([e, v]) => `EP${e} ${v}`).join('、'))
  md.push('')
  md.push('## 五、逐集明细')
  md.push('')
  md.push('| 集 | 时长 | 镜数 | 次/分 | 字数 | 开场 | 结尾 | 末句后静默 |')
  md.push('|---|---|---|---|---|---|---|---|')
  for (const e of stats.episodes_detail) {
    const clip = (s) => (s ? s.replace(/\|/g, '/').slice(0, 24) : '—')
    md.push(
      `| ${e.ep} | ${e.duration}s | ${e.shots} | ${e.cpm} | ${e.chars} | ${clip(e.first)} | ${clip(e.last)} | ${e.tail ?? '-'}s |`,
    )
  }
  md.push('')

  await writeFile(join(DIR, '拆解/数据速览.md'), md.join('\n'))
  console.log(
    `[stats] ${stats.episodes} 集 · ${stats.sec_per_shot}s/镜 · ${stats.cuts_per_min.mean} 次/分 · 末句均 ${stats.hooks.last_line_len_mean} 字 → 拆解/数据速览.md`,
  )
}

main().catch((e) => {
  console.error('[stats] 失败：', e.message ?? e)
  process.exit(1)
})
