## 目标

1. **彻底去掉"跳原文"交互**：所有表格、预览、引用列表都不再有跳转到 `/raw` 的链接（侧栏入口保留，那是用户主动入口）。
2. **行号默认隐藏**：加一个全局开关，默认关；开关关闭时所有"行号"列、所有 `LineLink` 文本都不出现。
3. **重设引用预览（RefsPreview）显示系统**：把高价值字段放前面，命中字段加粗，any-any 默认折叠，引用对象自身可读性更高。

## A. 全局"行号"开关

新文件 `src/lib/uiPrefs.ts`：

```ts
// 使用 useSyncExternalStore + localStorage，无新依赖
export function useShowLineNumbers(): [boolean, (v: boolean) => void];
```

key：`cfg.showLineNo`，默认 `false`。

`AppShell` 右上角（"清除"按钮旁）加入一枚 shadcn `Switch`：

```
[行号 ●——]   // 默认关
```

title 提示："仅用于追溯原始配置文本，平时无需打开"。

## B. `LineLink` 改造（去掉跳原文）

`src/components/DataTable.tsx`：

```tsx
export function LineLink({ line }: { line?: number }) {
  const [show] = useShowLineNumbers();
  if (!show) return null;
  if (!line) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="font-mono text-xs text-muted-foreground">L{line}</span>
  );
}
```

不再渲染 `<Link to="/raw">`，纯文本。

## C. 表格"行号"列默认隐藏

扩展 `Column<T>`：

```ts
interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  search?: (row: T) => string;
  className?: string;
  hiddenWhenNoLineNo?: boolean; // 新增
}
```

`DataTable` 渲染时，若全局开关 = false 且 `column.hiddenWhenNoLineNo === true`，整列（header + cells）跳过，不占空间。

各页（policies / objects 两处 / services 两处 / nat 两处 / audit）的"行号"列加 `hiddenWhenNoLineNo: true`。

`access-graph.tsx` 两个手写表的"行号" `<th>` / `<td>` 也用全局开关条件渲染。

## D. RefsPreview 显示系统重写

### 触发器

去掉表格里 `{n} 处（策略 X · NAT Y）` 的冗长括号，改为更紧凑：

```
🔗 N · 策略 X · NAT Y · 组 Z
```

未引用仍是 `<Badge tone="warn">未引用</Badge>`。

### 弹窗头部

```
{name}   共 N 处引用 · 策略 X · NAT Y · 地址组 Z · 服务组 W
```

合并原来标题 + summary，去掉冗余。

### 排序与折叠（核心）

`policyWeight(p)`：

- `src === "any" && dst === "any"` → 100（最底）
- `src === "any" || dst === "any"` → 10
- 其他 → 0
- 同权重内按 `Number(p.id)` 升序

NAT 同理（srcAddr / origDstAddr）。

**默认隐藏纯 any-any 项**：`useState<boolean>(false)` —— 分区标题旁加一个小按钮：

```
策略（12） [展开 5 条 any-any 引用 ▾]
```

点击展开 / 收起。地址组 / 服务组分区无此按钮。

如果某分区**全部**都是 any-any：先显示一行提示"该对象只被通配规则命中（对收敛无意义）"，再展示按钮允许用户展开。

### 每行新版结构

#### 策略行

```
{src} → {dst}    服务 {svc}    [允许/拒绝]    [trust→untrust]    [仅 work-time]    #12
```

- **粗体高亮**：构造小组件 `<H hit={name}>{value}</H>`：若 `value === name` 渲染 `<strong class="text-primary">`，否则普通。应用于 `srcAddr`、`dstAddr`、`service`。
- **动作徽标**：permit=ok、deny=danger。
- **区域徽标**：muted，仅当 `srcZone || dstZone` 非空才显示。
- **调度徽标**：当 `schedule && schedule !== "always"` 才出现，`tone="warn"`，文字"仅 {schedule}"。
- `#id` 行末 muted mono，仅作识别。
- 不显示行号、不显示"查看原文"。

> 注：`PolicyRule` 类型上没有 `disabled` 字段，本期不显示禁用徽标（NAT 才有 disabled）。

#### NAT 行

```
{src} → {origDst}:{origSvc}    ⇒ {translatedPool}    [目的 NAT / 源 NAT / 静态 NAT]    [已禁用][log]    #3
```

- `srcAddr` / `origDstAddr` / `translatedPool` 应用 `H` 高亮。
- `kind` 用 `Badge tone="default"`。
- `disabled` → `Badge tone="muted">已禁用</Badge>`；`log` → `Badge tone="muted">log</Badge>`。
- 描述（n.description）保留第二行斜体。

#### 地址组 / 服务组行

```
{groupName}   [成员 N]
```

- 组名加粗（它就是被引用对象的"承载者"）。
- 描述第二行斜体（如有）。

### 字段构造小组件

```tsx
function H({ hit, name, className = "" }: { hit: string; name: string; className?: string }) {
  if (name === hit) return <strong className={`text-primary font-semibold ${className}`}>{name}</strong>;
  return <span className={`text-foreground ${className}`}>{name}</span>;
}
```

通过 `name`（被引用对象名）从 `RefsPreview` 一路传入到 enrich，然后由渲染层使用。改 `useEnrich` 直接返回结构化字段，不再返回拼好的 `text`。

新接口：

```ts
interface PolicyRow { kind: "policy"; id: string; src: string; dst: string; svc: string;
  action: string; srcZone: string; dstZone: string; schedule: string; weight: number; }
interface NatRow { kind: "nat"; id: string; sub: string; src: string; origDst: string; origSvc: string;
  pool: string; disabled?: boolean; log?: boolean; description?: string; weight: number; }
interface GroupRow { kind: "group"; sub: "address-group" | "service-group"; name: string; count: number; description?: string; }
```

### 不要的东西

- 所有 `<Link to="/raw">`（查看原文）从 RefsPreview 移除。
- 行号信息从 RefsPreview 里完全消失。
- `r.lineNo` 字段不再被使用。

## E. 不动的部分

- 解析器 / store / 数据模型不变。
- /raw 路由保留，侧栏入口仍可用，仅作为用户主动入口。
- `ObjectName` 预览（已上一轮改完）不动。
- 不引入新 npm 包，开关用现有 `@/components/ui/switch`。

## 验收

1. 默认进入任何页面 → 看不到"行号"列，表格更紧凑。
2. 顶部"行号"开关打开 → 所有页面"行号"列出现，显示纯文本 `L1234`，不可点击。
3. 表格行不可点击跳转；ObjectName 预览、RefsPreview 内都不再有"查看原文" / `Link to=/raw`。
4. 在 /objects 悬停一个被密集使用的对象：
   - 弹窗第一段是 policy，any-any 项默认看不到，分区标题旁有"展开 X 条 any-any 引用"按钮。
   - 每条策略呈 `src → dst 服务 svc [允许] [trust→untrust] #12`，其中命中字段加粗高亮。
   - 调度不为 always 时显示 `[仅 work-time]` 警告徽标。
5. 在 /services 悬停服务对象同理，service 字段加粗。
6. NAT 引用行显示禁用 / log 徽标，命中字段加粗。
