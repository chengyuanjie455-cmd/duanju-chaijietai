# 常见问题与踩坑（FAQ）

> 这些坑都是真跑过才发现的，按「症状 → 原因 → 解法」记。

## 安装 / 环境

**Q：`ffmpeg: command not found` / 切镜报找不到 ffmpeg**
装 `brew install ffmpeg`；如果不在 `/opt/homebrew/bin`，设 `export FFMPEG=$(which ffmpeg)`、`export FFPROBE=$(which ffprobe)`。

**Q：`mlx_whisper` 找不到 / 听写报错退出**
`pip show mlx-whisper` 看装哪了，设 `export MLX_WHISPER=$(which mlx_whisper)`。注意它**只在 Apple Silicon** 上顺；x86 / Linux 请换 ASR（见文末）。

**Q：HuggingFace 下模型一直 SSL EOF / 断**
HF 直连和在部分网络下会被打断。本项目统一从 **ModelScope 镜像**下（不需要 HF 账号），命令见 [SETUP.md](./SETUP.md) 第 4 步。

**Q：`ALL_PROXY=socks5://...` 时 `mlx_whisper` 崩（`Invalid port: ':1]'`）**
某些 socks5 代理会让 `huggingface_hub`/`httpx` 解析崩。跑听写前清空代理：`unset ALL_PROXY HTTP_PROXY HTTPS_PROXY`（或只给非听写步骤设代理）。

## 扫榜 / 下载

**Q：`resolvePlayback` 报 `anonymous response was empty`，或匿名注册被风控**
openhongguo 的匿名设备会被平台风控。
1. 优先走「插件宿主路由」（DSH 装了 `dsh-hongguo` 时，下载器会优先用它，它持有可用会话）；
2. 或 `client.resetDevice()` 换设备（删 `pipeline/data/ohg-profile.json` 重新注册）；
3. 大批量时降速：`--delay 1200`，串行不要并发。

**Q：并发下载约 250 请求后宿主返回 `anonymous registration returned no guest identity`（502）**
匿名额度被打到上限。改**串行 + `--delay 1200` + 退避重试**（每失败 attempt×6s）。1000 集实测约 40 分钟可下完。

**Q：SDK 写 profile 报 `EPERM`**
当运行环境只允许写 workspace 时，把 profile 放到可写目录并统一指定：
```bash
export OHG_PROFILE="$PWD/data/ohg-profile.json"
```
本项目默认已改为写 `pipeline/data/ohg-profile.json`。

**Q：下载只要试跑几集**
`node bin/download.mjs --series <id> --limit 3`（只下前 3 集）；`--force` 重下已有。也可以用 `--search "剧名"` 按名字找。

**Q：插件缓存找不到片子**
「摸鱼短剧」插件缓存默认只留最近 40 集（滚动淘汰）。下载器会逐集**拷贝到 `剧库/<剧名>/raw/`**，不受淘汰影响——别直接依赖插件缓存目录。

## 切镜 / 听写

**Q：切镜阈值 0.3 漏了慢转场**
默认 `select='gt(scene,0.3)'` 对硬切够用；靠**叠化 / 白闪**转场的剧会漏，试 `--threshold 0.25` 复跑对比。

**Q：某集坏帧导致整季切镜中断（`ffmpeg 69: ... Conversion failed!`）**
```
ffmpeg -v error -i EPxxx.mp4 -f null -    # 查 AAC/HEVC 解码错误
node bin/download.mjs --series <id> --force   # 重下该集后再跑
```

**Q：Whisper 在纯音乐 / 闪回段整段复读（几十行 "Zither Harp" / "第十五 第十五…"）**
听写时加 `--condition-on-previous-text False`；`clean-subs.mjs` 会压缩连续复读、丢弃纯数字/低信息密度行；仍有残留就手动清一次。

**Q：人名 / 专有名词听写错得多（如「宋明晴」= 宋明清）**
- 听写时 `--prompt "人物名,地名,术语"` 喂进去；
- 剧目目录下可放 `lexicon.json` 做错名替换；
- 报告里统一后标注「听写作 X」，无法确证标「待核」。**别把听写稿当逐字台词本**，关键台词用烧入字幕 OCR 复核。

**Q：方言 / 古装剧「人名全错、术语全错」**
本机 Whisper 对东北话、广普、宋代官职名都很难。同上，靠 prompt + lexicon + OCR 复核。

## 统计 / 索引

**Q：补了几集之后 `stats.json` 只算成「1 集」**
`decompose` 每次会覆盖 `拆解/summary.json`；只跑 `--from 85 --to 85` 后直接 stats 就只剩 1 集。**补集后要整季重跑 decompose，再跑 stats。**

## 插件

**Q：面板空白 / 没有数据**
九成是 `pipelineRoot` 没配对（`plugin/cordis.patch.yml` 或 `DSH_DRAMA_LAB_ROOT`），或者 **DSH 没重启**（Host 侧插件在启动时装配）。改完配置请完全退出 DSH 再开。

**Q：「摸鱼短剧」栏目打不开**
它复用 `dsh-hongguo` 插件的 `/api/hongguo/*` 路由，需要先装 `dsh-hongguo`。不装不影响其他六个栏目。

**Q：「预测」栏目空**
它读各剧 `拆解/stats.json` 当语料，冷启动（没有已拆剧目）时结果为空是正常的。先拆一两部剧再看。

## 非 Apple Silicon

- 扫榜 / 下载 / 切镜 / 统计 / 索引：只依赖 Node + ffmpeg，任意平台可跑。
- 听写（`asr.mjs`）默认用 `mlx_whisper`（仅 Apple Silicon）。其他平台可换 faster-whisper / whisper.cpp 等，**只要产出同名 `字幕/EPxxx.srt`**，下游 `structure/stats/beats` 不用改。
- DSH 桌面版目前仅 macOS。
