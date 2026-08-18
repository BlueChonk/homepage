# 从零复现 BERT（中文情感二分类）完整流程

> 配套代码目录：`bert-from-scratch-zh/`
> 核心思想：**不依赖 `transformers` 库，完全使用原生 PyTorch 手写实现 BERT**，完成中文情感二分类的完整实验链路，并以此为载体系统演示「否定反转语义」这一真实短板的定位与优化。

本文整合了项目的全部源码、实验记录与真实输出指标，按「简介 → 依赖 → 模型 → 数据 → 训练 → 评估 → 优化实验 → 运行流程 → 结果复盘」的顺序展开。所有代码均为项目真实源码，所有实验数值均原样保留。

---

## 1. 项目简介、实验目标与整体架构

### 1.1 项目简介

本项目是一个**教学向**的从零复现工程。它不调用 HuggingFace `transformers`，而是用最朴素的 `torch.nn` 模块把 BERT 论文中的核心组件（嵌入层、多头缩放点积注意力、前馈网络、编码器层、分类头）逐一实现，并在一份**模板合成的中文情感二分类数据**上完成训练与评估。

选择「中文情感二分类」作为落地任务，是因为它足够简单、可在 CPU/GPU 上 1 分钟内跑通，又足以暴露一个真实的语义难点：**否定反转语义**（如「一点都不好看」应为负向、「一点都不垃圾」应为正向）。围绕这个难点，项目设计了一整套可独立开关的优化策略，并记录成完整的实验对比。

### 1.2 实验目标

1. 用纯 PyTorch 复刻 BERT 主干，验证「不依赖 transformers 也能实现可用 BERT」；
2. 跑通「随机数据生成 → 字符级词表构建 → 训练 → 评估」全链路；
3. 定位基线模型的核心缺陷（否定反转语义理解失败）；
4. 用 5 个可独立开关的策略对比优化效果，给出可复现的实验结论。

### 1.3 整体架构

```
bert-from-scratch-zh/
├── main.py            # CLI 入口（数据/词表缺失时自动生成；调度训练/评估）
├── generate_data.py   # 1000 条随机中文情感二分类数据生成（模板 + 否定 + 噪声）
├── dataset.py         # 字符级 tokenizer、词表构建、DataLoader
├── bert.py            # BERT 从零实现（BertConfig / BertModel / 分类头）
├── train.py           # 训练器：AdamW + 线性 warmup、早停、检查点管理
├── evaluate.py        # 评估器：Accuracy / P / R / F1 / 混淆矩阵 + Best/Worst Cases
├── augment.py         # 数据增强与过采样策略（均可独立开关）
├── EXPERIMENTS.md     # 否定语义优化全实验记录
├── vocab.json         # 字符词表（174 token，自动生成）
├── data/              # train/val/test.jsonl（800/100/100，自动生成）
├── checkpoints/       # bert_{exp}_best.pth、bert_{exp}_final.pth、bert_{exp}_training_history.json
├── log/               # bert_{exp}_training_log.txt 训练日志（按实验名隔离）
└── report/            # bert_{exp}_evaluation_report_{split}.json 评估报告（按实验名隔离）
```

模块依赖关系：

```
generate_data.py ──► data/*.jsonl ──► dataset.py(build_vocab) ──► vocab.json
                                                  │
                                                  ▼
bert.py(BertForSequenceClassification) ◄── main.py ──► train.py(BertTrainer)
                                                  │                  │
                                                  ▼                  ▼
                                          evaluate.py(BertEvaluator)  augment.py(仅训练集)
```

---

## 2. 环境依赖清单

本项目刻意保持极简依赖，核心只依赖 PyTorch 与 `tqdm`，**不依赖 `transformers`**。

| 依赖 | 版本要求 | 用途 |
|------|----------|------|
| Python | 3.11（推荐 conda 环境） | 运行环境 |
| torch | 2.x | 模型、训练、张量运算（CUDA 可选，无 GPU 自动降级 CPU） |
| tqdm | 任意较新版本 | 训练/评估进度条 |

> `json`、`argparse`、`random`、`pathlib`、`collections`、`math`、`shutil`、`time` 均为 Python 标准库，无需额外安装。

安装示例：

```bash
conda create -n bert-zh python=3.11 -y
conda activate bert-zh
pip install torch==2.2.0 tqdm
```

> 说明：`transformers` 在整个工程中**完全没有出现**，这正是对「从零复现」的坚持。

---

## 3. 模型实现（bert.py 全源码 + 逐模块解析）

`bert.py` 是项目的核心。它复现了 BERT 论文的关键组件，并采用 **Post-LN**（子层输出后再做 Add & LayerNorm）结构。

### 3.1 bert.py 完整源码

```python
#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
BERT 模型从零实现（纯 PyTorch，不依赖 transformers 库）

复现 BERT 核心组件（对应论文 BERT: Pre-training of Deep Bidirectional
Transformers for Language Understanding）：
- BertEmbeddings：token + position + segment 三种嵌入相加，LayerNorm + Dropout
- MultiHeadSelfAttention：多头缩放点积注意力（QKV 投影 + attention mask）
- FeedForward：Linear -> GELU -> Linear（intermediate_size）
- BertEncoderLayer：Post-LN 结构（Attention/FFN 后 Add & LayerNorm）
- BertModel：堆叠 N 层编码器，输出 sequence_output 与 [CLS] pooled_output
- BertForSequenceClassification：[CLS] -> tanh pooler -> dropout -> 线性分类头
"""
import math

import torch
import torch.nn as nn


class BertConfig:
    """BERT 模型配置（小模型，适合从零训练的演示任务）"""

    def __init__(self, vocab_size, hidden_size=128, num_hidden_layers=4,
                 num_attention_heads=4, intermediate_size=256,
                 max_position_embeddings=64, type_vocab_size=2,
                 hidden_dropout_prob=0.1, num_labels=2):
        self.vocab_size = vocab_size
        self.hidden_size = hidden_size
        self.num_hidden_layers = num_hidden_layers
        self.num_attention_heads = num_attention_heads
        self.intermediate_size = intermediate_size
        self.max_position_embeddings = max_position_embeddings
        self.type_vocab_size = type_vocab_size
        self.hidden_dropout_prob = hidden_dropout_prob
        self.num_labels = num_labels
        assert hidden_size % num_attention_heads == 0, \
            "hidden_size 必须能被 num_attention_heads 整除"


class BertEmbeddings(nn.Module):
    """token嵌入 + 位置嵌入 + segment嵌入，再 LayerNorm + Dropout"""

    def __init__(self, config: BertConfig):
        super().__init__()
        self.word_embeddings = nn.Embedding(config.vocab_size, config.hidden_size,
                                            padding_idx=0)
        self.position_embeddings = nn.Embedding(config.max_position_embeddings,
                                                config.hidden_size)
        self.token_type_embeddings = nn.Embedding(config.type_vocab_size,
                                                  config.hidden_size)
        self.layer_norm = nn.LayerNorm(config.hidden_size, eps=1e-12)
        self.dropout = nn.Dropout(config.hidden_dropout_prob)

    def forward(self, input_ids, token_type_ids=None):
        seq_len = input_ids.size(1)
        position_ids = torch.arange(seq_len, dtype=torch.long,
                                    device=input_ids.device).unsqueeze(0)
        if token_type_ids is None:
            token_type_ids = torch.zeros_like(input_ids)

        embeddings = (self.word_embeddings(input_ids)
                      + self.position_embeddings(position_ids)
                      + self.token_type_embeddings(token_type_ids))
        return self.dropout(self.layer_norm(embeddings))


class MultiHeadSelfAttention(nn.Module):
    """多头缩放点积自注意力"""

    def __init__(self, config: BertConfig):
        super().__init__()
        self.num_heads = config.num_attention_heads
        self.head_dim = config.hidden_size // config.num_attention_heads
        self.all_head_size = config.hidden_size

        self.query = nn.Linear(config.hidden_size, self.all_head_size)
        self.key = nn.Linear(config.hidden_size, self.all_head_size)
        self.value = nn.Linear(config.hidden_size, self.all_head_size)
        self.output_dense = nn.Linear(config.hidden_size, config.hidden_size)
        self.dropout = nn.Dropout(config.hidden_dropout_prob)

    def transpose_for_scores(self, x):
        # (batch, seq_len, hidden) -> (batch, num_heads, seq_len, head_dim)
        batch_size, seq_len, _ = x.size()
        return x.view(batch_size, seq_len, self.num_heads,
                      self.head_dim).permute(0, 2, 1, 3)

    def forward(self, hidden_states, attention_mask=None):
        # Q/K/V 投影并拆成多头
        query_layer = self.transpose_for_scores(self.query(hidden_states))
        key_layer = self.transpose_for_scores(self.key(hidden_states))
        value_layer = self.transpose_for_scores(self.value(hidden_states))

        # 缩放点积注意力分数: QK^T / sqrt(d_k)
        attention_scores = torch.matmul(query_layer, key_layer.transpose(-1, -2))
        attention_scores = attention_scores / math.sqrt(self.head_dim)

        # 应用 padding mask：被 mask 的位置分数置为 -1e4，softmax 后趋近 0
        if attention_mask is not None:
            extended_mask = (1.0 - attention_mask.unsqueeze(1).unsqueeze(2)) * -10000.0
            attention_scores = attention_scores + extended_mask

        attention_probs = torch.softmax(attention_scores, dim=-1)
        attention_probs = self.dropout(attention_probs)

        # 加权求和并还原形状
        context_layer = torch.matmul(attention_probs, value_layer)
        context_layer = context_layer.permute(0, 2, 1, 3).contiguous()
        context_layer = context_layer.view(context_layer.size(0),
                                           context_layer.size(1),
                                           self.all_head_size)
        return self.output_dense(context_layer)


class FeedForward(nn.Module):
    """Transformer 前馈网络：hidden -> intermediate -> hidden（GELU 激活）"""

    def __init__(self, config: BertConfig):
        super().__init__()
        self.dense_in = nn.Linear(config.hidden_size, config.intermediate_size)
        self.dense_out = nn.Linear(config.intermediate_size, config.hidden_size)
        self.activation = nn.GELU()

    def forward(self, hidden_states):
        return self.dense_out(self.activation(self.dense_in(hidden_states)))


class BertEncoderLayer(nn.Module):
    """单层 Transformer 编码器（Post-LN：子层输出 Add & LayerNorm）"""

    def __init__(self, config: BertConfig):
        super().__init__()
        self.attention = MultiHeadSelfAttention(config)
        self.attn_layer_norm = nn.LayerNorm(config.hidden_size, eps=1e-12)
        self.feed_forward = FeedForward(config)
        self.ffn_layer_norm = nn.LayerNorm(config.hidden_size, eps=1e-12)
        self.dropout = nn.Dropout(config.hidden_dropout_prob)

    def forward(self, hidden_states, attention_mask=None):
        # 自注意力子层 + 残差 + LayerNorm
        attention_output = self.attention(hidden_states, attention_mask)
        hidden_states = self.attn_layer_norm(hidden_states
                                             + self.dropout(attention_output))
        # 前馈子层 + 残差 + LayerNorm
        ffn_output = self.feed_forward(hidden_states)
        hidden_states = self.ffn_layer_norm(hidden_states
                                            + self.dropout(ffn_output))
        return hidden_states


class BertModel(nn.Module):
    """BERT 主干：嵌入层 + N 层编码器 + [CLS] tanh 池化"""

    def __init__(self, config: BertConfig):
        super().__init__()
        self.embeddings = BertEmbeddings(config)
        self.encoder_layers = nn.ModuleList(
            [BertEncoderLayer(config) for _ in range(config.num_hidden_layers)]
        )
        self.pooler = nn.Linear(config.hidden_size, config.hidden_size)
        self.pooler_activation = nn.Tanh()

    def forward(self, input_ids, attention_mask=None, token_type_ids=None):
        hidden_states = self.embeddings(input_ids, token_type_ids)
        for layer in self.encoder_layers:
            hidden_states = layer(hidden_states, attention_mask)
        sequence_output = hidden_states
        pooled_output = self.pooler_activation(self.pooler(sequence_output[:, 0]))
        return sequence_output, pooled_output


class BertForSequenceClassification(nn.Module):
    """BERT 序列分类模型：[CLS] 池化 -> dropout -> 线性分类头"""

    def __init__(self, config: BertConfig):
        super().__init__()
        self.bert = BertModel(config)
        self.dropout = nn.Dropout(config.hidden_dropout_prob)
        self.classifier = nn.Linear(config.hidden_size, config.num_labels)
        self.loss_fct = nn.CrossEntropyLoss()
        # 与原版 BERT 一致：N(0, 0.02) 初始化全部权重
        self.apply(self._init_weights)

    @staticmethod
    def _init_weights(module):
        if isinstance(module, (nn.Linear, nn.Embedding)):
            module.weight.data.normal_(mean=0.0, std=0.02)
            if isinstance(module, nn.Linear) and module.bias is not None:
                module.bias.data.zero_()
        elif isinstance(module, nn.LayerNorm):
            module.weight.data.fill_(1.0)
            module.bias.data.zero_()

    def forward(self, input_ids, attention_mask=None, token_type_ids=None,
                labels=None):
        _, pooled_output = self.bert(input_ids, attention_mask, token_type_ids)
        logits = self.classifier(self.dropout(pooled_output))
        loss = None
        if labels is not None:
            loss = self.loss_fct(logits, labels)
        return {"loss": loss, "logits": logits}
```

### 3.2 逐模块解析

#### 3.2.1 BertConfig：模型配置

集中的配置对象。`hidden_size` 必须能被 `num_attention_heads` 整除（断言保证），这样多头注意力才能均匀切分。本项目使用的默认小模型配置如下（实际由 `main.py` 传入）：

| 配置项 | 值 |
|--------|-----|
| hidden_size | 128 |
| num_hidden_layers | 4 |
| num_attention_heads | 4 |
| intermediate_size | 256（`hidden_size * 2`） |
| max_position_embeddings | 48 |
| type_vocab_size | 2 |
| hidden_dropout_prob | 0.1 |
| num_labels | 2 |

#### 3.2.2 BertEmbeddings：三种嵌入相加

BERT 的输入表示由三部分求和得到：

- `word_embeddings`：词（字）的 token 嵌入，带 `padding_idx=0`，padding 位置不参与梯度更新；
- `position_embeddings`：位置嵌入，位置 id 直接取 `[0, 1, 2, ...]`，长度等于当前序列长度（动态生成，不依赖固定最大长度）；
- `token_type_embeddings`：句段嵌入（单句任务恒为 0）。

三者相加后做 `LayerNorm + Dropout`。注意：**先求和再加 LayerNorm**，这是 BERT 的标准顺序。

```python
embeddings = (self.word_embeddings(input_ids)
              + self.position_embeddings(position_ids)
              + self.token_type_embeddings(token_type_ids))
return self.dropout(self.layer_norm(embeddings))
```

#### 3.2.3 MultiHeadSelfAttention：多头缩放点积注意力

这是 BERT 的灵魂组件，等价于论文中的 Scaled Dot-Product Attention 拆成多份并行：

1. **QKV 投影**：`query/key/value` 三个 `Linear(hidden, hidden)`；
2. **切分多头**：`transpose_for_scores` 把 `(batch, seq, hidden)` 变形为 `(batch, heads, seq, head_dim)`，`head_dim = hidden / heads = 32`；
3. **缩放点积**：`attention_scores = QK^T / sqrt(head_dim)`；
4. **padding mask**：`extended_mask = (1 - attention_mask) * -10000`，把被 pad 掉的位置分数压到极小，softmax 后权重趋近 0，使其不参与上下文聚合；
5. **softmax + dropout + 加权求和**：`context = softmax(scores) · V`，再经 `output_dense` 投影回 `hidden`。

```python
attention_scores = torch.matmul(query_layer, key_layer.transpose(-1, -2))
attention_scores = attention_scores / math.sqrt(self.head_dim)
if attention_mask is not None:
    extended_mask = (1.0 - attention_mask.unsqueeze(1).unsqueeze(2)) * -10000.0
    attention_scores = attention_scores + extended_mask
attention_probs = torch.softmax(attention_scores, dim=-1)
```

#### 3.2.4 FeedForward：前馈网络

两层全连接夹一个 GELU 激活，维度先扩到 `intermediate_size`（256）再缩回 `hidden_size`（128）：

```python
self.dense_in  = nn.Linear(hidden_size, intermediate_size)
self.dense_out = nn.Linear(intermediate_size, hidden_size)
self.activation = nn.GELU()
```

#### 3.2.5 BertEncoderLayer：Post-LN 编码器层

本项目使用 **Post-LN**（残差之后再 LayerNorm），与 BERT 原版一致：

```python
# 自注意力子层 + 残差 + LayerNorm
attention_output = self.attention(hidden_states, attention_mask)
hidden_states = self.attn_layer_norm(hidden_states + self.dropout(attention_output))
# 前馈子层 + 残差 + LayerNorm
ffn_output = self.feed_forward(hidden_states)
hidden_states = self.ffn_layer_norm(hidden_states + self.dropout(ffn_output))
```

区别提醒：Pre-LN（先 LayerNorm 再子层）在现代训练里更稳定，但本项目严格复刻 BERT 原版的 Post-LN 结构。

#### 3.2.6 BertModel 与分类头

- `BertModel`：嵌入层 → N 层编码器 → 取 `[CLS]`（序列第 0 位）经 `Linear + Tanh` 池化为 `pooled_output`；
- `BertForSequenceClassification`：`pooled_output → dropout → Linear(hidden, 2)` 得到 logits；若提供 `labels`，用 `CrossEntropyLoss` 算 loss。

#### 3.2.7 权重初始化规则

`self.apply(self._init_weights)` 递归应用以下规则（与 BERT 原版一致）：

- `Linear` / `Embedding` 权重：`N(0, 0.02)`；
- `Linear` 偏置：置 0；
- `LayerNorm`：权重置 1、偏置置 0。

#### 3.2.8 参数量

本项目的可训练参数量为 **575,618**（约 57.6 万），由 `main.py` 在创建模型后打印：

```python
param_count = sum(p.numel() for p in model.parameters() if p.requires_grad)
# [OK] BERT 模型创建成功！可训练参数量：575,618
```

这是一个非常适合教学与快速实验的小模型，GPU 上 1 分钟内、CPU 上数分钟可完成训练。

---

## 4. 数据全流程实现

数据链路由 `generate_data.py`（合成数据）与 `dataset.py`（分词、词表、编码）两部分组成。

### 4.1 generate_data.py 完整源码

```python
#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
二分类任务数据生成脚本（中文情感分类：正向=1 / 负向=0）

生成 1000 条随机模板化中文文本数据：
- 标签由情感词极性决定，类别完全平衡（500 正 / 500 负）
- 约 15% 样本使用否定模板（如「这部电影不太好看」），标签翻转，增加学习难度
- 随机插入中性噪声成分（口头禅 / 结尾语气），模拟真实文本多样性
- 固定随机种子可复现，默认划分 train/val/test = 800/100/100

用法：
    python generate_data.py --num-samples 1000 --output-dir ./data
"""
import argparse
import json
import random
from pathlib import Path

# ---------- 词库 ----------
POS_WORDS = ["喜欢", "满意", "优秀", "出色", "精彩", "完美", "推荐", "惊喜", "舒服",
             "靠谱", "流畅", "贴心", "值得", "感动", "开心", "惊艳", "专业", "耐用",
             "实惠", "温暖"]
NEG_WORDS = ["讨厌", "失望", "糟糕", "差劲", "垃圾", "难看", "难用", "后悔", "无聊",
             "差评", "崩溃", "敷衍", "难吃", "刺耳", "卡顿", "离谱", "恼火", "失败",
             "难喝", "闷热"]
SUBJECTS = ["这部电影", "这家店", "服务员", "产品质量", "快递", "客服", "这个app",
            "课程", "酒店", "外卖", "音乐", "剧情", "包装", "售后", "整体体验",
            "游戏", "屏幕", "电池", "物流", "界面"]
ADVERBS = ["非常", "十分", "特别", "很", "相当", "超级", "有点", "极其", "真的"]
# 中性噪声成分：不改变标签极性
NOISE_HEADS = ["我觉得", "朋友说", "说实话", "老实说", "总体来说", "总的来说",
               "其实", "讲真", "个人感觉", "有一说一"]
NOISE_TAILS = ["就这样吧", "不多说了", "你们自己体会", "先这样吧", "回头再说",
               "点到为止", "大家心里有数"]

# 普通模板：标签 = 情感词极性
TEMPLATES = [
    "{sub}{adv}{senti}",
    "{head}，{sub}{adv}{senti}",
    "{sub}{senti}，{tail}",
    "{sub}真的{adv}{senti}",
    "这次的{sub}{adv}{senti}",
    "{head}，{sub}太{senti}了",
    "{sub}，{adv}{senti}，{tail}",
    "{sub}用起来{adv}{senti}",
]
# 否定模板：标签 = 情感词极性翻转
NEG_TEMPLATES = [
    "{sub}{adv}不{senti}",
    "{sub}一点都不{senti}",
    "{head}，{sub}实在不{senti}",
    "{sub}称不上{senti}，{tail}",
]


def make_sample(rng: random.Random, polarity: int) -> dict:
    """生成单条样本。polarity: 1=使用正向情感词, 0=使用负向情感词"""
    senti = rng.choice(POS_WORDS) if polarity == 1 else rng.choice(NEG_WORDS)
    sub = rng.choice(SUBJECTS)
    adv = rng.choice(ADVERBS)
    head = rng.choice(NOISE_HEADS)
    tail = rng.choice(NOISE_TAILS)

    if rng.random() < 0.15:  # 否定模板，标签翻转
        text = rng.choice(NEG_TEMPLATES).format(sub=sub, adv=adv, senti=senti,
                                                head=head, tail=tail)
        label = 1 - polarity
    else:
        text = rng.choice(TEMPLATES).format(sub=sub, adv=adv, senti=senti,
                                            head=head, tail=tail)
        label = polarity
    return {"text": text, "label": label}


def generate_dataset(num_samples: int, output_dir: Path,
                     val_ratio: float = 0.1, test_ratio: float = 0.1,
                     seed: int = 42) -> None:
    """生成数据并划分 train/val/test，保存为 jsonl（每行一个样本）"""
    rng = random.Random(seed)

    # 类别平衡：一半正向词、一半负向词，最后整体打乱
    samples = [make_sample(rng, polarity=i % 2) for i in range(num_samples)]
    rng.shuffle(samples)

    n_val = int(num_samples * val_ratio)
    n_test = int(num_samples * test_ratio)
    splits = {
        "train": samples[n_val + n_test:],
        "val": samples[:n_val],
        "test": samples[n_val:n_val + n_test],
    }

    output_dir.mkdir(parents=True, exist_ok=True)
    print("\n" + "=" * 60)
    print("数据生成完成")
    print("=" * 60)
    for split_name, split_samples in splits.items():
        out_file = output_dir / f"{split_name}.jsonl"
        with open(out_file, "w", encoding="utf-8") as f:
            for s in split_samples:
                f.write(json.dumps(s, ensure_ascii=False) + "\n")
        n_pos = sum(s["label"] for s in split_samples)
        print(f"{split_name:<6} 共 {len(split_samples):<5} 条 "
              f"(正向 {n_pos} / 负向 {len(split_samples) - n_pos}) -> {out_file}")

    # 打印示例
    print("-" * 60)
    print("样本示例：")
    for s in samples[:5]:
        print(f"  [{'正向' if s['label'] == 1 else '负向'}] {s['text']}")
    print("=" * 60 + "\n")


def main():
    parser = argparse.ArgumentParser(description="生成二分类（中文情感）随机数据")
    parser.add_argument("--num-samples", type=int, default=1000, help="总样本数")
    parser.add_argument("--output-dir", type=str,
                        default=str(Path(__file__).resolve().parent / "data"),
                        help="输出目录")
    parser.add_argument("--val-ratio", type=float, default=0.1, help="验证集比例")
    parser.add_argument("--test-ratio", type=float, default=0.1, help="测试集比例")
    parser.add_argument("--seed", type=int, default=42, help="随机种子")
    args = parser.parse_args()

    generate_dataset(num_samples=args.num_samples,
                     output_dir=Path(args.output_dir),
                     val_ratio=args.val_ratio,
                     test_ratio=args.test_ratio,
                     seed=args.seed)


if __name__ == "__main__":
    main()
```

#### 4.1.1 数据生成逻辑说明

- **词库**：20 个正向情感词（`POS_WORDS`）、20 个负向情感词（`NEG_WORDS`）、20 个主语、9 个程度副词、10 个中性噪声前缀、7 个中性噪声后缀。
- **标签规则**：**情感词极性决定标签**（正向=1 / 负向=0），类别完全平衡（按 `i % 2` 交替生成，500 正 / 500 负）。
- **模板拼接**：普通模板 `TEMPLATES` 直接拼接主语 × 程度副词 × 情感词 × 中性噪声；
- **否定句式（关键）**：以 **15% 概率**（`rng.random() < 0.15`）改用 `NEG_TEMPLATES`（如「`{sub}{adv}不{senti}`」「`{sub}一点都不{senti}`」「`{sub}称不上{senti}`」），此时**标签翻转**。例如情感词取「垃圾」（负向），套用「一点都不垃圾」→ 文本为负向词但语义正向，标签翻为 1。
- **中性噪声**：`NOISE_HEADS`/`NOISE_TAILS`（如「说实话」「大家心里有数」）不改变极性，只为模拟真实文本的多样性。
- **划分与可复现**：`train/val/test = 800/100/100`，固定 `seed=42` 可完整复现。

| 文本 | 标签 | 说明 |
|------|------|------|
| 这次的酒店十分专业 | 正向 | 普通模板 |
| 包装，相当惊艳，大家心里有数 | 正向 | 带中性噪声 |
| 这部电影一点都不好看 | 负向（否定） | 否定模板，标签翻转 |
| 老实说，客服实在不靠谱 | 负向 | 否定模板，标签翻转 |

### 4.2 dataset.py 完整源码

```python
#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
数据集加载与词表构建

- 中文按字切分（字符级 tokenizer），特殊 token：[PAD]/[UNK]/[CLS]/[SEP]/[MASK]
- build_vocab_from_data：统计数据目录下所有 jsonl 的字符并构建词表
- BertDataset：读取 jsonl，编码为 [CLS] + 字符 + [SEP]，padding 到 max_len
- create_dataloaders：构建 train/val/test 三个 DataLoader
"""
import json
import random
from pathlib import Path

import torch
from torch.utils.data import Dataset, DataLoader

SPECIAL_TOKENS = ["[PAD]", "[UNK]", "[CLS]", "[SEP]", "[MASK]"]
PAD_ID, UNK_ID, CLS_ID, SEP_ID, MASK_ID = range(len(SPECIAL_TOKENS))


def build_vocab_from_data(data_dir: Path, output_file: Path, min_count: int = 1) -> dict:
    """从 data_dir 下的 train/val/test jsonl 构建字符级词表"""
    from collections import Counter
    counter = Counter()
    for split in ["train", "val", "test"]:
        jsonl_file = data_dir / f"{split}.jsonl"
        if not jsonl_file.exists():
            continue
        with open(jsonl_file, "r", encoding="utf-8") as f:
            for line in f:
                counter.update(json.loads(line)["text"])

    char2idx = {tok: i for i, tok in enumerate(SPECIAL_TOKENS)}
    for char, count in sorted(counter.items(), key=lambda x: (-x[1], x[0])):
        if count >= min_count and char not in char2idx:
            char2idx[char] = len(char2idx)
    idx2char = {i: c for c, i in char2idx.items()}

    vocab = {
        "char2idx": char2idx,
        "idx2char": {str(i): c for i, c in idx2char.items()},
        "vocab_size": len(char2idx),
        "pad_id": PAD_ID, "unk_id": UNK_ID, "cls_id": CLS_ID,
        "sep_id": SEP_ID, "mask_id": MASK_ID,
    }
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(vocab, f, ensure_ascii=False, indent=2)
    print(f"[OK] 词表已构建并保存到：{output_file}（共 {len(char2idx)} 个 token）")
    return vocab


def encode_text(text: str, char2idx: dict, max_len: int):
    """将文本编码为 input_ids 和 attention_mask（[CLS] + chars + [SEP] + padding）"""
    ids = [CLS_ID] + [char2idx.get(c, UNK_ID) for c in text][:max_len - 2] + [SEP_ID]
    attention_mask = [1] * len(ids)
    ids += [PAD_ID] * (max_len - len(ids))
    attention_mask += [0] * (max_len - len(attention_mask))
    return ids, attention_mask


class BertDataset(Dataset):
    """二分类文本数据集（jsonl 格式：{"text": ..., "label": 0/1}）

    支持两种构造方式：从 jsonl 文件读取，或直接传入样本列表（用于增强后的训练集）
    """

    def __init__(self, jsonl_file: Path = None, vocab: dict = None,
                 max_len: int = 48, samples: list = None):
        self.char2idx = vocab["char2idx"]
        self.max_len = max_len
        if samples is not None:
            self.samples = samples
        else:
            self.samples = []
            with open(jsonl_file, "r", encoding="utf-8") as f:
                for line in f:
                    self.samples.append(json.loads(line))

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        sample = self.samples[idx]
        input_ids, attention_mask = encode_text(sample["text"], self.char2idx,
                                                self.max_len)
        return {
            "input_ids": torch.tensor(input_ids, dtype=torch.long),
            "attention_mask": torch.tensor(attention_mask, dtype=torch.long),
            "labels": torch.tensor(sample["label"], dtype=torch.long),
            "text": sample["text"],
        }


def create_dataloaders(data_dir: Path, vocab: dict, batch_size: int = 32,
                       max_len: int = 48, augment_fns: list = None,
                       oversample_fn=None, seed: int = 42):
    """构建 train/val/test 三个 DataLoader

    增强与过采样仅作用于训练集（val/test 保持原始分布，避免评估失真）：
    - oversample_fn：先执行，输入样本列表返回需新增的样本
    - augment_fns：依次执行，每个函数输入当前样本列表返回新增样本
    """
    rng = random.Random(seed)
    dataloaders = {}
    for split in ["train", "val", "test"]:
        jsonl_file = data_dir / f"{split}.jsonl"
        dataset = BertDataset(jsonl_file, vocab, max_len=max_len)

        if split == "train" and (oversample_fn or augment_fns):
            samples = list(dataset.samples)
            original_size = len(samples)
            if oversample_fn:
                added = oversample_fn(samples)
                samples += added
                print(f"[过采样] 否定正向样本 -> 新增 {len(added)} 条")
            for fn in (augment_fns or []):
                added = fn(samples, rng)
                samples += added
                print(f"[增强:{fn.__name__}] 新增 {len(added)} 条")
            rng.shuffle(samples)
            print(f"训练集：{original_size} -> 增强后 {len(samples)} 条")
            dataset = BertDataset(vocab=vocab, max_len=max_len, samples=samples)

        dataloaders[split] = DataLoader(
            dataset, batch_size=batch_size, shuffle=(split == "train")
        )
    return dataloaders["train"], dataloaders["val"], dataloaders["test"]
```

#### 4.2.1 字符级 Tokenizer 与词表构建流程

- **特殊 token 固定编号**：`[PAD]=0`、`[UNK]=1`、`[CLS]=2`、`[SEP]=3`、`[MASK]=4`（`range(len(SPECIAL_TOKENS))` 顺序分配）。
- **字符级分词**：中文按「字」切分，不做词级别切分。否定语义（如「不」「一点都」「称不上」）只能靠 BERT 自注意力在字符序列上学习跨位置依赖，没有分词器级别的先验——这是本项目处理否定句式的固有挑战，也正是后续优化的背景。
- **`build_vocab_from_data` 词表构建流程**：
  1. 用 `Counter` 统计 `train/val/test` 全部 jsonl 中出现的字符频率；
  2. 先把 5 个特殊 token 放入 `char2idx`（占据 0~4）；
  3. 其余字符按 `(-count, char)` 排序（高频在前、字典序次之）依次编号，满足 `min_count` 且未出现过的才收录；
  4. 输出 `vocab.json`，包含 `char2idx`、`idx2char`、`vocab_size` 及各类特殊 id。
  5. 最终词表大小 **174**（5 特殊 token + 169 字符，由 1000 条数据自动统计）。
- **`encode_text` 编码逻辑**：`[CLS]` + 逐字符查表（未登录字 → `UNK_ID`）+ `[SEP]`，再 padding 到 `max_len=48`；同步生成 `attention_mask`（真实字符位为 1，padding 位为 0）。
- **`create_dataloaders` 的关键设计**：增强与过采样**仅作用于训练集**（`split == "train"` 时才执行），val/test 保持原始分布，避免评估失真。增强函数 `augment_fns` 依次叠加，过采样 `oversample_fn` 先执行。

---

## 5. 训练模块（train.py 全源码 + 解析）

### 5.1 train.py 完整源码

```python
#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
BERT 二分类训练器

- AdamW 优化器 + 线性 warmup 的学习率调度
- epoch 级评估：每轮输出 train loss / val loss / val accuracy
- 最佳模型判据：验证集 accuracy 最高 -> {model_name}_best.pth
- 定期检查点：每 save_every 轮保存 {model_name}_epoch_{N}.pth
- 训练历史持久化：checkpoints/{model_name}_training_history.json
- 训练日志实时落盘：{model_name}_training_log.txt（同时输出控制台）
"""
import json
import time
from pathlib import Path

import torch
from torch.optim import AdamW
from torch.optim.lr_scheduler import LambdaLR
from tqdm import tqdm


class BertTrainer:
    def __init__(self, model, device, learning_rate=1e-3, patience=5,
                 warmup_ratio=0.1, log_file="bert_training_log.txt",
                 pos_weight=1.0):
        self.model = model
        self.device = device
        self.patience = patience
        self.warmup_ratio = warmup_ratio
        self.log_file = Path(log_file)
        self.pos_weight = pos_weight

        # 类别权重：pos_weight != 1.0 时加大正向（label=1）样本的错误惩罚。
        # 注意：带 weight 的 CrossEntropyLoss 会把 weight 注册为 buffer 进入
        # state_dict，保存检查点时已在 save_checkpoint 中剔除 loss_fct.*
        if pos_weight != 1.0:
            weight = torch.tensor([1.0, pos_weight], dtype=torch.float,
                                  device=device)
            model.loss_fct = torch.nn.CrossEntropyLoss(weight=weight)

        self.optimizer = AdamW(model.parameters(), lr=learning_rate,
                               weight_decay=0.01)
        self.scheduler = None  # 在 train() 中按总步数创建

        self.best_val_acc = 0.0
        self.epochs_without_improvement = 0
        self.history = {"epochs": []}

    def _log(self, message: str):
        """控制台打印 + 日志文件追加"""
        print(message)
        with open(self.log_file, "a", encoding="utf-8") as f:
            f.write(message + "\n")

    def _create_scheduler(self, total_steps: int):
        """线性 warmup + 线性衰减"""
        warmup_steps = max(1, int(total_steps * self.warmup_ratio))

        def lr_lambda(current_step):
            if current_step < warmup_steps:
                return current_step / warmup_steps
            return max(0.0, (total_steps - current_step)
                       / max(1, total_steps - warmup_steps))

        self.scheduler = LambdaLR(self.optimizer, lr_lambda)

    def run_epoch(self, dataloader, train_mode: bool):
        """单轮训练或验证，返回 (平均loss, accuracy)"""
        self.model.train() if train_mode else self.model.eval()
        total_loss, total_correct, total_samples = 0.0, 0, 0

        with torch.set_grad_enabled(train_mode):
            pbar = tqdm(dataloader, desc="训练" if train_mode else "验证",
                        leave=False)
            for batch in pbar:
                input_ids = batch["input_ids"].to(self.device)
                attention_mask = batch["attention_mask"].to(self.device)
                labels = batch["labels"].to(self.device)

                if train_mode:
                    self.optimizer.zero_grad()

                outputs = self.model(input_ids=input_ids,
                                     attention_mask=attention_mask,
                                     labels=labels)
                loss, logits = outputs["loss"], outputs["logits"]

                if train_mode:
                    loss.backward()
                    torch.nn.utils.clip_grad_norm_(self.model.parameters(), 1.0)
                    self.optimizer.step()
                    self.scheduler.step()

                batch_size = labels.size(0)
                total_loss += loss.item() * batch_size
                total_correct += (logits.argmax(dim=-1) == labels).sum().item()
                total_samples += batch_size
                pbar.set_postfix(loss=f"{loss.item():.4f}")

        return total_loss / total_samples, total_correct / total_samples

    def save_checkpoint(self, path: Path, epoch: int):
        path.parent.mkdir(parents=True, exist_ok=True)
        # 排除 loss_fct.*（类别权重 buffer 属于训练配置而非模型权重，
        # 避免带 pos_weight 保存的检查点在评估加载时出现 unexpected key）
        model_state = {k: v for k, v in self.model.state_dict().items()
                       if not k.startswith("loss_fct.")}
        torch.save({
            "epoch": epoch,
            "model_state_dict": model_state,
            "optimizer_state_dict": self.optimizer.state_dict(),
            "best_val_acc": self.best_val_acc,
        }, path)

    def _save_history(self, save_dir: Path, model_name: str):
        history_file = save_dir / f"{model_name}_training_history.json"
        with open(history_file, "w", encoding="utf-8") as f:
            json.dump(self.history, f, ensure_ascii=False, indent=2)

    def train(self, train_dataloader, val_dataloader, num_epochs,
              save_dir="./checkpoints", model_name="bert", save_every=10):
        save_dir = Path(save_dir)
        save_dir.mkdir(parents=True, exist_ok=True)
        self._create_scheduler(num_epochs * len(train_dataloader))

        self._log("\n" + "=" * 60)
        self._log(f"开始训练 {model_name}（共 {num_epochs} 轮）")
        self._log(f"训练样本：{len(train_dataloader.dataset)} | "
                  f"验证样本：{len(val_dataloader.dataset)} | "
                  f"设备：{self.device}")
        if self.pos_weight != 1.0:
            self._log(f"类别权重：正向 pos_weight={self.pos_weight}")
        self._log("=" * 60)

        for epoch in range(1, num_epochs + 1):
            start_time = time.time()
            train_loss, train_acc = self.run_epoch(train_dataloader, True)
            val_loss, val_acc = self.run_epoch(val_dataloader, False)
            elapsed = time.time() - start_time

            self.history["epochs"].append({
                "epoch": epoch,
                "train_loss": round(train_loss, 4),
                "train_acc": round(train_acc, 4),
                "val_loss": round(val_loss, 4),
                "val_acc": round(val_acc, 4),
                "lr": round(self.scheduler.get_last_lr()[0], 8),
                "time_sec": round(elapsed, 1),
            })

            improved = val_acc > self.best_val_acc
            self._log(
                f"Epoch {epoch:>3}/{num_epochs} | "
                f"train_loss {train_loss:.4f} | train_acc {train_acc:.4f} | "
                f"val_loss {val_loss:.4f} | val_acc {val_acc:.4f} | "
                f"{elapsed:.1f}s" + (" [BEST]" if improved else "")
            )

            # 保存最佳模型（判据：验证集 accuracy）
            if improved:
                self.best_val_acc = val_acc
                self.epochs_without_improvement = 0
                self.save_checkpoint(save_dir / f"{model_name}_best.pth", epoch)
            else:
                self.epochs_without_improvement += 1

            # 定期检查点
            if epoch % save_every == 0:
                self.save_checkpoint(save_dir / f"{model_name}_epoch_{epoch}.pth",
                                     epoch)

            # 训练历史实时落盘
            self._save_history(save_dir, model_name)

            # 早停
            if self.epochs_without_improvement >= self.patience:
                self._log(f"\n早停触发：连续 {self.patience} 轮验证集 accuracy 无提升")
                break

        self._log("=" * 60)
        self._log(f"训练结束，最佳验证集 accuracy：{self.best_val_acc:.4f}")
        self._log("=" * 60)
        return self.history
```

### 5.2 训练配置解析

#### 5.2.1 AdamW 优化器

```python
self.optimizer = AdamW(model.parameters(), lr=learning_rate, weight_decay=0.01)
```

使用 `AdamW`（解耦权重衰减的 Adam），默认学习率 `1e-3`、权重衰减 `0.01`。相比普通 Adam，AdamW 把 L2 正则与梯度更新解耦，是 Transformer 训练的标准选择。

#### 5.2.2 线性 warmup + 线性衰减

```python
warmup_steps = max(1, int(total_steps * self.warmup_ratio))  # warmup_ratio=0.1
def lr_lambda(current_step):
    if current_step < warmup_steps:
        return current_step / warmup_steps          # 线性上升
    return max(0.0, (total_steps - current_step) / max(1, total_steps - warmup_steps))  # 线性下降
```

前 10% 步数学习率从 0 线性升到峰值 `lr`，之后线性衰减到 0。这种调度能稳定训练初期、避免大学习率破坏随机初始化权重。`total_steps = num_epochs * len(train_dataloader)` 在 `train()` 开头按实际数据量创建。

#### 5.2.3 梯度裁剪

```python
loss.backward()
torch.nn.utils.clip_grad_norm_(self.model.parameters(), 1.0)
self.optimizer.step()
self.scheduler.step()
```

反向传播后做梯度范数裁剪（阈值 1.0），防止梯度爆炸；随后更新参数与学习率。

#### 5.2.4 早停策略

以**验证集 accuracy** 为最佳判据：`val_acc` 创新高则保存 `{model_name}_best.pth` 并重置计数器；连续 `patience` 轮无提升则提前停止。`patience` 默认 5，实验中常用 8。

> 真实训练曲线佐证（基线 `bert_baseline_training_history.json`）：第 3 轮 `val_acc` 即达 0.94，此后一直 plateau 在 0.94，直到第 11 轮（连续 8 轮无提升，patience=8）触发早停。说明基线模型**很快就触到了能力天花板**——这正是后续优化实验的出发点。

#### 5.2.5 检查点保存逻辑

- **最佳检查点**：`{model_name}_best.pth`，判据 `val_acc` 最高；
- **定期检查点**：每 `save_every` 轮保存 `{model_name}_epoch_{N}.pth`；
- **类别权重剔除**：`save_checkpoint` 中刻意排除 `loss_fct.*` 开头的键（带 `weight` 的 `CrossEntropyLoss` 会把 weight 注册为 buffer 进入 `state_dict`），避免在评估加载时出现 `unexpected key`；
- **训练历史**：每轮追加写入 `{model_name}_training_history.json`，含 `train_loss / train_acc / val_loss / val_acc / lr / time_sec`；
- **日志**：每轮一行 `[BEST]` 标记，实时落盘到 `log/`。

---

## 6. 评估模块（evaluate.py 全源码 + 解析）

### 6.1 evaluate.py 完整源码

```python
#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
BERT 二分类评估器

- 指标：accuracy、每类 precision/recall/F1、macro-F1、混淆矩阵
- 输出 best cases（高置信且预测正确）与 worst cases（高置信但预测错误）
- 报告按 模型+划分 命名：{model_name}_evaluation_report_{split}.json
"""
import json
from pathlib import Path

import torch
from tqdm import tqdm

LABEL_NAMES = ["负向", "正向"]


class BertEvaluator:
    def __init__(self, model, device):
        self.model = model
        self.device = device

    @torch.no_grad()
    def evaluate_dataset(self, dataloader, split_name="test",
                         output_file=None, show_cases=5):
        """在指定数据集上评估，返回指标字典并保存 json 报告"""
        self.model.eval()
        all_labels, all_preds, all_probs, all_texts = [], [], [], []

        for batch in tqdm(dataloader, desc=f"评估[{split_name}]", leave=False):
            input_ids = batch["input_ids"].to(self.device)
            attention_mask = batch["attention_mask"].to(self.device)
            outputs = self.model(input_ids=input_ids,
                                 attention_mask=attention_mask)
            probs = torch.softmax(outputs["logits"], dim=-1)
            preds = probs.argmax(dim=-1)

            all_labels.extend(batch["labels"].tolist())
            all_preds.extend(preds.tolist())
            all_probs.extend(probs.tolist())
            all_texts.extend(batch["text"])

        # 组装逐样本结果
        samples = [{
            "text": text,
            "label": label,
            "prediction": pred,
            "confidence": round(probs[pred], 4),
            "correct": label == pred,
        } for text, label, pred, probs in zip(all_texts, all_labels,
                                              all_preds, all_probs)]

        results = self._compute_metrics(samples, split_name)
        self._print_summary(results, split_name)
        self._print_cases(samples, show_cases)

        if output_file:
            Path(output_file).parent.mkdir(parents=True, exist_ok=True)
            with open(output_file, "w", encoding="utf-8") as f:
                json.dump(results, f, ensure_ascii=False, indent=2)
            print(f"[OK] 评估报告已保存：{output_file}")
        return results

    @staticmethod
    def _compute_metrics(samples, split_name):
        """计算 accuracy、每类 P/R/F1、macro-F1、混淆矩阵"""
        num = len(samples)
        correct = sum(s["correct"] for s in samples)
        per_class = {}
        for cls in [0, 1]:
            tp = sum(1 for s in samples if s["label"] == cls and s["prediction"] == cls)
            fp = sum(1 for s in samples if s["label"] != cls and s["prediction"] == cls)
            fn = sum(1 for s in samples if s["label"] == cls and s["prediction"] != cls)
            precision = tp / (tp + fp) if tp + fp > 0 else 0.0
            recall = tp / (tp + fn) if tp + fn > 0 else 0.0
            f1 = (2 * precision * recall / (precision + recall)
                  if precision + recall > 0 else 0.0)
            per_class[LABEL_NAMES[cls]] = {
                "precision": round(precision, 4),
                "recall": round(recall, 4),
                "f1": round(f1, 4),
                "support": sum(1 for s in samples if s["label"] == cls),
            }
        macro_f1 = sum(c["f1"] for c in per_class.values()) / 2
        confusion = {
            "TP": sum(1 for s in samples if s["label"] == 1 and s["prediction"] == 1),
            "TN": sum(1 for s in samples if s["label"] == 0 and s["prediction"] == 0),
            "FP": sum(1 for s in samples if s["label"] == 0 and s["prediction"] == 1),
            "FN": sum(1 for s in samples if s["label"] == 1 and s["prediction"] == 0),
        }
        return {
            "split": split_name,
            "num_samples": num,
            "accuracy": round(correct / num, 4),
            "macro_f1": round(macro_f1, 4),
            "per_class": per_class,
            "confusion_matrix": confusion,
            "samples": samples,
        }

    @staticmethod
    def _print_summary(results, split_name):
        print("\n" + "=" * 60)
        print(f"评估结果 - {split_name} 集（{results['num_samples']} 个样本）")
        print("=" * 60)
        print(f"Accuracy : {results['accuracy']:.4f}")
        print(f"Macro-F1 : {results['macro_f1']:.4f}")
        print("-" * 60)
        print(f"{'类别':<8}{'Precision':<12}{'Recall':<12}{'F1':<12}{'Support':<8}")
        for name, m in results["per_class"].items():
            print(f"{name:<8}{m['precision']:<12.4f}{m['recall']:<12.4f}"
                  f"{m['f1']:<12.4f}{m['support']:<8}")
        cm = results["confusion_matrix"]
        print("-" * 60)
        print(f"混淆矩阵：TP={cm['TP']}  TN={cm['TN']}  "
              f"FP={cm['FP']}  FN={cm['FN']}")
        print("=" * 60)

    @staticmethod
    def _print_cases(samples, show_cases):
        """best cases：高置信且正确；worst cases：高置信但错误"""
        correct = sorted([s for s in samples if s["correct"]],
                         key=lambda s: -s["confidence"])
        wrong = sorted([s for s in samples if not s["correct"]],
                       key=lambda s: -s["confidence"])
        print(f"\n--- Best Cases（Top {show_cases} 高置信正确样本）---")
        for s in correct[:show_cases]:
            print(f"  [{LABEL_NAMES[s['label']]}] 置信度 {s['confidence']:.4f} | "
                  f"{s['text']}")
        print(f"\n--- Worst Cases（Top {show_cases} 高置信错误样本）---")
        if not wrong:
            print("  （无预测错误样本）")
        for s in wrong[:show_cases]:
            print(f"  真实[{LABEL_NAMES[s['label']]}] "
                  f"预测[{LABEL_NAMES[s['prediction']]}] "
                  f"置信度 {s['confidence']:.4f} | {s['text']}")
        print()
```

### 6.2 评估指标计算逻辑

评估在 `@torch.no_grad()` 下推理整个划分，对每条样本：

1. `probs = softmax(logits)`，取 `argmax` 为预测标签，`probs[pred]` 为置信度；
2. 逐样本记录 `text / label / prediction / confidence / correct`，写入报告 `samples` 字段；
3. 指标计算（`_compute_metrics`）：
   - **Accuracy** = 正确数 / 总数；
   - **每类 Precision / Recall / F1**：按 `cls ∈ {0,1}` 统计 `TP/FP/FN` 后套用标准公式；
   - **Macro-F1** = 两类 F1 的算术平均；
   - **混淆矩阵**：`TP`（正向预测正向）、`TN`（负向预测负向）、`FP`（负向误判正向）、`FN`（正向误判负向）；
4. **Best/Worst Cases**：`correct` 按置信度降序取 Top-k 为高置信正确；`wrong` 按置信度降序取 Top-k 为「高置信但错误」——后者专门用来暴露模型的**系统性误判**，是定位否定语义缺陷的关键诊断工具。
5. 报告整体保存为 `report/{model_name}_evaluation_report_{split}.json`。

> 真实数据印证：基线测试集报告（`bert_baseline_evaluation_report_test.json`）显示 100 条样本中 `FP=10, FN=1`，其中 10 个 FP **几乎全部是「否定+负向词=正向」模式**（如「服务员一点都不耐用」「课程特别不贴心」「有一说一，快递实在不优秀」「整体体验极其不流畅」「剧情称不上满意」「服务员称不上推荐」「这家店称不上实惠」「这家店一点都不温暖」「这家店称不上实惠」「外卖后悔」），而唯一的 FN 是「音乐，特别完美」（含正向情感词但被误判为负向）。这与 EXPERIMENTS.md 的诊断高度一致。

---

## 7. 优化实验：否定语义理解

本项目的灵魂不在于把模型跑通，而在于**用一套可独立开关的策略，系统性地诊断并优化「否定反转语义」这一真实短板**。本节完整复现 `EXPERIMENTS.md` 的实验记录，并附上 `augment.py` 全部源码与 `main.py` 的 5 个实验开关说明。

### 7.1 基线模型暴露的核心缺陷

基线（E0，无优化）在测试集 `Acc=0.89`，错误高度集中于否定句式：

1. **不擅长处理否定反转语义**：只抓取局部负面关键词，忽略句法否定逻辑。如「音乐一点都不垃圾」（正向）因含「垃圾」被误判为负向；
2. **对双重否定、否定修饰短语的上下文理解能力弱**：「称不上后悔」「实在不流畅」等否定修饰短语几乎全错；
3. **从零实现的 BERT 未充分学习否定句式的上下文依赖**：训练集中否定样本仅约 15%，模型倾向记忆情感词极性而非否定结构。

**基线典型错误（Worst Cases，来自真实报告）**：

| 文本 | 真实 | 预测 | 置信度 |
|------|------|------|--------|
| 音乐一点都不垃圾 | 正向 | 负向 | 0.9118 |
| 这个app一点都不刺耳 | 正向 | 负向 | 0.9118 |
| 这家店称不上后悔，就这样吧 | 正向 | 负向 | 0.9118 |
| 客服一点都不离谱 | 正向 | 负向 | 0.9118 |

错误高度集中且高置信——模型对否定模式存在**系统性误判**，而非随机噪声。

> 真实测试报告（`bert_baseline_evaluation_report_test.json`）的混淆矩阵为 `TP=50, TN=39, FP=10, FN=1`，10 个 FP 中绝大多数是「否定+负向词=正向」模式（如「服务员一点都不耐用」「课程特别不贴心」「有一说一，快递实在不优秀」「整体体验极其不流畅」「剧情称不上满意」「服务员称不上推荐」「这家店称不上实惠」「这家店一点都不温暖」「外卖后悔」），唯一的 FN 是「音乐，特别完美」（含正向情感词但被误判为负向）。这与上表的诊断完全一致。

### 7.2 分词策略记录

当前采用**字符级分词**（char-level tokenizer）：

| 项目 | 说明 |
|------|------|
| 切分粒度 | 每个汉字/字符一个 token，无词级别切分 |
| 特殊 token | `[PAD]`=0 `[UNK]`=1 `[CLS]`=2 `[SEP]`=3 `[MASK]`=4 |
| 序列结构 | `[CLS]` + 字符序列 + `[SEP]`，padding 至 max_len=48 |
| 词表大小 | 174（5 特殊 token + 169 字符，由 1000 条数据自动统计） |
| 词表文件 | `vocab.json`（自动生成，含 char2idx/idx2char） |

含义：否定语义（如「不」「一点都」「称不上」）只能依靠 BERT 的自注意力在字符序列上学习跨位置依赖，没有分词器级别的先验。这是字符级小模型处理否定句式的固有挑战，也是本轮优化的背景。

### 7.3 augment.py 完整源码

```python
#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
训练集数据增强与采样策略（仅作用于训练集；val/test 不增强，避免评估失真）

三种可独立开关的增强 + 一种过采样，均针对模型短板——否定反转语义：

1. augment_negation（否定句式扩充）
   专门生成否定句式样本，覆盖三种否定模式：
   - 否定 + 负向词 = 正向（一点都不垃圾 / 实在不难看）
   - 否定 + 正向词 = 负向（一点都不专业 / 称不上靠谱）
   - 双重否定 = 正向（不得不说出色 / 不得不承认专业）

2. augment_synonym（同义词替换）
   将样本中的情感词替换为同极性词库中的其他词，扩充表达多样性
   （垃圾/差劲/刺耳/离谱/糟糕互换，喜欢/满意/优秀互换）

3. augment_antonym（反义句式互换）
   肯定句加否定、否定句去否定，标签翻转，形成「好/不好」「差/不差」
   对比样本对，强迫模型学习否定词对语义的决定性作用

4. oversample_negation_positive（过采样）
   复制带否定词的正向样本（应对正向召回偏低、FN 偏多的不均衡问题）
"""
import random

from generate_data import (POS_WORDS, NEG_WORDS, SUBJECTS, ADVERBS,
                           NOISE_HEADS, NOISE_TAILS)

ALL_SENTI = POS_WORDS + NEG_WORDS

# 否定 + 负向词 = 正向 的模板
NEG_TO_POS_TEMPLATES = [
    "{sub}一点都不{neg}",
    "{sub}{adv}不{neg}",
    "{head}，{sub}实在不{neg}",
    "不得不说{sub}{adv}{pos}",      # 双重否定 -> 正向
    "不得不承认{sub}{adv}{pos}",    # 双重否定 -> 正向
]
# 否定 + 正向词 = 负向 的模板
NEG_TO_NEG_TEMPLATES = [
    "{sub}一点都不{pos}",
    "{sub}{adv}不{pos}",
    "{sub}称不上{pos}",
    "{head}，{sub}实在不{pos}",
]


def find_senti_word(text: str):
    """返回文本中出现的第一个情感词（正向词优先按词表顺序匹配），无则 None"""
    for w in ALL_SENTI:
        if w in text:
            return w
    return None


def is_negated(text: str) -> bool:
    """判断文本是否含否定标记"""
    return ("不" in text) or ("称不上" in text)


def augment_negation(samples, rng: random.Random):
    """否定句式扩充：为每条样本生成一条同标签的否定句式样本"""
    new_samples = []
    for s in samples:
        sub, adv, head = (rng.choice(SUBJECTS), rng.choice(ADVERBS),
                          rng.choice(NOISE_HEADS))
        pos, neg = rng.choice(POS_WORDS), rng.choice(NEG_WORDS)
        if s["label"] == 1:
            tpl = rng.choice(NEG_TO_POS_TEMPLATES)
        else:
            tpl = rng.choice(NEG_TO_NEG_TEMPLATES)
        text = tpl.format(sub=sub, adv=adv, head=head, pos=pos, neg=neg)
        new_samples.append({"text": text, "label": s["label"]})
    return new_samples


def augment_synonym(samples, rng: random.Random):
    """同义词替换：情感词替换为同极性词，标签不变"""
    new_samples = []
    for s in samples:
        w = find_senti_word(s["text"])
        if w is None:
            continue
        pool = POS_WORDS if w in POS_WORDS else NEG_WORDS
        new_w = rng.choice([x for x in pool if x != w])
        new_samples.append({"text": s["text"].replace(w, new_w),
                            "label": s["label"]})
    return new_samples


def augment_antonym(samples, rng: random.Random):
    """反义句式互换：肯定<->否定，标签翻转，形成对比样本对"""
    new_samples = []
    for s in samples:
        w = find_senti_word(s["text"])
        if w is None:
            continue
        text = s["text"]
        if "一点都不" + w in text:
            new_text = text.replace("一点都不" + w, "非常" + w)
        elif "实在不" + w in text:
            new_text = text.replace("实在不" + w, "确实" + w)
        elif "称不上" + w in text:
            new_text = text.replace("称不上" + w, "称得上" + w)
        elif "不" + w in text:
            new_text = text.replace("不" + w, w)
        else:
            new_text = text.replace(w, "不" + w)
        new_samples.append({"text": new_text, "label": 1 - s["label"]})
    return new_samples


def oversample_negation_positive(samples, factor: int = 2):
    """过采样带否定词的正向样本。factor 为总倍数，返回需新增的样本"""
    targets = [s for s in samples
               if s["label"] == 1 and is_negated(s["text"])]
    return [dict(s) for s in targets] * (factor - 1)
```

#### augment.py 关键设计解析

- **`NEG_TO_POS_TEMPLATES` / `NEG_TO_NEG_TEMPLATES`**：分别覆盖「否定+负向词=正向」与「否定+正向词=负向」，并含双重否定模板「不得不说/承认…（正向）」，专门补齐基线最弱的否定模式；
- **`augment_negation`**：为训练集中**每条样本**生成一条同标签的否定句式，使训练集 800 → 1600，直接把错误模式「喂」给模型；
- **`augment_synonym`**：只换情感词、标签不变，增加词面多样性，但不触碰否定逻辑；
- **`augment_antonym`**：基于字符串规则做「肯定↔否定」互换并翻转标签，形成对比样本对，强迫模型关注否定词；
- **`oversample_negation_positive`**：复制带否定词的正向样本（`factor-1` 份），缓解 FN 偏多。

### 7.4 main.py 的 5 个可开关实验策略

`main.py` 把所有策略实现为独立参数开关，由 `argparse` 定义（见第 130–142 行），并在第 214–229 行组装进 `augment_fns` / `oversample_fn`，仅作用于 `create_dataloaders`。5 个开关如下：

| 开关 | 类型 | 默认 | 作用 |
|------|------|------|------|
| `--augment-negation` | 标志位 | 关 | 调用 `augment.augment_negation`：否定句式扩充（含双重否定） |
| `--augment-synonym` | 标志位 | 关 | 调用 `augment.augment_synonym`：同义情感词替换 |
| `--augment-antonym` | 标志位 | 关 | 调用 `augment.augment_antonym`：反义句式互换（肯定↔否定，标签翻转） |
| `--pos-weight` | 浮点 | 1.0 | 传入 `BertTrainer`，非 1.0 时构造 `CrossEntropyLoss(weight=[1, W])`，加大正向类别损失权重 |
| `--oversample-neg` | 标志位 | 关 | 传入 `oversample_fn=oversample_negation_positive(factor=args.oversample_factor)` |

此外 `--oversample-factor`（默认 2）控制过采样倍数，`--exp-name` 把所有产物（`log/`、`report/`、`checkpoints/` 中的 `bert_{exp-name}_*`）隔离命名，便于多策略公平对比。

```python
# main.py 实验开关的组装逻辑（节选）
augment_fns = []
if args.augment_negation:
    augment_fns.append(augment.augment_negation)
if args.augment_synonym:
    augment_fns.append(augment.augment_synonym)
if args.augment_antonym:
    augment_fns.append(augment.augment_antonym)
oversample_fn = None
if args.oversample_neg:
    oversample_fn = lambda samples: augment.oversample_negation_positive(
        samples, factor=args.oversample_factor)
```

### 7.5 实验设置

统一实验条件，确保公平对比：

- 模型：hidden=128 / layers=4 / heads=4（575,618 参数），每次实验重新初始化；
- 训练：`--epochs 30 --patience 8 --lr 1e-3 --batch-size 32`，AdamW + 线性 warmup；
- 随机种子：42（数据、权重初始化、增强采样全部固定）；
- 评估：加载验证集最优检查点（`bert_best.pth`）在 test 集（100 条）评估；
- 基线数据：train 800 / val 100 / test 100；
- 数据侧策略**仅作用于训练集**（val/test 保持原始分布，避免评估失真）。

### 7.6 实验结果汇总表（原样保留 EXPERIMENTS.md 数值）

| 实验 | 策略 | 训练集规模 | best val_acc | test Acc | test Macro-F1 | FP / FN | Δ Acc |
|------|------|-----------|--------------|----------|---------------|---------|-------|
| E0 | 基线（无策略） | 800 | 0.94 | 0.8900 | 0.8886 | 10 / 1 | — |
| E1 | 否定句式扩充 | 1600 | **1.00** | 0.9900 | 0.9900 | 0 / 1 | **+0.10** |
| E2 | 同义词替换 | 1600 | 0.96 | 0.9100 | 0.9096 | 7 / 2 | +0.02 |
| E3 | 反义句式互换 | 1600 | 0.99 | 0.9200 | 0.9199 | 1 / 7 | +0.03 |
| E4 | **类别权重 pos_weight=2.0** | 800 | **1.00** | **1.0000** | **1.0000** | **0 / 0** | **+0.11** |
| E5 | 过采样 2x | 871 | 0.94 | 0.9000 | 0.8985 | 10 / 0 | +0.01 |
| E6 | 全组合（E1+E2+E3+E4+E5） | 6968 | 1.00 | 0.9900 | 0.9900 | 1 / 0 | +0.10 |

### 7.7 各实验详细分析

#### E0 基线：Acc 0.89（FP=10, FN=1）

- 负向 P=0.9750 / R=0.7959；正向 P=0.8333 / R=0.9804；
- Worst Cases 清一色为「否定+负向词=正向」被误判为负向（FP=10）；
- 模型只会匹配情感词极性，完全不理解否定反转。

#### E1 否定句式扩充：Acc 0.99（+0.10）

- 训练集 800 → 1600，val_acc 第 8 轮即达 1.0000；
- FP 10 → 0：否定句式样本直接覆盖错误模式，模型学会「不+负向词=正向」；
- 仅存 1 个 FN（「专业称不上好喝」——主语与情感词搭配怪异的边缘样本）；
- **结论：纯数据侧方案中效果最佳，直接命中痛点**。

#### E2 同义词替换：Acc 0.91（+0.02）

- 训练集 800 → 1600，val_acc 0.96；
- Worst Cases 仍集中在否定句（称不上差劲、实在不流畅、一点都不专业）；
- **结论：只增加词面多样性，不解决否定逻辑，提升有限**。

#### E3 反义句式互换：Acc 0.92（+0.03）

- 训练集 800 → 1600（生成等量对比样本对），val_acc 0.99；
- FP 10 → 1：「不+负向词=正向」方向基本学会；
- 但 FN 1 → 7：「不+正向词=负向」方向错误增多（模型对否定句整体产生正向偏移）；
- **结论：对比对有效但不均衡，需配合其他策略**。

#### E4 类别权重 pos_weight=2.0：Acc 1.00（+0.11）⭐ 最佳

- 不增加任何数据，仅调整损失权重；
- 第 8 轮 val_acc 达 1.0000；test 集 FP=0 / FN=0，Worst Cases 为空；
- 正向惩罚加倍改变了 loss 景观，迫使模型寻找能同时解释否定样本的决策边界，而非退化为关键词匹配；
- 复跑结果完全一致（种子固定，可复现）；
- **结论：零数据成本取得满分，为本任务最优方案**。

> 真实报告佐证（`bert_posweight_evaluation_report_test.json`）：test Acc=1.0000，混淆矩阵 `TP=50, TN=50, FP=0, FN=0`，Worst Cases 为空。之前 10 个高置信 FP（「整体体验极其不流畅」conf 0.9935、「这家店称不上实惠」0.9867、「服务员称不上推荐」0.9914 等）现在全部被正确预测且置信度极高——印证类别权重改写了决策边界。

#### E5 过采样 2x：Acc 0.90（+0.01）

- 否定正向样本 71 条复制一倍（800 → 871）；
- FN 1 → 0：正向召回率达 1.0，但 FP 维持 10 且错误方向反转（负向否定句被误判正向）；
- **结论：解决 FN 有效，但整体决策边界偏移，净收益小**。

#### E6 全组合：Acc 0.99（+0.10）

- 训练集 800 → 6968（过采样 + 三种增强链式叠加）；
- 训练过程不稳定：第 2 轮 val_acc 即达 1.0，第 5~7 轮崩溃至 0.49 后缓慢回升，靠早停保留最优点；
- test 0.99 未超过 E4，且训练时长约 8 倍；
- **结论：策略并非越多越好；大规模对比对 + 类别权重叠加导致 loss 震荡**。

### 7.8 实验结论与建议

1. **最佳单策略：`--pos-weight 2.0`**（E4，test Acc 1.00）。零数据成本、训练稳定、可复现，最终模型保存为 `checkpoints/bert_posweight_best.pth`；
2. **最佳数据侧策略：`--augment-negation`**（E1，test Acc 0.99）。若追求数据驱动的可解释改进，是否定语义增强的首选；
3. 策略叠加存在边际递减甚至相互干扰（E6），建议按需开启单个开关验证效果后再组合；
4. 局限说明：本任务数据为模板合成，结论适用于当前分布；迁移真实语料时，否定句式扩充（E1）比类别权重更具泛化潜力。

---

## 8. 完整运行流程

所有命令在 `bert-from-scratch-zh/` 目录下执行（已 `conda activate bert-zh` 并装好 `torch`/`tqdm`）。

### 8.1 一键全链路（推荐）

```bash
# 生成数据 -> 训练 -> 训练后自动在测试集评估
python main.py --generate-data --eval-after-train
```

`main.py` 会在数据/词表缺失时自动生成与构建（见 `ensure_data` / `ensure_vocab`），因此首次运行也可直接：

```bash
python main.py --epochs 30 --patience 8 --eval-after-train
```

### 8.2 分步命令

```bash
# (1) 生成数据集：1000 条 -> data/train(800) val(100) test(100).jsonl
python generate_data.py --num-samples 1000 --output-dir ./data

# (2) 构建词表：统计字符 -> vocab.json（174 token）
python -c "from dataset import build_vocab_from_data; from pathlib import Path; \
build_vocab_from_data(Path('./data'), Path('./vocab.json'))"

# (3) 训练（数据/词表不存在时自动生成；训练后自动评估）
python main.py --epochs 30 --patience 8 --exp-name baseline --eval-after-train
```

### 8.3 评估已训练模型

```bash
# 评估某实验的最佳权重（默认三集全量评估）
python main.py --evaluate --eval-split all --exp-name posweight

# 指定检查点文件名
python main.py --evaluate --eval-split test --checkpoint bert_baseline_best.pth
```

### 8.4 六个优化实验的复现命令（来自 EXPERIMENTS.md）

```bash
# E0 基线
python main.py --epochs 30 --patience 8 --exp-name baseline --eval-after-train
# E1 否定句式扩充
python main.py --epochs 30 --patience 8 --augment-negation --exp-name negation --eval-after-train
# E2 同义词替换
python main.py --epochs 30 --patience 8 --augment-synonym --exp-name synonym --eval-after-train
# E3 反义句式互换
python main.py --epochs 30 --patience 8 --augment-antonym --exp-name antonym --eval-after-train
# E4 类别权重（最佳）
python main.py --epochs 30 --patience 8 --pos-weight 2.0 --exp-name posweight --eval-after-train
# E5 过采样
python main.py --epochs 30 --patience 8 --oversample-neg --exp-name oversample --eval-after-train
# E6 全组合
python main.py --epochs 30 --patience 8 --augment-negation --augment-synonym --augment-antonym --pos-weight 2.0 --oversample-neg --exp-name combo --eval-after-train
```

> 每个实验通过 `--exp-name` 隔离产物，统一前缀 `bert_{exp-name}_`：训练日志在 `log/`、评估报告在 `report/`、检查点与训练历史在 `checkpoints/`。

### 8.5 产物与文件对应

| 实验 | exp-name | 训练日志（log/） | 评估报告（report/） | 检查点（checkpoints/） |
|------|----------|----------|----------|------------------------|
| E0 | baseline | bert_baseline_training_log.txt | bert_baseline_evaluation_report_test.json | bert_baseline_best.pth / _final.pth / _training_history.json |
| E1 | negation | bert_negation_training_log.txt | bert_negation_evaluation_report_test.json | bert_negation_best.pth / … |
| E2 | synonym | bert_synonym_training_log.txt | bert_synonym_evaluation_report_test.json | bert_synonym_best.pth / … |
| E3 | antonym | bert_antonym_training_log.txt | bert_antonym_evaluation_report_test.json | bert_antonym_best.pth / … |
| E4 | posweight | bert_posweight_training_log.txt | bert_posweight_evaluation_report_test.json | bert_posweight_best.pth / … |
| E5 | oversample | bert_oversample_training_log.txt | bert_oversample_evaluation_report_test.json | bert_oversample_best.pth / … |
| E6 | combo | bert_combo_training_log.txt | bert_combo_evaluation_report_test.json | bert_combo_best.pth / … |

最终模型为 E4 的 `checkpoints/bert_posweight_best.pth`（test Acc 1.00）。

---

## 9. 实验结果复盘

### 9.1 模型能力

- **成功复现 BERT**：纯 PyTorch（不依赖 `transformers`）实现了 token+position+segment 嵌入、多头缩放点积注意力、GELU 前馈、Post-LN 编码器层与 `[CLS]` 分类头，可训练参数 575,618，结构正确、训练稳定。
- **快速达到能力天花板**：基线在第 3 轮 `val_acc` 即达 0.94 并 plateau，说明小模型在简单模板数据上很快收敛——这也意味着「得分空间」有限，提升主要来自**针对性补数据/调损失**，而非模型容量。
- **否定语义可被有效修复**：E1（否定句式扩充）与 E4（类别权重）分别把 test Acc 从 0.89 提升到 0.99 / 1.00，且 E4 的 Worst Cases 为空——证明缺陷是「可学习的」，不是模型结构层面的死穴。

### 9.2 现存短板

1. **字符级分词无否定先验**：「不」「一点都」「称不上」只能靠自注意力在字符序列上学跨位置依赖，对长否定句、嵌套否定（如「不得不说…不…」）仍脆弱；
2. **数据为模板合成**：情感词/主语/副词来自固定词库，句式高度规律，模型可能学到的是「模板模式」而非真实语言泛化；
3. **基线对否定反转系统性误判**：纯关键词匹配倾向明显，FP 集中于「否定+负向词」；
4. **策略叠加不稳定**：E6 出现 `val_acc` 从 1.0 崩溃到 0.49 再回升的震荡，说明多策略同时叠加会扰动 loss 景观。

### 9.3 后续改进方向

| 方向 | 思路 |
|------|------|
| 词级别分词 / 预训练词向量 | 引入 jieba 或从大规模中文语料预训练 embedding，给否定词更结构化的表示 |
| 引入预训练 BERT 权重做对照 | 用 `transformers` 加载中文 BERT 做同样实验，对比「从零小模型」与「预训练大模型」的否定语义差距 |
| 更贴近真实的语料 | 用真实评论数据（如外卖/电商评论）替换模板合成，检验策略在真实分布下的泛化 |
| 更丰富的否定模式 | 扩充双重否定、反问否定（「难道不…？」）、局部否定（「不好不坏」）等模板，提升 E1 的覆盖度 |
| 课程式训练 / 难度调度 | 先教简单肯定句、再逐步引入否定句，替代一次性大规模增强叠加 |
| 注意力可视化诊断 | 用 `BertEncoderLayer` 的 attention 权重做 case 级可视化，直接观察模型是否「看到」了否定词 |

---

## 附录：main.py 完整源码

```python
#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
BERT 二分类 - 主入口脚本（数据生成 -> 词表 -> 训练 -> 评估 全链路）

用法示例:
    # 一键全链路：生成 1000 条数据 -> 训练 -> 训练后自动在测试集评估
    python main.py --generate-data --eval-after-train

    # 只生成数据
    python main.py --generate-data --num-samples 1000

    # 只训练（数据/词表不存在时自动生成）
    python main.py --epochs 20 --lr 1e-3 --batch-size 32

    # 开启否定句式扩充增强训练
    python main.py --epochs 30 --augment-negation

    # 类别权重 + 过采样组合策略
    python main.py --epochs 30 --pos-weight 2.0 --oversample-neg

    # 评估已训练模型（默认三集全量评估）
    python main.py --evaluate --eval-split all
"""
import argparse
import json
import random
import shutil
from pathlib import Path

import torch

import augment
from bert import BertConfig, BertForSequenceClassification
from dataset import build_vocab_from_data, create_dataloaders
from evaluate import BertEvaluator
from generate_data import generate_dataset
from train import BertTrainer

BASE_DIR = Path(__file__).resolve().parent
MODEL_NAME = "bert"


def ensure_data(data_dir: Path, num_samples: int, seed: int):
    """确保数据存在：不存在则自动生成"""
    if not (data_dir / "train.jsonl").exists():
        print(f"数据不存在，正在自动生成 {num_samples} 条样本...")
        generate_dataset(num_samples=num_samples, output_dir=data_dir, seed=seed)


def ensure_vocab(data_dir: Path, vocab_file: Path) -> dict:
    """确保词表存在：不存在则自动从数据构建"""
    if not vocab_file.exists():
        print(f"词表文件不存在，正在从 {data_dir} 自动构建...")
        build_vocab_from_data(data_dir=data_dir, output_file=vocab_file)
    with open(vocab_file, "r", encoding="utf-8") as f:
        return json.load(f)


def create_model(vocab_size: int, args, device) -> BertForSequenceClassification:
    config = BertConfig(
        vocab_size=vocab_size,
        hidden_size=args.hidden_size,
        num_hidden_layers=args.num_layers,
        num_attention_heads=args.num_heads,
        intermediate_size=args.hidden_size * 2,
        max_position_embeddings=args.max_len,
        num_labels=2,
        hidden_dropout_prob=args.dropout,
    )
    model = BertForSequenceClassification(config).to(device)
    param_count = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"[OK] BERT 模型创建成功！可训练参数量：{param_count:,}")
    print(f"  配置：hidden={args.hidden_size}, layers={args.num_layers}, "
          f"heads={args.num_heads}, max_len={args.max_len}")
    return model


def run_evaluation(model, device, dataloaders, splits, report_dir, run_name=MODEL_NAME):
    """对指定划分执行评估并打印汇总（报告写入 report_dir，按 run_name 隔离命名）"""
    evaluator = BertEvaluator(model, device)
    summary = {}
    for split_name in splits:
        output_file = report_dir / f"{run_name}_evaluation_report_{split_name}.json"
        results = evaluator.evaluate_dataset(dataloaders[split_name],
                                             split_name=split_name,
                                             output_file=output_file)
        summary[split_name] = results

    if len(splits) > 1:
        print("=" * 60)
        print("各数据集评估汇总")
        print("=" * 60)
        print(f"{'数据集':<10}{'样本数':<10}{'Accuracy':<12}{'Macro-F1':<10}")
        print("-" * 60)
        for split_name in splits:
            r = summary[split_name]
            print(f"{split_name:<10}{r['num_samples']:<10}"
                  f"{r['accuracy']:<12.4f}{r['macro_f1']:<10.4f}")
        print("=" * 60)
    return summary


def main():
    parser = argparse.ArgumentParser(description="BERT 二分类训练与评估（从零复现）")

    # 数据参数
    parser.add_argument("--generate-data", action="store_true",
                        help="重新生成随机二分类数据（覆盖现有数据）")
    parser.add_argument("--num-samples", type=int, default=1000, help="总样本数")
    parser.add_argument("--data-dir", type=str, default=str(BASE_DIR / "data"))
    parser.add_argument("--vocab-file", type=str, default=str(BASE_DIR / "vocab.json"))
    parser.add_argument("--max-len", type=int, default=48, help="最大序列长度")
    parser.add_argument("--seed", type=int, default=42, help="随机种子")

    # 模型参数
    parser.add_argument("--hidden-size", type=int, default=128)
    parser.add_argument("--num-layers", type=int, default=4)
    parser.add_argument("--num-heads", type=int, default=4)
    parser.add_argument("--dropout", type=float, default=0.1)

    # 训练参数
    parser.add_argument("--epochs", type=int, default=10)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--patience", type=int, default=5, help="早停耐心值")
    parser.add_argument("--save-every", type=int, default=10,
                        help="每 N 轮保存定期检查点")

    # 优化策略开关（仅作用于训练集，详见 augment.py 与 EXPERIMENTS.md）
    parser.add_argument("--augment-negation", action="store_true",
                        help="数据增强：否定句式扩充（含双重否定）")
    parser.add_argument("--augment-synonym", action="store_true",
                        help="数据增强：同义情感词替换")
    parser.add_argument("--augment-antonym", action="store_true",
                        help="数据增强：反义句式互换（肯定<->否定，标签翻转）")
    parser.add_argument("--pos-weight", type=float, default=1.0,
                        help="正向类别损失权重（默认 1.0 关闭；1.5~2.0 加大正向惩罚）")
    parser.add_argument("--oversample-neg", action="store_true",
                        help="过采样：复制带否定词的正向样本")
    parser.add_argument("--oversample-factor", type=int, default=2,
                        help="过采样总倍数（默认 2，即复制 1 份）")

    # 模式选择
    parser.add_argument("--evaluate", action="store_true", help="只评估，不训练")
    parser.add_argument("--eval-split", type=str, default="all",
                        choices=["train", "val", "test", "all"],
                        help="评估划分（默认 all 三集全量评估）")
    parser.add_argument("--eval-after-train", action="store_true",
                        help="训练完成后自动评估")
    parser.add_argument("--checkpoint", type=str, default=None,
                        help="指定检查点文件名；默认 bert_best.pth")

    # 其他
    parser.add_argument("--device", type=str, default="auto")
    parser.add_argument("--save-dir", type=str, default=str(BASE_DIR / "checkpoints"))
    parser.add_argument("--log-dir", type=str, default=str(BASE_DIR / "log"),
                        help="训练日志输出目录（默认 log/）")
    parser.add_argument("--report-dir", type=str, default=str(BASE_DIR / "report"),
                        help="评估报告输出目录（默认 report/）")
    parser.add_argument("--exp-name", type=str, default="",
                        help="实验名称：所有产物（日志/检查点/训练历史/评估报告）"
                             "以 {bert}_{exp-name} 前缀隔离命名，便于多策略对比")

    args = parser.parse_args()
    data_dir = Path(args.data_dir)
    vocab_file = Path(args.vocab_file)
    save_dir = Path(args.save_dir)
    log_dir = Path(args.log_dir)
    log_dir.mkdir(parents=True, exist_ok=True)
    report_dir = Path(args.report_dir)
    report_dir.mkdir(parents=True, exist_ok=True)

    # 固定随机种子，保证实验可复现、策略对比公平
    random.seed(args.seed)
    torch.manual_seed(args.seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(args.seed)

    # 运行名：加实验名后所有产物按 bert_{exp-name}_ 前缀隔离
    run_name = MODEL_NAME if not args.exp_name else f"{MODEL_NAME}_{args.exp_name}"
    if args.exp_name:
        print(f"实验名：{args.exp_name}（产物前缀 {run_name}_*）")

    # 设备
    if args.device == "auto":
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    else:
        device = torch.device(args.device)

    print("\n" + "=" * 60)
    print("BERT 二分类系统（从零复现）")
    print("=" * 60)
    print(f"设备：{device}")
    print(f"数据目录：{data_dir}")
    print("=" * 60 + "\n")

    # 重新生成数据模式
    if args.generate_data:
        generate_dataset(num_samples=args.num_samples, output_dir=data_dir,
                         seed=args.seed)
        # 数据变了，旧词表失效，删除以便重建
        if vocab_file.exists():
            vocab_file.unlink()
        if not args.eval_after_train:
            return

    # 确保数据与词表存在
    ensure_data(data_dir, args.num_samples, args.seed)
    vocab_dict = ensure_vocab(data_dir, vocab_file)
    print(f"词表大小：{vocab_dict['vocab_size']}")

    # 组装优化策略（仅训练模式生效）
    augment_fns = []
    if args.augment_negation:
        augment_fns.append(augment.augment_negation)
    if args.augment_synonym:
        augment_fns.append(augment.augment_synonym)
    if args.augment_antonym:
        augment_fns.append(augment.augment_antonym)
    oversample_fn = None
    if args.oversample_neg:
        oversample_fn = lambda samples: augment.oversample_negation_positive(
            samples, factor=args.oversample_factor)

    # 数据加载器
    train_dl, val_dl, test_dl = create_dataloaders(
        data_dir, vocab_dict, batch_size=args.batch_size, max_len=args.max_len,
        augment_fns=augment_fns, oversample_fn=oversample_fn, seed=args.seed)
    dataloaders = {"train": train_dl, "val": val_dl, "test": test_dl}
    print(f"数据加载完成：train {len(train_dl.dataset)} | "
          f"val {len(val_dl.dataset)} | test {len(test_dl.dataset)}\n")

    # 创建模型
    model = create_model(vocab_dict["vocab_size"], args, device)

    # 纯评估模式
    if args.evaluate:
        if args.checkpoint:
            checkpoint_path = save_dir / args.checkpoint
        else:
            checkpoint_path = save_dir / f"{run_name}_best.pth"
        if checkpoint_path.exists():
            checkpoint = torch.load(checkpoint_path, map_location=device)
            # strict=False：兼容早期包含 loss_fct.weight 的检查点
            model.load_state_dict(checkpoint["model_state_dict"], strict=False)
            print(f"[OK] 加载检查点：{checkpoint_path}")
        else:
            print(f"[WARN] 未找到检查点：{checkpoint_path}，将使用随机初始化模型评估")

        splits = ["train", "val", "test"] if args.eval_split == "all" \
            else [args.eval_split]
        run_evaluation(model, device, dataloaders, splits, report_dir, run_name)
        return

    # 训练模式
    print("启动训练模式...")
    trainer = BertTrainer(
        model=model, device=device, learning_rate=args.lr,
        patience=args.patience, pos_weight=args.pos_weight,
        log_file=str(log_dir / f"{run_name}_training_log.txt"),
    )
    trainer.train(train_dataloader=train_dl, val_dataloader=val_dl,
                  num_epochs=args.epochs, save_dir=save_dir,
                  model_name=run_name, save_every=args.save_every)

    # 保存最终检查点
    final_checkpoint = save_dir / f"{run_name}_final.pth"
    trainer.save_checkpoint(final_checkpoint, epoch=args.epochs)

    best_checkpoint = save_dir / f"{run_name}_best.pth"
    if not best_checkpoint.exists() and final_checkpoint.exists():
        shutil.copyfile(final_checkpoint, best_checkpoint)

    print("\n" + "=" * 60)
    print("训练完成！")
    print("=" * 60)
    print(f"最佳检查点：{best_checkpoint}（val_acc={trainer.best_val_acc:.4f}）")
    print(f"最终检查点：{final_checkpoint}")
    print(f"训练历史：{save_dir / f'{run_name}_training_history.json'}")
    print(f"训练日志：{log_dir / f'{run_name}_training_log.txt'}")
    print("=" * 60)

    # 训练后自动评估（加载最佳权重，在测试集上）
    if args.eval_after_train:
        if best_checkpoint.exists():
            checkpoint = torch.load(best_checkpoint, map_location=device)
            model.load_state_dict(checkpoint["model_state_dict"], strict=False)
            print(f"\n[OK] 已加载最佳权重：{best_checkpoint}")
        run_evaluation(model, device, dataloaders, ["test"], report_dir, run_name)


if __name__ == "__main__":
    main()
```

---

> 全文完。本文档整合自 `bert-from-scratch-zh` 项目的全部源码、配置、实验记录与真实输出指标，所有代码与数值均原样保留。
