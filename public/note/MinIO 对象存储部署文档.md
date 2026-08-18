# MinIO 对象存储部署文档

本文档介绍如何使用 Docker 部署 [MinIO](https://min.io/) 高性能对象存储服务。MinIO 提供 S3 兼容的 API，适用于存储非结构化数据（如文件、图片、备份等）。本文同时提供 `docker-compose` 与 `docker run` 两种启动方式，并给出国内镜像加速方案。

---

## 前置条件

- **Docker**：版本 20.10+。
- **存储目录**：宿主机上用于持久化存储数据的目录（如 `/var/lib/minio/data`），请确保有足够磁盘空间。
- **网络端口**：9000（API）、9001（Web 控制台）未被占用。

---

## 镜像拉取（国内加速）

原始镜像为 `quay.io/minio/minio:RELEASE.2023-12-20T01-00-02Z`。国内访问 `quay.io` 可能较慢，推荐使用以下任一方式加速：

### 方式一：使用 Docker Hub 镜像（推荐）
```bash
# Docker Hub 上的 MinIO 官方镜像
docker pull minio/minio:RELEASE.2023-12-20T01-00-02Z

# 如果仍慢，可配置 Docker 镜像加速器（如阿里云、中科大等）
```

### 方式二：使用华为云 SWR 代理（若可用）
```bash
# 以华为云 SWR 为例（需要替换为实际可用的代理地址）
docker pull swr.cn-north-4.myhuaweicloud.com/ddn-k8s/quay.io/minio/minio:RELEASE.2023-12-20T01-00-02Z
docker tag swr.cn-north-4.myhuaweicloud.com/ddn-k8s/quay.io/minio/minio:RELEASE.2023-12-20T01-00-02Z quay.io/minio/minio:RELEASE.2023-12-20T01-00-02Z
```

> 若您有其他可用的镜像源（如阿里云、腾讯云），可自行替换。

---

## 配置凭证

在启动前，请修改环境变量中的用户名和密码：
- `MINIO_ROOT_USER`：MinIO 根用户（建议设置强密码）
- `MINIO_ROOT_PASSWORD`：根用户密码（至少 8 位）

> **安全提示**：生产环境请勿使用弱密码，建议使用随机生成的高强度密码。

---

## 启动服务

### 方式一：使用 `docker run`（推荐）

```bash
docker run -d \
  --name minio \
  --restart always \
  -p 9000:9000 \
  -p 9001:9001 \
  -v /var/lib/minio/data:/data \
  -e MINIO_ROOT_USER=admin \
  -e MINIO_ROOT_PASSWORD=your-strong-password \
  quay.io/minio/minio:RELEASE.2023-12-20T01-00-02Z \
  server /data --console-address ":9001"
```

**参数解释**：
- `-d`：后台运行。
- `--restart always`：容器退出时自动重启。
- `-p 9000:9000`：映射 S3 API 端口。
- `-p 9001:9001`：映射 Web 控制台端口。
- `-v`：挂载数据目录，确保持久化。
- `-e`：设置环境变量（用户名密码）。
- 最后一行是容器启动命令，启动 MinIO 服务器，并指定控制台端口。

---

### 方式二：使用 `docker-compose`

`minio.yml` 文件内容（已包含健康检查）：

```yaml
services:
  minio:
    image: quay.io/minio/minio:RELEASE.2023-12-20T01-00-02Z
    container_name: minio
    restart: always
    ports:
      - 9000:9000
      - 9001:9001
    volumes:
      - /var/lib/minio/data:/data
    environment:
      - MINIO_ROOT_USER=admin
      - MINIO_ROOT_PASSWORD=your-strong-password
    command: >
      server /data
      --console-address ":9001"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 30s
      timeout: 20s
      retries: 3
```

> **注意**：请将 `MINIO_ROOT_USER` 和 `MINIO_ROOT_PASSWORD` 替换为实际凭证。

启动命令：
```bash
docker-compose -f minio.yml up -d
```

---

## 验证服务

1. **健康检查**：
   ```bash
   curl http://localhost:9000/minio/health/live
   ```
   正常返回 `OK`。

2. **访问 Web 控制台**：
   打开浏览器访问 `http://<宿主机IP>:9001`，使用设置的 `MINIO_ROOT_USER` 和 `MINIO_ROOT_PASSWORD` 登录。

3. **使用 AWS CLI 测试**（可选）：
   ```bash
   # 配置别名（使用 MinIO 的 API 端口 9000）
   aws configure set minio http://localhost:9000
   aws configure set aws_access_key_id admin
   aws configure set aws_secret_access_key your-strong-password
   aws configure set default.region us-east-1

   # 创建 bucket
   aws --endpoint-url http://localhost:9000 s3 mb s3://test-bucket

   # 列出 buckets
   aws --endpoint-url http://localhost:9000 s3 ls
   ```

4. **查看容器日志**：
   ```bash
   docker logs -f minio
   ```

---

## 常见问题

- **端口冲突**：若 9000 或 9001 被占用，可在 `ports` 中修改映射，如 `-p 9002:9000`。
- **权限问题**：宿主机数据目录（`/var/lib/minio/data`）需要具有可写权限，可运行 `sudo chown -R 1000:1000 /var/lib/minio/data`（MinIO 容器内用户 ID 为 1000）。
- **忘记密码**：停止容器，删除 `/data/.minio.sys` 目录（会丢失用户配置，但保留数据），重新启动后使用新凭证。
- **内存占用**：MinIO 默认使用内存缓存，可通过 `--limit` 参数限制，或增加 `--json` 等选项，参考官方文档。

---

## 停止与清理

```bash
# 停止容器
docker stop minio

# 删除容器（数据卷仍保留）
docker rm minio

# 若使用 compose
docker-compose -f minio.yml down

# 若要同时删除数据卷（谨慎操作）
docker-compose -f minio.yml down -v
```

---

## 参考资料

- [MinIO 官方](https://www.min.io/)
- [MinIO Docker 部署指南](https://docs.min.io/aistor/installation/container/install/)
- [MinIO 健康检查 API](https://docs.min.io/aistor/operations/monitoring/healthcheck-probe/)
