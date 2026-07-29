---
slug: bge-reranker
title: "BGE-Reranker-v2-M3 重排序模型部署文档"
date: 2026-01-20
tags:
  - 重排序
  - RAG
  - 模型部署
  - GPU
summary: "用 Docker 部署 BGE-Reranker-v2-M3 重排序模型，提升 RAG 系统排序质量，附 docker-compose 与 docker run 示例。"
---

# BGE-Reranker-v2-M3 重排序模型部署文档

本文档介绍如何使用 Docker 部署 [BAAI/bge-reranker-v2-m3](https://huggingface.co/BAAI/bge-reranker-v2-m3) 重排序模型，基于 `text-embeddings-inference` (TEI) 服务。由于网络限制，我们提供华为云 SWR 镜像源加速下载，并同时给出 `docker-compose` 与 `docker run` 两种启动方式。

---

## 模型简介

BGE-Reranker-v2-M3 是一个轻量级的重排序（Reranker）模型，基于 BGE-M3-0.5B 构建，具备强大的多语言能力，易于部署且推理速度快。与 Embedding 模型不同，Reranker 将问题和文档作为输入，直接输出相关性分数（而非向量），可更好地优化 RAG 系统中的排序结果。

典型 RAG 流程：Embedding 召回 Top-50 → Reranker 重排 Top-5 → LLM 生成。

---

## 前置条件

- **GPU 环境**：NVIDIA GPU，并已安装 [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)。
- **Docker**：版本 20.10+，并已配置 NVIDIA 运行时。
- **模型文件**：已下载 BGE-Reranker-v2-M3 模型到宿主机目录（如 `/opt/models/BAAI/bge-reranker-v2-m3`）。

---

## 模型下载

### 方式一：从 HuggingFace 下载
```bash
git lfs install
git clone https://huggingface.co/BAAI/bge-reranker-v2-m3 /opt/models/BAAI/bge-reranker-v2-m3
```

### 方式二：从 ModelScope 下载（国内推荐）
```bash
# 安装 modelscope
pip install modelscope

# 下载模型到指定目录
modelscope download --model BAAI/bge-reranker-v2-m3 --local_dir /opt/models/BAAI/bge-reranker-v2-m3
```
> **说明**：ModelScope 也提供 BGE-Reranker-v2-M3 模型，下载速度对国内用户更友好。默认情况下，模型会下载到 `~/.cache/modelscope`，可通过 `--local_dir` 指定目录。

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
  --name bge-reranker-v2-m3 \
  --restart unless-stopped \
  --gpus '"device=0"' \
  -p 8000:8000 \
  -v /opt/models/BAAI/bge-reranker-v2-m3:/bge-reranker-v2-m3 \
  ghcr.io/huggingface/text-embeddings-inference:cuda-1.9.2 \
  --model-id /bge-reranker-v2-m3 \
  --hostname 0.0.0.0 \
  --port 8000
```

**参数解释**：
- `-d`：后台运行。
- `--gpus '"device=0"'`：指定使用第 0 块 GPU。
- `-p 8000:8000`：暴露服务端口。
- `-v`：挂载宿主机模型目录到容器内 `/bge-reranker-v2-m3`。
- 最后一行是容器启动命令，与 compose 中的 `command` 一致。

---

### 方式二：使用 `docker-compose`

`bge-reranker-v2-m3.yml` 文件内容：

```yaml
services:
  bge-reranker-v2-m3:
    image: ghcr.io/huggingface/text-embeddings-inference:cuda-1.9.2
    container_name: bge-reranker-v2-m3
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
      - /opt/models/BAAI/bge-reranker-v2-m3:/bge-reranker-v2-m3
    command: >
      --model-id /bge-reranker-v2-m3
      --hostname 0.0.0.0
      --port 8000
```

启动命令：
```bash
docker-compose -f bge-reranker-v2-m3.yml up -d
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

3. **重排序测试**（使用 cURL）：
   TEI 为 Reranker 模型提供 `/rerank` 接口：
   ```bash
   curl http://localhost:8000/rerank \
     -X POST \
     -H "Content-Type: application/json" \
     -d '{
       "query": "中国的首都在哪儿",
       "texts": ["北京", "上海", "广州"],
       "truncate": true
     }'
   ```
   返回结果中包含每个文档的相关性分数，按分数从高到低排序。

   > **可选参数**：
   > - `raw_scores`: 设为 `true` 返回原始分数，`false` 返回归一化分数（0-1）。
   > - `return_text`: 设为 `true` 在返回结果中包含原文。
   > - `truncation_direction`: 截断方向，可选 `"left"` 或 `"right"`。

4. **查看容器日志**：
   ```bash
   docker logs -f bge-reranker-v2-m3
   ```

---

## 性能参考

在 RTX 5060 Ti 16GB 显卡上，BGE-Reranker-v2-M3 可达到约 **22K query-doc pairs/sec** 的处理速度。

---

## 常见问题

- **GPU 不可用**：确保 NVIDIA 驱动和 Container Toolkit 已正确安装，并运行 `docker run --rm --gpus all nvidia/cuda:11.0-base nvidia-smi` 测试。
- **模型加载慢**：首次启动会加载模型到显存，请耐心等待；若显存不足，可调整 `--max-batch-tokens` 等参数。
- **端口冲突**：若 8000 被占用，修改 `-p` 映射为其他端口，例如 `-p 8001:8000`。
- **模型类型错误**：如果访问 `/rerank` 返回 424 状态码，说明模型不是 Sequence Classification 模型，请确认挂载的模型路径正确指向 bge-reranker-v2-m3。

---

## 停止与清理

```bash
# 停止容器
docker stop bge-reranker-v2-m3

# 删除容器
docker rm bge-reranker-v2-m3

# 若使用 compose
docker-compose -f bge-reranker-v2-m3.yml down
```

---

## 参考资料

- [Text Embeddings Inference 官方文档](https://huggingface.co/docs/text-embeddings-inference/index)
- [TEI OpenAPI 规范](https://huggingface.github.io/text-embeddings-inference/)
- [BGE-Reranker-v2-M3 模型主页](https://huggingface.co/BAAI/bge-reranker-v2-m3)
- [FlagEmbedding GitHub](https://github.com/FlagOpen/FlagEmbedding)
- [ModelScope BGE-Reranker-v2-M3 页面](https://modelscope.cn/models/BAAI/bge-reranker-v2-m3)
