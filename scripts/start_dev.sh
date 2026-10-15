#!/bin/bash
# 像素都市 dev server 守护化启动脚本
# 策略：双脱离（新会话 setsid + 父进程立即退出 → 孤儿 reparent 到 init/tini）
# 作用：脱离 Bash 工具调用的进程树，避免调用结束时被连带清理
# 日志：dev script 内部自带 `| tee dev.log`，外部 stdout 丢弃即可

cd /home/z/my-project || exit 1

# 幂等：已在监听则不重复启动
if ss -tln 2>/dev/null | grep -q ":3000 "; then
  echo "dev server already listening on :3000"
  exit 0
fi

# 清掉可能残留的旧 next 进程（防端口占用）
pkill -f "next dev" 2>/dev/null
sleep 0.5

# daemon 化启动：setsid 新会话 + 后台 + 父 shell 立即结束
# 子进程脱离本脚本的进程组/会话，reparent 到 PID 1 (tini)
setsid bun run dev > /dev/null 2>&1 < /dev/null &
BUN_PID=$!
echo "$BUN_PID" > /home/z/my-project/scripts/dev.pid

# 等待就绪（最多 15s），供调用方在同一条命令内确认启动成功
for i in $(seq 1 30); do
  if ss -tln 2>/dev/null | grep -q ":3000 "; then
    echo "READY in ~$((i/2))s pid=$BUN_PID"
    exit 0
  fi
  sleep 0.5
done
echo "TIMEOUT waiting :3000" >&2
exit 2
