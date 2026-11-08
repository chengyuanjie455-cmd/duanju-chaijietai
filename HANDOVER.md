# 交接说明 · 拿到这个包，先看这里

> 版本：2026-11-08 ｜ 仓库：https://github.com/chengyuanjie455-cmd/duanju-chaijietai

## 一、这包是什么

**短剧拆解台** = 一个「DSH 侧边栏插件」+ 一条「命令行拆解流水线」，合起来干一件事：

> 扫红果短剧榜 → 按剧下载 → 抽帧切镜 / 语音听写 → 逆推剧本 → 产出「单剧拆解报告 / 数据速览 / 事件时间线 / 季报」。

插件是给人点的界面；流水线是真正干活的引擎。两者可分开用（见第四节）。

## 二、包里有什么

| 路径 | 内容 |
| --- | --- |
| `README.md` | 项目总览、架构、两种用法 |
| `docs/SETUP.md` | **安装配置（第一次必读）** |
| `docs/ARCHITECTURE.md` | 数据流与各脚本职责 |
| `docs/FAQ.md` | 常见问题（装不上、跑不动先翻这里） |
| `docs/SAMPLE_OUTPUT.md` | 产出长什么样（示例） |
| `plugin/` | DSH 侧边栏插件（`index.js` 后端、`client.js` 界面、`cordis.patch.yml`） |
| `pipeline/bin/` | 全部流水线脚本（scan / download / decompose / asr / structure / beats / report / breakdown …） |
| `pipeline/prompts/` | 报告生成的提示词模板 |
| `pipeline/scripts/daily-scan.sh` | 每日自动扫榜脚本 |
| `series.example.txt` | 剧单示例（`剧名\|ID\|关键词`），批量跑用 |
| `LICENSE` | MIT（见第七节） |

## 三、包里**没有**的东西（别慌，会自动生成）

为了能发给你，下面这些**故意没打进来**（版权 / 体积 / 隐私）：

- `pipeline/剧库/` —— 下载的原片、字幕、关键帧（体积大 + 有版权）
- `pipeline/models/` —— 语音识别模型 `whisper-large-v3-turbo`（约 1.5G，苹果芯片专用）
- `pipeline/data/ohg-*.json` —— 红果匿名设备凭据（**别人的机器上不能用，必须自己生成**）
- `pipeline/reports/`、`pipeline/logs/` —— 历史产出与日志

这些第一次运行会自动创建；模型按 `docs/SETUP.md` 里的 ModelScope 镜像地址下一次即可。

## 四、三步上手

### 1. 装基础环境
- Node.js ≥ 20、`ffmpeg`/`ffprobe`、`git`
- 想跑语音听写且是 **Apple Silicon**：额外装 `mlx_whisper`（`pip install mlx-whisper` 或按 SETUP 内说明）

### 2. 装依赖
```bash
cd pipeline
npm install          # 会拉 openhongguo（红果公开接口 SDK）
```

### 3. 两种用法，任选
**A. 只用命令行（不需要 DSH）**
```bash
cd pipeline
node bin/scan.mjs                 # 扫榜
node bin/download.mjs --series <ID> --name "剧名"
node bin/breakdown.mjs --series <ID> --name "剧名"   # 一键：下载→抽帧→听写→逆推→报告
```
更多参数见 `pipeline/README.md`。

**B. 接桌面版界面（有 DSH）**
1. 按 `plugin/README.md` 把 `plugin/` 装进 DSH 的 profile；
2. 打开 `plugin/cordis.patch.yml`，把 `pipelineRoot` 改成**你解压后 pipeline 的绝对路径**，例如
   ```yml
   pipelineRoot: /Users/你的用户名/Downloads/short-drama-lab/pipeline
   ```
3. 重启 DSH，左侧出现「短剧拆解台」，扫榜页点「帮我拆解」即可，进度表会实时显示 9 个步骤。

> ⚠️ `pipelineRoot` 不改 = 插件找不到引擎，点了没反应。这是最常见的坑。

## 五、自检（解压后想确认没坏）
```bash
cd short-drama-lab
for f in pipeline/bin/*.mjs; do node --check "$f" || echo "坏: $f"; done
echo "自检完成，无报错即正常"
```

## 六、出问题
先查 `docs/FAQ.md`；再不行看 `docs/SETUP.md` 的环境变量（`WHISPER_MODEL` / `MLX_WHISPER` / `OHG_PROFILE`）。

## 七、许可与合规
- 代码：MIT，可自由使用、修改、分发。
- **素材版权归原出品方**。本工具仅用于个人学习、研究与创作参考，请勿用于商业传播或二次分发受版权保护的影视内容。
