#!/bin/bash
# 每天定时扫榜 + 日报；周一补周报；每月 1 号补月报。由 launchd 调用，也可手动跑。
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
unset ALL_PROXY all_proxy HTTP_PROXY http_proxy HTTPS_PROXY https_proxy
export HF_HUB_OFFLINE=1
mkdir -p logs
LOG="logs/cron.log"

{
  echo "=== $(date '+%Y-%m-%d %H:%M:%S') 定时扫榜开始 ==="
  node bin/scan.mjs || echo "[warn] scan 失败"
  node bin/report-daily.mjs || echo "[warn] 日报失败"
  node bin/week.mjs --days 7 || echo "[warn] 趋势失败"
  if [ "$(date +%u)" = "1" ]; then node bin/report-weekly.mjs || echo "[warn] 周报失败"; fi
  if [ "$(date +%d)" = "01" ]; then node bin/report-monthly.mjs || echo "[warn] 月报失败"; fi
  node bin/index.mjs || echo "[warn] 索引失败"
  echo "=== $(date '+%Y-%m-%d %H:%M:%S') 结束 ==="
} >> "$LOG" 2>&1
