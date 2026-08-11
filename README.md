# Loomora · 织光成画

> 把灵感变成画面 — Loom light into images.

Loomora 是一款基于 Electron + Vue 3 的 **AI 文生图桌面工作台**。通过接入兼容 OpenAI Image API 的生成服务，输入文字描述即可创作图像，支持参考图、多比例、批量抽卡，并自动将作品保存到本地。

## ✦ 功能特性

- **文生图创作** — 输入提示词，一键生成高质量图像
- **参考图支持** — 最多添加 14 张参考图，引导 AI 创作方向
- **多比例切换** — 支持 1:1、16:9、9:16、4:3、3:4、3:2 六种画面比例
- **批量抽卡** — 单次生成 1~9 张，挑选最佳效果
- **本地持久化** — 生成图片自动保存至本地 `Gallery/` 目录，按日期归档
- **可配置接口** — 自定义 API 地址与 Key，兼容任意 OpenAI Image API 格式的服务
- **异步轮询** — 对异步生成任务自动轮询，最长等待 5 分钟

## ✦ 技术栈

| 层       | 技术                    |
| -------- | ----------------------- |
| 桌面框架 | Electron 31             |
| 前端     | Vue 3 + Vite 5          |
| 构建     | electron-builder (NSIS) |
| 运行时   | Node.js                 |

## ✦ 项目结构

```
├── main.js                # Electron 主进程（窗口管理、IPC、图片持久化）
├── preload.js             # 预加载脚本（contextBridge 安全桥接）
├── index.html             # 应用入口 HTML
├── package.json           # 依赖与构建配置
├── vite.config.mjs        # Vite 构建配置
├── renderer/
│   ├── index.html         # 渲染进程入口（standalone 模式）
│   ├── app.js             # 渲染进程 standalone 脚本
│   ├── style.css          # 全局样式
│   └── src/
│       ├── main.js        # Vue 应用入口
│       └── App.vue        # 主界面组件
└── renderer-dist/         # 构建输出（Vite build）
```

## ✦ 快速开始

### 环境要求

- Node.js >= 18
- npm >= 9

### 安装依赖

```bash
npm install
```

### 开发模式

同时启动 Vite 开发服务器和 Electron 窗口，支持热更新：

```bash
npm run dev
```

### 生产运行

先构建前端，再启动 Electron：

```bash
npm start
```

### 打包安装包

生成 Windows NSIS 安装程序：

```bash
npm run dist
```

## ✦ 使用指南

1. **配置接口** — 点击「接口设置」，填入 API 地址和 API Key，然后点击「保存配置」（Key 会存储在浏览器 localStorage 中）
2. **输入提示词** — 在文本框中描述你想要的画面（最多 800 字）
3. **选择比例** — 从下拉菜单选择画面比例
4. **添加参考图**（可选）— 点击「添加参考图」从本地选取图片
5. **设置数量** — 通过 +/− 按钮调整批量生成张数（1~9）
6. **点击生成** — 等待 AI 织造画面，结果会展示在下方画廊并自动保存到本地

## ✦ API 兼容性

Loomora 默认对接 OpenAI 兼容的图像生成 API：

- **同步生成**: `POST /v1/images/generations` → 直接返回 `data[].url` 结果
- **异步生成**: 返回 `task_id` → 轮询 `GET /v1/images/tasks/{task_id}` 直到完成

如需对接其他服务，调整 `endpoint` 地址即可。

## ✦ License

Apache-2.0
