# 短剧拆解台 · short-drama-lab

> 把「红果扫榜 → 全集下载 → 逐镜切分 → 本地听写 → 剧情逆推 → 数据速览 → 剧情库」整条链路，
> 做成一个**可以点的左侧边栏工作台**，并附带一套**命令行流水线**。

![status](https://img.shields.io/badge/status-personal%20research-orange)
![node](https://img.shields.io/badge/node-%E2%89%A520-339933)
![platform](https://img.shields.io/badge/platform-macOS%20(Apple%20Silicon)-lightgrey)
![license](https://img.shields.io/badge/license-MIT-blue)

---

## ⚠️ 先读这段（合规与免责，重要）

- 本项目是一个**个人学习 / 研究用**的短剧结构拆解工具，数据来自红果短剧的**公开接口**。
- **请勿**传播原片、字幕、关键帧；**请勿**商用；**请勿**二次上传。仓库本身**不包含任何影视素材**（原片、字幕、截图都不带）。
- 请自控请求频率，别对平台造成压力；因使用产生的任何后果由使用者自行承担。
- 本项目与红果 / 抖音官方**无关**。

---

## 这是什么

它由两半组成，缺一不可：

| 半 | 目录 | 作用 |
|---|---|---|
| **流水线（引擎）** | [`pipeline/`](./pipeline/) | 纯 Node 脚本：扫榜、下载、ffmpeg 切镜、本地 Whisper 听写、逐镜逆推、统计、出报告 |
| **工作台（界面）** | [`plugin/`](./plugin/) | DSH（DeepSeek Harness）Web GUI 的左侧边栏插件「短剧拆解台」，把上面的脚本变成可点按钮 + 可视化面板 |

工作台**不复制**任何下载/解密/听写逻辑，它只是读取流水线目录（`pipelineRoot`）里的文件、并在 Host 侧 `spawn node bin/*.mjs`。所以**两个目录要一起装**，别人才能「拿来就能用」。

📖 **完整制作说明见 [制作说明.md](./制作说明.md)**（一份顶两份：使用者的安装/用法 + 开发者的架构/代码地图/二次开发）。打包发给他人先看 [HANDOVER.md](./HANDOVER.md)。

## 架构

```
┌──────────────────── DSH Web GUI · 左侧边栏「短剧拆解台」────────────────────┐
│  dsh-drama-lab 插件（plugin/）                                              │
│  扫榜 · 视频 · 拆解 · 知识库 · 剧情 · 摸鱼短剧 · 预测                        │
│        │  HTTP 路由 /api/drama-lab/*        │ 点按钮 → Host 侧 spawn          │
└────────┼────────────────────────────────────┼───────────────────────────────┘
         │ 读文件                               │ node bin/xxx.mjs
┌────────▼────────────────────────────────────▼───────────────────────────────┐
│  短剧拆解流水线（pipeline/）                                                  │
│                                                                              │
│  scan ─► download ─► decompose ─► asr ─► structure ─► stats ─► beats         │
│    │        │           │           │        │           │         │         │
│  data/    剧库/<剧>/    拆解/<集>/   字幕/    剧本逆推/   数据速览   事件索引   │
│  rankings   raw/*.mp4   shots/      *.srt    *.md       .md       .csv       │
│                                                                              │
│  index / auto-report / series-stats / week / report-*  → 报告与剧情库索引      │
└──────────────────────────────────────────────────────────────────────────────┘
   外部依赖：红果公开接口(openhongguo SDK) · ffmpeg/ffprobe · mlx_whisper(本地 ASR)
```

## 七个栏目

| 栏目 | 内容 |
|---|---|
| **扫榜** | 红果 32 个榜按日期浏览，频道切换、名次/热度/集数，命中库内剧目可一键跳转 |
| **视频** | 逐集原片播放（Range 拖动）、五宫格缩略图、当集时长/镜头/字数/首末句 |
| **拆解** | 逐镜表 + 关键帧 + 台词对齐；报告 / 速览 / 卡片 / 逆推四个文档页签 |
| **知识库** | 跨剧模式库（`剧库/剧情库.md`）+ 各剧剧情库卡片 + 系列总览 |
| **剧情** | 剧情结构逆推、事件时间线、分集表、系列总报告 |
| **摸鱼短剧** | 在线看红果：推荐流 / 搜索 / 分集列表 / 直连播放（不落盘），一键「下载到拆解库」 |
| **预测** | 透明经验打分器：按你已拆剧目的语料 z 分数打分，给 band、驱动项、最像的对标 |

顶部「运行」抽屉：扫榜 / 下载 / 切镜 / 听写 / 逆推 / 速览 / 事件索引 / 系列总览，任务由 Host 真跑 `bin/*.mjs`，日志每 2 秒回流。

## 目录结构

```
short-drama-lab/
├── plugin/                 # DSH 插件：短剧拆解台（界面）
│   ├── index.js            # Host 侧：路由 + spawn bin/*.mjs + 读剧库
│   ├── client.js           # Web 侧：七个栏目的 React 面板
│   ├── cordis.patch.yml    # 注入配置（★在这里填 pipelineRoot）
│   ├── icon.svg  package.json  locale/zh.json
│   └── README.md
├── pipeline/               # 短剧拆解流水线（引擎）
│   ├── bin/                # scan/download/decompose/asr/structure/stats/beats/index/…
│   ├── prompts/            # 报告写作契约（单剧/季报/系列总报告）
│   ├── scripts/daily-scan.sh
│   ├── data/.gitkeep       # 运行期数据目录（榜单、设备档案）
│   ├── package.json
│   └── README.md
├── docs/
│   ├── SETUP.md            # 环境依赖详细安装
│   ├── ARCHITECTURE.md     # 数据流与文件格式
│   ├── FAQ.md              # 踩过的坑
│   └── SAMPLE_OUTPUT.md    # 产出的目录与文件长什么样
├── 制作说明.md             # ★ 完整说明：使用者（安装/用法）+ 开发者（架构/代码地图/二次开发）
├── HANDOVER.md             # 交接说明（打包发给他人时先看这份）
├── series.example.txt      # 批量剧单示例
└── README.md
```

## 环境要求

- **Node.js ≥ 20**（流水线 + 插件都要求）
- **macOS（Apple Silicon）**：听写用 `mlx_whisper` + MLX 模型，目前只在 Apple Silicon 上顺；其他平台可只跑「扫榜/下载/切镜/统计」，听写换别的 ASR。
- **ffmpeg / ffprobe**（切镜、抽帧）
- **openhongguo**（红果公开接口的 Node SDK，`npm install` 自动装）
- **DSH（DeepSeek Harness）桌面版**：只有想用图形工作台时才需要；纯命令行可跳过插件。

## 快速开始

```bash
# 0) 克隆
git clone <本仓库地址> short-drama-lab
cd short-drama-lab

# 1) 装流水线依赖（只一个：openhongguo）
cd pipeline && npm install && cd ..

# 2) 装系统依赖（macOS）
brew install ffmpeg
pip install mlx-whisper           # 或 pipx install mlx-whisper

# 3) 下本地 Whisper 模型（从 ModelScope 镜像，无需 HuggingFace 账号）
mkdir -p pipeline/models/whisper-large-v3-turbo && cd pipeline/models/whisper-large-v3-turbo
for f in config.json weights.safetensors; do
  curl -L -C - -o "$f" \
    "https://www.modelscope.cn/api/v1/models/mlx-community/whisper-large-v3-turbo/repo?Revision=master&FilePath=$f"
done
cd ../../..

# 4) 先跑一次扫榜，验证 SDK 与匿名设备档案是否可用
cd pipeline && node bin/scan.mjs && cd ..
#    首次运行会在 pipeline/data/ 下自动注册匿名设备档案 ohg-profile.json

# 5) 装图形工作台（可选，需要 DSH 桌面版）
#    把 plugin/ 装进 DSH 的 desktop profile：
dsh plugin --profile desktop add "$(pwd)/plugin"
#    然后编辑 plugin/cordis.patch.yml，把 pipelineRoot 改成：
#      pipelineRoot: /你的绝对路径/short-drama-lab/pipeline
#    重新启动 DSH，左侧边栏出现「短剧拆解台」
```

> `dsh plugin ...` 不可用时，也可以手动把 `plugin/` 加进 profile 的 `package.json` 的 `dependencies`，并把 `dsh-drama-lab` 加入 `dsh.profile.bundles`，再重启 DSH。详见 [`docs/SETUP.md`](./docs/SETUP.md)。

## 两种用法

### A. 图形工作台（DSH）

打开左侧「短剧拆解台」→「扫榜」页 → 选一个榜单里的剧 → 点「帮我拆解」，后台会跑完整条链路，日志实时回流。已入库的剧显示「看拆解 / 重跑」。

### B. 命令行

```bash
cd pipeline

# 单步走（以一部剧为例，剧名随意起，--name 会作为剧库目录名）
node bin/scan.mjs                              # 01 扫榜
node bin/download.mjs  --series <剧目ID> --name "某剧"      # 02 下全集
node bin/decompose.mjs --series "某剧"                     # 03 拆镜头（关键帧 + 九宫格）
node bin/asr.mjs       --series "某剧"                     # 04 听写台词
node bin/clean-subs.mjs --series "某剧"                    # 04b 清洗字幕
node bin/structure.mjs --series "某剧"                     # 05 逐镜逆推稿
node bin/stats.mjs     --series "某剧"                     # 05b 数据速览
node bin/beats.mjs     --series "某剧"                     # 07 事件索引
node bin/index.mjs                                         # 06 刷新剧情库索引

# 一条命令跑完（下载→切镜→听写→逆推→速览→事件→初稿→索引）
node bin/breakdown.mjs --series <剧目ID> --name "某剧"

# 批量（读剧单文件，每行 剧名|ID|提示词）
./bin/run-batch.sh ../series.example.txt
```

> 报告类（`拆解报告.md`、`剧情结构逆推.md`、`剧情库卡片.md`）是**分析判断**，由 `auto-report.mjs` 先出结构初稿，再结合 [`pipeline/prompts/`](./pipeline/prompts/) 里的写作契约人工/AI 精修。脚本只负责可复算的统计部分。

## 每一步产出什么

| 步骤 | 脚本 | 产出 | 关键实现 |
|---|---|---|---|
| 01 扫榜 | `bin/scan.mjs` | `data/rankings/<日期>.json`、`reports/<日期>-红果榜单.md` | 遍历 6 频道 32 榜，解析「998万」类中文热度 |
| 02 下载 | `bin/download.mjs` | `剧库/<剧名>/raw/EPxxx.mp4` + `meta.json` | 优先插件宿主解密路由，SDK 直连为备；断点续传/失败重试 |
| 03 切镜 | `bin/decompose.mjs` | `拆解/EPxxx/shots.csv`、`shots/*.jpg`、`contact.jpg` | ffmpeg `select='gt(scene,0.3)'` 切镜，逐镜抽中位帧，5×5 九宫格 |
| 04 听写 | `bin/asr.mjs` | `字幕/EPxxx.srt\|txt`、`全集字幕.md` | 本地 MLX Whisper large-v3-turbo；`--prompt` 喂人名、压缩复读 |
| 05 逆推 | `bin/structure.mjs` | `剧本逆推/EPxxx.md`、`分集表.csv` | 镜头 × 字幕按时间重叠合并成逐镜台词表 |
| 05b 速览 | `bin/stats.mjs` | `拆解/数据速览.md`、`stats.json` | 纯统计：秒/镜、切镜率、台词密度、首句位置、末句静默等 |
| 07 事件 | `bin/beats.mjs` | `拆解/事件索引.csv`、`事件时间线.md` | 8 类关键词打标签，每 10 集一段列出重场戏与首尾台词 |
| 08 跨季 | `bin/series-stats.mjs` | `剧库/<系列>·系列总览.md`、`series.json` | 多季汇总：硬指标、结尾类型分布、季间对比 |
| 06 索引 | `bin/index.mjs` | `剧库/README.md`、`index.json` | 汇总集数、时长、镜率、热度、题材标签、完成度 |

完整产出长什么样，见 [`docs/SAMPLE_OUTPUT.md`](./docs/SAMPLE_OUTPUT.md)。

## 配置项 / 环境变量

| 变量 | 作用 | 默认 |
|---|---|---|
| `pipelineRoot`（插件配置） | 插件读写的流水线目录 | 见 `plugin/cordis.patch.yml` |
| `DSH_DRAMA_LAB_ROOT` | 同上的环境变量覆盖 | — |
| `OHG_PROFILE` | openhongguo 匿名设备档案路径 | `pipeline/data/ohg-profile.json` |
| `FFMPEG` / `FFPROBE` | ffmpeg 可执行文件 | `/opt/homebrew/bin/ffmpeg` |
| `MLX_WHISPER` | mlx_whisper 可执行文件 | `~/.local/bin/mlx_whisper` |
| `WHISPER_MODEL` | 模型目录 | `pipeline/models/whisper-large-v3-turbo` |
| `WHISPER_PROMPT` | 默认人名提示词 | 空 |
| `HG_HOST` | 「摸鱼短剧」插件宿主地址（下载备选路由） | `http://127.0.0.1:53228` |

## 许可

本项目代码以 **MIT** 发布，见 [LICENSE](./LICENSE)。依赖 [openhongguo](https://www.npmjs.com/package/openhongguo) 为其各自授权（Apache-2.0）。影视素材版权归原平台 / 版权方，本项目不附带任何素材。

## English

`short-drama-lab` is a personal-research toolkit for breaking down vertical short dramas from Hongguo: scrap the rankings, download episodes, cut shots with ffmpeg, transcribe locally with MLX Whisper, reconstruct shot-by-shot scripts, compute rhythm stats, and grow a reusable story-pattern library — plus a DSH web-GUI sidebar plugin that turns all of it into clickable panels. **For personal study only — do not redistribute the videos, subtitles or frames, and do not use commercially.** The repo contains code only, no media.

---

<sub>仅供个人学习与研究 · 不传播原片/字幕/关键帧 · 不商用 · 不二次上传</sub>
