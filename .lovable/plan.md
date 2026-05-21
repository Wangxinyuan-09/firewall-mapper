## 目标

让 `addrMatches` 在比较时也走「字面值 → 包含它的对象」这一路径，避免 NAT 转换目标是字面 IP、而策略目的是包含该 IP 的对象时被误判为不匹配。

服务端 (`svcMatches`) 已经把两侧都展开成字面 `proto/port` 比对，本来就走字面值匹配 — 不动。

## 现状缺陷

```
nat.translatedPool = "172.23.51.28"           (字面 IP)
policy.dstAddr     = "srv-api-pool"           (object，entries 包含 172.23.51.28)

addrMatches:
  collectAddressMembers("172.23.51.28") = {"172.23.51.28"}
  collectAddressMembers("srv-api-pool") = {"srv-api-pool", "host-api-1", ...}
  → 无交集，误判为不匹配
```

## 改动

仅改 `src/lib/access.ts`，复用现有 `findAddressesContainingIp` + `collectAddressMembers`，不动 svcMatches、不动 UI。

### 新增 helper

```ts
function addrIdentity(name: string, cfg: ParsedConfig): Set<string> {
  // Returns: {name} ∪ all transitive group member names
  //          ∪ (if name is a literal IPv4) all address-object names containing it
  //            ∪ all groups containing those object names (transitive)
  const out = new Set<string>();
  collectAddressMembers(name, cfg).forEach((x) => out.add(x));
  if (isIpLiteral(name)) {
    findAddressesContainingIp(name, cfg).forEach((objName) => {
      collectAddressMembers(objName, cfg).forEach((x) => out.add(x));
      // also walk up: any group whose members include objName
      cfg.addressGroups.forEach((g) => {
        if (collectAddressMembers(g.name, cfg).has(objName)) out.add(g.name);
      });
    });
  }
  return out;
}
```

注意：「向上找包含该对象的 group」这一步是为了让 `policy.dstAddr = "srv-pool"`（grp 包含 host-api-1，host-api-1 包含字面 IP）也能命中。

### 改 addrMatches

```ts
export function addrMatches(a, b, cfg) {
  if (!a || !b) return false;
  if (a === "any" || b === "any") return true;
  if (a === b) return true;
  const A = addrIdentity(a, cfg);
  const B = addrIdentity(b, cfg);
  if (A.has(b) || B.has(a)) return true;
  for (const x of A) if (B.has(x)) return true;
  return false;
}
```

### 不动

- `svcMatches` — 已走字面 port 集合比对
- `findCoveringPolicies` — 公式已正确
- UI / 计数 / 文案
- Flow / FocusLine 构建逻辑

## 验证

- 路由 `/access-graph?focus=src&id=财富大厦统一出口`：之前因「NAT 转换为字面 IP、策略目的写的是对象」而被判 unassociated 的 DNAT，现在应转为「已关联策略」。
- 反向：策略目的是字面 IP、NAT 转换为对象名时也能命中（addrIdentity 对称处理）。
- `any` 行为不变。
- Typecheck 全绿；现有 `addrMatches` 其他调用点行为只会变得更包容，不会反向破坏。