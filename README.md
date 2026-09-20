# 我的花园 · My Garden

一座数字花园 / 自我空间：记录、回顾、探索自己，随生活生长。

## 本地运行

```bash
npm install
npm run dev      # 开发预览，默认 http://localhost:5173
npm run build    # 构建静态产物到 dist/
```

## 内容契约（v0.1）

- `public/content/settings.json` —— 设置对象：生日、建站日、关于我、时间窗长度
- `public/content/posts/*.md` —— 内容对象：Markdown + 头部信息（frontmatter）

```markdown
---
title: 标题
date: 2026-09-20
type: diary
visible: private
tags: [标签]
---

正文……
```

## 部署

推送到 `main` 分支后，GitHub Actions 自动构建并部署到 GitHub Pages。

## 框架设计

完整设计见仓库根目录的《框架设计》文档（来自项目的框架设计 v0.1 讨论）。
