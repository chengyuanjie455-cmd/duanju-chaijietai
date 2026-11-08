# dsh-drama-lab · 短剧拆解台（DSH 插件）

左侧边栏的「短剧拆解台」：把 [`../pipeline/`](../pipeline/) 的
「红果扫榜 → 全集下载 → 逐镜切分 → 本地听写 → 剧情逆推 → 数据速览 → 剧情库」搬进 DSH Web GUI。

> 插件不内置任何下载 / 解密 / 听写逻辑，只读写流水线目录、并在 Host 侧 `spawn node bin/*.mjs`。

## 依赖

- DSH（DeepSeek Harness）桌面版。
- 同仓库的 [`../pipeline/`](../pipeline/)（必须一起装，否则面板里没有数据可读）。
- 插件注入的运行时模块（由 DSH 提供，无需单独安装）：
  `@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-client-locale`。
- 「摸鱼短剧」栏目复用 `dsh-hongguo` 插件的 `/api/hongguo/*` 路由（可选；不装则该栏不可用，其他栏目不受影响）。

## 安装

方式一（CLI）：

```bash
# 在 DSH 的 desktop profile 里加入本插件（把路径换成你克隆后的 plugin/ 目录绝对路径）
dsh plugin --profile desktop add /绝对路径/short-drama-lab/plugin
```

方式二（手动）：编辑 `~/.dsh/profiles/desktop/package.json`：

```jsonc
{
  "dependencies": {
    "dsh-drama-lab": "file:/绝对路径/short-drama-lab/plugin"
  },
  "dsh": {
    "profile": {
      "bundles": [ /* …, */ "dsh-drama-lab" ]
    }
  }
}
```

然后**重启 DSH**（Host 侧插件在启动时装配），左侧图标行出现「短剧拆解台」。

## 配置 `pipelineRoot`

编辑 [`cordis.patch.yml`](./cordis.patch.yml)，把占位路径换成你的流水线目录：

```yaml
- insert:
    - id: drama-lab
      name: dsh-drama-lab
      config:
        pipelineRoot: /绝对路径/short-drama-lab/pipeline
        maxLogLines: 400
```

也可以用环境变量覆盖：`export DSH_DRAMA_LAB_ROOT=/绝对路径/short-drama-lab/pipeline`。

## 七个栏目

| 栏目 | 内容 |
|---|---|
| 扫榜 | 红果 32 榜按日期浏览，频道切换、名次/热度/集数，联动库内剧目 |
| 视频 | 逐集原片播放（Range 拖动）、五宫格缩略图、当集时长/镜头/字数/首末句 |
| 拆解 | 逐镜表 + 关键帧 + 台词对齐；报告/速览/卡片/逆推四份文档页签 |
| 知识库 | 跨剧模式库（`剧库/剧情库.md`）+ 各剧剧情库卡片 + 系列总览 |
| 剧情 | 剧情结构逆推、事件时间线、分集表、系列总报告 |
| 摸鱼短剧 | 在线看红果：推荐流 / 搜索 / 分集列表 / 直连播放（不落盘），一键「下载到拆解库」 |
| 预测 | 透明经验打分器：按已拆剧目的语料 z 分数打分，给出 band、驱动项、最像的对标 |

顶部「运行」按钮打开流水线抽屉：扫榜 / 下载 / 切镜 / 听写 / 逆推 / 速览 / 事件索引 / 系列总览，任务由 Host 真跑 `bin/*.mjs`，日志每 2 秒回流。

## 文件

```
plugin/
├── index.js          # Host 侧：/api/drama-lab 路由、spawn bin/*.mjs、读剧库
├── client.js         # Web 侧：七个栏目的 React 面板
├── cordis.patch.yml  # 注入配置（★ 填 pipelineRoot）
├── icon.svg
├── locale/zh.json
└── package.json
```

## 说明

- 所有栏目只读 `pipelineRoot` 下的 `剧库/`、`data/`、`reports/`、`bin/`。
- 「预测」需要你已经有至少几部拆解完的剧（读各剧 `拆解/stats.json` 做语料），冷启动时结果为空是正常的。
- 原始片、字幕、关键帧仅用于个人学习研究，请勿传播或商用。
