#!/bin/bash
# ============================================================
# 像素都市 PIXEL CITY — 冷启动自定义 dev 脚本
# 由容器 /start.sh 在冷启动时以 `sudo -u z bash` 调用。
# 之所以需要它：标准流程会执行 `bun run db:push`，本项目
# 无数据库脚本导致 set -e 中断初始化，dev server 永远起不来。
#
# 本脚本挂在 start.sh 的后台子 shell 下，进程最终由 tini
# (PID 1) 收养，不受工具调用级进程清理影响 → 81 端口常驻。
# ============================================================
set -e
cd /home/z/my-project

echo "[PIXELCITY] .zscripts/dev.sh starting..."

# 依赖已就位时 bun install 秒级返回（幂等）
bun install

# 生产模式更省内存且无热更新开销；如需热更新改回 `bun run dev`
# 现阶段保留 dev 模式便于迭代后直接生效
exec bun run dev
