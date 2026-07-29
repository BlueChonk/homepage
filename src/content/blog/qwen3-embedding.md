---
slug: qwen3-embedding
title: "Qwen3-Embedding-0.6B 文本嵌入模型部署文档"
date: 2026-01-22
tags:
  - 嵌入模型
  - RAG
  - 模型部署
  - GPU
summary: "部署 Qwen3-Embedding-0.6B 轻量级嵌入模型，支持 8K 上下文，适合资源受限场景的文本向量化任务。"
---

# Qwen3-Embedding-0.6B 文本嵌入模型部署文档

本文档介绍如何使用 Docker 部署 [Qwen3-Embedding-0.6B](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B) 文本嵌入模型，基于 `text-embeddings-inference` (TEI) 服务。Qwen3-Embedding-0.6B 是通义千问团队开源的轻量级嵌入模型，支持 8K 上下文长度，适合资源受限场景下的文本向量化任务。

由于网络限制，我们提供华为云 SWR 镜像源加速下载，并同时给出 `docker-compose` 与 `docker run` 两种启动方式。

---

## 模型简介

Qwen3-Embedding-0.6B 是 Qwen3 系列中的嵌入模型，参数规模 6 亿（0.6B），具有以下特点：
- **轻量高效**：模型体积小，推理速度快，显存占用低
- **长上下文**：支持 8192 token 上下文长度
- **多语言**：支持中文、英文等多种语言
- **SOTA 性能**：在多个嵌入基准测试中表现优异

适用场景：文本检索、RAG、相似度计算、聚类等。

---

## 前置条件

- **GPU 环境**：NVIDIA GPU，并已安装 [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)。
- **Docker**：版本 20.10+，并已配置 NVIDIA 运行时。
- **模型文件**：已下载 Qwen3-Embedding-0.6B 模型到宿主机目录（如 `/opt/models/Qwen/Qwen3-Embedding-0.6B`）。

---

## 模型下载

### 方式一：从 HuggingFace 下载
```bash
git lfs install
git clone https://huggingface.co/Qwen/Qwen3-Embedding-0.6B /opt/models/Qwen/Qwen3-Embedding-0.6B
```

### 方式二：从 ModelScope 下载（国内推荐）
```bash
# 安装 modelscope
pip install modelscope

# 下载模型到指定目录
modelscope download --model Qwen/Qwen3-Embedding-0.6B --local_dir /opt/models/Qwen/Qwen3-Embedding-0.6B
```
> **说明**：ModelScope 提供通义千问系列模型的国内加速下载，速度更稳定。

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
  --name qwen3-embedding-0.6b \
  --restart unless-stopped \
  --gpus '"device=0"' \
  -p 8000:8000 \
  -v /opt/models/Qwen/Qwen3-Embedding-0.6B:/qwen3-embedding-0.6b \
  ghcr.io/huggingface/text-embeddings-inference:cuda-1.9.2 \
  --model-id /qwen3-embedding-0.6b \
  --hostname 0.0.0.0 \
  --port 8000 \
  --max-batch-tokens 32768 \
  --auto-truncate false
```

**参数解释**：
- `-d`：后台运行。
- `--gpus '"device=0"'`：指定使用第 0 块 GPU。
- `-p 8000:8000`：暴露服务端口。
- `-v`：挂载宿主机模型目录到容器内 `/qwen3-embedding-0.6b`。
- `--max-batch-tokens 32768`：设置批次最大 token 数为 32768，可根据显存大小调整。
- `--auto-truncate false`：关闭自动截断，若输入超过模型上下文长度会返回错误（需客户端手动处理）。

---

### 方式二：使用 `docker-compose`

`qwen3-embedding-0.6b.yml` 文件内容：

```yaml
services:
  qwen3-embedding-0.6b:
    image: ghcr.io/huggingface/text-embeddings-inference:cuda-1.9.2
    container_name: qwen3-embedding-0.6b
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
      - /opt/models/Qwen/Qwen3-Embedding-0.6B:/qwen3-embedding-0.6b
    command: >
      --model-id /qwen3-embedding-0.6b
      --hostname 0.0.0.0
      --port 8000
      --max-batch-tokens 32768
      --auto-truncate false
```

启动命令：
```bash
docker-compose -f qwen3-embedding-0.6b.yml up -d
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
   返回模型的元数据信息，包括模型类型、上下文长度等。

3. **嵌入测试**（使用 cURL）：
   ```bash
   curl http://localhost:8000/embed \
     -X POST \
     -d '{"inputs":"你好，世界！"}' \
     -H 'Content-Type: application/json'
   ```
   返回文本的向量表示（1024 维浮点数数组）。

4. **批量嵌入测试**：
   ```bash
   curl http://localhost:8000/embed \
     -X POST \
     -d '{"inputs": ["文本1", "文本2", "文本3"]}' \
     -H 'Content-Type: application/json'
   ```

5. **查看容器日志**：
   ```bash
   docker logs -f qwen3-embedding-0.6b
   ```

---

## 重要参数说明

| 参数 | 说明 | 推荐值 |
|------|------|--------|
| `--max-batch-tokens` | 单个批次最大 token 总数，影响吞吐量 | 16384~65536（视显存而定） |
| `--auto-truncate` | 是否自动截断超长输入 | `false`（保留原始行为） |
| `--max-client-batch-size` | 单次请求最大批次大小 | 32（默认） |
| `--pooling` | 池化策略 | `cls`（模型默认） |

> **注意**：Qwen3-Embedding-0.6B 最大上下文长度为 8192 token，`--auto-truncate false` 意味着超长输入会返回错误，客户端需提前截断或分段处理。

---

## 常见问题

- **GPU 不可用**：确保 NVIDIA 驱动和 Container Toolkit 已正确安装，并运行 `docker run --rm --gpus all nvidia/cuda:11.0-base nvidia-smi` 测试。
- **模型加载慢**：首次启动会加载模型到显存，请耐心等待；模型约 1.2GB，显存占用约 2-4GB。
- **端口冲突**：若 8000 被占用，修改 `-p` 映射为其他端口，例如 `-p 8001:8000`。
- **输入超长错误**：由于 `--auto-truncate false`，若输入超过 8192 token，服务会返回错误。可在客户端使用 `tiktoken` 等工具预先截断。
- **显存不足**：可降低 `--max-batch-tokens` 值（如 16384）或使用 CPU 部署（需替换镜像为 CPU 版本）。

---

## 停止与清理

```bash
# 停止容器
docker stop qwen3-embedding-0.6b

# 删除容器
docker rm qwen3-embedding-0.6b

# 若使用 compose
docker-compose -f qwen3-embedding-0.6b.yml down
```

---

## 参考资料

- [Qwen3-Embedding-0.6B 模型主页](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B)
- [ModelScope Qwen3-Embedding-0.6B 页面](https://modelscope.cn/models/Qwen/Qwen3-Embedding-0.6B)
- [Text Embeddings Inference 官方文档](https://huggingface.co/docs/text-embeddings-inference/index)
- [Qwen3-Embedding 官方 GitHub](https://github.com/QwenLM/Qwen3-Embedding)
