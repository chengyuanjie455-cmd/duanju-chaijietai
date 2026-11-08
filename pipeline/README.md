# 短剧拆解流水线 · pipeline

一套**纯 Node 命令行工具**，把红果短剧从「榜单」推进到「可复用的剧情结构库」：

```
扫榜 scan ─► 下载 download ─► 切镜 decompose ─► 听写 asr ─► 逆推 structure
   ─► 速览 stats ─► 事件索引 beats ─► 剧情库索引 index
   ─►（报告）auto-report / series-stats / week / report-daily|weekly|monthly
```

全程把中间产物落成**普通文件**（csv / md / srt / json / jpg），方便你打开看、改、二次处理。

> 上层的图形工作台见 [`../plugin/`](../plugin/)（DSH 插件「短剧拆解台」）。两者共用同一个 `pipeline/` 目录。

## 目录

```
pipeline/
├── bin/
│   ├── scan.mjs            # 01 扫榜：抓 32 个榜 → data/rankings + reports/*.md
│   ├── download.mjs        # 02 下全集：剧库/<剧名>/raw/EPxxx.mp4 + meta.json
│   ├── decompose.mjs       # 03 切镜：ffmpeg 场景切分 + 抽帧 + 九宫格
│   ├── asr.mjs             # 04 本地 Whisper 听写 → 字幕/EPxxx.srt|txt
│   ├── clean-subs.mjs      # 04b 清洗字幕（去复读、统一标点）
│   ├── structure.mjs       # 05 逐镜逆推稿：镜头×字幕对齐 → 剧本逆推/EPxxx.md
│   ├── stats.mjs           # 05b 数据速览：秒/镜、切镜率、台词密度…
│   ├── beats.mjs           # 07 事件索引：8 类关键词打标签 → 事件索引.csv
│   ├── series-stats.mjs    # 08 系列总览：多季汇总对比
│   ├── index.mjs           # 06 刷新剧情库索引 README.md + index.json
│   ├── breakdown.mjs       # 一条命令跑完 02→06（下载→…→索引）
│   ├── auto-report.mjs     # 报告结构初稿（再配 prompts/ 人工精修）
│   ├── week.mjs            # 本周汇总
│   ├── report-daily.mjs / report-weekly.mjs / report-monthly.mjs
│   ├── run-batch.sh        # 读剧单批量（每行 剧名|ID|提示词）
│   └── run-season.sh       # 通用多季批跑
├── prompts/                # 报告写作契约（单剧拆解报告 / 季报写作 / 系列总报告）
├── scripts/daily-scan.sh   # 每日定时扫榜（cron 用）
├── data/.gitkeep           # 运行期数据目录（榜单、匿名设备档案）
└── package.json            # deps: openhongguo；各 script 快捷入口
```

## 环境

- **Node.js ≥ 20**
- **ffmpeg / ffprobe**（`brew install ffmpeg`）
- **mlx_whisper**（`pip install mlx-whisper`；目前只在 Apple Silicon 顺畅）+ 本地模型（见下）
- **openhongguo**（`npm install` 自动装，红果公开接口 SDK）

环境变量（一般不用改，默认值都对）：

| 变量 | 作用 | 默认 |
|---|---|---|
| `OHG_PROFILE` | 匿名设备档案路径 | `<pipeline>/data/ohg-profile.json` |
| `FFMPEG` / `FFPROBE` | ffmpeg 可执行文件 | `/opt/homebrew/bin/ffmpeg` |
| `MLX_WHISPER` | mlx_whisper 可执行文件 | `~/.local/bin/mlx_whisper` |
| `WHISPER_MODEL` | 模型目录 | `<pipeline>/models/whisper-large-v3-turbo` |
| `WHISPER_PROMPT` | 默认人名/术语提示词 | 空 |

## 安装

```bash
cd pipeline
npm install

# 下本地 Whisper 模型（ModelScope 镜像，无需 HuggingFace 账号）
mkdir -p models/whisper-large-v3-turbo && cd models/whisper-large-v3-turbo
for f in config.json weights.safetensors; do
  curl -L -C - -o "$f" \
    "https://www.modelscope.cn/api/v1/models/mlx-community/whisper-large-v3-turbo/repo?Revision=master&FilePath=$f"
done
cd ../..
```

## 用法

### 单步

```bash
node bin/scan.mjs                                    # 01 扫榜
node bin/download.mjs  --series <剧目ID> --name "某剧"  # 02 下全集
node bin/decompose.mjs --series "某剧"                 # 03 切镜
node bin/asr.mjs       --series "某剧"                 # 04 听写（可加 --prompt "人名,地名"）
node bin/clean-subs.mjs --series "某剧"                # 04b 清洗字幕
node bin/structure.mjs --series "某剧"                 # 05 逆推稿
node bin/stats.mjs     --series "某剧"                 # 05b 数据速览
node bin/beats.mjs     --series "某剧"                 # 07 事件索引
node bin/index.mjs                                    # 06 刷新剧情库索引
```

`--series` 同时接受「剧目 ID」和「剧库目录名」。`--name` 只在下载时用来给目录起名。

### 一条命令跑完

```bash
node bin/breakdown.mjs --series <剧目ID> --name "某剧"
```

### 批量

`series.example.txt` 每行格式：`剧名|剧目ID|提示词`（提示词可留空）：

```bash
./bin/run-batch.sh ../series.example.txt
```

### 定时扫榜

```bash
# crontab 每天 08:00 扫一次
0 8 * * * /绝对路径/short-drama-lab/pipeline/scripts/daily-scan.sh >> logs/daily.log 2>&1
```

## 产出

以一部剧「某剧」为例，跑完后 `剧库/` 下会是这样（详见 [`../docs/SAMPLE_OUTPUT.md`](../docs/SAMPLE_OUTPUT.md)）：

```
剧库/
├── 某剧/
│   ├── raw/EP001.mp4 … EPxxx.mp4      # 原片
│   ├── meta.json                       # 剧目元信息（ID/集数/热度…）
│   ├── 字幕/EP001.srt …  全集字幕.md
│   ├── 拆解/
│   │   ├── EP001/shots.csv  shots/*.jpg  contact.jpg
│   │   ├── 数据速览.md  stats.json
│   │   ├── 事件索引.csv  事件时间线.md
│   │   ├── 拆解报告.md   剧情结构逆推.md   剧情库卡片.md
│   ├── 剧本逆推/EP001.md …  分集表.csv
│   └── 剧情库卡片.md
├── README.md                          # 剧情库索引（index.mjs 生成）
├── index.json
└── 剧情库.md                          # 跨剧模式库
```

`拆解报告.md / 剧情结构逆推.md / 剧情库卡片.md` 属于**分析判断**：`auto-report.mjs` 先出结构初稿，再用 [`prompts/`](./prompts/) 里的写作契约精修。脚本保证的是**可复算的统计部分**（时长/镜头/密度/首末句等）。

## 说明与边界

- 报告与统计只对「公开可访问」的红果短剧做结构分析，用于**个人学习研究**。
- 请勿传播原片、字幕、关键帧；请勿商用；请勿二次上传。
- 首次运行 `scan.mjs` 会自动向红果注册一个**匿名设备档案**并写入 `data/ohg-profile.json`（不含你的账号信息，但属于设备凭据，切勿提交到 git——`.gitignore` 已排除）。
- 听写模型较大（约 1.5G），放在 `models/`，同样不入库。

## 许可

代码 MIT（见仓库根 [LICENSE](../LICENSE)）。`openhongguo` 为其自身授权（Apache-2.0）。影视素材版权归原平台/版权方。
