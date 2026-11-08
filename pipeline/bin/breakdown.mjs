#!/usr/bin/env node
/**
 * 一条命令自动拆解一部剧
 *
 * 流程：下载全集 → 切镜 → 听写 → 清洗字幕 → 逐镜逆推 → 数据速览 → 事件索引 → 自动初稿 → 重建索引
 *
 * 用法：
 *   node bin/breakdown.mjs --series 7671966197985856536 --name "某某剧" --limit 3
 *   node bin/breakdown.mjs --series 7702724487975799832 --name "示例剧" --from 1 --to 20
 */
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`)
  return index > 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

const SERIES = arg('series', '')
const NAME = arg('name', '')
const FROM = arg('from', '')
const TO = arg('to', '')
const LIMIT = arg('limit', '')
const DELAY = arg('delay', '1200')
const SKIP_DOWNLOAD = process.argv.includes('--skip-download')
const SKIP_ASR = process.argv.includes('--skip-asr')

if (!SERIES || !NAME) {
  console.error('[breakdown] 需要 --series <id> --name <剧名>')
  process.exit(1)
}

const env = { ...process.env }
delete env.ALL_PROXY
delete env.all_proxy
env.HF_HUB_OFFLINE = '1'
env.OHG_PROFILE = env.OHG_PROFILE || `${ROOT}/data/ohg-profile.json`

function run(script, args, label) {
  return new Promise((resolvePromise, reject) => {
    console.log(`\n[breakdown] ▶ ${label}`)
    const child = spawn(process.execPath, [resolve(ROOT, 'bin', script), ...args], {
      cwd: ROOT,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout.on('data', (chunk) => process.stdout.write(chunk))
    child.stderr.on('data', (chunk) => process.stderr.write(chunk))
    child.on('close', (code) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`${label} 退出码 ${code}`))
    })
    child.on('error', reject)
  })
}

const range = []
if (FROM) range.push('--from', FROM)
if (TO) range.push('--to', TO)

async function main() {
  console.log(`[breakdown] ${NAME}（series ${SERIES}）开始：${new Date().toISOString()}`)
  if (!SKIP_DOWNLOAD) {
    const downloadArgs = ['--series', SERIES, '--name', NAME, '--delay', DELAY, ...range]
    if (LIMIT) downloadArgs.push('--limit', LIMIT)
    await run('download.mjs', downloadArgs, '下载全集')
  }
  await run('decompose.mjs', ['--series', NAME], '切镜抽帧')
  if (!SKIP_ASR) {
    await run('asr.mjs', ['--series', NAME, '--prompt', '这是一部中文短剧，请准确记录人物对白，人名与地名保留原样。'], '语音听写')
    await run('clean-subs.mjs', ['--series', NAME], '清洗字幕')
  }
  await run('structure.mjs', ['--series', NAME], '逐镜逆推')
  await run('stats.mjs', ['--series', NAME], '数据速览')
  await run('beats.mjs', ['--series', NAME], '事件索引')
  await run('auto-report.mjs', ['--series', NAME], '自动初稿')
  await run('index.mjs', [], '重建剧库索引')
  console.log(`\n[breakdown] 完成：${NAME}（${new Date().toISOString()}）`)
  console.log(`[breakdown] 产物：剧库/${NAME}/（raw / 字幕 / 剧本逆推 / 拆解 / 数据速览 / 事件时间线 / 自动拆解初稿）`)
}

main().catch((error) => {
  console.error(`\n[breakdown] 失败：${error?.message ?? error}`)
  process.exit(1)
})
