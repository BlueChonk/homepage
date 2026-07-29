---
slug: frp
title: "FRP 内网穿透部署文档"
date: 2026-01-10
tags:
  - FRP
  - 内网穿透
  - 运维
summary: "使用 Docker 部署 frps / frpc，打通内网服务到公网的完整指南，含华为云镜像加速与配置示例。"
---

# FRP 内网穿透部署文档

## Docker 镜像

```bash
# frps（服务端）
docker pull swr.cn-north-4.myhuaweicloud.com/ddn-k8s/ghcr.io/fatedier/frps:v0.65.0
docker tag swr.cn-north-4.myhuaweicloud.com/ddn-k8s/ghcr.io/fatedier/frps:v0.65.0 ghcr.io/fatedier/frps:v0.65.0

# frpc（客户端）
docker pull swr.cn-north-4.myhuaweicloud.com/ddn-k8s/ghcr.io/fatedier/frpc:v0.65.0
docker tag swr.cn-north-4.myhuaweicloud.com/ddn-k8s/ghcr.io/fatedier/frpc:v0.65.0 ghcr.io/fatedier/frpc:v0.65.0
```

---

## frps（服务端）

### 配置 `frps.toml`

```toml
bindPort = 7000

auth.token = "<your-token>"

webServer.addr = "0.0.0.0"
webServer.port = 7500
webServer.user = "admin"
webServer.password = "<your-password>"

log.to = "/root/frp/log/frps.log"
log.level = "info"
log.maxDays = 7
```

### Docker run

```bash
docker run -d \
  --name frps \
  --restart always \
  --network host \
  -v /root/frps/frps.toml:/etc/frp/frps.toml \
  ghcr.io/fatedier/frps:v0.65.0 \
  -c /etc/frp/frps.toml
```

### 运维命令

```bash
# 查看配置
cat /etc/frp/frps.toml

# 查询 frps 进程
pgrep frps
kill <PID>

# systemd 托管
sudo systemctl status frps
sudo systemctl restart frps
sudo systemctl stop frps
sudo systemctl disable --now frps
```

---

## frpc（客户端）

### Docker 桌面版配置

```toml
serverAddr = "<your-server-ip>"
serverPort = 7000
auth.token = "<your-token>"

[[proxies]]
name = "web"
type = "tcp"
localIP = "host.docker.internal"
localPort = 8080
remotePort = 8080
```

### 公网 IP 配置

```toml
serverAddr = "<your-server-ip>"
serverPort = 7000
auth.token = "<your-token>"

[[proxies]]
name = "web"
type = "tcp"
localIP = "127.0.0.1"
localPort = 8080
remotePort = 8080
```

### 域名配置

```toml
serverAddr = "<your-domain>"
serverPort = 7000
auth.token = "<your-token>"

[[proxies]]
name = "web"
type = "http"
localIP = "127.0.0.1"
localPort = 8080
customDomains = ["<your-domain>"]
```

### Docker run

```bash
docker run -d \
  --name frpc \
  --restart always \
  --network host \
  -v /root/frpc/frpc.toml:/etc/frp/frpc.toml \
  ghcr.io/fatedier/frpc:v0.65.0 \
  -c /etc/frp/frpc.toml
```
