---
slug: certbot
title: "Certbot (Let’s Encrypt) 免费 HTTPS 证书部署文档"
date: 2026-01-14
tags:
  - HTTPS
  - 证书
  - Nginx
  - 运维
summary: "在阿里云 Ubuntu ECS + Nginx 环境下，使用 Certbot 申请、部署并自动续期 Let’s Encrypt 免费 SSL 证书的完整流程。"
---

# Certbot (Let’s Encrypt) 免费 HTTPS 证书部署文档

> **使用前提醒**：本文档已做敏感信息脱敏，文中 `<your-domain>` 为占位符，代表你的实际域名（含 `www.<your-domain>`）；`your-email@example.com` 为占位邮箱。实操前请统一替换为自己的真实域名与邮箱——证书存放路径、Nginx 配置文件名均随域名变化，替换后所有命令即可直接执行。

## 文档概述

本文档记录基于 **阿里云 Ubuntu ECS + Nginx 反向代理** 环境，使用 **Certbot** 为站点 `<your-domain>` 申请并部署 **Let’s Encrypt 免费 SSL 证书** 的完整流程。内容涵盖环境准备、工具安装、证书申请与自动续期、HTTPS 访问验证及长期维护，所有命令均经实际验证，替换占位符后即可按步骤直接复现。

### 环境信息

- 服务器系统：Ubuntu Linux
- Web 服务：Nginx
- 域名：`<your-domain>`
- SSL 方案：Let’s Encrypt 90 天免费 DV 证书，自动续期

---

## 一、前置准备工作

### 1. 确认域名解析已生效

确保 `<your-domain>` 的 A 记录已解析到 ECS 公网 IP，可通过以下命令验证：

```bash
nslookup <your-domain>
```

返回服务器公网 IP 即解析正常（证书申请时 Let's Encrypt 需通过 80 端口访问该域名完成验证）。

### 2. 阿里云 ECS 安全组放行端口

#### 2.1 放行 80 端口（证书验证用）

1. 阿里云控制台 → 实例安全组 → 添加入方向规则
2. 快捷配置选择：`Web HTTP流量访问(80)`，授权 `0.0.0.0/0`，优先级 1，确定保存

#### 2.2 放行 443 端口（HTTPS 访问必备）

对应截图配置参数：

- 授权策略：允许
- 优先级：1
- 协议类型：Web HTTPS 流量访问
- 访问来源：IPv4 `0.0.0.0/0`（任何位置）
- 访问目的端口：HTTPS(443)

填写描述后点击【确定】完成放行。

### 3. 确认 Nginx 正常运行

```bash
systemctl status nginx
```

显示 `active (running)` 代表服务正常。

---

## 二、安装 Certbot 证书工具

### 1. 问题背景

直接执行 `apt install python3-certbot-nginx` 提示包不存在，Ubuntu 新版推荐通过 Snap 安装。

### 2. 完整安装命令（逐条执行）

```bash
# 更新软件源
sudo apt update
# 安装 snap 组件
sudo apt install snapd -y
# 更新 snap 核心依赖
sudo snap install core
sudo snap refresh core
# 安装完整 certbot（内置 nginx 插件）
sudo snap install --classic certbot
# 全局软链接，直接调用 certbot 命令
sudo ln -s /snap/bin/certbot /usr/bin/certbot
```

### 3. 验证安装

```bash
certbot plugins
```

输出包含 `nginx` 插件即安装成功。

---

## 三、申请 Let’s Encrypt SSL 证书

### 1. 执行申请命令

```bash
sudo certbot --nginx -d <your-domain>
```

### 2. 交互步骤输入参考

1. Enter email address：输入接收证书到期提醒的邮箱（如 `your-email@example.com`）
2. Do you agree? 输入 `y` 同意协议
3. 共享邮箱给 EFF：输入 `n` 拒绝

### 3. 成功输出标识

```
Deploying certificate
Successfully deployed certificate for <your-domain> to /etc/nginx/sites-enabled/<your-domain>
Congratulations! You have successfully enabled HTTPS on https://<your-domain>
```

证书配置自动写入 Nginx 站点配置文件：`/etc/nginx/sites-enabled/<your-domain>`

### 4. Certbot 自动写入的 Nginx 配置参考

申请成功后，Certbot 会在站点配置中自动追加以下内容，无需手动修改：

```nginx
server {
    server_name <your-domain>;
    listen 443 ssl; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/<your-domain>/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/<your-domain>/privkey.pem; # managed by Certbot
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot

    # 原有的反向代理配置保持不变
}

# HTTP 自动跳转 HTTPS（managed by Certbot）
server {
    listen 80;
    server_name <your-domain>;
    return 301 https://$host$request_uri;
}
```

> 注意：带 `# managed by Certbot` 注释的配置行由 Certbot 维护，请勿手动改动；续期或重新申请时会自动更新。

### 5. 测试证书自动续期（90 天自动更新，无需手动操作）

```bash
certbot renew --dry-run
```

出现 `simulated renewals succeeded` 代表自动续期机制正常。

---

## 四、访问验证

### 1. 命令行验证 HTTPS 访问

```bash
curl -v https://<your-domain>
```

返回正常页面内容且 SSL 握手无报错即部署成功；浏览器访问 `https://<your-domain>` 地址栏显示锁形图标亦可确认。

### 2. 证书文件存放路径

```
/etc/letsencrypt/live/<your-domain>/
├── fullchain.pem  # Nginx ssl_certificate 证书链
├── privkey.pem    # Nginx ssl_certificate_key 私钥
```

---

## 五、长期维护说明

1. 证书有效期 90 天，系统自带定时任务自动续期，无需人工干预；
2. 如需新增 `www.<your-domain>` 访问：域名后台添加 www 解析，重新执行证书申请命令：

```bash
sudo certbot --nginx -d <your-domain> -d www.<your-domain>
```

3. 服务器重装/迁移：备份 `/etc/letsencrypt` 目录，可直接复用证书。
