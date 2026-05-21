## 路径分析改版：三入口 + 横向 Focus Graph

把现有「全部 src→dst 流卡片瀑布流」改为 **顶部三 Tab 入口 + 顶部单选 + 下方横向 Focus Graph** 的工作台结构。

### 页面布局

```text
┌────────────────────────────────────────────────────────────┐
│ [Source] [Destination] [Service]   ← Tab 切入口            │
│ ┌────────────────────────────────┐  ┌───────────────────┐ │
│ │ 选择 财务大厦统一出口      ▼   │  │ direct/DNAT 等过滤 │ │
│ └────────────────────────────────┘  └───────────────────┘ │
├────────────────────────────────────────────────────────────┤
│                                                            │
│              横向 Focus Graph 主区域                       │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

- 顶部 Tab 决定入口类型；下方一个搜索/选择 popover 列出该入口的所有候选对象（按命中流条数排序，any 与超阈值对象折叠到末尾）。
- 选中后下方画 Focus Graph，未选时显示空态提示 + 列推荐对象。
- 横向空间最大化，移动端纵向堆叠（Tab 在最上，选择器其次）。

### 路由参数

- 用 `?focus=src|dst|svc&id=<name>` 单一上下文，替代当前 `?src=/?dst=/?svc=` 三独立 param。
- 旧链接首次进入时自动映射到新参数后再 `replace`，保持兼容。

### 横向主线（FlowGroup 行）

**聚合主键**：`src + dst + protocol + dstPort + action`，一行一个 FlowGroup。布局：

```text
[来源 chip] ─[ direct | DNAT #3 公网EIP:443 → 转换为 172.23.51.8:8443 | SNAT #… | NAT×N ]─> [目的 chip[WAF]] ── tcp/8443 permit · 策略×3
```

- **链路段**：纯 CSS 水平连线 + 中间 token。
  - `direct` → 灰色细标签
  - 单 DNAT → `DNAT #id 原始目的:端口 → 转换为 内网IP:端口`，"转换为"加重 + amber 箭头
  - 单 SNAT → `SNAT #id …`
  - 多 NAT → 折叠为 `NAT×N`，hover/click popover 展开
- **端点 chip**：源/目的对象名 + 分类小标签（WAF/网关/堡垒/LB），点击 → `ObjectPreview` 弹窗
- **服务/动作段**：`tcp/8443`（绿/红着色）+ `permit`/`deny` + `策略×N` 徽章；点击 → 策略列表 popover（复用 `RefsPreview`）
- **异常着色**：orphan/partial/deny 行左侧 4px 色条（黄/橙/红），不单独分区

### 三入口主线差异

1. **Source 入口** — 选中 src，列出该 src 出发的所有 FlowGroup，按 dst 二级分组（同一 dst 内多端口堆叠成子行，端点 chip 合并不重复画）。
2. **Destination 入口** — 选中 dst，多来源「左侧汇聚」：多条左侧主线 → 同一 dst chip → 右侧端口栏纵向堆叠；
   ```text
   src1 ─[DNAT…]─┐
   src2 ─direct──┤── [dst chip] ── port pill 列
   src3 ─direct──┘
   ```
3. **Service 入口** — 选中 `proto/port`，列出所有命中该端口的 FlowGroup（src ─ link ─ dst · action · 策略×N），按 dst 二级分组。

三种入口共用同一 `FocusLineRow` 行组件，差异在外层 grouping 与是否合并端点。

### 折叠/阈值规则

- 单个端点的 FlowGroup 数 > 12 → 默认折叠「展开更多 (N)」
- 含 `any` 的 src/dst/svc，列表中独立放到末尾，默认折叠
- 不展开 address-group / service-group 成员、不展开完整策略字段，全部走点击 → 现有预览组件

### 文件改动

- `src/lib/access.ts`：新增 `groupByFocus(flows, focus, id)` → `FocusLine[]` 与 `FocusLine` 类型 `{ src, dst, link: NatChain | 'direct', port, action, policyCount, dnatRefs, policyRefs, coverageKind }`，按主键 `src+dst+proto+port+action` 拆分聚合；保留旧 API。
- `src/routes/access-graph.tsx`：删除当前 `FlowCard / Bracket / HLine / DnatNode / PortPill` 等原子；新增：
  - `<FocusTabs>` 顶部三 Tab + 顶部 `<FocusPicker>` 单选 popover
  - `<FocusGraph>` 主区域，根据 focus 派发到子组件
  - `<FocusLineRow>` 单行主线
  - `<NatToken>` direct / DNAT / SNAT / NAT×N 渲染 + popover
  - `<MultiSourceFanIn>` Destination 入口的左侧汇聚画法
  - 处理 `?focus&id` 路由参数 + 旧参数迁移
- `.lovable/plan.md`：替换为本计划

### 不变

- 顶部 chip / literal IP 提示逻辑保留
- `buildFlows / filterFlows / facetFor / sortFlows` 不动
- `ObjectPreview / RefsPreview` 复用
- 其它页面、解析器、路由结构不动

### 不做

- 不引入图形库 / SVG / Canvas，全部 flex + `h-px` 连线 + 绝对定位竖向 trunk
- 不实现拖拽 / 缩放 / 自动布局
- 不改解析器、不改数据模型、不改其它页面
- 不展开 address-group / service-group / 策略全文 / 原始配置
