#!/usr/bin/env bash
# 批量拆解：读取一个剧单文件（每行「剧名|剧目ID|听写提示词」），逐部串行跑完整流程。
# 用法：
#   ./bin/run-batch.sh series.example.txt
# 剧单格式见仓库根目录 series.example.txt；以 # 开头的行会被忽略。
set -u
cd "$(dirname "$0")/.." || exit 1
FILE="${1:?用法: ./bin/run-batch.sh <剧单文件>}"
while IFS='|' read -r name id prompt; do
  [ -z "${name:-}" ] && continue
  case "$name" in \#*) continue ;; esac
  echo "[batch] ▶ $name ($id) $(date '+%T')"
  ./bin/run-season.sh "$id" "$name" "${prompt:-}"
done < "$FILE"
echo "[batch] ALL DONE $(date '+%F %T')"
