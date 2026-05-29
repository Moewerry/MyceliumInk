# Mycelium Ink

**天气书法 × 音乐菌落** — 当代水墨生机主义生成艺术作品。

基于 PRD v1.2、TDD v1.0 与 UX 设计规范搭建的 Monorepo 项目，当前实现 **M1 算法原型**。

## 项目结构

```
mycelium-ink/
├── packages/core/     # 共享核心（天气、书法、菌落、音频、时间线）
├── apps/web/          # 网页端（Vite 6 + PWA）
├── apps/desktop/      # 桌面端（Electron 骨架）
└── design/            # 设计资产
```

## 快速开始

需要 **Node.js ≥ 20** 与 **pnpm ≥ 9**。

```bash
# 安装依赖（Windows 若遇 EBUSY，见下方说明）
pnpm install

# 启动网页开发服务器
pnpm dev

# 构建全部包
pnpm build
```

开发服务器默认运行在 http://localhost:5173

### Windows 安装问题（EBUSY / EPERM）

若 `pnpm install` 报 `EBUSY` 或 `EPERM`：

1. **关闭 Cursor**（文件监视会锁定 `node_modules`）
2. 在外部 PowerShell 中运行：
   ```powershell
   cd E:\03_Development\Projects\experiments\MyceliumInk
   .\scripts\install-win.ps1
   ```
3. 或将项目目录加入 Windows Defender 排除项：
   ```powershell
   Add-MpPreference -ExclusionPath "E:\03_Development\Projects\experiments\MyceliumInk"
   ```

> M1 阶段已精简依赖（移除 PWA / Electron），约 15 个包，安装更快更稳。PWA 与桌面端在 M2/M3 阶段加回。

## M1 已实现功能

- [x] Monorepo + TypeScript + Vite 6
- [x] 天气服务（Open-Meteo + 手动/虚拟城市/离线缓存）
- [x] 气象 → 书法笔刷参数映射（平滑过渡）
- [x] 书法引擎（词库、运笔、晕染、飞白、宣纸纹理）
- [x] 菌落 Agent 系统（FSM、趋墨性、分裂/死亡）
- [x] 双层渲染（Canvas 2D 书法 + 菌落层 multiply 合成）
- [x] 麦克风音频分析（FFT 特征）
- [x] 控制面板（天气 / 声音 / 菌落 / 时间 四 Tab）
- [x] PNG 导出
- [x] PWA 基础配置

## 技术栈

| 层级 | 技术 |
|------|------|
| 语言 | TypeScript 5.6+ |
| 构建 | Vite 6, pnpm workspaces |
| 书法层 | Canvas 2D |
| 菌落层 | WebGL 2（降级 Canvas 2D 粒子） |
| 音频 | Web Audio API |
| 桌面 | Electron 33+ |

## 文档

- [技术方案设计 (TDD)](docs/技术方案设计文档%20(TDD)%20v1.0.md)
- [UX 设计规范](docs/UX%20设计规范文档%20v1.0.md)
- [开发计划](docs/Mycelium%20Ink%20项目任务拆分与开发计划%20v1.0.md)

## 许可证

Private — 实验项目
