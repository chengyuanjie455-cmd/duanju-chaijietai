# 安装与配置（SETUP）

> 面向「克隆下来第一次跑通」的人。全程 macOS（Apple Silicon）验证；其他平台见文末「非 Apple Silicon」。

## 0. 你需要什么

| 组件 | 用途 | 是否必须 |
|---|---|---|
| Node.js ≥ 20 | 跑流水线与插件 | ✅ 必须 |
| ffmpeg / ffprobe | 切镜、抽帧、封面 | ✅ 必须 |
| openhongguo（npm） | 红果公开接口 SDK | ✅ 必须（`npm install` 自动装） |
| mlx_whisper + 模型 | 本地语音听写 | 想生成字幕/逆推稿才需要 |
| DSH 桌面版 | 图形工作台「短剧拆解台」 | 只用命令行可跳过 |

先确认版本：

```bash
node -v      # 需要 >= v20
ffmpeg -version | head -1
ffprobe -version | head -1
```

## 1. 取代码

```bash
git clone <本仓库地址> short-drama-lab
cd short-drama-lab
```

下文所有命令都以 `short-drama-lab/` 为仓库根。记下它的**绝对路径**（装插件时要用）：

```bash
pwd    # 例如 /Users/you/Documents/short-drama-lab
```

## 2. 装流水线依赖

```bash
cd pipeline
npm install          # 只装一个依赖：openhongguo
cd ..
```

## 3. 装系统依赖

### ffmpeg

```bash
brew install ffmpeg
# 如果 ffmpeg 不在 /opt/homebrew/bin，用 which 查，然后设 FFMPEG/FFPROBE 环境变量
which ffmpeg ffprobe
```

### mlx_whisper（听写）

```bash
pip install mlx-whisper
# 或者用 pipx 隔离：
# pipx install mlx-whisper
```

确认可执行：

```bash
which mlx_whisper     # 默认期望在 ~/.local/bin/mlx_whisper
```

## 4. 下本地 Whisper 模型

用 ModelScope 镜像（国内快，不需要 HuggingFace 账号）：

```bash
cd pipeline
mkdir -p models/whisper-large-v3-turbo
cd models/whisper-large-v3-turbo
for f in config.json weights.safetensors; do
  curl -L -C - -o "$f" \
    "https://www.modelscope.cn/api/v1/models/mlx-community/whisper-large-v3-turbo/repo?Revision=master&FilePath=$f"
done
cd ../..
```

`-C -` 支持断点续传；`weights.safetensors` 约 1.5G。下完 `ls -lh` 应能看到两个文件。

> 模型路径固定是 `pipeline/models/whisper-large-v3-turbo`；如果你的放别处，设 `WHISPER_MODEL=/你的路径`。

## 5. 验证流水线

```bash
cd pipeline
node bin/scan.mjs
```

首次运行会：

1. 用 openhongguo 注册一个**匿名设备档案**，写到 `pipeline/data/ohg-profile.json`；
2. 抓 6 频道 32 个榜，写 `data/rankings/<日期>.json` 和 `reports/<日期>-红果榜单.md`。

看到榜单文件生成，就说明 SDK、网络、目录都通了。**注意 `data/ohg-profile.json` 是设备凭据，别提交、别外发。**

随便挑一部剧跑通整条链路：

```bash
node bin/breakdown.mjs --series <榜单里的剧目ID> --name "试跑剧"
```

跑完去 `剧库/试跑剧/` 看产物。

## 6.（可选）装图形工作台

需要 DSH 桌面版。两种装法二选一：

### 方式 A：CLI

```bash
dsh plugin --profile desktop add "$(pwd)/plugin"
```

### 方式 B：手动

编辑 `~/.dsh/profiles/desktop/package.json`：

```jsonc
{
  "dependencies": {
    "dsh-drama-lab": "file:/绝对路径/short-drama-lab/plugin"
  },
  "dsh": { "profile": { "bundles": [ /* … */ "dsh-drama-lab" ] } }
}
```

### 配置 pipelineRoot（必做）

编辑 `short-drama-lab/plugin/cordis.patch.yml`，把 `pipelineRoot` 换成你的绝对路径：

```yaml
- insert:
    - id: drama-lab
      name: dsh-drama-lab
      config:
        pipelineRoot: /绝对路径/short-drama-lab/pipeline
        maxLogLines: 400
```

或设环境变量 `export DSH_DRAMA_LAB_ROOT=/绝对路径/short-drama-lab/pipeline`。

### 重启 DSH

Host 侧插件在启动时装配，**必须重启 DSH**，左侧图标行才会出现「短剧拆解台」。若想用「摸鱼短剧」栏目，另需装 `dsh-hongguo` 插件（提供 `/api/hongguo/*`）。

## 常见环境问题

见 [`FAQ.md`](./FAQ.md)。几个高频的：

- `ffmpeg: command not found` → 设 `export FFMPEG=/opt/homebrew/bin/ffmpeg`（`ffprobe` 同理）。
- `mlx_whisper` 找不到 → `pip show mlx-whisper` 看装到哪，设 `export MLX_WHISPER=$(which mlx_whisper)`。
- `scan` 报鉴权/设备错误 → 删掉 `pipeline/data/ohg-profile.json` 让它重新注册。
- 插件面板空白 → 九成是 `pipelineRoot` 没配对，或 DSH 没重启。

## 非 Apple Silicon（x86 / Linux / Windows）

- **扫榜 / 下载 / 切镜 / 统计 / 索引**：这些只依赖 Node + ffmpeg，任意平台都能跑。
- **听写（asr.mjs）**：默认走 `mlx_whisper`，只在 Apple Silicon 顺畅。其他平台二选一：
  1. 改脚本调用别的 ASR（如 faster-whisper / whisper.cpp），只要能产出同名 `字幕/EPxxx.srt`；
  2. 跳过听写，只做切镜与统计（逆推稿会缺台词）。
- **DSH 桌面版**：目前仅 macOS。
