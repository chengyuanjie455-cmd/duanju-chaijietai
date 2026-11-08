/**
 * dsh-drama-lab — Host half.
 *
 * Serves the left-Sidebar workbench for the short-drama breakdown pipeline:
 * it reads the pipeline folder (`剧库/`, reports, stats) and runs the same
 * `bin/*.mjs` steps the CLI uses, so the GUI never duplicates pipeline logic.
 *
 * Everything the page asks for is same-origin under `/api/drama-lab`; the
 * pipeline root never leaves the Host as an absolute path unless the user
 * configured it themselves.
 */
import { spawn } from 'node:child_process'
import { createReadStream, existsSync } from 'node:fs'
import { readFile, readdir, stat } from 'node:fs/promises'
import { basename, join, resolve, sep } from 'node:path'
import { homedir } from 'node:os'

export const name = 'dsh-drama-lab'

const PREFIX = '/api/drama-lab'

/** Steps the panel may run. Anything else is refused before spawning. */
const TASKS = {
  scan: { script: 'scan.mjs', title: '扫榜', args: () => [] },
  download: {
    script: 'download.mjs',
    title: '从红果下载全集',
    args: (q) => ['--series', String(q.seriesId ?? q.name), ...(q.dramaName ? ['--name', String(q.dramaName)] : []), ...range(q), ...(q.force ? ['--force'] : [])],
  },
  decompose: {
    script: 'decompose.mjs',
    title: '切镜抽帧',
    args: (q) => ['--series', q.name, ...range(q), ...(q.threshold ? ['--threshold', String(Number(q.threshold))] : [])],
  },
  asr: { script: 'asr.mjs', title: '听写', args: (q) => ['--series', q.name, ...range(q)] },
  structure: { script: 'structure.mjs', title: '逐镜逆推', args: (q) => ['--series', q.name] },
  stats: { script: 'stats.mjs', title: '数据速览', args: (q) => ['--series', q.name] },
  beats: { script: 'beats.mjs', title: '事件索引', args: (q) => ['--series', q.name] },
  index: { script: 'index.mjs', title: '刷新索引', args: () => [] },
  'series-stats': { script: 'series-stats.mjs', title: '系列总览', args: (q) => ['--prefix', q.prefix] },
  week: { script: 'week.mjs', title: '近七日趋势', args: (q) => ['--days', String(Number(q.days) || 7)] },
  'report-daily': { script: 'report-daily.mjs', title: '生成日报', args: (q) => (q.date ? ['--date', String(q.date)] : []) },
  'report-weekly': { script: 'report-weekly.mjs', title: '生成周报', args: () => [] },
  'report-monthly': { script: 'report-monthly.mjs', title: '生成月报', args: (q) => (q.month ? ['--month', String(q.month)] : []) },
  'auto-report': { script: 'auto-report.mjs', title: '自动初稿', args: (q) => ['--series', q.name] },
  breakdown: {
    script: 'breakdown.mjs',
    title: '一键自动拆解',
    args: (q) => [
      '--series', String(q.seriesId ?? ''),
      '--name', String(q.dramaName ?? q.name ?? ''),
      ...(q.from ? ['--from', String(Number(q.from))] : []),
      ...(q.to ? ['--to', String(Number(q.to))] : []),
      ...(q.limit ? ['--limit', String(Number(q.limit))] : []),
    ],
  },
}

const CN = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }

function seasonNumber(label) {
  if (!label) return 1
  if (label === '十') return 10
  if (label.startsWith('十')) return 10 + (CN[label[1]] ?? 0)
  if (label.endsWith('十')) return (CN[label[0]] ?? 0) * 10
  return CN[label] ?? 1
}

function splitSeries(name) {
  const m = String(name).match(/^(.+?)·第([一二三四五六七八九十百]+)季$/)
  if (!m) return { base: String(name), season: 1 }
  return { base: m[1], season: seasonNumber(m[2]) }
}

function range(query) {
  const out = []
  if (query.from) out.push('--from', String(Number(query.from)))
  if (query.to) out.push('--to', String(Number(query.to)))
  if (query.limit) out.push('--limit', String(Number(query.limit)))
  if (query.force === '1' || query.force === true) out.push('--force')
  return out
}

function resolveRoot(config) {
  const raw = config?.pipelineRoot || process.env.DSH_DRAMA_LAB_ROOT || join(homedir(), 'Documents/short-drama-lab/pipeline')
  return resolve(String(raw))
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return null
  }
}

async function countFiles(dir, filter = () => true) {
  try {
    const names = await readdir(dir)
    return names.filter(filter).length
  } catch {
    return 0
  }
}

async function pathExists(target) {
  try {
    await stat(target)
    return true
  } catch {
    return false
  }
}

/** A name is valid when it is one real directory inside `剧库/`. */
async function libraryNames(root) {
  const lib = join(root, '剧库')
  try {
    const entries = await readdir(lib, { withFileTypes: true })
    return entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name)
  } catch {
    return []
  }
}

async function dramaCard(root, name) {
  const dir = join(root, '剧库', name)
  const archive = await readJson(join(dir, '档案.json'))
  const meta = await readJson(join(dir, 'meta.json'))
  const stats = await readJson(join(dir, '拆解', 'stats.json'))
  const [raw, subs, scripts, shots, report, card, overview] = await Promise.all([
    countFiles(join(dir, 'raw'), (n) => n.endsWith('.mp4')),
    countFiles(join(dir, '字幕'), (n) => n.endsWith('.srt')),
    countFiles(join(dir, '剧本逆推'), (n) => /^EP\d+\.md$/.test(n)),
    countFiles(join(dir, '拆解'), (n) => /^EP\d+$/.test(n)),
    pathExists(join(dir, '拆解报告.md')),
    pathExists(join(dir, '剧情库卡片.md')),
    pathExists(join(dir, '拆解', '数据速览.md')),
  ])
  const series = splitSeries(name)
  const hook = stats?.hooks ?? {}
  const dialogue = stats?.dialogue ?? {}
  return {
    name,
    series: series.base,
    season: series.season,
    tags: archive?.tags ?? [],
    heat: archive?.heat ?? (meta?.heat ? `${Math.round(meta.heat / 10000) / 10}万` : null),
    rank: archive?.rank ?? null,
    episodes: stats?.episodes ?? archive?.episodes ?? raw,
    minutes: stats?.total_minutes ?? null,
    secPerShot: stats?.sec_per_shot ?? null,
    cutsPerMin: stats?.cuts_per_min?.mean ?? null,
    charsPerMin: dialogue.chars_per_min ?? null,
    shotMedian: stats?.shot_median ?? null,
    longestShot: stats?.longest_shot ?? null,
    oneLiner: archive?.one_liner ?? meta?.intro ?? null,
    hook: archive?.hook ?? null,
    engine: archive?.engine ?? null,
    ending: archive?.ending ?? null,
    reuse: archive?.reuse ?? null,
    caution: archive?.caution ?? null,
    firstLineAtZero: hook.zero_start_ratio ?? null,
    lastLineChars: hook.last_line_len_mean ?? null,
    tailSilence: hook.last_line_tail_mean ?? null,
    counts: { raw, subs, scripts, shots, report, card, overview },
  }
}

function filterJobLines(lines) {
  return lines
}

function createJobs(config) {
  const jobs = new Map()
  let seq = 0
  const maxLines = Math.max(80, Math.min(4000, Number(config?.maxLogLines) || 400))

  function push(job, chunk) {
    const text = String(chunk)
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue
      job.lines.push(line)
    }
    if (job.lines.length > maxLines) job.lines.splice(0, job.lines.length - maxLines)
  }

  function start(root, task, query) {
    const spec = TASKS[task]
    if (!spec) throw new Error(`unknown task: ${task}`)
    const script = join(root, 'bin', spec.script)
    if (!existsSync(script)) throw new Error(`bin/${spec.script} missing under ${root}`)
    const args = [script, ...spec.args(query)]
    const id = `job-${++seq}`
    const job = {
      id,
      task,
      title: spec.title,
      name: query.name ?? null,
      argv: ['node', ...args.map((a) => (a === script ? `bin/${spec.script}` : a))],
      lines: [],
      running: true,
      startedAt: new Date().toISOString(),
      endedAt: null,
      code: null,
    }
    jobs.set(id, job)
    const env = { ...process.env }
    delete env.ALL_PROXY
    delete env.all_proxy
    env.OHG_PROFILE = join(root, 'data', 'ohg-profile.json')
    env.HF_HUB_OFFLINE = '1'
    env.PYTHONUNBUFFERED = '1'
    let child
    try {
      child = spawn(process.execPath, args, { cwd: root, env })
    } catch (error) {
      job.running = false
      job.code = -1
      job.endedAt = new Date().toISOString()
      push(job, `spawn failed: ${error?.message ?? error}`)
      return job
    }
    job.pid = child.pid
    child.stdout?.on('data', (buf) => push(job, buf))
    child.stderr?.on('data', (buf) => push(job, buf))
    child.on('error', (error) => push(job, `error: ${error?.message ?? error}`))
    child.on('close', (code) => {
      job.running = false
      job.code = code
      job.endedAt = new Date().toISOString()
      push(job, `[exit ${code}]`)
    })
    return job
  }

  return {
    start,
    get: (id) => jobs.get(id) ?? null,
    list: () =>
      [...jobs.values()]
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
        .slice(0, 12)
        .map((job) => ({
          id: job.id,
          task: job.task,
          title: job.title,
          name: job.name,
          running: job.running,
          code: job.code,
          startedAt: job.startedAt,
          endedAt: job.endedAt,
          pid: job.pid,
          tail: job.lines.slice(-40),
          argv: job.argv,
        })),
    stop: (id) => {
      const job = jobs.get(id)
      if (!job || !job.running || !job.pid) return false
      try {
        process.kill(-job.pid, 'SIGTERM')
      } catch {
        try {
          process.kill(job.pid, 'SIGTERM')
        } catch {
          return false
        }
      }
      return true
    },
  }
}

function json(response, status, payload) {
  response.statusCode = status
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.setHeader('cache-control', 'no-store')
  response.end(JSON.stringify(payload))
}

function text(response, status, body, type = 'text/plain; charset=utf-8') {
  response.statusCode = status
  response.setHeader('content-type', type)
  response.setHeader('cache-control', 'no-store')
  response.end(body)
}

async function handle(root, jobs, request, response) {
  const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`)
  const path = url.pathname.replace(PREFIX, '') || '/'
  const query = Object.fromEntries(url.searchParams.entries())

  if (request.method === 'GET' && (path === '/' || path === '/config')) {
    return json(response, 200, {
      root,
      exists: existsSync(join(root, '剧库')),
      tasks: Object.entries(TASKS).map(([id, spec]) => ({ id, title: spec.title, script: `bin/${spec.script}` })),
      pid: process.pid,
      time: new Date().toISOString(),
    })
  }

  if (request.method === 'GET' && path === '/library') {
    const names = await libraryNames(root)
    const dramas = []
    for (const name of names) dramas.push(await dramaCard(root, name))
    dramas.sort((a, b) => (a.series === b.series ? a.season - b.season : a.series.localeCompare(b.series, 'zh-Hans-CN')))
    const series = [...new Set(dramas.map((d) => d.series))]
    const seriesFiles = {}
    for (const base of series) {
      seriesFiles[base] = existsSync(join(root, '剧库', `${base}·系列总报告.md`))
    }
    return json(response, 200, {
      root,
      dramas,
      series,
      seriesFiles,
      jobs: jobs.list(),
      updatedAt: new Date().toISOString(),
    })
  }

  if (request.method === 'GET' && path === '/stats') {
    const name = query.name
    if (!(await libraryNames(root)).includes(name ?? '')) return json(response, 404, { error: 'unknown drama' })
    const statsFile = join(root, '剧库', name, '拆解', 'stats.json')
    const stats = await readJson(statsFile)
    if (!stats) return json(response, 404, { error: 'stats.json missing (先跑 数据速览)' })
    const episodes = (stats.episodes_detail ?? []).map((e) => ({
      ep: e.ep,
      duration: e.duration,
      shots: e.shots,
      cpm: e.cpm,
      chars: e.chars,
      first: e.first,
      last: e.last,
      tail: e.tail,
    }))
    return json(response, 200, {
      name,
      summary: {
        episodes: stats.episodes,
        minutes: stats.total_minutes,
        shots: stats.total_shots,
        secPerShot: stats.sec_per_shot,
        shotMedian: stats.shot_median,
        longestShot: stats.longest_shot,
        under1Shots: stats.under1_shots,
        under3Ratio: stats.under3_ratio,
        cutsPerMin: stats.cuts_per_min,
        dialogue: stats.dialogue,
        hooks: stats.hooks,
        segments: stats.segments,
        correlation: stats.correlation,
        fastest: stats.fastest_eps,
        slowest: stats.slowest_eps,
        epDuration: stats.ep_duration,
      },
      episodes,
    })
  }


function parseClock(stamp) {
  const m = /^(\d+):(\d+):(\d+)[,.](\d+)$/.exec(String(stamp).trim())
  if (!m) return 0
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000
}

function parseSrt(body) {
  const lines = []
  const blocks = String(body).split(/\r?\n\r?\n/)
  for (const block of blocks) {
    const rows = block.split(/\r?\n/).filter(Boolean)
    if (!rows.length) continue
    const idx = rows.findIndex((row) => row.includes('-->'))
    if (idx < 0) continue
    const [from, to] = rows[idx].split('-->').map((part) => parseClock(part.trim().split(' ')[0]))
    const text = rows.slice(idx + 1).join(' ').replace(/\s+/g, ' ').trim()
    if (text) lines.push({ start: Number(from.toFixed(2)), end: Number(to.toFixed(2)), text })
  }
  return lines
}

async function serveFile(request, response, target, type) {
  const info = await stat(target)
  const total = info.size
  const rangeHeader = request.headers.range
  if (rangeHeader) {
    const m = /bytes=(\d*)-(\d*)/.exec(rangeHeader)
    const start = m && m[1] ? Number(m[1]) : 0
    const end = m && m[2] ? Math.min(Number(m[2]), total - 1) : total - 1
    if (start >= total || start > end) {
      response.writeHead(416, { 'content-range': `bytes */${total}` })
      return response.end()
    }
    response.writeHead(206, {
      'content-type': type,
      'content-length': end - start + 1,
      'content-range': `bytes ${start}-${end}/${total}`,
      'accept-ranges': 'bytes',
      'cache-control': 'no-store',
    })
    if (request.method === 'HEAD') return response.end()
    return createReadStream(target, { start, end }).pipe(response)
  }
  response.writeHead(200, {
    'content-type': type,
    'content-length': total,
    'accept-ranges': 'bytes',
    'cache-control': 'no-store',
  })
  if (request.method === 'HEAD') return response.end()
  return createReadStream(target).pipe(response)
}

/**
 * 预测语料：扫描 pipelineRoot 下的 剧库/，把每部已拆完的剧的 stats.json
 * 和每个系列的 *·series.json 汇总行都收进来，不绑定任何具体剧名。
 */
async function loadCorpus(root) {
  const rows = []
  const lib = join(root, '剧库')
  let entries = []
  try {
    entries = await readdir(lib, { withFileTypes: true })
  } catch {
    return rows
  }
  for (const entry of entries) {
    // 系列总览：剧库/<系列>·series.json
    if (entry.isFile() && /·series\.json$/.test(entry.name)) {
      const series = await readJson(join(lib, entry.name))
      for (const row of series?.rows ?? []) {
        rows.push({
          name: row.name,
          episodes: row.episodes,
          minutes: row.minutes,
          secPerShot: row.sec_per_shot,
          cpm: row.cpm,
          charsPerMin: row.chars_min,
          under3: row.under3,
          zeroStart: row.zero_start,
          last6: row.last6,
          tail: row.tail,
          dialogueShots: row.dialogue_shots,
        })
      }
      continue
    }
    // 单剧：剧库/<剧名>/拆解/stats.json
    if (entry.isDirectory()) {
      const stats = await readJson(join(lib, entry.name, '拆解', 'stats.json'))
      if (!stats) continue
      rows.push({
        name: stats.series ?? entry.name,
        episodes: stats.episodes,
        minutes: stats.total_minutes,
        secPerShot: stats.sec_per_shot,
        cpm: stats.cuts_per_min?.mean ?? stats.cuts_per_min,
        charsPerMin: stats.dialogue?.chars_per_min,
        under3: stats.under3_ratio,
        zeroStart: stats.hooks?.zero_start_ratio,
        last6: stats.hooks?.last_line_le6_ratio,
        tail: stats.hooks?.tail_silence_mean,
        dialogueShots: stats.dialogue?.with_dialogue_ratio,
      })
    }
  }
  return rows.filter((row) => Number.isFinite(row.cpm))
}

function stats(values) {
  const clean = values.filter((v) => Number.isFinite(v))
  const mean = clean.reduce((a, b) => a + b, 0) / (clean.length || 1)
  const variance = clean.reduce((a, b) => a + (b - mean) ** 2, 0) / (clean.length || 1)
  return { mean, sd: Math.sqrt(variance) || 1 }
}

/** Transparent scoring: z-scores against the corpus, fixed weights, no ML. */
function forecast(corpus, plan) {
  const fields = {
    charsPerMin: { weight: 0.34, label: '台词密度' },
    cutsPerMin: { weight: 0.12, label: '切镜率' },
    secPerShot: { weight: -0.16, label: '秒/镜' },
    episodes: { weight: 0.05, label: '集数' },
    tail: { weight: 0.08, label: '末句后留白' },
    zeroStart: { weight: 0.12, label: '首句 0 秒' },
    under3: { weight: 0.05, label: '<3 秒镜头' },
  }
  const norm = {}
  for (const [key, spec] of Object.entries(fields)) {
    const source = key === 'cutsPerMin' ? 'cpm' : key
    const values = corpus.map((row) => row[source])
    const { mean, sd } = stats(values)
    const raw = Number(plan[key] ?? plan[source] ?? mean)
    norm[key] = { z: (raw - mean) / sd, raw, mean, spec }
  }
  let z = 0
  let weightSum = 0
  const drivers = []
  for (const [key, item] of Object.entries(norm)) {
    const contribution = item.z * item.spec.weight
    z += contribution
    weightSum += Math.abs(item.spec.weight)
    drivers.push({
      key,
      label: item.spec.label,
      value: Math.round(item.raw * 10) / 10,
      corpusMean: Math.round(item.mean * 10) / 10,
      z: Math.round(item.z * 100) / 100,
      contribution: Math.round(contribution * 1000) / 1000,
    })
  }
  const base = z / (weightSum || 1)
  let score = 50 + base * 46
  const notes = []
  if (plan.breakAt === 'climax') {
    score -= 6
    notes.push('断季断在总攻前：S5 用同一手法，热度 4942.1 万，十季最低（−6）')
  }
  if (plan.ending === 'open') {
    score -= 8
    notes.push('开放式/伪闭结尾：S10 片尾挂「第十一季即将上线」，明账没兑完（−8）')
  } else if (plan.ending === 'closed') {
    score += 5
    notes.push('闭环甜点结尾：S1 婚纱–婚礼闭环，是十季里热度最高的一季（+5）')
  }
  if (Number(plan.cutsPerMin) > 24) {
    score -= 4
    notes.push('切镜率 >24：S9 的 21.5 已是上限，再碎只会暴露素材量（−4）')
  }
  if (Number(plan.cutsPerMin) < 13) {
    score -= 4
    notes.push('切镜率 <13：S5/S6 的长镜堆叠会被看成产能兜底（−4）')
  }
  score = Math.max(5, Math.min(95, Math.round(score)))
  const band = score >= 70 ? '强' : score >= 55 ? '中上' : score >= 45 ? '中' : '弱'
  const comparables = corpus
    .map((row) => {
      const d =
        ((row.cpm - Number(plan.cutsPerMin ?? row.cpm)) / 6) ** 2 +
        ((row.charsPerMin - Number(plan.charsPerMin ?? row.charsPerMin)) / 40) ** 2 +
        ((row.secPerShot - Number(plan.secPerShot ?? row.secPerShot)) / 0.5) ** 2 +
        ((row.episodes - Number(plan.episodes ?? row.episodes)) / 60) ** 2
      return { name: row.name, cpm: row.cpm, charsPerMin: row.charsPerMin, secPerShot: row.secPerShot, episodes: row.episodes, distance: Math.round(Math.sqrt(d) * 100) / 100 }
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3)
  drivers.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
  return { score, band, drivers, notes, comparables, corpusSize: corpus.length, formula: 'score = 50 + 46 × Σ(z×w)/Σ|w|，再按断季/结尾/切镜率加减' }
}


  if (request.method === 'GET' && path === '/rankings') {
    const dir = join(root, 'data', 'rankings')
    let files = []
    try {
      files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort().reverse()
    } catch {}
    const list = []
    for (const file of files.slice(0, 30)) {
      const data = await readJson(join(dir, file))
      if (!data) continue
      const boards = (data.contents ?? []).flatMap((channel) => channel.boards ?? [])
      list.push({
        date: file.replace(/\.json$/, ''),
        channels: (data.contents ?? []).map((channel) => ({ id: channel.id, name: channel.name, boards: (channel.boards ?? []).length })),
        boards: boards.length,
        dramas: new Set(boards.flatMap((board) => (board.items ?? []).map((item) => item.series_id))).size,
        fetchedAt: data.meta?.fetched_at ?? null,
      })
    }
    return json(response, 200, { list })
  }

  if (request.method === 'GET' && path === '/ranking') {
    const date = String(query.date ?? '').replace(/[^0-9-]/g, '')
    const file = join(root, 'data', 'rankings', `${date}.json`)
    const data = await readJson(file)
    if (!data) return json(response, 404, { error: '没有这一天的榜单，先跑扫榜' })
    return json(response, 200, { date, meta: data.meta, contents: data.contents ?? [], errors: data.errors ?? [] })
  }

  if (request.method === 'GET' && path === '/episode') {
    const name = query.name
    if (!(await libraryNames(root)).includes(name ?? '')) return json(response, 404, { error: 'unknown drama' })
    const ep = String(query.ep ?? '1').padStart(3, '0')
    const dir = join(root, '剧库', name)
    const shots = await readJson(join(dir, '拆解', `EP${ep}`, 'shots.json'))
    if (!shots) return json(response, 404, { error: '这一集还没切镜' })
    let lines = []
    try {
      lines = parseSrt(await readFile(join(dir, '字幕', `EP${ep}.srt`), 'utf8'))
    } catch {}
    return json(response, 200, {
      name,
      ep: Number(ep),
      meta: shots.meta ?? {},
      shots: (shots.shots ?? []).map((shot) => ({
        no: shot.no,
        start: shot.start,
        end: shot.end,
        dur: shot.dur,
        keyframe: shot.keyframe,
        lines: lines.filter((line) => line.start < shot.end && line.end > shot.start).map((line) => line.text),
      })),
      lines,
    })
  }

  if ((request.method === 'GET' || request.method === 'HEAD') && path === '/media') {
    const name = query.name
    if (!(await libraryNames(root)).includes(name ?? '')) return json(response, 404, { error: 'unknown drama' })
    const ep = String(query.ep ?? '1').padStart(3, '0')
    const target = join(root, '剧库', name, 'raw', `EP${ep}.mp4`)
    if (!existsSync(target)) return json(response, 404, { error: '这一集没有原片' })
    return serveFile(request, response, target, 'video/mp4')
  }

  if (request.method === 'GET' && path === '/frame') {
    const name = query.name
    if (!(await libraryNames(root)).includes(name ?? '')) return json(response, 404, { error: 'unknown drama' })
    const ep = String(query.ep ?? '1').padStart(3, '0')
    const shot = String(query.shot ?? '1').padStart(3, '0')
    const target = join(root, '剧库', name, '拆解', `EP${ep}`, 'shots', `${shot}.jpg`)
    if (!existsSync(target)) return json(response, 404, { error: '没有这一帧' })
    return serveFile(request, response, target, 'image/jpeg')
  }

  if (request.method === 'POST' && path === '/forecast') {
    const body = await readBody(request)
    const corpus = await loadCorpus(root)
    if (!corpus.length) return json(response, 503, { error: '没有可用的对标样本（先跑系列总览）' })
    return json(response, 200, { plan: body, ...forecast(corpus, body ?? {}), corpus: corpus.map((row) => ({ name: row.name, cpm: row.cpm, charsPerMin: row.charsPerMin, secPerShot: row.secPerShot, episodes: row.episodes })) })
  }

  if (request.method === 'GET' && path === '/trend') {
    const trendFile = join(root, 'data', 'trend.json')
    const trend = await readJson(trendFile)
    if (!trend) return json(response, 404, { error: 'trend.json missing (跑一次 近七日趋势)' })
    return json(response, 200, trend)
  }

  if (request.method === 'GET' && path === '/week-report') {
    const dir = join(root, 'reports')
    if (!existsSync(dir)) return json(response, 404, { error: '没有 reports/' })
    const files = (await readdir(dir)).filter((file) => /-七日趋势\.md$/.test(file)).sort()
    if (!files.length) return json(response, 404, { error: '还没有趋势报告' })
    const latest = files[files.length - 1]
    const body = await readFile(join(dir, latest), 'utf8')
    return json(response, 200, { file: latest, markdown: body, bytes: Buffer.byteLength(body) })
  }

  const REPORT_KINDS = new Set(['daily', 'weekly', 'monthly'])

  if (request.method === 'GET' && path === '/reports') {
    const kind = String(query.kind ?? '')
    if (!REPORT_KINDS.has(kind)) return json(response, 400, { error: 'kind 只能是 daily / weekly / monthly' })
    const dir = join(root, 'reports', kind)
    if (!existsSync(dir)) return json(response, 200, { kind, files: [] })
    const names = (await readdir(dir)).filter((file) => file.endsWith('.md')).sort().reverse().slice(0, 90)
    const files = await Promise.all(names.map(async (file) => {
      const info = await stat(join(dir, file))
      return { file, size: info.size, mtime: info.mtime.toISOString() }
    }))
    return json(response, 200, { kind, count: files.length, files })
  }

  if (request.method === 'GET' && path === '/report') {
    const kind = String(query.kind ?? '')
    const file = (() => { try { return decodeURIComponent(String(query.file ?? '')) } catch { return String(query.file ?? '') } })()
    if (!REPORT_KINDS.has(kind) || !file.endsWith('.md') || /[\\/]/.test(file) || file.startsWith('.')) return json(response, 400, { error: 'bad kind/file' })
    const dir = join(root, 'reports', kind)
    const full = join(dir, file)
    if (!full.startsWith(dir + sep) || !existsSync(full)) return json(response, 404, { error: 'not found' })
    const body = await readFile(full, 'utf8')
    return json(response, 200, { kind, file, markdown: body, bytes: Buffer.byteLength(body) })
  }

  if (request.method === 'GET' && path === '/markdown') {
    const name = query.name
    if (!(await libraryNames(root)).includes(name ?? '')) return json(response, 404, { error: 'unknown drama' })
    const dir = join(root, '剧库', name)
    const files = {
      report: '拆解报告.md',
      card: '剧情库卡片.md',
      structure: '剧本逆推/剧情结构逆推.md',
      overview: '拆解/数据速览.md',
      beats: '拆解/事件时间线.md',
    }
    const rel = files[query.file] ?? '拆解报告.md'
    const target = resolve(dir, rel)
    if (!target.startsWith(resolve(dir) + sep)) return json(response, 400, { error: 'bad path' })
    try {
      const body = await readFile(target, 'utf8')
      return json(response, 200, { name, file: rel, markdown: body, bytes: Buffer.byteLength(body) })
    } catch {
      return json(response, 404, { error: `missing ${rel}` })
    }
  }

  if (request.method === 'GET' && path === '/series-report') {
    const base = String(query.series ?? '')
    const target = join(root, '剧库', `${base}·系列总报告.md`)
    if (!existsSync(target)) return json(response, 404, { error: '系列总报告不存在' })
    const body = await readFile(target, 'utf8')
    return json(response, 200, { series: base, markdown: body, bytes: Buffer.byteLength(body) })
  }

  if (request.method === 'GET' && path === '/modes') {
    const target = join(root, '剧库', '剧情库.md')
    if (!existsSync(target)) return json(response, 404, { error: '剧情库.md 不存在' })
    const body = await readFile(target, 'utf8')
    return json(response, 200, { markdown: body, bytes: Buffer.byteLength(body) })
  }

  if (request.method === 'GET' && path === '/series-overview') {
    const base = String(query.series ?? '')
    const target = join(root, '剧库', `${base}·系列总览.md`)
    if (!existsSync(target)) return json(response, 404, { error: '系列总览不存在' })
    const body = await readFile(target, 'utf8')
    return json(response, 200, { series: base, markdown: body, bytes: Buffer.byteLength(body) })
  }

  if (request.method === 'GET' && path === '/episodes-table') {
    const name = query.name
    if (!(await libraryNames(root)).includes(name ?? '')) return json(response, 404, { error: 'unknown drama' })
    const target = join(root, '剧库', name, '剧本逆推', '分集表.csv')
    if (!existsSync(target)) return json(response, 404, { error: '分集表.csv 不存在（先跑逐镜逆推）' })
    const body = await readFile(target, 'utf8')
    const rows = body.split(/\r?\n/).filter(Boolean).map((line) => {
      const cells = []
      let cell = ''
      let quoted = false
      for (const ch of line) {
        if (ch === '"') quoted = !quoted
        else if (ch === ',' && !quoted) { cells.push(cell); cell = '' }
        else cell += ch
      }
      cells.push(cell)
      return cells
    })
    return json(response, 200, { name, header: rows[0] ?? [], rows: rows.slice(1) })
  }

  if (request.method === 'GET' && path === '/asset') {
    const name = query.name
    if (!(await libraryNames(root)).includes(name ?? '')) return json(response, 404, { error: 'unknown drama' })
    const dir = join(root, '剧库', name)
    let target = null
    if (query.kind === 'contact') {
      const ep = String(query.ep ?? '1').padStart(3, '0')
      target = join(dir, '拆解', `EP${ep}`, 'contact.jpg')
    } else if (query.kind === 'frame') {
      const ep = String(query.ep ?? '1').padStart(3, '0')
      target = join(dir, '拆解', `EP${ep}`, 'shots', `${String(query.shot ?? '001').padStart(3, '0')}.jpg`)
    }
    if (!target || !existsSync(target)) return json(response, 404, { error: 'asset missing' })
    const buf = await readFile(target)
    response.statusCode = 200
    response.setHeader('content-type', 'image/jpeg')
    response.setHeader('cache-control', 'public, max-age=3600')
    response.end(buf)
    return
  }

  if (request.method === 'GET' && path === '/jobs') return json(response, 200, { jobs: jobs.list() })

  if (request.method === 'GET' && path.startsWith('/jobs/')) {
    const id = path.slice('/jobs/'.length)
    const job = jobs.get(id)
    if (!job) return json(response, 404, { error: 'no such job' })
    return json(response, 200, {
      id: job.id,
      running: job.running,
      code: job.code,
      task: job.task,
      title: job.title,
      name: job.name,
      argv: job.argv,
      startedAt: job.startedAt,
      endedAt: job.endedAt,
      lines: filterJobLines(job.lines),
    })
  }

  if (request.method === 'POST' && path === '/run') {
    const body = await readBody(request)
    const task = String(body.task ?? '')
    if (!TASKS[task]) return json(response, 400, { error: `unknown task: ${task}` })
    const query = { ...body }
    if (task !== 'scan' && task !== 'index' && task !== 'week') {
      if (task === 'series-stats') {
        query.prefix = String(body.prefix ?? body.name ?? '')
        if (!query.prefix) return json(response, 400, { error: 'prefix required' })
      } else if (task === 'breakdown') {
        const seriesId = String(body.seriesId ?? '').trim()
        const dramaName = String(body.dramaName ?? body.name ?? '').trim()
        if (!/^\d{6,}$/.test(seriesId)) return json(response, 400, { error: 'seriesId must be a numeric hongguo series id' })
        if (!dramaName) return json(response, 400, { error: 'dramaName required' })
        query.seriesId = seriesId
        query.dramaName = dramaName
        query.name = dramaName
      } else if (task === 'download') {
        const seriesId = String(body.seriesId ?? '').trim()
        const dramaName = String(body.dramaName ?? body.name ?? '').trim()
        if (seriesId) {
          if (!/^\d{6,}$/.test(seriesId)) return json(response, 400, { error: 'seriesId must be a numeric hongguo series id' })
          query.seriesId = seriesId
          query.dramaName = dramaName || undefined
          query.name = dramaName || seriesId
        } else {
          const names = await libraryNames(root)
          if (!names.includes(dramaName)) return json(response, 404, { error: 'unknown drama' })
          const meta = await readJson(join(root, '剧库', dramaName, 'meta.json'))
          if (!meta?.series_id) return json(response, 400, { error: 'meta.json 里没有 series_id，无法补下' })
          query.seriesId = String(meta.series_id)
          query.dramaName = dramaName
          query.name = dramaName
        }
      } else {
        const names = await libraryNames(root)
        if (!names.includes(String(body.name ?? ''))) return json(response, 404, { error: 'unknown drama' })
        query.name = String(body.name)
      }
    }
    const job = jobs.start(root, task, query)
    return json(response, 200, { job: jobs.list().find((j) => j.id === job.id) })
  }

  if (request.method === 'POST' && path.startsWith('/jobs/') && path.endsWith('/stop')) {
    const id = path.slice('/jobs/'.length, -'/stop'.length)
    const ok = jobs.stop(id)
    return json(response, ok ? 200 : 409, { ok })
  }

  return json(response, 404, { error: 'not found', path })
}

function readBody(request) {
  return new Promise((resolveBody, reject) => {
    let size = 0
    const chunks = []
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > 64 * 1024) {
        reject(new Error('body too large'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      if (!chunks.length) return resolveBody({})
      try {
        resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch (error) {
        reject(error)
      }
    })
    request.on('error', reject)
  })
}

export function apply(ctx, config = {}) {
  const root = resolveRoot(config)
  const jobs = createJobs(config)
  const logger = ctx?.logger

  ctx.inject(['webServer'], (web) => {
    const handler = (request, response) => {
      Promise.resolve(handle(root, jobs, request, response)).catch((error) => {
        logger?.warn?.(`[drama-lab] ${error?.stack ?? error}`)
        if (!response.headersSent) response.statusCode = 500
        response.end(JSON.stringify({ error: String(error?.message ?? error) }))
      })
    }
    const dispose = ctx.effect(
      () => web.webServer.register({ kind: 'prefix', path: PREFIX, handler }),
      'drama-lab: routes',
    )
    return dispose
  })
}
