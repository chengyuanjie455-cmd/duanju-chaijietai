# 架构与数据流（ARCHITECTURE）

## 一句话

`pipeline/` 是一条**文件驱动的流水线**：每一步从上一阶段的文件读输入，把结果写成新的普通文件；`plugin/` 只是这些文件的**可视化外壳**——它读文件、并在 Host 侧 `spawn node bin/*.mjs` 触发新步骤。两者通过「同一个 `pipelineRoot` 目录」解耦，互不 import。

```
              ┌──────────────── plugin/（DSH 左侧边栏）────────────────┐
              │ client.js  ←HTTP→  index.js                           │
              │  七栏目面板           /api/drama-lab/*                │
              │                        ├─ 读 剧库/data/reports 下的文件 │
              │                        └─ spawn node bin/<step>.mjs   │
              └────────────────────────────┬──────────────────────────┘
                                           │ 同一个 pipelineRoot
┌──────────────────────────────────────────▼───────────────────────────┐
│ pipeline/                                                             │
│                                                                       │
│  scan.mjs ─► download.mjs ─► decompose.mjs ─► asr.mjs ─► structure.mjs │
│                                     │            │            │        │
│                              stats.mjs ─────────┘            │        │
│                                     ▼                         ▼        │
│                              beats.mjs               分集表.csv        │
│  index.mjs / series-stats.mjs / auto-report.mjs / week.mjs / report-*  │
└───────────────────────────────────────────────────────────────────────┘
```

## 每一步的输入 / 输出

| 步 | 脚本 | 主要输入 | 主要输出 | 实现要点 |
|---|---|---|---|---|
| 01 扫榜 | `scan.mjs` | 红果公开榜单接口 | `data/rankings/<date>.json`（原始快照）、`data/rankings/snapshots/<date>_<stamp>.json`、`reports/<date>-红果榜单.md` | 遍历 6 频道 32 榜；把「998万」类中文热度解析成数值 |
| 02 下载 | `download.mjs` | 剧目 ID | `剧库/<剧名>/raw/EPxxx.mp4`、`meta.json` | 优先插件宿主解密路由，SDK 直连兜底；断点续传、失败重试 |
| 03 切镜 | `decompose.mjs` | `raw/*.mp4` | `拆解/EPxxx/shots.csv`、`shots/*.jpg`、`contact.jpg`、`shots.json`、`meta.json` | ffmpeg `select='gt(scene,0.3)'` 切镜；逐镜抽**中位帧**；5×5 九宫格 |
| 04 听写 | `asr.mjs` | `raw/*.mp4` | `字幕/EPxxx.srt`、`字幕/EPxxx.txt`、`全集字幕.md` | 本地 MLX Whisper large-v3-turbo；`--prompt` 喂人名/术语、抑制复读 |
| 04b 清洗 | `clean-subs.mjs` | `字幕/*.srt` | 清洗后的 `字幕/*.srt` | 去复读、统一标点 |
| 05 逆推 | `structure.mjs` | `shots.json` + `字幕/*.srt` | `剧本逆推/EPxxx.md`、`剧本逆推/EPxxx.json`、`剧本逆推/分集表.csv/json` | 镜头时间区间 × 字幕 cue 按**时间重叠**合并成逐镜台词表 |
| 05b 速览 | `stats.mjs` | 各集 `meta.json` + `字幕` | `拆解/数据速览.md`、`拆解/stats.json` | 纯统计：秒/镜、切镜率分位、台词密度分数、首句位置、末句静默 |
| 07 事件 | `beats.mjs` | `字幕` | `拆解/事件索引.csv`、`拆解/事件时间线.md` | 8 类关键词（战斗/危机/感情/朝堂/计谋/穿越/结盟/喜剧）打标签，每 10 集一段列重场戏与首尾台词 |
| 08 系列 | `series-stats.mjs` | 多季 `stats.json` | `剧库/<系列>·系列总览.md`、`series.json` | 硬指标汇总、结尾类型分布、季间对比 |
| 06 索引 | `index.mjs` | `剧库/*/` | `剧库/README.md`、`剧库/index.json` | 汇总集数、时长、镜率、热度、题材标签、完成度 |
| 报告 | `auto-report.mjs` | `stats.json` + `分集表` | `拆解/拆解报告.md` 等结构初稿 | 只出机械骨架；判断类文字配 `prompts/` 精修 |

`breakdown.mjs` = 02→06 的串联调度器；`run-batch.sh` 逐行读剧单调用 `breakdown`。

## 文件格式

### 单集 `拆解/EPxxx/shots.csv`

```
shot,start,end,dur,keyframe
1,0.00,2.31,2.31,shots/01.jpg
2,2.31,4.90,2.59,shots/02.jpg
```

### 单集 `拆解/EPxxx/meta.json`

```jsonc
{
  "number": 1,
  "duration": 92.5,
  "resolution": "1080x1920",
  "fps": 30,
  "codec": "h264",
  "has_audio": true,
  "shots": 47,
  "cuts_per_minute": 30.5,
  "shot_median": 1.8,
  "shot_mean": 1.97,
  "under_3s": 39,
  "under_1s": 6,
  "longest": 6.2
}
```

### 剧目 `剧库/<剧名>/meta.json`

```jsonc
{
  "series_id": "…",
  "title": "某剧",
  "description": "…",
  "episode_count": 80,
  "heat": 12345678,
  "tags": ["都市", "逆袭"],
  "source": "红果短剧 · openhongguo 匿名设备 · 仅个人研究",
  "fetched_at": "2026-01-01T00:00:00.000Z",
  "episodes": [{ "number": 1, "id": "…", "title": "", "playable": true, "duration_hint": 92 }]
}
```

### 全季 `拆解/stats.json`

```jsonc
{
  "series": "某剧",
  "episodes": 80,
  "total_minutes": 122.4,
  "total_shots": 3760,
  "sec_per_shot": 1.95,
  "shot_median": 1.8,
  "cuts_per_min": { "mean": 30.5, "q1": 24.1, "median": 29.0, "q3": 35.2, "min": 12.0, "max": 51.0 },
  "under3_ratio": 83.1,
  "under1_shots": 214,
  "longest_shot": 9.8,
  "ep_duration": { "min": 80.0, "max": 110.0, "mean": 91.8, "buckets": {}, "shortest_ep": 3, "longest_ep": 12 },
  "dialogue": {
    "chars_total": 41200, "chars_per_min": 336.6, "per_ep_median": 480,
    "with_dialogue_ratio": 61.2, "coverage_ratio": 58.4,
    "peak": [[7, 520.1], [1, 498.0], [3, 470.2]],
    "valley": [[9, 180.4], [14, 210.9], [2, 240.0]]
  }
}
```

### 榜单 `data/rankings/<date>.json`

`{ date, generated_at, boards: [ { channel, board, items: [ { rank, title, series_id, heat, episode_count, … } ] } ] }` —— 结构随接口字段，原样快照。

### 索引 `剧库/index.json` / `剧库/README.md`

`index.json` 是每部剧一行的机读汇总（集数、时长、镜率、热度、标签、完成度、产物清单）；`README.md` 是同一份内容的人读表格。

## 插件与流水线的边界

- 插件**不复制**任何下载/解密/听写逻辑；它只：
  1. 读 `pipelineRoot` 下 `剧库/`、`data/rankings`、`reports/` 里的文件渲染面板；
  2. 通过 `/api/drama-lab/run` 在 Host 侧 `spawn` 对应 `bin/*.mjs`，把 stdout 每 ~2s 回流到「运行」抽屉。
- `pipelineRoot` 由 `plugin/cordis.patch.yml` 的 `config.pipelineRoot`（或环境变量 `DSH_DRAMA_LAB_ROOT`）指定，`index.js` 里 `resolveRoot()` 读取；找不到时 fallback 到 `~/Documents/short-drama-lab/pipeline`。
- 因此：**流水线可单独用命令行跑**，插件只是可选的图形前端。

## 平台边界

- 除 `asr.mjs`（mlx_whisper，Apple Silicon）外，其余步骤只依赖 Node + ffmpeg，跨平台。
- 听写换其他 ASR 时，只要产出同名 `字幕/EPxxx.srt`，下游 `structure/stats/beats` 无需改动。
