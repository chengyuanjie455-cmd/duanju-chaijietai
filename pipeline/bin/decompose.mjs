#!/usr/bin/env node
/**
 * 03 拆解：把每集 MP4 拆成镜头表 + 关键帧 + 九宫格
 *
 * 输出（剧库/<剧名>/拆解/EPxxx/）：
 *   shots.csv    镜头号、起止秒、时长、关键帧
 *   shots.json   同上（机器读）
 *   meta.json    时长/分辨率/帧率/镜头数/节奏统计
 *   shots/001.jpg …   每镜一张代表帧
 *   contact.jpg  全集九宫格（每 4 秒一格）
 *
 * 用法：
 *   node bin/decompose.mjs --series 示例剧              # 全部已下载
 *   node bin/decompose.mjs --series 示例剧 --episodes 1-5
 *   node bin/decompose.mjs --series 示例剧 --from 1 --to 3 --threshold 0.28
 */
import { spawn } from 'node:child_process'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FFMPEG = process.env.FFMPEG ?? '/opt/homebrew/bin/ffmpeg'
const FFPROBE = process.env.FFPROBE ?? '/opt/homebrew/bin/ffprobe'

const argv = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback
}
const SERIES = arg('series', '')
const THRESHOLD = Number(arg('threshold', '0.3'))
const FROM = Number(arg('from', '0'))
const TO = Number(arg('to', '0'))
const EPISODES = arg('episodes', '')

const pad = (n) => String(n).padStart(3, '0')
const stamp = () => new Date().toLocaleTimeString('zh-CN', { hour12: false })
const log = (m) => console.log(`${stamp()} ${m}`)
const round = (n) => Math.round(n * 1000) / 1000

function exec(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args)
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (err += d))
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolve({ out, err }) : reject(new Error(`${cmd} ${code}: ${err.split('\n').slice(-4).join(' | ')}`))))
  })
}

async function probe(file) {
  const { out } = await exec(FFPROBE, [
    '-v', 'error', '-print_format', 'json',
    '-show_format', '-show_streams', file,
  ])
  const data = JSON.parse(out)
  const v = data.streams.find((s) => s.codec_type === 'video') ?? {}
  const a = data.streams.find((s) => s.codec_type === 'audio') ?? {}
  const [num, den] = String(v.r_frame_rate ?? '0/1').split('/').map(Number)
  return {
    duration: Number(data.format?.duration ?? 0),
    size: Number(data.format?.size ?? 0),
    width: v.width,
    height: v.height,
    fps: den ? round(num / den) : null,
    codec: v.codec_name,
    bitrate: Number(data.format?.bit_rate ?? 0),
    has_audio: Boolean(a.codec_name),
  }
}

/** 场景检测：用 ffmpeg showinfo 拿切点时间。 */
async function sceneCuts(file, threshold) {
  const { err } = await exec(FFMPEG, [
    '-hide_banner', '-loglevel', 'info',
    '-i', file,
    '-vf', `select='gt(scene,${threshold})',showinfo`,
    '-an', '-f', 'null', '-',
  ])
  const times = []
  for (const line of err.split('\n')) {
    if (!line.includes('Parsed_showinfo') || !line.includes('pts_time:')) continue
    const m = line.match(/pts_time:([\d.]+)/)
    if (m) times.push(Number(m[1]))
  }
  return [...new Set(times)].sort((x, y) => x - y)
}

function shotsFromCuts(cuts, duration) {
  const edges = [0, ...cuts.filter((t) => t > 0.15 && t < duration - 0.15), duration]
  const shots = []
  for (let i = 0; i < edges.length - 1; i += 1) {
    const start = edges[i]
    const end = edges[i + 1]
    if (end - start < 0.2) continue
    shots.push({ no: shots.length + 1, start: round(start), end: round(end), dur: round(end - start) })
  }
  return shots
}

async function grabFrame(file, time, dest) {
  await exec(FFMPEG, [
    '-y', '-loglevel', 'error',
    '-ss', String(time), '-i', file,
    '-frames:v', '1', '-q:v', '3', dest,
  ])
}

async function contactSheet(file, dest) {
  await exec(FFMPEG, [
    '-y', '-loglevel', 'error', '-i', file,
    '-vf', "fps=1/4,scale=240:-2,tile=5x5:padding=4:margin=4",
    '-frames:v', '1', dest,
  ])
}

async function decomposeEpisode(file, dir, number) {
  const outDir = join(dir, '拆解', `EP${pad(number)}`)
  const shotDir = join(outDir, 'shots')
  await mkdir(shotDir, { recursive: true })

  const info = await probe(file)
  const cuts = await sceneCuts(file, THRESHOLD)
  const shots = shotsFromCuts(cuts, info.duration)

  for (const shot of shots) {
    shot.keyframe = `shots/${pad(shot.no)}.jpg`
    await grabFrame(file, round((shot.start + shot.end) / 2), join(shotDir, `${pad(shot.no)}.jpg`))
  }
  await contactSheet(file, join(outDir, 'contact.jpg'))

  const durs = shots.map((s) => s.dur).sort((a, b) => a - b)
  const median = durs.length ? durs[Math.floor(durs.length / 2)] : 0
  const stats = {
    number,
    duration: round(info.duration),
    resolution: `${info.width}x${info.height}`,
    fps: info.fps,
    codec: info.codec,
    has_audio: info.has_audio,
    shots: shots.length,
    cuts_per_minute: round((shots.length / info.duration) * 60),
    shot_median: median,
    shot_mean: durs.length ? round(durs.reduce((a, b) => a + b, 0) / durs.length) : 0,
    under_3s: durs.filter((d) => d < 3).length,
    under_1s: durs.filter((d) => d < 1).length,
    longest: durs.length ? durs[durs.length - 1] : 0,
  }

  const head = 'shot,start,end,dur,keyframe'
  const rows = shots.map((s) => `${s.no},${s.start},${s.end},${s.dur},${s.keyframe}`)
  await writeFile(join(outDir, 'shots.csv'), [head, ...rows].join('\n'))
  await writeFile(join(outDir, 'shots.json'), JSON.stringify({ meta: stats, shots }, null, 2))
  await writeFile(join(outDir, 'meta.json'), JSON.stringify(stats, null, 2))
  return stats
}

async function main() {
  if (!SERIES) throw new Error('需要 --series <剧名目录>')
  const dir = join(ROOT, '剧库', SERIES)
  const meta = JSON.parse(await readFile(join(dir, 'meta.json'), 'utf8'))
  const files = (await readdir(join(dir, 'raw'))).filter((f) => /^EP\d+\.mp4$/.test(f)).sort()
  if (!files.length) throw new Error(`没有找到已下载的分集：${join(dir, 'raw')}`)

  let pick = files.map((f) => ({ f, n: Number(f.match(/\d+/)[0]) }))
  if (EPISODES) {
    const nums = new Set()
    for (const part of EPISODES.split(',')) {
      const [a, b] = part.split('-').map(Number)
      for (let n = a; n <= (b || a); n += 1) nums.add(n)
    }
    pick = pick.filter((p) => nums.has(p.n))
  }
  if (FROM) pick = pick.filter((p) => p.n >= FROM)
  if (TO) pick = pick.filter((p) => p.n <= TO)

  log(`[decompose] 《${meta.title ?? SERIES}》 待拆 ${pick.length} 集，阈值 scene>${THRESHOLD}`)
  const all = []
  for (const { f, n } of pick) {
    const s = await decomposeEpisode(join(dir, 'raw', f), dir, n)
    all.push(s)
    log(`EP${pad(n)} ${s.duration}s → ${s.shots} 镜，中位 ${s.shot_median}s，<3s ${s.under_3s} 个`)
  }
  const avg = all.reduce((a, b) => a + b.shots, 0) / (all.length || 1)
  await writeFile(
    join(dir, '拆解', 'summary.json'),
    JSON.stringify({ series: meta.title, threshold: THRESHOLD, episodes: all, avg_shots: round(avg) }, null, 2),
  )
  log(`[done] ${all.length} 集，平均 ${round(avg)} 镜/集`)
}

main().catch((e) => {
  console.error('[decompose] 失败：', e.message ?? e)
  process.exit(1)
})
