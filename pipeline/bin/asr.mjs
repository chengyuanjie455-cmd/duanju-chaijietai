#!/usr/bin/env node
/**
 * 04 听写：用本地 MLX Whisper 逐集转字幕
 *
 * 模型：models/whisper-large-v3-turbo（MLX 版，从 ModelScope 镜像下载，无需连 HuggingFace）
 * 输出：剧库/<剧名>/字幕/EPxxx.srt + EPxxx.txt + 全集字幕.md
 *
 * 用法：
 *   node bin/asr.mjs --series 示例剧
 *   node bin/asr.mjs --series 示例剧 --episodes 1-10 --force
 */
import { spawn } from 'node:child_process'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MODEL = process.env.WHISPER_MODEL ?? join(ROOT, 'models/whisper-large-v3-turbo')
const MLX = process.env.MLX_WHISPER ?? join(process.env.HOME ?? '', '.local/bin/mlx_whisper')

const argv = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback
}
const flag = (name) => argv.includes(`--${name}`)
const SERIES = arg('series', '')
const EPISODES = arg('episodes', '')
// 人名 / 专有名词提示：喂给 Whisper 的 initial_prompt，能显著减少人名听错
const PROMPT = arg('prompt', process.env.WHISPER_PROMPT ?? '')

const pad = (n) => String(n).padStart(3, '0')
const stamp = () => new Date().toLocaleTimeString('zh-CN', { hour12: false })
const log = (m) => console.log(`${stamp()} ${m}`)

async function exists(path) {
  try {
    return (await stat(path)).size > 200
  } catch {
    return false
  }
}

function transcribe(file, outDir, base) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      MLX,
      [
        file,
        '--model', MODEL,
        '--output-dir', outDir,
        '--output-name', base,
        '--output-format', 'srt',
        '--language', 'zh',
        '--task', 'transcribe',
        // 纯音乐/静音段容易触发复读幻觉，关掉上下文条件
        '--condition-on-previous-text', 'False',
        ...(PROMPT ? ['--initial-prompt', PROMPT] : []),
        '--verbose', 'False',
      ],
      {
        env: {
          ...process.env,
          // 环境里的 socks5 ALL_PROXY 会让 httpx 解析失败；本地模型也不需要联网
          ALL_PROXY: '',
          all_proxy: '',
          NO_PROXY: 'localhost,127.0.0.1',
          no_proxy: 'localhost,127.0.0.1',
          HF_HUB_OFFLINE: '1',
        },
      },
    )
    let err = ''
    let out = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (err += d))
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0 ? resolve({ out, err }) : reject(new Error(`mlx_whisper ${code}: ${err.split('\n').slice(-5).join(' | ')}`)),
    )
  })
}

function srtToText(srt) {
  return srt
    .split('\n\n')
    .map((block) => {
      const lines = block.split('\n').filter(Boolean)
      if (lines.length < 3) return ''
      const time = lines[1]
      const text = lines.slice(2).join(' ').trim()
      const start = time.split(' --> ')[0].trim()
      return { start, text, raw: block }
    })
    .filter(Boolean)
    .filter((c) => /[\u4e00-\u9fa5]/.test(c.text))
    .filter((c, i, arr) => i === 0 || c.text !== arr[i - 1].text)
    .map((c) => `[${c.start}] ${c.text}`)
    .join('\n')
}

/** 把一句话里同一短语连续复读（Whisper 在音乐/噪声段的典型幻觉）压成一次。 */
function collapseRepeats(s) {
  let prev
  let out = s.replace(/\s+/g, ' ').trim()
  do {
    prev = out
    out = out.replace(/(.{2,12}?)\1{2,}/g, '$1')
    out = out.replace(/^(.{2,12}?)\1+$/, '$1')
  } while (out !== prev)
  return out
}

/** 纯数字/单字刷屏、低信息密度的幻觉行直接丢。 */
function isNoise(text) {
  const t = text.replace(/[\s，。！？、,.!?]/g, '')
  if (!t) return true
  if (/^[0-9一二三四五六七八九十百千万]+$/.test(t)) return true
  if (/^第?[0-9一二三四五六七八九十百千万]{1,6}[集章回节]?$/.test(t)) return true
  if (!t.replace(/[第集章回节0-9一二三四五六七八九十百千万]/g, '')) return true
  const uniq = new Set(t).size / t.length
  return t.length > 12 && uniq < 0.22
}

/** 过滤幻觉行后重写 SRT，保证逐镜逆推用的是干净台词。 */
function cleanSrt(srt, lexicon = {}) {
  const blocks = srt.split(/\n\s*\n/)
  const kept = []
  let lastText = ''
  const fix = (t) => {
    let out = t
    for (const [a, b] of Object.entries(lexicon)) out = out.split(a).join(b)
    return out
  }
  for (const block of blocks) {
    const lines = block.split('\n').filter(Boolean)
    if (lines.length < 3) continue
    const raw = lines.slice(2).join(' ').trim()
    if (!/[\u4e00-\u9fa5]/.test(raw)) continue
    const text = fix(collapseRepeats(raw))
    if (isNoise(text)) continue
    if (text === lastText) continue
    lastText = text
    kept.push({ time: lines[1], text })
  }
  return kept
    .map((c, i) => `${i + 1}\n${c.time}\n${c.text}`)
    .join('\n\n')
}

async function main() {
  if (!SERIES) throw new Error('需要 --series <剧名目录>')
  const dir = join(ROOT, '剧库', SERIES)
  const meta = JSON.parse(await readFile(join(dir, 'meta.json'), 'utf8'))
  let lexicon = {}
  try {
    lexicon = JSON.parse(await readFile(join(dir, 'lexicon.json'), 'utf8'))
  } catch {}
  const subDir = join(dir, '字幕')
  await mkdir(subDir, { recursive: true })

  let files = (await readdir(join(dir, 'raw'))).filter((f) => /^EP\d+\.mp4$/.test(f)).sort()
  files = files.map((f) => ({ f, n: Number(f.match(/\d+/)[0]) }))
  if (EPISODES) {
    const nums = new Set()
    for (const part of EPISODES.split(',')) {
      const [a, b] = part.split('-').map(Number)
      for (let n = a; n <= (b || a); n += 1) nums.add(n)
    }
    files = files.filter((p) => nums.has(p.n))
  }

  log(`[asr] 《${meta.title ?? SERIES}》 ${files.length} 集，模型 ${MODEL}`)
  let done = 0
  const started = Date.now()

  for (const { f, n } of files) {
    const base = `EP${pad(n)}`
    const srt = join(subDir, `${base}.srt`)
    if (!flag('force') && (await exists(srt))) continue
    const t0 = Date.now()
    try {
      await transcribe(join(dir, 'raw', f), subDir, base)
      const filtered = cleanSrt(await readFile(srt, 'utf8'), lexicon)
      await writeFile(srt, filtered)
      const text = srtToText(filtered)
      await writeFile(join(subDir, `${base}.txt`), text)
      done += 1
      const took = ((Date.now() - t0) / 1000).toFixed(1)
      const chars = text.replace(/\[[^\]]+\]/g, '').replace(/\s/g, '').length
      log(`${base} ✓ ${took}s，${chars} 字`)
    } catch (error) {
      log(`${base} ✗ ${String(error?.message ?? error).slice(0, 200)}`)
    }
  }

  // 合并成一份可读全文
  const parts = []
  for (const { n } of files) {
    const p = join(subDir, `EP${pad(n)}.txt`)
    try {
      parts.push(`\n## 第${n}集\n\n${await readFile(p, 'utf8')}`)
    } catch {}
  }
  await writeFile(join(subDir, '全集字幕.md'), `# ${meta.title ?? SERIES} · 全集字幕\n${parts.join('\n')}`)
  log(`[done] 新转写 ${done} 集，总耗时 ${((Date.now() - started) / 60000).toFixed(1)} 分钟`)
}

main().catch((e) => {
  console.error('[asr] 失败：', e.message ?? e)
  process.exit(1)
})
