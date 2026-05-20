## 目标

优化 `RefsPreview` 中每条策略 / NAT 引用的视觉层级：

1. 主信息（src→dst / 服务 / 动作）保持显眼，**次要元数据（区域、调度、描述、#id、log/disabled 等）下沉到第二行，用更弱样式呈现**。
2. **适当加入字段标题（label）**，如 `源`、`目的`、`服务`、`原始`、`转换为`、`区域`、`调度` 等，提高列表可读性，避免裸值堆叠产生歧义。

## 改动点（仅 `src/components/RefsPreview.tsx`）

### 1. 通用：字段标题小组件

```tsx
function L({ children }: { children: ReactNode }) {
  return <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mr-0.5">{children}</span>;
}
```

- 字号比次要文本再小一档、uppercase、letter-spacing 加一点。
- 用于"源 / 目的 / 服务 / 原始 / 转换为 / 区域 / 调度" 等字段名。
- 紧跟其后是实际值；多个字段间用 `gap-2` 而不是 `·`，让 label 自身承担分隔感。

### 2. 策略行：双行结构 + 字段标题

```
源 {src}   目的 {dst}   服务 {svc}                    [允许/拒绝]
  区域 trust→untrust   调度 仅 work-time   #12
```

- **第一行（font-mono text-sm）**：
  - `<L>源</L> {H src}` ` <L>目的</L> {H dst}` ` <L>服务</L> {H svc}`
  - 右侧只保留动作 badge（permit=ok / deny=danger）。
- **第二行（text-[11px] text-muted-foreground）**：
  - `<L>区域</L> trust→untrust`（仅当区域不全是 any 时）
  - `<L>调度</L> 仅 work-time`（仅当非 always；调度部分用 `text-amber-600` warn 色）
  - 末尾 `#12` 用 `font-mono`，作 id 标识
  - 各分段用 `gap-x-3` 间隔，第二行整体可换行
- 命中字段（值等于 `name`）继续用 `H` 加粗高亮。
- 去掉左边框 `border-l-2`，行间用 `<ul>` 的 `divide-y divide-border/40` 分隔。

### 3. NAT 行：双行 + 字段标题 + 描述并入次要行

```
原始 {src} → {origDst}:{origSvc}   转换为 {pool}:{port}        [目的 NAT]
  状态 已禁用   日志 log   #3   说明 — {description}
```

- **第一行**：
  - `<L>原始</L> {H src} → {H origDst}:{origSvc}`
  - `<L>转换为</L> {H pool}:{servicePort}`
  - 右侧 kind badge
- **第二行**：
  - `<L>状态</L> 已禁用`（disabled 时）
  - `<L>日志</L> log`（log 时）
  - `#3`
  - `<L>说明</L> {description}`（line-clamp-2，去掉 italic）
  - 全部 muted 小字，不再用 badge

### 4. 组行：加 label + 描述下沉

```
名称 {groupName}                              [成员 N]
  说明 {description}
```

- 第二行 `text-[11px] text-muted-foreground`，去掉 italic。
- 无描述时第二行不渲染。

### 5. 列表容器

- `<ul>` 用 `divide-y divide-border/40`，每项 `py-1.5`，去掉左边框，密度更接近表格行。

### 6. 折叠按钮：保留不变

"展开 N 条 any-any 引用" 逻辑、any-any 全量提示文案保留。

## 不动

- 排序与 any-any 权重、折叠机制
- 触发器文案、Header summary
- 其他文件、解析器、store、行号系统

## 验收

1. 列表中每行都有清晰的字段标题（源/目的/服务/原始/转换为/区域/调度/说明），不再需要靠位置推断字段含义。
2. 主信息一行、次要信息一行；badge 仅剩动作 / NAT 类型 / 组成员数，视觉噪音明显降低。
3. NAT description 并入次要行，前缀 `说明`，长描述截断到 2 行。
4. 字段标题样式统一（10px、uppercase、muted），不抢夺主信息焦点。
