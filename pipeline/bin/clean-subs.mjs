#!/usr/bin/env node
/**
 * 字幕清洗：删掉 Whisper 在片尾/纯音乐段的幻觉行（"请不吝点赞订阅"、"优优独播剧场" 等）
 *
 * 用法：node bin/clean-subs.mjs --series 示例剧
 */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const i = argv.indexOf('--series')
const SERIES = i >= 0 ? argv[i + 1] : ''

const JUNK = /请不吝|点赞|订阅|转发|打赏|明镜与点点|优优独播|YoYo\s*Television|Exclusive|字幕由|Amara|谢谢观看|感谢观看|关注我们|下集更精彩/i

function cleanSrt(srt) {
  const kept = []
  let last = ''
  for (const block of srt.split(/\n\s*\n/)) {
    const lines = block.split('\n').filter(Boolean)
    if (lines.length < 3) continue
    const text = lines.slice(2).join(' ').trim()
    if (!/[\u4e00-\u9fa5]/.test(text)) continue
    if (JUNK.test(text)) continue
    if (text === last) continue
    last = text
    kept.push({ time: lines[1], text })
  }
  return kept.map((c, idx) => `${idx + 1}\n${c.time}\n${c.text}`).join('\n\n')
}

const dir = join(ROOT, '剧库', SERIES, '字幕')
const files = (await readdir(dir)).filter((f) => f.endsWith('.srt'))
let n = 0
for (const f of files) {
  const p = join(dir, f)
  const before = await readFile(p, 'utf8')
  const after = cleanSrt(before)
  if (after !== before.trim()) {
    await writeFile(p, after)
    n += 1
  }
  const txt = after
    .split('\n\n')
    .map((b) => {
      const l = b.split('\n')
      return l.length >= 3 ? `[${l[1].split(' --> ')[0]}] ${l.slice(2).join(' ')}` : ''
    })
    .filter(Boolean)
    .join('\n')
  await writeFile(p.replace(/\.srt$/, '.txt'), txt)
}
console.log(`[clean] 清洗 ${n}/${files.length} 集`)
