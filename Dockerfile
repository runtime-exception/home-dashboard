# 单镜像：NGINX 与 Node（api 配置服务）跑在同一个容器里。
#
# 为什么合并：部署只需要一个镜像、一个容器、一个端口，不用在容器之间做服务发现，
# 也不用再维护两套镜像的 tag。代价是两个进程共用一个容器 —— 由 docker/entrypoint.sh
# 负责监督，任一进程退出就结束容器交给 restart 策略，避免出现「nginx 活着但 api 已经死了」的假健康状态。
#
# 阶段划分：
#   frontend-build → 前端静态文件
#   api-build      → api 编译产物
#   runtime        → nginx + node + 上面两者的产物
#
# nginx 配置复用 web/api 分开时就在用的那一份 nginx/nginx.conf，不复制第二份，
# 只在构建时替换上游地址，避免两份配置各自漂移。

# ── 阶段 1：构建前端静态文件 ─────────────────────────────────
FROM node:22-alpine AS frontend-build

WORKDIR /app

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build


# ── 阶段 2：构建 api ─────────────────────────────────────────
FROM node:22-alpine AS api-build

WORKDIR /app

COPY api/package*.json ./
RUN npm ci

COPY api/tsconfig.json ./
COPY api/src ./src
RUN npm run build


# ── 阶段 3：运行时（nginx + node）────────────────────────────
FROM node:22-alpine AS runtime

# nginx：静态资源 + 反向代理
# su-exec：让 api 以非 root 身份运行（见 entrypoint），
#          这样它写回 config/conf.yml 与 data/backups 时宿主机属主不是 root
# nginx 用户：alpine 的 nginx 包通常会建，这里做个幂等兜底，避免 `user nginx;` 找不到用户而启动失败
# 日志软链到 stdout/stderr：官方 nginx 镜像默认就是这么做的，
#          而 alpine 包里的 /var/log/nginx/*.log 是真实文件，不软链的话 docker logs 看不到 nginx 日志
RUN apk add --no-cache nginx su-exec \
    && (id -u nginx >/dev/null 2>&1 || adduser -S -D -H -s /sbin/nologin nginx) \
    && mkdir -p /var/log/nginx \
    && ln -sf /dev/stdout /var/log/nginx/access.log \
    && ln -sf /dev/stderr /var/log/nginx/error.log

WORKDIR /app

# api 的生产依赖与编译产物
ENV NODE_ENV=production
COPY api/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=api-build /app/dist ./dist

# 前端静态文件
COPY --from=frontend-build /app/dist /usr/share/nginx/html

# nginx 配置：只把上游从「另一个容器的 api」换成「本机 127.0.0.1」。
# 先确认待替换的字符串确实还在 —— 万一以后 nginx.conf 里的上游写法改了，
# 构建直接失败，好过悄悄产出一个指向错误地址的镜像。
COPY nginx/nginx.conf /tmp/nginx.conf
RUN grep -q 'http://api:3000' /tmp/nginx.conf \
    && sed 's|http://api:3000|http://127.0.0.1:3000|g' /tmp/nginx.conf > /etc/nginx/nginx.conf \
    && ! grep -q 'http://api:3000' /etc/nginx/nginx.conf \
    && rm /tmp/nginx.conf

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 80

# 同时探 nginx（80）与 api（3000）的存活路由，两边都活着才算健康。
# 刻意不探 /api/config.json：配置坏掉时它会返回 503 但服务本身是活的
#（控制台正是修复入口），那种情况不该被判成容器不健康。
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/healthz && wget -q --spider http://127.0.0.1:3000/healthz

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
