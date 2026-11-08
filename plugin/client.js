window.__ModuleLoader__.load({
  id: 'dsh-drama-lab',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useMemo, useRef } = React

    const PANEL_ID = 'drama-lab'
    const API = '/api/drama-lab'

    const TABS = [
      { id: 'rank', label: '扫榜' },
      { id: 'video', label: '视频' },
      { id: 'breakdown', label: '拆解' },
      { id: 'knowledge', label: '知识库' },
      { id: 'story', label: '剧情' },
      { id: 'forecast', label: '预测' },
      { id: 'hongguo', label: '摸鱼短剧' },
    ]

    const CSS = `
.dl-root{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;color:var(--dsh-text,inherit);
  font-size:13px;background:var(--dsh-panel-bg,var(--dsh-bg,transparent))}
.dl-head{display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--dsh-border,rgba(127,127,127,.18));flex-wrap:wrap}
.dl-head h1{font-size:14px;font-weight:650;margin:0;letter-spacing:.2px}
.dl-grow{flex:1;min-width:0}
.dl-sub{font-size:11px;opacity:.55;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dl-tabs{display:flex;gap:2px;padding:0 12px;border-bottom:1px solid var(--dsh-border,rgba(127,127,127,.18));overflow-x:auto}
.dl-tab{border:0;background:transparent;color:inherit;padding:8px 11px;font-size:12.5px;cursor:pointer;opacity:.6;
  border-bottom:2px solid transparent;white-space:nowrap}
.dl-tab:hover{opacity:.9}
.dl-tab.on{opacity:1;font-weight:600;border-bottom-color:currentColor}
.dl-btn{border:1px solid var(--dsh-border,rgba(127,127,127,.28));background:transparent;color:inherit;border-radius:7px;
  padding:4px 9px;font-size:12px;cursor:pointer;line-height:1.4}
.dl-btn:hover{background:color-mix(in srgb,currentColor 7%,transparent)}
.dl-btn:disabled{opacity:.4;cursor:default}
.dl-btn.on{background:color-mix(in srgb,currentColor 10%,transparent)}
.dl-body{flex:1;min-height:0;overflow:auto;padding:14px 18px 30px}
.dl-empty{opacity:.55;font-size:12px;padding:18px 0}
.dl-chip{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--dsh-border,rgba(127,127,127,.24));
  border-radius:999px;padding:2px 9px;font-size:11px;opacity:.85}
.dl-chip b{font-weight:650}
.dl-chiprow{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 12px}
.dl-shelf{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 12px}
button.dl-chip{cursor:pointer;background:transparent;color:inherit}
button.dl-chip.dl-on{border-color:var(--dsh-accent,#4e7fff);color:var(--dsh-accent,#4e7fff)}
button.dl-btn.dl-on{border-color:var(--dsh-accent,#4e7fff);color:var(--dsh-accent,#4e7fff)}
.dl-card{border:1px solid var(--dsh-border,rgba(127,127,127,.2));border-radius:10px;padding:10px 12px;margin-bottom:12px}
.dl-card h3{font-size:12.5px;margin:0 0 8px;font-weight:650;display:flex;align-items:center;gap:8px}
.dl-card h3 .n{font-size:11px;opacity:.55;font-weight:400}
table.dl-t{border-collapse:collapse;width:100%;font-size:12px}
table.dl-t th,table.dl-t td{border-bottom:1px solid var(--dsh-border,rgba(127,127,127,.16));padding:5px 7px;text-align:left;vertical-align:top}
table.dl-t th{font-weight:600;opacity:.72;font-size:11px;white-space:nowrap}
table.dl-t td.num{text-align:right;font-variant-numeric:tabular-nums}
.dl-md h1,.dl-md h2,.dl-md h3,.dl-md h4{line-height:1.35;margin:16px 0 8px}
.dl-md h1{font-size:16px}.dl-md h2{font-size:14px}.dl-md h3{font-size:13px}.dl-md h4{font-size:12.5px}
.dl-md p{margin:7px 0;line-height:1.72}
.dl-md ul,.dl-md ol{margin:7px 0;padding-left:20px;line-height:1.72}
.dl-md li{margin:3px 0}
.dl-md blockquote{margin:8px 0;padding:6px 10px;border-left:2px solid currentColor;opacity:.78;font-size:12px}
.dl-md table{border-collapse:collapse;margin:10px 0;font-size:12px;width:100%}
.dl-md th,.dl-md td{border:1px solid var(--dsh-border,rgba(127,127,127,.2));padding:4px 7px;text-align:left;vertical-align:top}
.dl-md th{background:color-mix(in srgb,currentColor 5%,transparent);font-weight:600}
.dl-md code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;background:color-mix(in srgb,currentColor 7%,transparent);padding:1px 4px;border-radius:4px}
.dl-md pre{overflow:auto;padding:10px;border-radius:8px;background:color-mix(in srgb,currentColor 6%,transparent)}
.dl-md pre code{background:transparent;padding:0}
.dl-md hr{border:0;border-top:1px solid var(--dsh-border,rgba(127,127,127,.18));margin:14px 0}
.dl-epgrid{display:flex;flex-wrap:wrap;gap:4px;max-height:180px;overflow:auto;margin:8px 0}
.dl-ep{min-width:34px;text-align:center;font-size:11px;padding:3px 4px;border-radius:6px;border:1px solid transparent;
  background:color-mix(in srgb,currentColor 6%,transparent);cursor:pointer;font-variant-numeric:tabular-nums}
.dl-ep:hover{background:color-mix(in srgb,currentColor 12%,transparent)}
.dl-ep.on{background:currentColor;color:var(--dsh-panel-bg,#fff);font-weight:650}
.dl-player{width:100%;max-height:52vh;background:#000;border-radius:10px;display:block;margin:6px 0 10px}
.dl-shots{display:flex;flex-direction:column;gap:6px;margin-top:8px}
.dl-shot{display:grid;grid-template-columns:56px 118px minmax(0,1fr);gap:10px;align-items:flex-start;
  border-bottom:1px solid var(--dsh-border,rgba(127,127,127,.14));padding:6px 0}
.dl-shot .idx{font-size:11px;opacity:.62;font-variant-numeric:tabular-nums}
.dl-shot img{width:118px;border-radius:6px;display:block;background:color-mix(in srgb,currentColor 6%,transparent)}
.dl-shot .say{font-size:12px;line-height:1.6}
.dl-shot .say .t{opacity:.5;font-size:11px;margin-right:6px}
.dl-shot .say .none{opacity:.38;font-size:11px}
.dl-form{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px 12px;max-width:820px}
.dl-field{display:flex;flex-direction:column;gap:4px;font-size:11.5px}
.dl-field span{opacity:.66}
.dl-field input,.dl-field select{border:1px solid var(--dsh-border,rgba(127,127,127,.28));border-radius:7px;
  background:transparent;color:inherit;font-size:12px;padding:5px 8px;outline:none}
.dl-score{display:flex;align-items:baseline;gap:10px;margin:6px 0 2px}
.dl-score b{font-size:34px;font-weight:700;font-variant-numeric:tabular-nums}
.dl-score .band{font-size:12px;padding:2px 9px;border-radius:999px;border:1px solid currentColor;opacity:.85}
.dl-note{font-size:11.5px;line-height:1.65;opacity:.8;margin:4px 0}
.dl-run{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-top:8px}
.dl-log{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;line-height:1.5;
  background:color-mix(in srgb,currentColor 6%,transparent);border-radius:8px;padding:8px 10px;max-height:220px;overflow:auto;white-space:pre-wrap}
.dl-split{display:grid;grid-template-columns:230px minmax(0,1fr);gap:14px}
.dl-side{display:flex;flex-direction:column;gap:3px}
.dl-side .dl-item{font-size:12px;padding:6px 8px;border-radius:7px;text-align:left;border:1px solid transparent;background:transparent;color:inherit;cursor:pointer}
.dl-side .dl-item:hover{background:color-mix(in srgb,currentColor 6%,transparent)}
.dl-side .dl-item.on{background:color-mix(in srgb,currentColor 9%,transparent)}
@media (max-width:760px){.dl-split{grid-template-columns:1fr}.dl-shot{grid-template-columns:44px 92px minmax(0,1fr)}.dl-shot img{width:92px}}

.dl-search{display:flex;gap:8px;margin:4px 0 14px}
.dl-input{flex:1;min-width:0;padding:7px 11px;border-radius:9px;border:1px solid var(--dsh-border,rgba(127,127,127,.28));background:transparent;color:inherit;font-size:12.5px;outline:none}
.dl-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(146px,1fr));gap:12px}
.dl-hgcard{display:flex;flex-direction:column;gap:0;padding:0;border:1px solid var(--dsh-border,rgba(127,127,127,.25));border-radius:12px;overflow:hidden;background:transparent;color:inherit;cursor:pointer;text-align:left}
.dl-hgcard:hover{border-color:color-mix(in srgb,currentColor 35%,transparent)}
.dl-hgcard img{width:100%;aspect-ratio:3/4;object-fit:cover;display:block;background:color-mix(in srgb,currentColor 8%,transparent)}
.dl-hgph{aspect-ratio:3/4;display:flex;align-items:center;justify-content:center;opacity:.5;font-size:12px}
.dl-hgb{padding:8px 10px 10px;display:flex;flex-direction:column;gap:3px}
.dl-hgt{font-size:12.5px;line-height:1.35;max-height:2.7em;overflow:hidden}
.dl-hgm{font-size:11px;opacity:.6}
.dl-hg{display:flex;flex-direction:column;gap:12px}
.dl-hghead{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.dl-hgtitle{font-size:15px;font-weight:600}
.dl-hgmeta{font-size:11.5px;opacity:.6}
.dl-desc{font-size:12px;line-height:1.65;opacity:.72;margin:0;max-height:6.2em;overflow:auto}
.dl-player{display:flex;flex-direction:column;gap:6px}
.dl-player video{width:100%;max-height:62vh;background:#000;border-radius:10px}
.dl-playercap{font-size:11.5px;opacity:.6}
.dl-epgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(46px,1fr));gap:6px;max-height:230px;overflow:auto}
.dl-ep{padding:5px 0;font-size:12px;border-radius:8px;border:1px solid var(--dsh-border,rgba(127,127,127,.25));background:transparent;color:inherit;cursor:pointer}
.dl-ep.on{border-color:currentColor;font-weight:600}
.dl-ep.off{opacity:.35;cursor:not-allowed}

.dl-champ{display:flex;flex-direction:column;gap:2px;margin:6px 0 10px}
.dl-champ-row{display:grid;grid-template-columns:44px minmax(0,1fr) 74px;gap:8px;font-size:12px;align-items:baseline}
.dl-champ-row .d{opacity:.5;font-variant-numeric:tabular-nums}
.dl-champ-row .t{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dl-champ-row .h{text-align:right;opacity:.6;font-variant-numeric:tabular-nums}
.dl-two{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}
.dl-lab{font-size:11px;opacity:.55;margin-bottom:4px}
.dl-line{display:flex;justify-content:space-between;gap:8px;font-size:12px;line-height:1.7}
.dl-line .n{opacity:.6;font-variant-numeric:tabular-nums}
`

    function inline(text, key) {
      const source = String(text ?? '')
      const nodes = []
      let rest = source
      let guard = 0
      while (rest && guard++ < 60) {
        const bold = rest.match(/\*\*([^*]+)\*\*/)
        const code = rest.match(/`([^`]+)`/)
        const link = rest.match(/\[([^\]]+)\]\(([^)]+)\)/)
        const candidates = [bold, code, link].filter(Boolean).sort((a, b) => a.index - b.index)
        const next = candidates[0]
        if (!next) {
          nodes.push(rest)
          break
        }
        if (next.index > 0) nodes.push(rest.slice(0, next.index))
        if (next === bold) nodes.push(h('strong', { key: `b${key}${nodes.length}` }, bold[1]))
        else if (next === code) nodes.push(h('code', { key: `c${key}${nodes.length}` }, code[1]))
        else nodes.push(h('a', { key: `a${key}${nodes.length}`, href: link[2], target: '_blank', rel: 'noreferrer' }, link[1]))
        rest = rest.slice(next.index + next[0].length)
      }
      return nodes
    }

    function renderMarkdown(markdown) {
      const lines = String(markdown ?? '').split(/\r?\n/)
      const out = []
      let i = 0
      let key = 0
      while (i < lines.length) {
        const line = lines[i]
        if (/^```/.test(line)) {
          const buf = []
          i += 1
          while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++])
          i += 1
          out.push(h('pre', { key: `k${key++}` }, h('code', null, buf.join('\n'))))
          continue
        }
        if (/^\s*$/.test(line)) { i += 1; continue }
        const heading = line.match(/^(#{1,4})\s+(.*)$/)
        if (heading) {
          out.push(h(`h${heading[1].length}`, { key: `k${key++}` }, inline(heading[2], `k${key}`)))
          i += 1
          continue
        }
        if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
          const parse = (row) => row.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim())
          const head = parse(line)
          i += 2
          const rows = []
          while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(parse(lines[i++]))
          out.push(
            h('table', { key: `k${key++}` },
              h('thead', null, h('tr', null, head.map((cell, ci) => h('th', { key: ci }, inline(cell, `th${ci}`))))),
              h('tbody', null, rows.map((row, ri) =>
                h('tr', { key: ri }, row.map((cell, ci) => h('td', { key: ci }, inline(cell, `td${ri}-${ci}`)))),
              )),
            ),
          )
          continue
        }
        if (/^\s*(-|\*|\d+\.)\s+/.test(line)) {
          const ordered = /^\s*\d+\./.test(line)
          const items = []
          while (i < lines.length && /^\s*(-|\*|\d+\.)\s+/.test(lines[i])) {
            const body = lines[i].replace(/^\s*(-|\*|\d+\.)\s+/, '')
            items.push(h('li', { key: items.length }, inline(body, `li${items.length}`)))
            i += 1
          }
          out.push(h(ordered ? 'ol' : 'ul', { key: `k${key++}` }, items))
          continue
        }
        if (/^>\s?/.test(line)) {
          out.push(h('blockquote', { key: `k${key++}` }, inline(line.replace(/^>\s?/, ''), `q${key}`)))
          i += 1
          continue
        }
        if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
          out.push(h('hr', { key: `k${key++}` }))
          i += 1
          continue
        }
        const buf = []
        while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|>\s?|\s*\|.*\|\s*$)/.test(lines[i])) {
          if (/^\s*(-|\*|\d+\.)\s+/.test(lines[i])) break
          buf.push(lines[i++])
        }
        if (buf.length) out.push(h('p', { key: `k${key++}` }, inline(buf.join(' '), `p${key}`)))
        else i += 1
      }
      return out
    }

    async function getJson(path) {
      const res = await fetch(API + path, { headers: { accept: 'application/json' } })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`)
      return body
    }

    async function postJson(path, payload) {
      const res = await fetch(API + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload ?? {}),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`)
      return body
    }

    const fmt = (value, digits = 1) =>
      typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '—'
    const pct = (value) => {
      if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
      return `${Math.round(value > 1 ? value : value * 100)}%`
    }
    const clampEp = (value, max) => Math.min(Math.max(1, Number(value) || 1), max || 1)
    const pad = (ep) => String(ep).padStart(3, '0')

    function Err({ message }) {
      return message ? h('div', { className: 'dl-empty', style: { color: 'inherit' } }, message) : null
    }

    function Markdown({ text, loading }) {
      if (loading) return h('div', { className: 'dl-empty' }, '读取中…')
      if (!text) return h('div', { className: 'dl-empty' }, '还没有这份文档')
      return h('div', { className: 'dl-md' }, renderMarkdown(text))
    }

    function useDramaStats(name) {
      const [state, setState] = useState({ loading: false, data: null, error: null })
      useEffect(() => {
        if (!name) return
        let alive = true
        setState({ loading: true, data: null, error: null })
        getJson(`/stats?name=${encodeURIComponent(name)}`)
          .then((data) => alive && setState({ loading: false, data, error: null }))
          .catch((error) => alive && setState({ loading: false, data: null, error: error.message }))
        return () => { alive = false }
      }, [name])
      return state
    }

    function Spark({ episodes, field, unit, color }) {
      const points = (episodes ?? []).filter((e) => Number.isFinite(Number(e[field])))
      if (points.length < 2) return h('div', { className: 'dl-empty' }, '数据不足，跑一次「数据速览」再来。')
      const values = points.map((e) => Number(e[field]))
      const max = Math.max(...values, 1)
      const min = Math.min(...values, 0)
      const w = 640
      const hgt = 140
      const stepX = w / (points.length - 1)
      const y = (v) => hgt - 16 - ((v - min) / Math.max(max - min, 0.001)) * (hgt - 30)
      const path = values.map((v, index) => `${index ? 'L' : 'M'}${(index * stepX).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
      const mean = values.reduce((a, b) => a + b, 0) / values.length
      return h('div', { className: 'dl-card' },
        h('h3', null, `${unit} 逐集曲线`, h('span', { className: 'n' }, `均值 ${fmt(mean, 1)} · 最低 ${fmt(min, 1)} · 最高 ${fmt(max, 1)}`)),
        h('svg', { viewBox: `0 0 ${w} ${hgt}`, width: '100%', height: 130, preserveAspectRatio: 'none' },
          h('line', { x1: 0, y1: y(mean), x2: w, y2: y(mean), stroke: 'currentColor', strokeOpacity: 0.18, strokeDasharray: '4 4' }),
          h('path', { d: path, fill: 'none', stroke: color ?? '#4d6bfe', strokeWidth: 1.6, strokeLinejoin: 'round' }),
        ),
      )
    }

    // ---------- 摸鱼短剧（在线观看） ----------
    async function hg(path) {
      const response = await fetch(path, { headers: { accept: 'application/json' } })
      if (!response.ok) throw new Error(`红果接口 ${response.status}`)
      const data = await response.json()
      if (data && data.error) throw new Error(data.error.message ?? String(data.error))
      return data
    }

    function HongguoView() {
      const [items, setItems] = useState([])
      const [loading, setLoading] = useState(false)
      const [error, setError] = useState('')
      const [series, setSeries] = useState(null)
      const [episode, setEpisode] = useState(null)
      const [play, setPlay] = useState({ url: '', title: '' })
      const [note, setNote] = useState('')
      const [query, setQuery] = useState('')

      const load = (kind, text) => {
        setLoading(true); setError(''); setNote('')
        const path = kind === 'search'
          ? `/api/hongguo/search?q=${encodeURIComponent(text)}`
          : '/api/hongguo/feed'
        hg(path)
          .then((data) => { setItems(data.items ?? []); setSeries(null); setEpisode(null); setPlay({ url: '', title: '' }) })
          .catch((e) => setError(e.message))
          .finally(() => setLoading(false))
      }

      useEffect(() => { load('feed') }, [])

      const open = (item) => {
        setLoading(true); setError(''); setNote('')
        hg(`/api/hongguo/series?id=${encodeURIComponent(item.id ?? item.series_id)}`)
          .then((data) => { setSeries({ ...data.series, episodes: data.episodes ?? [] }); setEpisode(null); setPlay({ url: '', title: '' }) })
          .catch((e) => setError(e.message))
          .finally(() => setLoading(false))
      }

      const watch = (ep) => {
        setLoading(true); setError('')
        hg(`/api/hongguo/play?episode=${encodeURIComponent(ep.id)}`)
          .then((data) => {
            const source = (data.sources ?? [])[0]
            if (!source || !source.url) throw new Error('这一集暂时没有可用片源')
            setEpisode(ep)
            setPlay({ url: source.url, title: `${series ? series.title : ''} · ${ep.title ?? '第' + ep.number + '集'}` })
          })
          .catch((e) => setError(e.message))
          .finally(() => setLoading(false))
      }

      const download = () => {
        if (!series) return
        setNote('提交中…')
        postJson('/run', { task: 'download', seriesId: String(series.id), dramaName: series.title })
          .then((data) => setNote(`已在后台开始下载《${series.title}》（任务 ${(data.job && data.job.id) || ''}），日志点顶部「运行」查看`))
          .catch((e) => setNote(`提交失败：${e.message}`))
      }

      const submit = (event) => {
        event.preventDefault()
        if (!query.trim()) { load('feed'); return }
        load('search', query.trim())
      }

      const card = (item) => h('button', {
        key: item.id ?? item.series_id,
        className: 'dl-hgcard',
        onClick: () => open(item),
        title: item.title,
      },
        item.cover ? h('img', { src: item.cover, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer' }) : h('div', { className: 'dl-hgph' }, '无封面'),
        h('div', { className: 'dl-hgb' },
          h('div', { className: 'dl-hgt' }, item.title ?? '未命名'),
          h('div', { className: 'dl-hgm' }, item.episode_count ? `${item.episode_count} 集` : (item.heat ? `热度 ${item.heat}` : '红果短剧')),
        ),
      )

      if (series) {
        return h('div', { className: 'dl-hg' },
          h('div', { className: 'dl-hghead' },
            h('button', { className: 'dl-btn', onClick: () => { setSeries(null); setEpisode(null); setPlay({ url: '', title: '' }) } }, '← 返回列表'),
            h('div', { className: 'dl-hgtitle' }, series.title ?? '未命名'),
            h('div', { className: 'dl-hgmeta' }, [
              series.episode_count ? `${series.episode_count} 集` : `${series.episodes.length} 集`,
              series.heat ? `热度 ${series.heat}` : null,
              series.play_count ? `播放 ${series.play_count}` : null,
            ].filter(Boolean).join(' · ')),
            h('button', { className: 'dl-btn on', onClick: download }, '下载到拆解库'),
          ),
          note ? h('div', { className: 'dl-note' }, note) : null,
        (() => {
          const at = data?.meta?.fetched_at
          if (!at) return null
          const age = (Date.now() - new Date(at).getTime()) / 60000
          if (age < 15) return null
          return h('div', { className: 'dl-note', style: { color: '#d08700' } }, `这份快照已 ${Math.round(age)} 分钟前抓取，点「实时抓榜」重新拉平台实时榜。`)
        })(),
          h(Err, { message: error }),
          play.url
            ? h('div', { className: 'dl-player' },
                h('video', { key: play.url, src: play.url, controls: true, autoPlay: true, playsInline: true }),
                h('div', { className: 'dl-playercap' }, play.title),
              )
            : h('div', { className: 'dl-empty' }, loading ? '取片源…' : '选一集开始看（在线解密直连，不落盘）'),
          series.description ? h('p', { className: 'dl-desc' }, series.description) : null,
          h('div', { className: 'dl-epgrid' },
            series.episodes.map((ep) => h('button', {
              key: ep.id,
              className: `dl-ep${episode && episode.id === ep.id ? ' on' : ''}${ep.playable === false ? ' off' : ''}`,
              onClick: () => watch(ep),
              disabled: ep.playable === false,
              title: ep.title,
            }, ep.number ?? ep.title)),
          ),
        )
      }

      return h('div', { className: 'dl-hg' },
        h('form', { className: 'dl-search', onSubmit: submit },
          h('input', {
            className: 'dl-input',
            value: query,
            placeholder: '搜红果短剧：千金 / 总裁 / 逆袭…',
            onChange: (event) => setQuery(event.target.value),
          }),
          h('button', { className: 'dl-btn on', type: 'submit' }, '搜索'),
          h('button', { className: 'dl-btn', type: 'button', onClick: () => { setQuery(''); load('feed') } }, '推荐'),
        ),
        h(Err, { message: error }),
        loading ? h('div', { className: 'dl-empty' }, '加载中…') : null,
        h('div', { className: 'dl-cards' }, items.map(card)),
        !loading && !items.length ? h('div', { className: 'dl-empty' }, '没有结果') : null,
      )
    }

    // ---------- 扫榜 ----------
    function BreakdownProgress({ job, onClose }) {
      if (!job) return null
      const progress = job.progress
      const stages = progress?.stages ?? []
      const percent = progress?.percent ?? 0
      const meta = {
        pending: { icon: '⏸', text: '待运行', color: 'inherit', dim: 0.5 },
        running: { icon: '⏳', text: '进行中', color: '#4e7fff' },
        done: { icon: '✅', text: '完成', color: '#1a9e57' },
        error: { icon: '❌', text: '失败', color: '#d64545' },
      }
      const fmtSec = (sec) => (sec == null ? '—' : sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}分${sec % 60}秒`)
      const stateText = progress?.finished ? '已完成' : progress?.error ? '已中断' : '进行中…'
      return h('div', { className: 'dl-card' },
        h('h3', null,
          `拆解进度 · ${job.title || ''}`,
          h('span', { className: 'n' }, stateText),
          h('div', { className: 'dl-grow' }),
          h('span', { className: 'n' }, `${percent}%`),
          h('button', { className: 'dl-btn', onClick: onClose, style: { marginLeft: 8 } }, '收起'),
        ),
        h('div', { style: { height: 8, borderRadius: 999, background: 'rgba(127,127,127,.18)', overflow: 'hidden', margin: '4px 0 10px' } },
          h('div', { style: { height: '100%', width: `${percent}%`, background: progress?.error ? '#d64545' : 'linear-gradient(90deg,#4e7fff,#1a9e57)', transition: 'width .4s ease' } }),
        ),
        progress?.error ? h('div', { className: 'dl-note', style: { color: '#d64545' } }, `中断：${progress.error}`) : null,
        stages.length ? h('table', { className: 'dl-t' },
          h('thead', null, h('tr', null,
            h('th', { style: { width: 30 } }, '#'),
            h('th', null, '步骤'),
            h('th', { style: { width: 76 } }, '状态'),
            h('th', null, '进度'),
            h('th', { className: 'num', style: { width: 72 } }, '用时'),
          )),
          h('tbody', null, stages.map((s, i) => {
            const m = meta[s.status] || meta.pending
            return h('tr', { key: s.label, style: s.status === 'running' ? { color: '#4e7fff', fontWeight: 600 } : null },
              h('td', { className: 'num' }, i + 1),
              h('td', null, s.label),
              h('td', { style: { color: m.color, opacity: m.dim ?? 1, whiteSpace: 'nowrap' } }, `${m.icon} ${m.text}`),
              h('td', { style: { fontSize: 11.5, opacity: 0.85 } }, s.detail || (s.status === 'pending' ? '—' : '')),
              h('td', { className: 'num' }, fmtSec(s.seconds)),
            )
          })),
        ) : h('p', { className: 'dl-note' }, '已提交，正在获取进度…'),
        h('p', { className: 'dl-note' }, '下载全集 → 切镜抽帧 → 语音听写 → 清洗字幕 → 逐镜逆推 → 数据速览 → 事件索引 → 自动初稿 → 重建剧库索引。跑完这一栏就能「看拆解」。'),
      )
    }

    function RankingView({ dramas, onOpenDrama, onBreakdown }) {
      const [dates, setDates] = useState([])
      const [date, setDate] = useState('')
      const [data, setData] = useState(null)
      const [channel, setChannel] = useState('')
      const [trend, setTrend] = useState(null)
      const [weekDoc, setWeekDoc] = useState('')
      const [error, setError] = useState('')
      const [note, setNote] = useState('')
      const [reportKind, setReportKind] = useState('')
      const [reportFiles, setReportFiles] = useState([])
      const [reportDoc, setReportDoc] = useState('')
      const [reportName, setReportName] = useState('')

      function loadReport(kind, file) {
        setReportName(file)
        setReportDoc('')
        getJson(`/report?kind=${kind}&file=${encodeURIComponent(file)}`)
          .then((body) => setReportDoc(body.markdown ?? ''))
          .catch((e) => setError(e.message))
      }

      useEffect(() => {
        if (!reportKind) return
        setReportFiles([])
        setReportDoc('')
        setReportName('')
        getJson(`/reports?kind=${reportKind}`)
          .then((body) => {
            const files = body.files ?? []
            setReportFiles(files)
            if (files.length) loadReport(reportKind, files[0].file)
          })
          .catch((e) => setError(e.message))
      }, [reportKind])

      useEffect(() => {
        getJson('/rankings')
          .then((body) => {
            setDates(body.list ?? [])
            if (body.list?.length) setDate(body.list[0].date)
          })
          .catch((e) => setError(e.message))
        getJson('/trend').then(setTrend).catch(() => setTrend(null))
      }, [])

      useEffect(() => {
        if (!date) return
        setData(null)
        getJson(`/ranking?date=${encodeURIComponent(date)}`)
          .then(setData)
          .catch((e) => setError(e.message))
      }, [date])

      const run = (task, payload, label, after) => {
        setNote(`${label}：已提交…`)
        postJson('/run', { task, ...payload })
          .then((body) => {
            const id = body.job?.id
            setNote(`${label}：任务 ${id ?? ''} 运行中…`)
            if (!id) return
            const timer = setInterval(() => {
              getJson(`/jobs/${encodeURIComponent(id)}`)
                .then((job) => {
                  if (job.running) return
                  clearInterval(timer)
                  if (job.code === 0) {
                    setNote(`${label}：完成${after ? '，已刷新' : ''}`)
                    if (after) after()
                  } else {
                    setNote(`${label}：失败（退出码 ${job.code}），顶部「运行流水线」看日志`)
                  }
                })
                .catch(() => { clearInterval(timer) })
            }, 2000)
          })
          .catch((e) => setNote(`${label} 失败：${e.message}`))
      }

      const reload = () => {
        getJson('/rankings').then((body) => { setDates(body.list ?? []); if (body.list?.length) setDate(body.list[0].date) })
        getJson('/trend').then(setTrend).catch(() => setTrend(null))
      }

      const openWeek = () => {
        setWeekDoc('读取中…')
        getJson('/week-report')
          .then((body) => setWeekDoc(body.markdown))
          .catch((e) => setWeekDoc(`还没有趋势报告：${e.message}`))
      }

      const channels = data?.contents ?? []
      const active = channel || channels[0]?.id || ''
      const boards = channels.find((c) => c.id === active)?.boards ?? []

      const resolveDrama = (title) => {
        const base = String(title).split(/[：:]/)[0]
        return dramas.find((d) => d.series === base || d.name.startsWith(base)) ?? null
      }

      const champions = trend?.champions?.rows ?? []
      const up = trend?.movers?.up ?? []
      const genres = trend?.genres ?? []
      const coverage = trend?.meta?.coverage

      return h('div', null,
        h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
          h('span', { style: { fontSize: 11, opacity: 0.6 } }, '榜单日期'),
          h('select', {
            className: 'dl-field', value: date, onChange: (e) => setDate(e.target.value),
            style: { padding: '4px 8px', borderRadius: 7, border: '1px solid var(--dsh-border,rgba(127,127,127,.28))', background: 'transparent', color: 'inherit' },
          }, dates.map((d) => h('option', { key: d.date, value: d.date }, `${d.date} · ${d.boards} 榜 · ${d.dramas} 部`))),
          h('div', { className: 'dl-grow' }),
          h('button', { className: 'dl-btn', onClick: () => run('scan', {}, '实时抓榜', reload) }, '抓今日榜'),
          h('button', { className: 'dl-btn', onClick: () => run('week', { days: 7 }, '近七日趋势', reload) }, '跑近七日趋势'),
          h('button', { className: 'dl-btn', onClick: openWeek }, '看趋势报告'),
          h('button', { className: reportKind === 'daily' ? 'dl-btn dl-on' : 'dl-btn', onClick: () => setReportKind(reportKind === 'daily' ? '' : 'daily') }, '日报'),
          h('button', { className: reportKind === 'weekly' ? 'dl-btn dl-on' : 'dl-btn', onClick: () => setReportKind(reportKind === 'weekly' ? '' : 'weekly') }, '周报'),
          h('button', { className: reportKind === 'monthly' ? 'dl-btn dl-on' : 'dl-btn', onClick: () => setReportKind(reportKind === 'monthly' ? '' : 'monthly') }, '月报'),
        ),
        note ? h('div', { className: 'dl-note' }, note) : null,
        h(Err, { message: error || (data?.errors?.length ? `有 ${data.errors.length} 个榜单没抓到` : '') }),

        trend
          ? h('div', { className: 'dl-card' },
              h('h3', null, '近七日趋势', h('span', { className: 'n' }, `覆盖 ${coverage?.days ?? 0}/${coverage?.requested ?? 7} 天 · ${coverage?.from ?? ''} ~ ${coverage?.to ?? ''}`)),
              h('div', { className: 'dl-champ' },
                champions.map((row) => h('div', { key: row.date, className: 'dl-champ-row' },
                  h('span', { className: 'd' }, row.date.slice(5)),
                  h('span', { className: 't' }, row.title),
                  h('span', { className: 'h' }, row.heat ? `${row.heat} 万` : ''),
                )),
              ),
              h('div', { className: 'dl-two' },
                h('div', null,
                  h('div', { className: 'dl-lab' }, '爬升最快'),
                  up.slice(0, 5).map((row) => h('div', { key: row.title, className: 'dl-line' },
                    h('span', null, row.title),
                    h('span', { className: 'n' }, `${row.from}→${row.to}（+${row.delta}）`),
                  )),
                ),
                h('div', null,
                  h('div', { className: 'dl-lab' }, '题材部数（末日）'),
                  genres.slice(0, 5).map((row) => h('div', { key: row.genre, className: 'dl-line' },
                    h('span', null, row.genre),
                    h('span', { className: 'n' }, `${row.last}`),
                  )),
                ),
              ),
              h('p', { className: 'dl-note' }, '趋势只统计实际采到的快照；平台不给历史榜，缺的天数无法倒补。'),
            )
          : h('p', { className: 'dl-note' }, '还没有七日趋势：点「跑近七日趋势」生成（默认读写作/短剧扫榜里已有的日更档案 + 本流水线抓的实时榜）。'),

        weekDoc ? h('div', { className: 'dl-card' }, h(Markdown, { text: weekDoc, loading: false })) : null,

        reportKind
          ? h('div', { className: 'dl-card' },
              h('h3', null, `${reportKind === 'daily' ? '每日' : reportKind === 'weekly' ? '每周' : '每月'}排行汇报`,
                h('span', { className: 'n' }, `${reportFiles.length} 份 · 每天 09:05 自动扫榜`)),
              h('div', { className: 'dl-shelf' },
                reportFiles.slice(0, 14).map((f) => h('button', {
                  key: f.file,
                  className: reportName === f.file ? 'dl-chip dl-on' : 'dl-chip',
                  onClick: () => loadReport(reportKind, f.file),
                }, f.file.replace(/\.md$/, ''))),
              ),
              reportDoc
                ? h(Markdown, { text: reportDoc, loading: false })
                : h('p', { className: 'dl-note' }, reportFiles.length ? '选一份上面就读' : '还没有这类报告：先点「抓今日榜」，或等每天 09:05 的自动任务。'),
            )
          : null,

        h('div', { className: 'dl-chiprow' },
          channels.map((c) => h('button', {
            key: c.id, className: `dl-btn${c.id === active ? ' on' : ''}`, onClick: () => setChannel(c.id),
          }, c.name)),
        ),
        boards.length
          ? boards.map((board) => h('div', { className: 'dl-card', key: board.id },
              h('h3', null, board.name, h('span', { className: 'n' }, `${board.count ?? board.items?.length ?? 0} 条`)),
              h('table', { className: 'dl-t' },
                h('thead', null, h('tr', null,
                  h('th', { style: { width: 40 } }, '名次'),
                  h('th', null, '剧名'),
                  h('th', { className: 'num', style: { width: 54 } }, '集数'),
                  h('th', { className: 'num', style: { width: 108 } }, '热度'),
                  h('th', { style: { width: 128 } }, '操作'),
                )),
                h('tbody', null, (board.items ?? []).map((item) => {
                  const hit = resolveDrama(item.title)
                  return h('tr', { key: `${board.id}-${item.series_id}-${item.rank}` },
                    h('td', { className: 'num' }, item.rank),
                    h('td', null, item.title),
                    h('td', { className: 'num' }, item.episode_count ?? '—'),
                    h('td', { className: 'num' }, item.score ?? '—'),
                    h('td', null, h('div', { style: { display: 'flex', gap: 4 } },
                      hit ? h('button', { className: 'dl-btn', style: { padding: '1px 7px', fontSize: 11 }, onClick: () => onOpenDrama(hit.name) }, '看拆解') : null,
                      h('button', {
                        className: 'dl-btn' + (hit ? '' : ' on'),
                        style: { padding: '1px 7px', fontSize: 11 },
                        title: hit ? '重新跑一遍全流程（会覆盖该剧产物）' : '自动下载并拆解这部剧',
                        onClick: () => onBreakdown({
                          seriesId: String(item.series_id ?? ''),
                          dramaName: String(item.title ?? ''),
                        }, hit ? `重跑《${hit.name}》` : `拆解《${item.title}》`, String(item.title ?? '')),
                      }, hit ? '重跑' : '帮我拆解'),
                    )),
                  )
                })),
              ),
            ))
          : h('div', { className: 'dl-empty' }, data ? '这一层没有榜单' : '读取榜单中…'),
        h('p', { className: 'dl-note' }, '「帮我拆解」会在后台跑：下载全集 → 切镜 → 听写 → 逐镜逆推 → 数据速览 → 事件索引 → 自动初稿；跑完这一栏就能「看拆解」。榜单来自红果公开接口，热度是平台展示值，只做粗排序。'),
      )
    }

    // ---------- 视频 ----------
    function VideoView({ drama, stats, onPickShot }) {
      const [ep, setEp] = useState(1)
      const [sheet, setSheet] = useState(false)
      const total = drama?.counts?.raw || drama?.episodes || 0
      useEffect(() => { setEp(1); setSheet(false) }, [drama?.name])
      if (!drama) return h('div', { className: 'dl-empty' }, '左侧还没有剧库')
      const epInfo = stats?.data?.episodes?.find((row) => Number(row.ep) === Number(ep))
      const src = `${API}/media?name=${encodeURIComponent(drama.name)}&ep=${ep}`
      return h('div', null,
        h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
          h('strong', { style: { fontSize: 13 } }, drama.name),
          h('span', { className: 'dl-sub' }, `${total} 集 · ${fmt(drama.secPerShot, 2)} 秒/镜 · ${fmt(drama.cutsPerMin, 1)} 次/分`),
          h('div', { className: 'dl-grow' }),
          h('button', { className: 'dl-btn', onClick: () => setEp((v) => Math.max(1, v - 1)) }, '上一集'),
          h('button', { className: 'dl-btn', onClick: () => setEp((v) => Math.min(total, v + 1)) }, '下一集'),
          h('button', { className: `dl-btn${sheet ? ' on' : ''}`, onClick: () => setSheet((v) => !v) }, '五宫格'),
        ),
        total ? h('div', { className: 'dl-epgrid' }, Array.from({ length: total }, (_, index) =>
          h('button', { key: index + 1, className: `dl-ep${Number(ep) === index + 1 ? ' on' : ''}`, onClick: () => setEp(index + 1) }, index + 1),
        )) : null,
        total
          ? h('video', { className: 'dl-player', key: src, src, controls: true, preload: 'metadata', playsInline: true })
          : h('div', { className: 'dl-empty' }, '这一部还没有原片，先去「运行流水线」下载'),
        epInfo ? h('div', { className: 'dl-chiprow' },
          h('span', { className: 'dl-chip' }, '时长 ', h('b', null, `${fmt(epInfo.duration, 1)}s`)),
          h('span', { className: 'dl-chip' }, '镜头 ', h('b', null, String(epInfo.shots ?? '—'))),
          h('span', { className: 'dl-chip' }, '台词 ', h('b', null, String(epInfo.chars ?? '—')), ' 字'),
          h('span', { className: 'dl-chip' }, '切镜 ', h('b', null, fmt(epInfo.cpm, 1)), ' 次/分'),
          h('span', { className: 'dl-chip' }, '末句 ', h('b', null, epInfo.last || '—')),
        ) : null,
        sheet ? h('img', { src: `${API}/asset?name=${encodeURIComponent(drama.name)}&kind=contact&ep=${ep}`, style: { width: '100%', borderRadius: 10, marginTop: 8 } }) : null,
        h('div', { style: { marginTop: 10 } },
          h('button', { className: 'dl-btn', onClick: () => onPickShot(ep) }, '逐镜拆解这一集 →'),
        ),
        h('p', { className: 'dl-note' }, '原片是本地已解密的 360p 竖屏文件，只在本机播放；右侧「五宫格」是每集 25 帧缩略图，用来快速找重场戏。'),
      )
    }

    // ---------- 拆解 ----------
    function BreakdownView({ drama, stats, initialEp }) {
      const [ep, setEp] = useState(initialEp || 1)
      const [mode, setMode] = useState('shots')
      const [episode, setEpisode] = useState({ loading: false, data: null, error: '' })
      const [doc, setDoc] = useState({ loading: false, markdown: '', error: '' })
      const total = drama?.counts?.scripts || drama?.episodes || 0

      useEffect(() => { if (initialEp) setEp(initialEp) }, [initialEp])
      useEffect(() => { setEp(1) }, [drama?.name])
      useEffect(() => {
        if (!drama || mode !== 'shots') return
        let alive = true
        setEpisode({ loading: true, data: null, error: '' })
        getJson(`/episode?name=${encodeURIComponent(drama.name)}&ep=${ep}`)
          .then((data) => alive && setEpisode({ loading: false, data, error: '' }))
          .catch((error) => alive && setEpisode({ loading: false, data: null, error: error.message }))
        return () => { alive = false }
      }, [drama?.name, ep, mode])

      useEffect(() => {
        if (!drama || mode === 'shots') return
        let alive = true
        setDoc({ loading: true, markdown: '', error: '' })
        getJson(`/markdown?name=${encodeURIComponent(drama.name)}&file=${mode}`)
          .then((data) => alive && setDoc({ loading: false, markdown: data.markdown, error: '' }))
          .catch((error) => alive && setDoc({ loading: false, markdown: '', error: error.message }))
        return () => { alive = false }
      }, [drama?.name, mode])

      if (!drama) return h('div', { className: 'dl-empty' }, '左侧还没有剧库')

      const docTabs = [
        ['shots', '逐镜'],
        ['report', '拆解报告'],
        ['overview', '数据速览'],
        ['card', '剧情库卡片'],
        ['structure', '结构逆推'],
      ]

      return h('div', null,
        h('div', { className: 'dl-chiprow', style: { marginTop: 0 } },
          docTabs.map(([id, label]) => h('button', { key: id, className: `dl-btn${mode === id ? ' on' : ''}`, onClick: () => setMode(id) }, label)),
        ),
        mode === 'shots' ? h('div', null,
          h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
            h('strong', null, drama.name),
            h('span', { className: 'dl-sub' }, `${total} 集`),
            h('div', { className: 'dl-grow' }),
            h('button', { className: 'dl-btn', onClick: () => setEp((v) => Math.max(1, v - 1)) }, '上一集'),
            h('button', { className: 'dl-btn', onClick: () => setEp((v) => Math.min(total, v + 1)) }, '下一集'),
          ),
          h('div', { className: 'dl-epgrid' }, Array.from({ length: total }, (_, index) =>
            h('button', { key: index + 1, className: `dl-ep${Number(ep) === index + 1 ? ' on' : ''}`, onClick: () => setEp(index + 1) }, index + 1),
          )),
          h(Err, { message: episode.error }),
          episode.loading ? h('div', { className: 'dl-empty' }, '读取逐镜…') : null,
          episode.data ? h('div', null,
            h('div', { className: 'dl-chiprow' },
              h('span', { className: 'dl-chip' }, 'EP', h('b', null, pad(ep))),
              h('span', { className: 'dl-chip' }, '镜头 ', h('b', null, String(episode.data.shots.length))),
              h('span', { className: 'dl-chip' }, '台词 ', h('b', null, String(episode.data.lines.length)), ' 句'),
            ),
            h('div', { className: 'dl-shots' }, episode.data.shots.map((shot) =>
              h('div', { className: 'dl-shot', key: shot.no },
                h('div', { className: 'idx' }, `#${String(shot.no).padStart(2, '0')}\n${fmt(shot.start, 1)}–${fmt(shot.end, 1)}s\n${fmt(shot.dur, 2)}s`),
                h('img', { loading: 'lazy', src: `${API}/frame?name=${encodeURIComponent(drama.name)}&ep=${ep}&shot=${shot.no}`, alt: '' }),
                h('div', { className: 'say' },
                  shot.lines.length
                    ? shot.lines.map((line, index) => h('div', { key: index }, line))
                    : h('span', { className: 'none' }, '无台词'),
                ),
              ),
            )),
          ) : null,
        ) : h('div', null,
          h(Err, { message: doc.error }),
          h(Markdown, { text: doc.markdown, loading: doc.loading }),
        ),
      )
    }

    // ---------- 知识库 ----------
    function KnowledgeView({ dramas, series }) {
      const [kind, setKind] = useState({ type: 'modes' })
      const [doc, setDoc] = useState({ loading: false, markdown: '', error: '' })

      useEffect(() => {
        let alive = true
        let request = null
        if (kind.type === 'modes') request = getJson('/modes')
        else if (kind.type === 'card') request = getJson(`/markdown?name=${encodeURIComponent(kind.name)}&file=card`)
        else if (kind.type === 'report') request = getJson(`/markdown?name=${encodeURIComponent(kind.name)}&file=report`)
        if (!request) return
        setDoc({ loading: true, markdown: '', error: '' })
        request
          .then((data) => alive && setDoc({ loading: false, markdown: data.markdown, error: '' }))
          .catch((error) => alive && setDoc({ loading: false, markdown: '', error: error.message }))
        return () => { alive = false }
      }, [kind])

      return h('div', { className: 'dl-split' },
        h('div', { className: 'dl-side' },
          h('button', { className: `dl-item${kind.type === 'modes' ? ' on' : ''}`, onClick: () => setKind({ type: 'modes' }) }, '跨剧模式库'),
          h('div', { className: 'dl-sub', style: { margin: '8px 4px 2px' } }, '卡片'),
          dramas.map((d) => h('button', {
            key: `card-${d.name}`,
            className: `dl-item${kind.type === 'card' && kind.name === d.name ? ' on' : ''}`,
            onClick: () => setKind({ type: 'card', name: d.name }),
          }, d.name)),
          h('div', { className: 'dl-sub', style: { margin: '8px 4px 2px' } }, '报告'),
          dramas.map((d) => h('button', {
            key: `report-${d.name}`,
            className: `dl-item${kind.type === 'report' && kind.name === d.name ? ' on' : ''}`,
            onClick: () => setKind({ type: 'report', name: d.name }),
          }, d.name)),
        ),
        h('div', null,
          h(Err, { message: doc.error }),
          h(Markdown, { text: doc.markdown, loading: doc.loading }),
        ),
      )
    }

    // ---------- 剧情 ----------
    function StoryView({ drama, series, seriesHasReport }) {
      const [mode, setMode] = useState('structure')
      const [doc, setDoc] = useState({ loading: false, markdown: '', error: '' })
      const [table, setTable] = useState({ loading: false, header: [], rows: [], error: '' })

      useEffect(() => { setMode('structure') }, [drama?.name])

      useEffect(() => {
        if (!drama) return undefined
        let alive = true
        if (mode === 'table') {
          setTable({ loading: true, header: [], rows: [], error: '' })
          getJson(`/episodes-table?name=${encodeURIComponent(drama.name)}`)
            .then((data) => alive && setTable({ loading: false, header: data.header, rows: data.rows, error: '' }))
            .catch((error) => alive && setTable({ loading: false, header: [], rows: [], error: error.message }))
          return () => { alive = false }
        }
        const file = mode === 'structure' ? 'structure' : mode === 'beats' ? 'beats' : null
        const request = file
          ? getJson(`/markdown?name=${encodeURIComponent(drama.name)}&file=${file}`)
          : mode === 'series' && series
            ? getJson(`/series-report?series=${encodeURIComponent(series)}`)
            : null
        if (!request) return undefined
        setDoc({ loading: true, markdown: '', error: '' })
        request
          .then((data) => alive && setDoc({ loading: false, markdown: data.markdown, error: '' }))
          .catch((error) => alive && setDoc({ loading: false, markdown: '', error: error.message }))
        return () => { alive = false }
      }, [drama?.name, mode, series])

      if (!drama) return h('div', { className: 'dl-empty' }, '左侧还没有剧库')

      const tabs = [['structure', '剧情结构逆推'], ['beats', '事件时间线'], ['table', '分集表']]
      if (seriesHasReport) tabs.push(['series', '系列总报告'])

      return h('div', null,
        h('div', { className: 'dl-chiprow', style: { marginTop: 0 } },
          tabs.map(([id, label]) => h('button', { key: id, className: `dl-btn${mode === id ? ' on' : ''}`, onClick: () => setMode(id) }, label)),
        ),
        h(Err, { message: doc.error || table.error }),
        mode === 'table'
          ? (table.loading ? h('div', { className: 'dl-empty' }, '读取分集表…')
            : h('table', { className: 'dl-t' },
                h('thead', null, h('tr', null, table.header.map((cell, index) => h('th', { key: index }, cell)))),
                h('tbody', null, table.rows.map((row, ri) => h('tr', { key: ri }, row.map((cell, ci) =>
                  h('td', { key: ci, className: /^\d/.test(cell) ? 'num' : undefined }, cell),
                )))),
              ))
          : h(Markdown, { text: doc.markdown, loading: doc.loading }),
      )
    }

    // ---------- 预测 ----------
    const FORECAST_FIELDS = [
      ['episodes', '集数', 100, 1],
      ['secPerShot', '秒/镜', 3.2, 0.05],
      ['cutsPerMin', '切镜率（次/分）', 18.5, 0.1],
      ['charsPerMin', '台词密度（字/分）', 190, 1],
      ['zeroStart', '首句 0 秒占比（%）', 95, 1],
      ['under3', '<3 秒镜头占比（%）', 60, 1],
      ['tail', '末句后留白（秒）', 4.8, 0.1],
    ]

    function ForecastView() {
      const [plan, setPlan] = useState({
        episodes: 100, secPerShot: 3.2, cutsPerMin: 18.5, charsPerMin: 190,
        zeroStart: 95, under3: 60, tail: 4.8, ending: 'closed', breakAt: 'none',
      })
      const [result, setResult] = useState(null)
      const [corpus, setCorpus] = useState([])
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState('')

      useEffect(() => {
        postJson('/forecast', {})
          .then((data) => setCorpus(data.corpus ?? []))
          .catch((e) => setError(e.message))
      }, [])

      const run = () => {
        setBusy(true)
        setError('')
        postJson('/forecast', plan)
          .then((data) => { setResult(data); setCorpus(data.corpus ?? corpus) })
          .catch((e) => setError(e.message))
          .finally(() => setBusy(false))
      }

      const set = (key) => (event) => setPlan({ ...plan, [key]: event.target.value })

      return h('div', null,
        h('p', { className: 'dl-note' }, '输入一套新剧的开场与节奏参数，用十季实测样本算一个「爆款潜力分」。模型是透明的：把参数换算成对标样本里的 z 分数，按固定权重加权，再按断季、结尾、切镜率做加减；不是黑箱，也不保证结果。'),
        h('div', { className: 'dl-form' },
          FORECAST_FIELDS.map(([key, label, , step]) =>
            h('label', { className: 'dl-field', key },
              h('span', null, label),
              h('input', { type: 'number', step, value: plan[key], onChange: set(key) }),
            ),
          ),
          h('label', { className: 'dl-field' },
            h('span', null, '结尾类型'),
            h('select', { value: plan.ending, onChange: set('ending') },
              h('option', { value: 'closed' }, '闭环 / 甜点收尾'),
              h('option', { value: 'bittersweet' }, '苦甜 / 半开'),
              h('option', { value: 'open' }, '伪闭 / 挂下一季'),
            ),
          ),
          h('label', { className: 'dl-field' },
            h('span', null, '断季位置'),
            h('select', { value: plan.breakAt, onChange: set('breakAt') },
              h('option', { value: 'none' }, '不断季 / 整季闭合'),
              h('option', { value: 'climax' }, '断在总攻前（长引信）'),
            ),
          ),
        ),
        h('div', { style: { marginTop: 10 } }, h('button', { className: 'dl-btn', disabled: busy, onClick: run }, busy ? '计算中…' : '算一算')),
        h(Err, { message: error }),
        result ? h('div', { style: { marginTop: 14 } },
          h('div', { className: 'dl-score' },
            h('b', null, String(result.score)),
            h('span', { className: 'band' }, result.band),
            h('span', { className: 'dl-sub' }, `对标样本 ${result.corpusSize} 部 · ${result.formula}`),
          ),
          result.notes?.length ? h('div', null, result.notes.map((note, index) => h('p', { className: 'dl-note', key: index }, `· ${note}`))) : null,
          h('div', { className: 'dl-card', style: { marginTop: 10 } },
            h('h3', null, '驱动项'),
            h('table', { className: 'dl-t' },
              h('thead', null, h('tr', null, h('th', null, '参数'), h('th', { className: 'num' }, '你的值'), h('th', { className: 'num' }, '样本均值'), h('th', { className: 'num' }, 'z'), h('th', { className: 'num' }, '贡献'))),
              h('tbody', null, result.drivers.map((row) => h('tr', { key: row.key },
                h('td', null, row.label),
                h('td', { className: 'num' }, row.value),
                h('td', { className: 'num' }, row.corpusMean),
                h('td', { className: 'num' }, row.z.toFixed(2)),
                h('td', { className: 'num' }, row.contribution.toFixed(3)),
              ))),
            ),
          ),
          h('div', { className: 'dl-card' },
            h('h3', null, '最像的三部'),
            h('table', { className: 'dl-t' },
              h('thead', null, h('tr', null, h('th', null, '剧'), h('th', { className: 'num' }, '集数'), h('th', { className: 'num' }, '秒/镜'), h('th', { className: 'num' }, '切镜'), h('th', { className: 'num' }, '字/分'), h('th', { className: 'num' }, '距离'))),
              h('tbody', null, result.comparables.map((row) => h('tr', { key: row.name },
                h('td', null, row.name),
                h('td', { className: 'num' }, row.episodes),
                h('td', { className: 'num' }, fmt(row.secPerShot, 2)),
                h('td', { className: 'num' }, fmt(row.cpm, 1)),
                h('td', { className: 'num' }, fmt(row.charsPerMin, 0)),
                h('td', { className: 'num' }, row.distance),
              ))),
            ),
          ),
        ) : null,
        corpus.length ? h('div', { className: 'dl-card', style: { marginTop: 12 } },
          h('h3', null, '对标样本（十季实测）'),
          h('table', { className: 'dl-t' },
            h('thead', null, h('tr', null, h('th', null, '剧'), h('th', { className: 'num' }, '集数'), h('th', { className: 'num' }, '秒/镜'), h('th', { className: 'num' }, '切镜'), h('th', { className: 'num' }, '字/分'))),
            h('tbody', null, corpus.map((row) => h('tr', { key: row.name },
              h('td', null, row.name),
              h('td', { className: 'num' }, row.episodes),
              h('td', { className: 'num' }, fmt(row.secPerShot, 2)),
              h('td', { className: 'num' }, fmt(row.cpm, 1)),
              h('td', { className: 'num' }, fmt(row.charsPerMin, 0)),
            ))),
          ),
        ) : null,
      )
    }

    // ---------- 流水线 ----------
    function PipelineDrawer({ library, open, onClose }) {
      const [tasks, setTasks] = useState([])
      const [task, setTask] = useState('download')
      const [name, setName] = useState('')
      const [from, setFrom] = useState('')
      const [to, setTo] = useState('')
      const [force, setForce] = useState(false)
      const [log, setLog] = useState('')
      const [busy, setBusy] = useState(false)

      useEffect(() => {
        if (!open) return
        getJson('/config').then((data) => setTasks(data.tasks ?? [])).catch(() => {})
      }, [open])

      useEffect(() => {
        if (!open) return
        if (!name && library?.dramas?.length) setName(library.dramas[0].name)
      }, [open, library, name])

      const run = async () => {
        setBusy(true)
        setLog('提交中…\n')
        try {
          const payload = { task, name, from: from || undefined, to: to || undefined, force }
          const { job } = await postJson('/run', payload)
          setLog((prev) => prev + `job ${job.id} ${job.task}\n`)
          let last = 0
          const timer = setInterval(async () => {
            try {
              const data = await getJson(`/jobs/${job.id}`)
              const rows = (data.lines ?? []).slice(last)
              last = (data.lines ?? []).length
              if (rows.length) setLog((prev) => prev + rows.join('\n') + '\n')
              if (!data.running) {
                clearInterval(timer)
                setBusy(false)
                setLog((prev) => prev + `[exit ${data.code ?? '?'}]\n`)
              }
            } catch (error) {
              clearInterval(timer)
              setBusy(false)
              setLog((prev) => prev + `ERROR ${error.message}\n`)
            }
          }, 2000)
        } catch (error) {
          setBusy(false)
          setLog((prev) => prev + `ERROR ${error.message}\n`)
        }
      }

      if (!open) return null
      return h('div', { className: 'dl-card' },
        h('h3', null, '运行流水线', h('span', { className: 'n' }, 'Host 侧直接跑 bin/*.mjs'),
          h('div', { className: 'dl-grow' }),
          h('button', { className: 'dl-btn', onClick: onClose }, '收起')),
        h('div', { className: 'dl-form' },
          h('label', { className: 'dl-field' }, h('span', null, '步骤'),
            h('select', { value: task, onChange: (e) => setTask(e.target.value) }, tasks.map((t) => h('option', { key: t.id, value: t.id }, t.title))),
          ),
          h('label', { className: 'dl-field' }, h('span', null, '剧目'),
            h('select', { value: name, onChange: (e) => setName(e.target.value) }, (library?.dramas ?? []).map((d) => h('option', { key: d.name, value: d.name }, d.name))),
          ),
          h('label', { className: 'dl-field' }, h('span', null, '起始集'), h('input', { value: from, onChange: (e) => setFrom(e.target.value), placeholder: '可空' })),
          h('label', { className: 'dl-field' }, h('span', null, '结束集'), h('input', { value: to, onChange: (e) => setTo(e.target.value), placeholder: '可空' })),
          h('label', { className: 'dl-field' }, h('span', null, '强制重下'),
            h('select', { value: force ? '1' : '', onChange: (e) => setForce(e.target.value === '1') },
              h('option', { value: '' }, '否'),
              h('option', { value: '1' }, '是'),
            ),
          ),
        ),
        h('div', { style: { marginTop: 8 } }, h('button', { className: 'dl-btn', disabled: busy, onClick: run }, busy ? '运行中…' : '运行')),
        h('pre', { className: 'dl-log', style: { marginTop: 10 } }, log || '（日志会在这里出现）'),
        h('p', { className: 'dl-note' }, '「听写」会调用本机 mlx_whisper，100 集约 10 分钟；「下载」请别并发超过 1 个，平台会按匿名设备限流。'),
      )
    }

    function Panel() {
      const [library, setLibrary] = useState(null)
      const [tab, setTab] = useState('rank')
      const [dramaName, setDramaName] = useState('')
      const [sheetEp, setSheetEp] = useState(0)
      const [runOpen, setRunOpen] = useState(false)
      const [error, setError] = useState('')
      const [bd, setBd] = useState(null)

      const loadLibrary = () => {
        getJson('/library')
          .then((data) => {
            setLibrary(data)
            if (data.dramas?.length) setDramaName((current) => current || data.dramas[0].name)
          })
          .catch((e) => setError(e.message))
      }

      useEffect(() => { loadLibrary() }, [])

      // 一键拆解：提交后轮询 /jobs/:id 的 progress，驱动进度表
      const startBreakdown = (payload, label, title) => {
        setError('')
        postJson('/run', { task: 'breakdown', ...payload })
          .then((body) => {
            const id = body.job?.id
            if (!id) { setError(`${label} 提交失败`); return }
            setBd({ id, label, title, progress: null, running: true, code: null })
          })
          .catch((e) => setError(`${label} 失败：${e.message}`))
      }

      useEffect(() => {
        if (!bd?.id) return
        let alive = true
        let timer = null
        const tick = () => {
          getJson(`/jobs/${encodeURIComponent(bd.id)}`)
            .then((job) => {
              if (!alive) return
              setBd((cur) => (cur && cur.id === bd.id ? { ...cur, progress: job.progress ?? cur.progress, running: job.running, code: job.code } : cur))
              if (job.running) {
                timer = setTimeout(tick, 1500)
              } else {
                if (job.code === 0) loadLibrary()
                setError(job.code === 0 ? '' : `${bd.label}：失败（退出码 ${job.code}）`)
              }
            })
            .catch(() => { if (alive) timer = setTimeout(tick, 3000) })
        }
        tick()
        return () => { alive = false; if (timer) clearTimeout(timer) }
      }, [bd?.id])

      const dramas = library?.dramas ?? []
      const drama = dramas.find((d) => d.name === dramaName) ?? dramas[0] ?? null
      const stats = useDramaStats(drama && (tab === 'video' || tab === 'breakdown') ? drama.name : '')
      const seriesHasReport = Boolean(drama && library?.seriesFiles?.[drama.series])

      const openDrama = (name) => {
        setDramaName(name)
        setTab('breakdown')
      }

      return h('div', { className: 'dl-root' },
        h('style', null, CSS),
        h('div', { className: 'dl-head' },
          h('h1', null, '短剧拆解台'),
          h('span', { className: 'dl-sub' }, library ? `${dramas.length} 部 · ${library.series?.length ?? 0} 个系列` : '读取剧库…'),
          h('div', { className: 'dl-grow' }),
          drama && tab !== 'rank' && tab !== 'knowledge' && tab !== 'forecast'
            ? h('select', { value: drama.name, onChange: (e) => setDramaName(e.target.value), style: { maxWidth: 240, padding: '4px 8px', borderRadius: 7, border: '1px solid var(--dsh-border,rgba(127,127,127,.28))', background: 'transparent', color: 'inherit', fontSize: 12 } },
                dramas.map((d) => h('option', { key: d.name, value: d.name }, d.name)),
              )
            : null,
          h('button', { className: `dl-btn${runOpen ? ' on' : ''}`, onClick: () => setRunOpen((v) => !v) }, '运行流水线'),
        ),
        h('div', { className: 'dl-tabs' }, TABS.map((item) =>
          h('button', { key: item.id, className: `dl-tab${tab === item.id ? ' on' : ''}`, onClick: () => setTab(item.id) }, item.label),
        )),
        h('div', { className: 'dl-body' },
          h(Err, { message: error }),
          bd ? h(BreakdownProgress, { job: bd, onClose: () => setBd(null) }) : null,
          runOpen ? h(PipelineDrawer, { library, open: runOpen, onClose: () => setRunOpen(false) }) : null,
          tab === 'rank' ? h(RankingView, { dramas, onOpenDrama: openDrama, onBreakdown: startBreakdown }) : null,
          tab === 'video' ? h(VideoView, { drama, stats, onPickShot: (ep) => { setSheetEp(ep); setTab('breakdown') } }) : null,
          tab === 'breakdown' ? h(BreakdownView, { drama, stats, initialEp: sheetEp }) : null,
          tab === 'knowledge' ? h(KnowledgeView, { dramas, series: library?.series }) : null,
          tab === 'story' ? h(StoryView, { drama, series: drama?.series, seriesHasReport }) : null,
          tab === 'forecast' ? h(ForecastView, null) : null,
          tab === 'hongguo' ? h(HongguoView, null) : null,
        ),
      )
    }

    function RailIcon({ size }) {
      return h('svg', { width: size ?? 18, height: size ?? 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' },
        h('rect', { x: 3, y: 4, width: 18, height: 16, rx: 3 }),
        h('path', { d: 'M3 9h18' }),
        h('path', { d: 'M8 4l2.5 5M15 4l2.5 5' }),
        h('path', { d: 'M8 14.5l3 2-3 2z' }),
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID }, Panel))
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 6, label: () => '短剧拆解台' }, RailIcon),
        )
      },
    }
  },
})
