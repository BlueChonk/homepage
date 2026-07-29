---
slug: bge-m3
title: "BGE-M3 文本嵌入模型部署文档"
date: 2026-01-18
tags:
  - 嵌入模型
  - RAG
  - 模型部署
  - GPU
summary: "基于 text-embeddings-inference 用 Docker 部署 BGE-M3 多语言文本嵌入模型，含华为云镜像加速与两种启动方式。"
---

# BGE-M3 文本嵌入模型部署文档

本文档介绍如何使用 Docker 部署 [BGE-M3](https://huggingface.co/BAAI/bge-m3) 文本嵌入模型，基于 `text-embeddings-inference` (TEI) 服务。由于网络限制，我们提供华为云 SWR 镜像源加速下载，并同时给出 `docker-compose` 与 `docker run` 两种启动方式。

---

## 前置条件

- **GPU 环境**：NVIDIA GPU，并已安装 [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)。
- **Docker**：版本 20.10+，并已配置 NVIDIA 运行时。
- **模型文件**：已下载 BGE-M3 模型到宿主机目录（如 `/opt/models/BAAI/bge-m3`）。

---

## 模型下载

### 方式一：从 HuggingFace 下载
```bash
git lfs install
git clone https://huggingface.co/BAAI/bge-m3 /opt/models/BAAI/bge-m3
```

### 方式二：从 ModelScope 下载（国内推荐）
```bash
# 安装 modelscope
pip install modelscope

# 下载模型到指定目录
modelscope download --model BAAI/bge-m3 --local_dir /opt/models/BAAI/bge-m3
```
> **说明**：ModelScope 也提供 BGE-M3 模型，下载速度对国内用户更友好。默认情况下，模型会下载到 `~/.cache/modelscope`，可通过 `--local_dir` 指定目录。

---

## 镜像拉取（国内加速）

原镜像为 `ghcr.io/huggingface/text-embeddings-inference:cuda-1.9.2`。使用华为云 SWR 镜像源加速下载：

```bash
# 1. 从华为云 SWR 拉取镜像
docker pull swr.cn-north-4.myhuaweicloud.com/ddn-k8s/ghcr.io/huggingface/text-embeddings-inference:cuda-1.9.2

# 2. 重新标记为原始镜像名称
docker tag swr.cn-north-4.myhuaweicloud.com/ddn-k8s/ghcr.io/huggingface/text-embeddings-inference:cuda-1.9.2 ghcr.io/huggingface/text-embeddings-inference:cuda-1.9.2
```

---

## 启动服务

### 方式一：使用 `docker run`（推荐）

```bash
docker run -d \
  --name bge-m3 \
  --restart unless-stopped \
  --gpus '"device=0"' \
  -p 8000:8000 \
  -v /opt/models/BAAI/bge-m3:/bge-m3 \
  ghcr.io/huggingface/text-embeddings-inference:cuda-1.9.2 \
  --model-id /bge-m3 \
  --hostname 0.0.0.0 \
  --port 8000
```

**参数解释**：
- `-d`：后台运行。
- `--gpus '"device=0"'`：指定使用第 0 块 GPU。
- `-p 8000:8000`：暴露服务端口。
- `-v`：挂载宿主机模型目录到容器内 `/bge-m3`。
- 最后一行是容器启动命令，与 compose 中的 `command` 一致。

---

### 方式二：使用 `docker-compose`

`bge-m3.yml` 文件内容：

```yaml
services:
  bge-m3:
    image: ghcr.io/huggingface/text-embeddings-inference:cuda-1.9.2
    container_name: bge-m3
    restart: unless-stopped
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              device_ids: ['0']
              capabilities: [gpu]
    ports:
      - 8000:8000
    volumes:
      - /opt/models/BAAI/bge-m3:/bge-m3
    command: >
      --model-id /bge-m3
      --hostname 0.0.0.0
      --port 8000
```

启动命令：
```bash
docker-compose -f bge-m3.yml up -d
```

---

## 验证服务

服务启动后，可通过以下方式验证：

1. **健康检查**：
   ```bash
   curl http://localhost:8000/health
   ```
   服务正常时返回 `200 OK`，否则返回 `503`。

2. **获取模型信息**：
   ```bash
   curl http://localhost:8000/info
   ```
   返回模型的元数据信息。

3. **嵌入测试**（使用 cURL）：
   ```bash
   curl http://localhost:8000/embed \
     -X POST \
     -d '{"inputs":"Hello, world!"}' \
     -H 'Content-Type: application/json'
   ```

4. **查看容器日志**：
   ```bash
   docker logs -f bge-m3
   ```

---

## 常见问题

- **GPU 不可用**：确保 NVIDIA 驱动和 Container Toolkit 已正确安装，并运行 `docker run --rm --gpus all nvidia/cuda:11.0-base nvidia-smi` 测试。
- **模型加载慢**：首次启动会加载模型到显存，请耐心等待；若显存不足，可调整 `--max-batch-tokens` 等参数。
- **端口冲突**：若 8000 被占用，修改 `-p` 映射为其他端口，例如 `-p 8001:8000`。

---

## 停止与清理

```bash
# 停止容器
docker stop bge-m3

# 删除容器
docker rm bge-m3

# 若使用 compose
docker-compose -f bge-m3.yml down
```

---

## 参考资料

- [Text Embeddings Inference 官方文档](https://huggingface.co/docs/text-embeddings-inference/index)
- [TEI Quick Tour](https://huggingface.co/docs/text-embeddings-inference/en/quick_tour)
- [TEI HTTP API 文档](https://deepwiki.com/huggingface/text-embeddings-inference/6.1-http-api)
- [BGE-M3 模型主页](https://huggingface.co/BAAI/bge-m3)
- [ModelScope BGE-M3 页面](https://modelscope.cn/models/BAAI/bge-m3)
