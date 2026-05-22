# 防火墙配置审计台 (Firewall Mapper)

本地运行的防火墙配置解析与可视化审计工具。拖拽上传 Topsec 风格防火墙配置文件，即可在浏览器中浏览对象、策略、NAT 规则，分析访问关系图谱，并获得自动审计提示。

**所有解析均在浏览器本地完成，配置内容不会上传到任何服务器。**

## 功能

- **对象浏览** — 地址对象/组、服务对象/组，支持交叉引用查看
- **策略表格** — 放行/拒绝策略的完整列表，按字段排序与筛选
- **NAT 规则** — 目的 NAT (DNAT) 与源 NAT (SNAT) 分 Tab 展示，含 NAT 池管理
- **中间节点识别** — 自动识别 WAF、代理、网关、堡垒机、负载均衡等中间节点，汇总其入站/出站策略
- **访问关系图** — 源→目的→端口三级联动筛选，DNAT 覆盖度诊断（OK / 部分覆盖 / 孤儿规则）
- **审计** — 自动检测未引用对象、宽松策略（含多个 any）、同 IP 不同名等配置问题
- **原始配置视图** — 保留原文行号，支持行号跳转
- **CSV 导出** — 各表格数据可导出为 CSV

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | React 19 + TypeScript |
| 全栈 | TanStack Start |
| 路由 | TanStack Router |
| 样式 | Tailwind CSS 4 + shadcn/ui |
| 图表 | Recharts |
| 包管理 | Bun |
| 部署 | Cloudflare Workers |

## 快速开始

```bash
# 安装依赖
bun install

# 启动开发服务器
bun dev

# 构建生产版本
bun run build

# 本地预览构建结果
bun preview
```

## 使用方式

1. 打开应用首页
2. 拖拽防火墙配置文件（`SYSCONFIG.TXT` 或类似格式）到上传区域，或点击按钮选择文件
3. 文件在浏览器中本地解析，完成后显示配置概览
4. 通过顶部导航切换到各视图查看详情

## 支持的配置格式

解析器面向 Topsec（天融信）防火墙的文本配置格式，支持以下指令块：

- `address` / `address-group` — 地址对象与地址组
- `service` / `service-group` — 服务对象与服务组
- `policy` — 单行策略规则（源/目的/服务/动作）
- `ip nat destination` — 目的 NAT 规则
- `ip nat source` — 源 NAT 规则（含 `interface` 出接口取址）
- `ip nat pool` — NAT 地址池
- `ip nat <id> description|disable` — NAT 规则元数据续行
- `interface` — 网络接口定义
- `schedule` — 时间调度对象

## 项目结构

```
src/
├── components/          # UI 组件
│   ├── ui/              # shadcn/ui 基础组件
│   ├── AppShell.tsx     # 全局布局与导航
│   ├── DataTable.tsx    # 通用数据表格（排序/筛选/导出）
│   ├── EmptyConfig.tsx  # 未加载配置时的占位
│   ├── ObjectPreview.tsx # 对象详情弹窗
│   └── RefsPreview.tsx  # 交叉引用弹窗
├── lib/
│   ├── parser/
│   │   ├── types.ts     # 领域模型类型定义
│   │   └── index.ts     # 解析器 + 交叉引用 + 审计引擎
│   ├── access.ts        # 访问关系流构建与匹配算法
│   ├── store.tsx        # Zustand 全局状态
│   └── uiPrefs.ts       # 用户显示偏好（行号/端口范围）
├── routes/              # 页面路由
│   ├── __root.tsx       # 根路由
│   ├── index.tsx        # 首页（上传 + 概览）
│   ├── objects.tsx      # 地址对象/组
│   ├── services.tsx     # 服务对象/组
│   ├── policies.tsx     # 策略列表
│   ├── nat.tsx          # NAT 规则与池
│   ├── intermediaries.tsx # 中间节点
│   ├── access-graph.tsx # 访问关系图谱
│   ├── audit.tsx        # 审计发现
│   └── raw.tsx          # 原始配置文本
├── server.ts            # Cloudflare Workers 入口
└── router.tsx           # TanStack Router 初始化
```

## 许可

MIT
