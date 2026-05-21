## 目标

统一 NAT 卡片（pill 触发器 + HoverCard 详情）的配色，采用「原始 / 转换 双色对比」方案：

- 原始侧（防火墙入口）→ 中性色（slate / foreground / muted）
- 转换侧（后端目标）→ amber 强调色
- 所有端口 → 统一弱化为 `text-muted-foreground`，不再使用 sky 蓝
- 箭头与 NAT/DNAT 标识 → 保留 amber 作为「这是 NAT」的语义锚点

效果：去掉当前 amber + sky + 默认色三色混杂的杂乱感，让用户一眼看出「左边是原始 → 右边是转换后」的方向性。

## 改动范围

只改 `src/routes/access-graph.tsx` 中的 `DnatEntryPill` 组件（约 880–968 行），不动业务逻辑、不动其他组件。

### Pill 触发器（行 894–919）

| 元素 | 当前 | 调整后 |
|---|---|---|
| 容器边框/背景 | amber-500/40 + amber-500/10 | 保持（amber 作为 NAT 语义标识）|
| `DNAT` 文字 | amber-700 | 保持 |
| 原始 `entryAddr` | 默认 foreground | `text-foreground`（明确）|
| 原始 `:entryPort` | text-muted-foreground | 保持 |
| `ArrowRight` | amber-600 | 保持 |
| 转换 `translatedPool` | amber-700 | 保持 |
| 转换 `:backendPort` | amber-700/60 | 改为 `text-muted-foreground`（与原始端口对称） |

### HoverCard 详情（行 943–964）

| 元素 | 当前 | 调整后 |
|---|---|---|
| `原始目的` 标签 | text-muted-foreground | 保持 |
| 原始 `entryAddr` | 默认 | `text-foreground` |
| 原始 `:entryPort` | sky-700 / sky-300 | `text-muted-foreground` |
| `转换为` 标签 | amber-700 | 保持 |
| 转换 `translatedPool` | amber-700 | 保持 |
| 转换 `:backendPort` | sky-700 / sky-300 | `text-amber-700/70 dark:text-amber-300/70`（跟随转换侧主色，但弱化）|

### 不改动

- NAT pill 的整体 amber 边框 / 背景（这是用户识别 NAT 的关键视觉锚）
- 详情卡的标题区（DNAT #203 / 接口 / disabled badge）
- 业务逻辑、数据结构、过滤、关联策略判定均不动

## 验证

改完后在预览中查看 `/access-graph?focus=src&id=财富大厦统一出口`，确认：

1. Pill 中端口不再喧宾夺主，整体只剩 amber + 中性两色
2. HoverCard 中「原始目的」一行没有蓝色端口
3. 「转换为」一行的 IP 和端口色调统一为 amber 系（端口稍弱）
4. 浅色 / 深色模式对比度都可读