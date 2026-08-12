# FRP 内网穿透部署文档

本文档介绍如何使用 FRP（Fast Reverse Proxy）实现内网穿透：涵盖 frps 服务端与 frpc 客户端的 Docker 部署、`frps.toml` 与 `frpc.toml` 配置、Docker 桌面版与公网 IP / 域名接入方式，以及 systemd 托管与常用运维命令。所有命令均经实际验证，替换占位符后即可按步骤直接复现。

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
