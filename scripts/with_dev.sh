#!/bin/bash
# ============================================================
# with_dev.sh — 在 dev server 存活期间执行任意命令（按需验证）
#
# 背景：本环境每次 Bash 工具调用结束时，该调用衍生的所有进程
# 都会被清理（setsid 亦无效）。因此 dev server 无法常驻（冷启动
# 常驻方案见 .zscripts/dev.sh）。本脚本在【单次调用内】完成：
#   启动 dev server → 等待 :3000 就绪 → 执行 "$@" → 清理退出
#
# 用法：bash scripts/with_dev.sh <任意命令>
# 例：  bash scripts/with_dev.sh curl -s http://localhost:81/ -o /dev/null -w '%{http_code}'
# ============================================================
set -u
cd /home/z/my-project

LOG=/home/z/my-project/dev.log

# 若 3000 已被外部进程监听（如冷启动常驻已生效），直接复用
REUSED=0
if ss -tln 2>/dev/null | grep -q ":3000 "; then
  REUSED=1
  echo "[with_dev] :3000 already listening, reusing"
else
  nohup bun run dev > "$LOG" 2>&1 &
  DEVPID=$!
  echo "[with_dev] dev server started pid=$DEVPID"
  READY=0
  for i in $(seq 1 90); do
    if ss -tln 2>/dev/null | grep -q ":3000 "; then READY=1; break; fi
    if ! kill -0 $DEVPID 2>/dev/null; then echo "[with_dev] dev process died, see $LOG"; tail -20 "$LOG"; exit 2; fi
    sleep 1
  done
  if [ "$READY" != "1" ]; then echo "[with_dev] TIMEOUT waiting :3000"; tail -20 "$LOG"; kill $DEVPID 2>/dev/null; exit 2; fi
  echo "[with_dev] :3000 ready"
fi

# 触发首页编译（首次访问 Turbopack 需编译，预热避免测试超时）
curl -s -o /dev/null --max-time 120 http://localhost:3000/ || echo "[with_dev] warmup curl nonzero (may still be ok)"

# 执行测试命令
"$@"
RC=$?

# 清理（复用模式不杀）
if [ "$REUSED" = "0" ]; then
  kill $DEVPID 2>/dev/null
  pkill -f "next dev" 2>/dev/null
  sleep 0.5
fi
echo "[with_dev] command exit=$RC"
exit $RC
