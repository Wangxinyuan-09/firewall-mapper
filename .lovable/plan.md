## 目标

在 `对象列表` 的"被引用"列（`RefsPreview` 悬浮卡）里，除了显示直接引用该地址/服务的策略、NAT、地址组、服务组之外，还要把这些**组**再被哪些策略/NAT 引用一并展开，做"传递引用"汇总，方便一次性看到对象的真实使用面。

## 当前行为

`addressUsedBy / serviceUsedBy` 只记录**一层**引用：
- 地址 A → 用到 A 的策略、NAT、地址组
- 地址组 G → 用到 G 的策略、NAT

所以预览 A 时只看到"地址组 G 引用了我"，但看不到"G 又被策略 #12 / NAT #7 引用"。

## 方案

在 `src/components/RefsPreview.tsx` 内计算传递引用（不改 parser，避免影响其它依赖 xref 形状的代码）：

1. 对当前对象的直接引用列表 `refs` 中，每个 `by: "address-group"` 或 `by: "service-group"` 的条目，再去 `xr.addressUsedBy / xr.serviceUsedBy` 查询该组自身的引用。
2. 收集其中 `by` 为 `policy` 或 `nat` 的条目作为"间接引用"，并记录是通过哪个组进来的（来源组名）。
3. 与直接 policy/nat 引用做去重（按 `by + id`）：
   - 若一条 policy 既被直接引用又通过组引用，保留为直接引用，不重复出现在间接区。
4. 在悬浮卡里新增一个分组区块 **"通过组的间接引用"**，按 `policy / nat` 排序展示，每行后面用一个小标签注明 `via 组名`（多组命中时合并显示 `via G1, G2`）。
5. 顶部 summary（`策略 N · NAT N · ...`）只统计直接引用数量；间接引用单独显示一行小计：`间接：策略 X · NAT Y`，避免数字含义混淆。
6. 复用现有的 `PolicyLine / NatLine` 渲染与 any-any 折叠/排序逻辑（间接段也按相同权重排序，并支持展开 any-any）。

## 不改动

- `src/lib/parser/index.ts`（`RefUsage` 结构、`addressUsedBy/serviceUsedBy` 语义不变）。
- 其它依赖 xref 的页面（审计、对象列表的"被引用"计数等）。
- 服务对象走同一逻辑（通过 `service-group` 间接到 policy/nat）。

## 验收

- 打开 `对象` 页面，悬浮一个被某地址组包含的地址：能看到原有直接引用区，外加新的"通过组的间接引用"区，行尾标注 `via <组名>`。
- 仅被组引用、组又未被任何策略/NAT 引用的对象：不显示间接区。
- 同一策略既直接又间接命中：只在直接区出现一次。
