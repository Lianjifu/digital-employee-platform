# 数字员工平台

企业级数字员工平台前端工程，提供工作区、智能体、工作流、知识中心、模型中心、渠道中心、技能与任务等运营治理能力。

## 技术栈

- React 18、TypeScript、Vite 5
- pnpm Workspace Monorepo
- TanStack Query、Zustand、React Flow
- 本地 Mock API 与 Vitest

## 目录结构

```text
digital-employee-platform/
├── frontend/
│   ├── web/                 # React 控制台
│   └── packages/
│       ├── api/             # API Client 与 Mock 领域实现
│       ├── types/           # 跨模块领域类型
│       ├── ui/              # 共享 UI 组件
│       └── utils/           # 共享工具函数
└── docs/                    # 产品、设计与实施文档
```

## 快速开始

要求：Node.js 20+、pnpm 11+。

```bash
cd frontend
pnpm install
pnpm dev
```

默认访问地址：<http://localhost:5173>

当前前端默认使用本地 Mock API；设置 `VITE_USE_MOCK=false` 后可切换至实际后端网关。

## 常用命令

```bash
cd frontend

# 类型检查
pnpm --filter web typecheck

# 生产构建
pnpm --filter web build

# Web 测试
pnpm --filter web test

# Mock API 测试
pnpm --filter @de/web-api test

# 全部包的类型检查
pnpm typecheck
```

## 领域边界

- 工作区：成员、资源归属、环境、工作区策略、配额、运行治理和审计。
- 模型中心：模型接入、路由、治理和模型审计。
- 渠道中心：渠道接入、投递路由、运行健康、失败处置和渠道审计。
- 知识中心：企业知识内容、加工、检索评测、图谱与引用治理。
- 系统设置：组织租户、身份与访问、全局安全基线、平台集成和审计保留。

> Mock 仅用于前端交互和领域验证，不替代生产环境的服务端鉴权、持久化、密钥管理或租户数据隔离。

## 验证提交

提交前建议至少运行：

```bash
cd frontend
pnpm --filter web typecheck
pnpm --filter web build
pnpm --filter @de/web-api test
git diff --check
```
