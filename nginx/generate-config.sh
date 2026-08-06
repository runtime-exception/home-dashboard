#!/bin/sh
set -eu

CONFIG_FILE=${CONFIG_FILE:-/etc/docker-tools/conf.yml}
PUBLIC_CONFIG=${PUBLIC_CONFIG:-/usr/share/nginx/html/api/config.json}
HEALTH_ROUTES=${HEALTH_ROUTES:-/etc/nginx/health-locations.conf}

mkdir -p "$(dirname "$PUBLIC_CONFIG")"

if ! yq -o=json '.' "$CONFIG_FILE" | jq -e '
  type == "object" and
  (.dashboard | type == "object") and
  (.networkTest | type == "object") and
  (.tools | type == "array")
' >/dev/null; then
  echo "conf.yml 格式无效：必须包含 dashboard 对象和 tools 数组" >&2
  exit 1
fi

yq -o=json '.' "$CONFIG_FILE" | jq '{
  dashboard: .dashboard,
  networkTest: .networkTest,
  tools: .tools
}' > "$PUBLIC_CONFIG"

: > "$HEALTH_ROUTES"

jq -c '.tools[] | select(.enabled != false)' "$PUBLIC_CONFIG" | while IFS= read -r tool; do
  id=$(printf '%s' "$tool" | jq -r '.id')
  internal_url=$(printf '%s' "$tool" | jq -r '.internalUrl')

  if ! printf '%s' "$id" | grep -Eq '^[a-z0-9][a-z0-9-]*$'; then
    echo "无效工具 id: $id" >&2
    exit 1
  fi
  if ! printf '%s' "$internal_url" | grep -Eq '^https?://[a-zA-Z0-9.-]+(:[0-9]{1,5})?(/[a-zA-Z0-9._~/?=&%+-]*)?$'; then
    echo "无效内网地址: $internal_url" >&2
    exit 1
  fi

  health_url="${internal_url%/}/"

  cat >> "$HEALTH_ROUTES" <<EOF
location = /api/health/$id {
    access_log off;
    set \$health_upstream "$health_url";
    proxy_pass \$health_upstream;
    proxy_method HEAD;
    proxy_pass_request_body off;
    proxy_hide_header Content-Length;
    proxy_http_version 1.1;
    proxy_set_header Host \$proxy_host;
    proxy_set_header Connection "";
    proxy_connect_timeout 1s;
    proxy_send_timeout 1s;
    proxy_read_timeout 1s;
    proxy_intercept_errors on;
    error_page 301 302 303 307 308 400 401 403 404 405 409 422 429 =200 /healthz;
}

EOF
done

echo "已根据 conf.yml 生成前端配置和健康检查路由"
