## 关联判定改造：以「转化后目的+后端端口被 permit 覆盖」为唯一标准

### 现状问题

`buildFlows` 用 `(srcAddr, dstAddr)` 字面值聚合 NAT 与策略；`FocusLine` 是按 `(src, dst, proto, port, action)` 拆行。结果：

- DNAT `srcAddr=any, translatedPool=api-172.23.51.28` 与策略 `dstAddr=api-svc-group`（组里含该 IP）会落到不同 flow，被误判为「未关联策略」
- 一切以源/目的名字面值是否相等为前提，与 NAT 的语义（转换为）脱节

### 新规则

DNAT 是否「已关联策略」只看一件事：转换后的内网目的 + 后端端口，是否被任一 `permit` 策略覆盖。

```text
associated(nat) ⇔ ∃ p ∈ policies,
    p.action === "permit"
  ∧ addrMatches(p.dstAddr, nat.translatedPool)
  ∧ svcMatches(p.service, nat.backendPort)
```

- `addrMatches(A, B)`：A、B 展开后的地址名集合相交，或任一方为 `any`，即匹配
- `svcMatches(S, port)`：S 展开后的 `proto/port` 集合包含 `port`，或任一方为 `any`，即匹配
- 源地址（NAT 源 / 策略源）**不参与**判定，只用于主图展示访问面和详情预览

主图状态只有两种：`已关联策略 · 策略×N` 或 `未关联策略`（不再有 partial / orphan / no-nat 三态混用）。

### 实现

**1. `src/lib/access.ts`**

新增工具函数（带 Map 缓存避免 N×M 重复展开）：

```ts
function addrMatches(policyAddr: string, natTarget: string, cfg): boolean
function svcMatches(policySvc: string, natPort: string, cfg): boolean
function findCoveringPolicies(nat: FlowDnatEntry, cfg): PolicyRule[]
```

调整 `Flow` 与 coverage 计算：
- `buildFlows` 保留按 `(src, dst)` 聚合（用于主图分组浏览），但**每条 DNAT 项再额外挂一份「跨组覆盖策略列表」**：扫描全量 `cfg.policies`，按上面公式过滤出 permit 策略
- `coverage.kind` 简化为 `"associated" | "unassociated"`（保留旧字段名以减少波及，但语义按新规则赋值）；旧 `partial / orphan / no-nat` 在 UI 层一律映射到这两个之一
- `permitPorts/denyPorts` 仍保留用于 service facet，但不再决定主图状态

改写 `buildFocusLines`：
- 每条 DNAT 暴露端口生成一行；`action` 字段改为 `"associated"`（带覆盖策略列表）或 `"unassociated"`（空策略列表）
- 不再依赖 `f.policies` 与 NAT 是否同 `(src,dst)` 桶
- 纯策略链（无 DNAT 的 flow）保持原样输出，仍按 permit/deny 拆行

修 `filterLinesByFocus`：
- `src/dst` 焦点改为「展开集合相交即命中」，让用户选具体地址也能看到落在地址组上的行
- `svc` 焦点用 `serviceToPorts` 比对

**2. `src/routes/access-graph.tsx`**

- `ActionBadge`：`associated` 显示「已关联策略 · 策略×N」（点击弹覆盖策略列表，复用 `RefsPreview`）；`unassociated` 显示「未关联策略」轻样式，hover 文案：「转化后的目的+后端端口没有任何 permit 策略覆盖」
- 主图行左侧色条：`associated` 走中性色；`unassociated` 走警示色
- `GroupSummary` 计数改为「DNAT N · 已关联 X · 未关联 Y」
- 顶部「仅显示异常」筛选改为「仅未关联」

### 不动

- 解析器、路由结构、其它页面不动
- `ObjectPreview / RefsPreview` 复用
- 纯策略链（无 DNAT）的展示逻辑不动

### 文件

- `src/lib/access.ts`
- `src/routes/access-graph.tsx`

### 验收

- DNAT `translatedPool=api-172.23.51.28, backendPort=tcp/8443`，存在策略 `dstAddr=api-svc-group`（组含 172.23.51.28）`service=web-svc`（含 tcp/8443）`action=permit` → 显示「已关联策略 · 策略×1」，弹窗列出该策略
- 同上 NAT，但全量策略里无任何 permit 覆盖到该 IP+端口 → 显示「未关联策略」
- Source 焦点选具体 IP，能看到 NAT `srcAddr=any` 的行
