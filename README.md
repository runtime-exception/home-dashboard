# Docker Tools Center

一个基于 Vue 3、Vite、TypeScript、NGINX 和 Docker Compose 的个人工具导航门户。门户从 `conf.yml` 读取卡片配置，在首页加载时通过后台检查每个工具的内网地址，并根据“内网/公网”开关直接跳转到对应的原始网址。

## 功能

- 三列响应式工具卡片布局
- 卡片标题、图标、简介、内网地址和公网地址全部配置化
- 首页自动检测各工具内网地址是否在线
- 页面拿到配置后立即展示，健康检查在后台逐项更新，不阻塞首页
- 进入首页时自动判断当前浏览器能否访问内网，并选择内网或公网模式
- 默认使用内网地址，可临时切换到公网地址
- 点击卡片直接跳转原始网址，不使用 iframe 或子路径代理
- 搜索、手动刷新状态和深浅色模式
- 单个 NGINX 容器提供门户静态文件及健康检查接口

## 项目结构

```text
docker-tools-dashboard/
├── conf.yml                       # 用户配置：门户信息与工具卡片
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── services/
│   │   ├── types/
│   │   ├── App.vue
│   │   ├── main.ts
│   │   └── styles.css
│   ├── package.json
│   └── vite.config.ts
├── nginx/
│   ├── Dockerfile
│   ├── generate-config.sh         # 生成前端配置与健康检查路由
│   └── nginx.conf
├── docker-compose.yml
└── README.md
```

## 快速启动

```bash
docker compose up -d --build
```

打开 <http://localhost:8080>。如需修改入口端口：

```bash
DASHBOARD_PORT=9000 docker compose up -d --build
```

## 配置工具

所有用户配置集中在根目录的 `conf.yml`：

> 仓库中的 IP、端口、域名和图标地址均为示例占位值，部署前请替换为你自己的服务地址。`192.0.2.0/24` 是专用于文档示例的保留网段。

```yaml
dashboard:
  title: Tools Center
  description: 统一管理和访问个人部署工具

networkTest:
  ip: 192.0.2.10
  port: 8081
  protocol: http
  timeoutMs: 3000

tools:
  - id: my-tool
    title: My Tool
    description: 工具用途说明
    icon: https://icons.example.com/my-tool.ico
    internalUrl: http://192.0.2.10:8081
    publicUrl: https://my-tool.example.com
    accent: "#5f86ff"
    enabled: true
```

| 字段 | 说明 |
|---|---|
| `id` | 唯一标识，只能使用小写字母、数字和连字符 |
| `title` | 卡片标题 |
| `description` | 卡片简介 |
| `icon` | 图标图片地址；加载失败时显示默认占位图标 |
| `internalUrl` | 内网原始地址，同时用于后台在线检查 |
| `publicUrl` | 公网原始地址；没有公网地址时留空字符串 |
| `accent` | 卡片强调色 |
| `enabled` | 设置为 `false` 时保留灰色卡片，但不执行健康检查和跳转 |

`networkTest` 用于判断当前访问者是否能够连接局域网：

| 字段 | 说明 |
|---|---|
| `ip` | 用于测试的内网 IP |
| `port` | 用于测试的可访问服务端口 |
| `protocol` | `http` 或 `https` |
| `timeoutMs` | 探测超时时间，单位毫秒 |

修改 `conf.yml` 后重启门户即可：

```bash
docker compose restart nginx
```

## 地址选择规则

- 每次打开或刷新首页时，“公网模式”初始关闭，并立即测试 `networkTest`。
- 测试成功：保持内网模式。
- 测试超时或失败：自动开启公网模式。
- 公网模式关闭：按钮直接跳转 `internalUrl`。
- 公网模式开启：按钮直接跳转 `publicUrl`。
- 开启公网模式但工具未配置 `publicUrl` 时，卡片整体灰显；点击卡片会提示“暂未配置公网地址”，不会发生跳转。
- 在线状态始终检查 `internalUrl`，不受公网开关影响。
- `enabled: false` 的工具固定显示灰色“离线”状态，点击提示“未启用”。

## 当前工具

| 工具 | 内网地址 | 公网地址 |
|---|---|---|
| PDF Tools | `http://192.0.2.10:8081` | `https://pdf.tools.example.com` |
| ConvertX | `http://192.0.2.10:8082` | `https://converter.tools.example.com` |
| Omnitools | `http://192.0.2.10:8083` | `https://omnitools.tools.example.com` |
| Lama Cleaner | `http://192.0.2.10:8084` | 未配置 |
| FileCodeBox | `http://192.0.2.10:8085` | `https://files.tools.example.com` |
| MusicScraper | `http://192.0.2.10:8086` | `https://music-scraper.tools.example.com` |
| Navidrome | `http://192.0.2.10:8087` | `https://music.tools.example.com` |
| Lucky | `http://192.0.2.10:8088` | `https://lucky.tools.example.com` |
| 思源笔记 | `http://192.0.2.10:8089` | `https://notes.tools.example.com` |
| 1Panel | `http://192.0.2.10:8090` | `https://panel.tools.example.com` |
| DPanel 面板 | `http://192.0.2.10:8091` | `https://dpanel.tools.example.com` |
| Magic-Resume | `http://192.0.2.10:8092` | `https://resume.tools.example.com` |
| Octopus | `http://192.0.2.10:8093` | `https://ai.tools.example.com` |
| LitePan | `http://192.0.2.10:8094` | `https://drive.tools.example.com` |
| Docker Ports | `http://192.0.2.10:8095` | `https://ports.tools.example.com` |

## HTTPS 注意事项

如果门户将来通过 HTTPS 对外提供服务，直接跳转 HTTP 内网地址不受“混合内容 iframe”限制，因为这是顶层页面跳转；但浏览器会显示目标工具自身为非安全 HTTP 页面。建议公网地址统一配置 HTTPS。
