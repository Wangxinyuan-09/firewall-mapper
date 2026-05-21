## 目标

让 DNAT 关联策略匹配把「来源」也算进去。当前公式只看 dst + service，导致即便策略源完全不覆盖该流的源，也被算作「已关联」。

## 新匹配公式

```
candidate = policy.action === "permit"
         && addrMatches(policy.srcAddr, flow.src)
         && addrMatches(policy.dstAddr, nat.translatedPool)
         && svcMatches(policy.service, nat.backendPort)
```

- `any` 仍然视为通配匹配（包括 src=any、dst=any、service=any 的策略，都按命中处理）
- 不引入「至少 1 个精准非 any」的额外约束 — 用户已确认 all-any 也计数
- 不改任何 UI / 样式 / 计数文案

## 改动

`src/lib/access.ts`

### 1. `findCoveringPolicies`（约 511–523 行）

加一个 `flowSrc` 参数，过滤条件追加 `addrMatches(p.srcAddr, flowSrc, cfg)`：

```ts
export function findCoveringPolicies(
  entry: FlowDnatEntry,
  flowSrc: string,
  cfg: ParsedConfig
): PolicyRule[] {
  const target = entry.rule.translatedPool;
  const port = entry.backendPort || "any";
  return cfg.policies.filter(
    (p) =>
      p.action === "permit" &&
      addrMatches(p.srcAddr, flowSrc, cfg) &&
      addrMatches(p.dstAddr, target, cfg) &&
      svcMatches(p.service, port, cfg)
  );
}
```

### 2. `buildFocusLines`（约 548 行的调用点）

把 `f.src` 透传过去：

```ts
const covering = findCoveringPolicies(d, f.src, cfg);
```

### 3. 其他调用点

搜 `findCoveringPolicies(` 的所有调用，全部补上 `flowSrc`。如果有调用方暂时不知道源（例如纯按 DNAT 规则维度的列表），传 `"any"` 保持原行为。

## 验证

- `/access-graph?focus=src&id=财富大厦统一出口`：检查 DNAT 卡片的「已关联策略 · 策略×N」中 N 是否减少了那些「策略源完全不包含财富大厦」的条目；点开策略弹出窗确认每条策略的源都覆盖该流。
- 切换到 `/access-graph?focus=dst`：同一 DNAT 在不同 src 下的关联策略数应能不同。
- 没有源约束的 NAT（policy src=any）应仍然出现在结果里。
- Typecheck 全绿，所有 `findCoveringPolicies` 调用点都补全了第二个参数。