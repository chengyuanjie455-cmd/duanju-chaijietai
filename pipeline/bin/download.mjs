#!/usr/bin/env node
/**
 * 02 下载：把一部红果短剧整季拉成可拆解的本地 MP4
 *
 * 流程：getSeries → listEpisodes（翻页）→ 每集 resolvePlayback → 下载加密流
 *      → ffmpeg -decryption_key 解密并 +faststart → 剧库/<剧名>/raw/EPxxx.mp4
 *
 * 用法：
 *   node bin/download.mjs --series 7702724487975799832 --name 示例剧
 *   node bin/download.mjs --search 示例剧
 *   node bin/download.mjs --series <id> --limit 3       # 只下前 3 集试跑
 *   node bin/download.mjs --series <id> --force         # 重下已有
 *
 * 断点续传：raw/EPxxx.mp4 已存在且 >200KB 视为完成，默认跳过。
 */
import { createClient } from 'openhongguo'
import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PROFILE =
  process.env.OHG_PROFILE ??
  join(ROOT, 'data', 'ohg-profile.json')
const FFMPEG = process.env.FFMPEG ?? '/opt/homebrew/bin/ffmpeg'
// 「摸鱼短剧」插件宿主：它持有可用的匿名设备会话，并且已经做好解密+faststart。
// 本机 SDK 的匿名设备被风控时（anonymous response was empty），走这条路由最稳。
const HOST = process.env.HG_HOST ?? 'http://127.0.0.1:53228'

const argv = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback
}
const flag = (name) => argv.includes(`--${name}`)
const SERIES_ID = arg('series', '')
const QUERY = arg('search', '')
const NAME = arg('name', '')
const LIMIT = Number(arg('limit', '0'))
const FROM = Number(arg('from', '0'))
const TO = Number(arg('to', '0'))
// 集间间隔：宿主匿名额度低，太密会触发「anonymous registration returned no guest identity」
const DELAY = Number(arg('delay', '800'))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const safeName = (s) => String(s).replace(/[\\/:*?"<>|]/g, '·').replace(/\s+/g, ' ').trim().slice(0, 60)
const pad = (n) => String(n).padStart(3, '0')
const stamp = () => new Date().toLocaleTimeString('zh-CN', { hour12: false })

function log(msg) {
  console.log(`${stamp()} ${msg}`)
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    child.stderr.on('data', (d) => (err += d))
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exit ${code}: ${err.split('\n').filter(Boolean).slice(-3).join(' | ')}`)),
    )
  })
}

async function fileSize(path) {
  try {
    return (await stat(path)).size
  } catch {
    return 0
  }
}

async function fetchTo(url, dest) {
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) })
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
  const out = createWriteStream(dest)
  for await (const chunk of res.body) {
    if (!out.write(chunk)) await new Promise((r) => out.once('drain', r))
  }
  await new Promise((resolve, reject) => out.end((e) => (e ? reject(e) : resolve())))
}

async function hostAlive() {
  try {
    const res = await fetch(`${HOST}/api/hongguo/config`, { signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch {
    return false
  }
}

/** 走摸鱼短剧宿主：/api/hongguo/media?episode=，服务端解密后直接吐 faststart MP4。 */
async function downloadViaHost(episodeId, out, tmp) {
  const url = `${HOST}/api/hongguo/media?episode=${encodeURIComponent(episodeId)}`
  const res = await fetch(url, { signal: AbortSignal.timeout(180_000) })
  const type = res.headers.get('content-type') ?? ''
  if (!res.ok || !type.startsWith('video/')) {
    const text = type.includes('json') ? await res.text() : ''
    throw new Error(`host ${res.status} ${type} ${text.slice(0, 120)}`)
  }
  const sink = createWriteStream(tmp)
  for await (const chunk of res.body) {
    if (!sink.write(chunk)) await new Promise((r) => sink.once('drain', r))
  }
  await new Promise((resolve, reject) => sink.end((e) => (e ? reject(e) : resolve())))
  const got = await fileSize(tmp)
  if (got < 200_000) throw new Error(`下载过小 ${got}B`)
  // 服务端已 faststart，这里只做容器统一，保证后续 ffprobe/切镜稳定
  await run(FFMPEG, ['-y', '-loglevel', 'error', '-i', tmp, '-map', '0', '-c', 'copy', '-tag:v', 'hvc1', '-movflags', '+faststart', out])
  await rm(tmp, { force: true })
  return got
}

async function fetchAllEpisodes(client, seriesId) {
  const all = []
  let cursor
  for (let page = 0; page < 40; page += 1) {
    const res = await client.listEpisodes(seriesId, cursor ? { cursor } : undefined)
    all.push(...(res.items ?? []))
    if (!res.has_more || !res.cursor || res.cursor === cursor) break
    cursor = res.cursor
    await sleep(200)
  }
  // 去重 + 按 number 排序
  const seen = new Set()
  return all
    .filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)))
    .sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
}

async function resolveTarget(client) {
  if (SERIES_ID) return { series_id: SERIES_ID }
  if (QUERY) {
    const page = await client.search(QUERY)
    const hit = page.items?.[0]
    if (!hit) throw new Error(`搜索「${QUERY}」没有结果`)
    log(`[search] 《${hit.title}》 id=${hit.id} ${hit.episode_count ?? '?'} 集`)
    return { series_id: hit.id, title: hit.title }
  }
  throw new Error('需要 --series <id> 或 --search <剧名>')
}

async function main() {
  const client = await createClient({
    profile: PROFILE,
    retryAttempts: 3,
    timeoutMs: 30_000,
    log: () => {},
  })

  const target = await resolveTarget(client)
  const series = await client.getSeries(target.series_id)
  const title = NAME || series.title || target.title || target.series_id
  const dir = join(ROOT, '剧库', safeName(title))
  const rawDir = join(dir, 'raw')
  const tmpDir = join(rawDir, '.tmp')
  await mkdir(rawDir, { recursive: true })
  await mkdir(tmpDir, { recursive: true })

  const episodes = await fetchAllEpisodes(client, target.series_id)
  const playable = episodes.filter((e) => e.playable !== false)
  const todo = (LIMIT > 0 ? playable.slice(0, LIMIT) : playable).length
  log(`[series] 《${title}》 id=${series.id} 共 ${episodes.length} 集（可播 ${playable.length}），本次任务 ${todo} 集`)
  if (series.description) log(`[series] 简介：${series.description.slice(0, 120)}`)

  const meta = {
    series_id: series.id,
    title,
    description: series.description ?? '',
    episode_count: series.episode_count ?? episodes.length,
    heat: series.heat ?? series.play_count ?? null,
    tags: series.tags ?? series.subtitles ?? [],
    source: '红果短剧 · openhongguo 匿名设备 · 仅个人研究',
    fetched_at: new Date().toISOString(),
    episodes: episodes.map((e) => ({
      number: e.number,
      id: e.id,
      title: e.title ?? '',
      playable: e.playable !== false,
      duration_hint: e.duration_seconds ?? null,
    })),
  }
  const metaPath = join(dir, 'meta.json')
  await writeFile(metaPath, JSON.stringify(meta, null, 2))

  let ok = 0
  let skip = 0
  const failed = []
  const list = (LIMIT > 0 ? playable.slice(0, LIMIT) : playable).filter((ep) => {
    const n = ep.number ?? 0
    return (!FROM || n >= FROM) && (!TO || n <= TO)
  })
  const useHost = (await hostAlive()) && !flag('sdk')
  log(`[route] ${useHost ? `摸鱼短剧宿主 ${HOST}/api/hongguo/media` : 'SDK 直连 resolvePlayback'}`)

  for (let i = 0; i < list.length; i += 1) {
    const ep = list[i]
    const n = ep.number ?? i + 1
    const out = join(rawDir, `EP${pad(n)}.mp4`)
    const existing = await fileSize(out)
    if (existing > 200_000 && !flag('force')) {
      skip += 1
      continue
    }

    let lastError
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const tmp = join(tmpDir, `EP${pad(n)}.${process.pid}.part`)
      try {
        if (useHost) {
          const bytes = await downloadViaHost(ep.id, out, tmp)
          ok += 1
          log(`[${i + 1}/${list.length}] EP${pad(n)} ✓ ${(bytes / 1048576).toFixed(2)}MB host`)
          lastError = null
          break
        }
        const { playback, contentKey, contentKeyError } = await client.resolvePlayback(ep.id)
        const streams = (playback.streams ?? []).filter((s) => s.url && !s.dash)
        if (!streams.length) throw new Error('无可用流')
        // 拆解用不到 1080p：优先挑最小的可用流，下载与解密都快几倍
        const prefer = process.env.PREFER_DEF ?? ''
        const rank = (x) => (prefer && (x.definition ?? '') === prefer ? -1 : (x.bitrate ?? 0))
        streams.sort((a, b) => rank(a) - rank(b))
        const stream = streams[0]

        await fetchTo(stream.url, tmp)
        const got = await fileSize(tmp)
        if (got < 100_000) throw new Error(`下载过小 ${got}B`)

        if (playback.protected) {
          if (!contentKey?.key) throw new Error(`加密但无密钥：${contentKeyError ?? 'unknown'}`)
          await run(FFMPEG, [
            '-y', '-loglevel', 'error',
            '-decryption_key', contentKey.key,
            '-i', tmp,
            '-map', '0', '-c', 'copy',
            '-tag:v', 'hvc1', '-movflags', '+faststart',
            out,
          ])
          await rm(tmp, { force: true })
        } else {
          await run(FFMPEG, [
            '-y', '-loglevel', 'error', '-i', tmp,
            '-map', '0', '-c', 'copy', '-tag:v', 'hvc1', '-movflags', '+faststart', out,
          ])
          await rm(tmp, { force: true })
        }
        ok += 1
        log(`[${i + 1}/${list.length}] EP${pad(n)} ✓ ${(await fileSize(out) / 1048576).toFixed(2)}MB ${stream.definition ?? ''}`)
        lastError = null
        break
      } catch (error) {
        lastError = error
        await rm(tmp, { force: true })
        const msg = String(error?.message ?? error)
        log(`[${i + 1}/${list.length}] EP${pad(n)} ✗ 第${attempt}次：${msg.slice(0, 160)}`)
        if (/额度|风控|device|登录|401|403|guest identity|anonymous|502/i.test(msg)) {
          try {
            await client.resetDevice()
            log('[device] 已重置匿名设备')
          } catch {}
        }
        await sleep((/guest identity|anonymous|502/i.test(msg) ? 6000 : 1200) * attempt)
      }
    }
    if (lastError) failed.push({ number: n, error: String(lastError?.message ?? lastError).slice(0, 200) })
    await sleep(DELAY)
  }

  const summary = {
    title,
    series_id: series.id,
    finished_at: new Date().toISOString(),
    downloaded: ok,
    skipped: skip,
    failed,
    total_playable: playable.length,
  }
  await writeFile(join(dir, 'download-report.json'), JSON.stringify(summary, null, 2))
  log(`\n[done] 《${title}》新下 ${ok} 集，跳过 ${skip} 集，失败 ${failed.length} 集`)
  if (failed.length) log(`[warn] 失败集：${failed.map((f) => f.number).join(', ')}`)
}

main().catch((error) => {
  console.error('[download] 失败：', error)
  process.exit(1)
})
