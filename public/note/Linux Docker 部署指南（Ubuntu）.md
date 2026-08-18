# Linux Docker 部署指南（Ubuntu）

本文档基于 [Docker 官方安装指南（Ubuntu）](https://docs.docker.com/engine/install/ubuntu/) 编写，详细介绍了在 Ubuntu（及 Debian 系）系统上安装 Docker Engine 的完整步骤，并集成了国内镜像加速、NVIDIA 容器运行时支持以及 Live Restore 等生产级配置。

---

## 适用环境

- **操作系统**：Ubuntu 20.04 / 22.04 / 24.04
- **架构**：x86_64（amd64）
- **权限**：需要 `sudo` 权限

---

## 卸载旧版本

在安装 Docker Engine 之前，需要卸载任何可能冲突的非官方 Docker 包。这些包包括：

- `docker.io`
- `docker-compose`
- `docker-compose-v2`
- `docker-doc`
- `podman-docker`

此外，Docker Engine 依赖 `containerd` 和 `runc`，官方版本会捆绑为 `containerd.io`。如果系统已安装这些依赖，建议一并卸载以避免冲突。

执行以下命令卸载所有冲突包：

```bash
sudo apt remove $(dpkg --get-selections docker.io docker-compose docker-compose-v2 docker-doc podman-docker containerd runc | cut -f1)
```

> **注意**：此命令可能报告某些包未安装，这属于正常情况。卸载操作不会删除 `/var/lib/docker/` 下的镜像、容器、卷和网络数据，如需完全清理，可参考官方卸载文档。

---

## 安装方法

Docker 提供多种安装方式，我们推荐使用 **apt 仓库** 安装，便于管理和升级。

### 1. 设置 Docker 的 apt 仓库

```bash
# 更新软件包索引，并安装依赖
sudo apt update
sudo apt install ca-certificates curl

# 创建密钥目录并下载 Docker 官方 GPG 密钥
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

# 添加 Docker 仓库（使用 DEB822 格式）
sudo tee /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

# 更新仓库
sudo apt update
```

> 对于 Debian 系统，请将 `URIs` 中的 `ubuntu` 改为 `debian`，并确保 `Suites` 为当前 Debian 版本代号（如 `bookworm`）。

### 2. 安装 Docker Engine

安装最新版本的 Docker Engine 及其核心组件：

```bash
sudo apt install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

安装完成后，Docker 服务会自动启动。您可以验证服务状态：

```bash
sudo systemctl status docker
```

若未自动启动，手动启动：

```bash
sudo systemctl start docker
```

### 3. 验证安装

运行官方测试镜像以验证安装是否成功：

```bash
sudo docker run hello-world
```

若输出 Hello World 信息并正常退出，则说明安装成功。

---

## 配置 Docker 守护进程（daemon.json）

Docker 守护进程的配置文件位于 `/etc/docker/daemon.json`（若不存在则新建）。以下配置集成了**国内镜像加速**、**NVIDIA 运行时**、**Live Restore** 等常用选项，可直接使用。

### 配置文件内容

```json
{
  "registry-mirrors": [
    "https://docker.1ms.run",
    "https://docker.xuanyuan.me",
    "https://docker.m.daocloud.io",
    "https://docker.1panel.live",
    "https://hub.rat.dev"
  ],
  "runtimes": {
    "nvidia": {
      "args": [],
      "path": "nvidia-container-runtime"
    }
  },
  "live-restore": true
}
```

**参数说明**：

| 参数 | 说明 |
|------|------|
| `registry-mirrors` | 镜像加速器列表，用于加速 Docker Hub 镜像拉取（多个源自动尝试）。 |
| `runtimes.nvidia` | 注册 NVIDIA 容器运行时，以便在容器中使用 `--gpus` 参数。 |
| `live-restore` | 当 Docker 守护进程重启时，保持正在运行的容器继续运行（不中断服务）。 |

### 应用配置

1. **创建配置文件**：

   ```bash
   sudo mkdir -p /etc/docker
   sudo tee /etc/docker/daemon.json > /dev/null <<-'EOF'
   {
     "registry-mirrors": [
       "https://docker.1ms.run",
       "https://docker.xuanyuan.me",
       "https://docker.m.daocloud.io",
       "https://docker.1panel.live",
       "https://hub.rat.dev"
     ],
     "runtimes": {
       "nvidia": {
         "args": [],
         "path": "nvidia-container-runtime"
       }
     },
     "live-restore": true
   }
   EOF
   ```

2. **重启 Docker 使配置生效**：

   ```bash
   sudo systemctl restart docker
   ```

3. **验证配置是否生效**：

   ```bash
   sudo docker info | grep -A 5 "Registry Mirrors"
   sudo docker info | grep -A 3 "Runtimes"
   ```

---

## 安装 NVIDIA Container Toolkit（如需 GPU 支持）

如果您的机器配备 NVIDIA GPU，并且需要容器内调用 GPU，请安装 NVIDIA Container Toolkit。

### 安装步骤

```bash
# 添加 NVIDIA 官方仓库
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | sudo tee /etc/apt/sources.list.d/nvidia-docker.list

# 更新并安装
sudo apt update
sudo apt install -y nvidia-container-toolkit

# 重启 Docker
sudo systemctl restart docker
```

### 验证 GPU 支持

```bash
sudo docker run --rm --gpus all nvidia/cuda:11.0-base nvidia-smi
```

若正常显示 GPU 信息，则配置成功。

---

## 管理 Docker 服务

| 操作 | 命令 |
|------|------|
| 启动 Docker | `sudo systemctl start docker` |
| 停止 Docker | `sudo systemctl stop docker` |
| 重启 Docker | `sudo systemctl restart docker` |
| 查看状态 | `sudo systemctl status docker` |
| 开机自启 | `sudo systemctl enable docker` |
| 查看日志 | `sudo journalctl -u docker -f` |

---

## 将当前用户加入 docker 组（可选）

为避免每次执行 `docker` 命令都需要 `sudo`，可将当前用户加入 `docker` 组：

```bash
sudo usermod -aG docker $USER
newgrp docker   # 或重新登录使组生效
```

> **安全提示**：加入 docker 组的用户拥有与 root 相近的权限，请谨慎操作。

---

## 常见问题

- **镜像拉取超时**：检查网络连通性，或更换 `registry-mirrors` 中的镜像源。
- **GPU 不可用**：确保 NVIDIA 驱动已安装，且 `nvidia-container-runtime` 已正确注册（查看 `docker info` 中 Runtimes 列表）。
- **配置不生效**：检查 `/etc/docker/daemon.json` 的 JSON 格式是否正确（可用 `jq` 验证），然后重启 Docker。
- **Docker 服务启动失败**：执行 `journalctl -u docker` 查看详细错误日志。

---

## 参考资料

- [Docker 官方安装指南（Ubuntu）](https://docs.docker.com/engine/install/ubuntu/)
- [Docker 守护进程配置参考](https://docs.docker.com/engine/reference/commandline/dockerd/)
- [NVIDIA Container Toolkit 安装指南](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)
- [Docker 镜像加速器配置](https://docs.docker.com/engine/install/ubuntu/#set-up-the-repository)
