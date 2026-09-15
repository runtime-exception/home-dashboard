#!/bin/sh
# 一个容器里跑两个进程：nginx（对外 80）与 api（Node，监听本机 3000）。
#
# 这个脚本负责三件事：
#   1. api 以非 root 身份启动 —— 它要写回 config/conf.yml 与 data/backups，
#      以宿主机用户身份运行，文件属主才不会变成 root。
#      nginx 保持 root 启动，因为它需要绑定 80 端口；这与合并前的双容器一致
#      （那时 nginx 容器也是 root，只有 api 容器用了 compose 的 user:）。
#   2. 任一进程退出就结束整个容器，交给 compose 的 restart 策略重新拉起。
#      不做这件事的话，api 挂了容器依然算 healthy，用户只会看到一片 502。
#   3. 把 TERM/INT 转发给两个子进程，让 docker stop 能干净收尾。
set -eu

APP_UID="${APP_UID:-1000}"
APP_GID="${APP_GID:-1000}"

stop_all() {
  trap - TERM INT
  [ -n "${nginx_pid:-}" ] && kill -TERM "$nginx_pid" 2>/dev/null || true
  [ -n "${api_pid:-}" ] && kill -TERM "$api_pid" 2>/dev/null || true
  wait 2>/dev/null || true
}

trap 'stop_all; exit 0' TERM INT

su-exec "$APP_UID:$APP_GID" node /app/dist/server.js &
api_pid=$!

nginx -g 'daemon off;' &
nginx_pid=$!

echo "[entrypoint] api pid=$api_pid (uid=$APP_UID), nginx pid=$nginx_pid" >&2

# 任一进程消失就跳出循环。kill -0 只探存活、不发信号。
while kill -0 "$api_pid" 2>/dev/null && kill -0 "$nginx_pid" 2>/dev/null; do
  sleep 1
done

echo "[entrypoint] 子进程已退出，关闭容器" >&2
stop_all
exit 1
