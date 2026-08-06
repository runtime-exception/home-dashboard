FROM node:22-alpine AS frontend-build

WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM nginx:1.27-alpine

RUN apk add --no-cache jq yq

COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY nginx/generate-config.sh /docker-entrypoint.d/20-generate-tool-config.sh
COPY conf.yml /etc/docker-tools/conf.yml
COPY --from=frontend-build /app/dist /usr/share/nginx/html

RUN chmod +x /docker-entrypoint.d/20-generate-tool-config.sh

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/healthz || exit 1
