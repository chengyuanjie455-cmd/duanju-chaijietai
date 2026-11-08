#!/bin/bash
# 单季全流程：download → decompose → asr → structure → stats
# 用法：./bin/run-season.sh <series_id> <剧名> [prompt]
set -u
cd "$(dirname "$0")/.." || exit 1
SID="$1"; NAME="$2"; PROMPT="${3:-}"
LOG="logs/$(echo "$NAME" | tr '·/: ' '____').log"
mkdir -p logs

echo "=== $(date '+%F %T') START $NAME ($SID) ===" >> "$LOG"
node bin/download.mjs --series "$SID" --name "$NAME" >> "$LOG" 2>&1 || { echo "DOWNLOAD FAIL $NAME" >> "$LOG"; exit 1; }
node bin/decompose.mjs --series "$NAME" >> "$LOG" 2>&1 || echo "DECOMPOSE FAIL $NAME" >> "$LOG"
env -u ALL_PROXY -u all_proxy HF_HUB_OFFLINE=1 node bin/asr.mjs --series "$NAME" --prompt "$PROMPT" >> "$LOG" 2>&1 || echo "ASR FAIL $NAME" >> "$LOG"
node bin/structure.mjs --series "$NAME" >> "$LOG" 2>&1 || echo "STRUCTURE FAIL $NAME" >> "$LOG"
node bin/stats.mjs --series "$NAME" >> "$LOG" 2>&1 || echo "STATS FAIL $NAME" >> "$LOG"
echo "=== $(date '+%F %T') DONE $NAME ===" >> "$LOG"
