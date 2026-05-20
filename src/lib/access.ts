import type { ParsedConfig, NatRule, PolicyRule } from "./parser/types";

export type IntermediaryCat = "waf" | "gateway" | "proxy" | "bastion" | "lb";

export const CAT_LABEL: Record<IntermediaryCat, string> = {
  waf: "WAF",
  gateway: "网关",
  proxy: "代理",
  bastion: "堡垒机",
  lb: "负载均衡",
};

export function classifyIntermediary(name: string): IntermediaryCat | undefined {
  const lower = name.toLowerCase();
  if (lower.includes("waf")) return "waf";
  if (name.includes("堡垒") || lower.includes("bastion")) return "bastion";
  if (
    name.includes("数据库网关") ||
    name.includes("api网关") ||
    lower.includes("gateway") ||
    lower.includes("api-")
  )
    return "gateway";
  if (name.includes("代理") || lower.includes("proxy")) return "proxy";
  if (name.includes("负载") || lower.includes("lb") || lower.includes("slb"))
    return "lb";
  return undefined;
}

/** Expand a name to itself + any address-group transitively containing it. */
export function expandAddressNames(
  name: string,
  cfg: ParsedConfig
): Set<string> {
  const out = new Set<string>([name]);
  if (name === "any") return out;
  const stack = [name];
  const seen = new Set<string>();
  while (stack.length) {
    const cur = stack.pop()!;
    cfg.addressGroups.forEach((g) => {
      if (seen.has(g.name)) return;
      if (g.members.includes(cur)) {
        seen.add(g.name);
        out.add(g.name);
        stack.push(g.name);
      }
    });
  }
  return out;
}

/** Expand a service name to itself + any service-group transitively containing it. */
export function expandServiceNames(
  name: string,
  cfg: ParsedConfig
): Set<string> {
  const out = new Set<string>([name]);
  if (name === "any") return out;
  const stack = [name];
  const seen = new Set<string>();
  while (stack.length) {
    const cur = stack.pop()!;
    cfg.serviceGroups.forEach((g) => {
      if (seen.has(g.name)) return;
      if (g.members.includes(cur)) {
        seen.add(g.name);
        out.add(g.name);
        stack.push(g.name);
      }
    });
  }
  return out;
}

// ---------- literal IP / CIDR support ----------

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const CIDR = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/;

export function isIpLiteral(s: string): boolean {
  return IPV4.test(s) || CIDR.test(s);
}

function ipToInt(ip: string): number | null {
  const m = ip.match(IPV4);
  if (!m) return null;
  const parts = m.slice(1, 5).map(Number);
  if (parts.some((p) => p < 0 || p > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function inCidr(ip: string, cidr: string): boolean {
  const m = cidr.match(CIDR);
  if (!m) return false;
  const base = ipToInt(m.slice(1, 5).join("."));
  const bits = Number(m[5]);
  const i = ipToInt(ip);
  if (base == null || i == null || bits < 0 || bits > 32) return false;
  if (bits === 0) return true;
  const mask = (~0 << (32 - bits)) >>> 0;
  return (i & mask) === (base & mask);
}

function inRange(ip: string, range: string): boolean {
  const [a, b] = range.split("-").map((s) => s.trim());
  const ai = ipToInt(a);
  const bi = ipToInt(b);
  const i = ipToInt(ip);
  if (ai == null || bi == null || i == null) return false;
  return i >= ai && i <= bi;
}

/** Address object names whose entries contain `ip` (literal IPv4). */
export function findAddressesContainingIp(
  ip: string,
  cfg: ParsedConfig
): string[] {
  if (!IPV4.test(ip)) return [];
  const hits: string[] = [];
  cfg.addresses.forEach((a) => {
    const ok = a.entries.some((e) => {
      if (e.kind === "host") return e.value === ip;
      if (e.kind === "net") return inCidr(ip, e.value);
      if (e.kind === "range") return inRange(ip, e.value);
      return false;
    });
    if (ok) hits.push(a.name);
  });
  return hits;
}

/** Build the expanded name set for a user input (object name OR literal IP). */
export function resolveEndpoint(
  input: string,
  cfg: ParsedConfig
): { names: Set<string>; literalHits: string[] } {
  if (input === "any") return { names: new Set(["any"]), literalHits: [] };
  if (isIpLiteral(input)) {
    const hits = findAddressesContainingIp(input, cfg);
    const names = new Set<string>();
    hits.forEach((n) =>
      expandAddressNames(n, cfg).forEach((x) => names.add(x))
    );
    return { names, literalHits: hits };
  }
  return { names: expandAddressNames(input, cfg), literalHits: [] };
}

// ---------- service summary ----------

export function summarizeService(
  name: string,
  cfg: ParsedConfig
): string {
  if (!name || name === "any") return name || "—";
  const svc = cfg.services.find((s) => s.name === name);
  if (svc) {
    return svc.entries
      .map((e) =>
        e.destPort ? `${e.protocol}/${e.destPort}` : e.protocol
      )
      .join(", ");
  }
  return name;
}

// ---------- per-node aggregates for intermediaries page ----------

export interface NodeAggregate {
  name: string;
  cat: IntermediaryCat;
  address?: string;
  lineNo?: number;
  // 谁可以访问该节点（前端→节点）
  inboundPolicies: PolicyRule[];
  // 节点对外（节点→后端）
  outboundPolicies: PolicyRule[];
  // 外部 DNAT 落到该节点（外部 IP:port → 节点）
  inboundDnat: NatRule[];
  // 暴露端口（来自 DNAT 的 servicePort / origDstService）
  exposedPorts: string[];
}

export function buildNodeAggregates(cfg: ParsedConfig): NodeAggregate[] {
  const map = new Map<string, NodeAggregate>();
  const ensure = (
    name: string,
    cat: IntermediaryCat,
    address?: string,
    lineNo?: number
  ) => {
    const cur = map.get(name);
    if (cur) {
      if (!cur.address && address) cur.address = address;
      if (!cur.lineNo && lineNo) cur.lineNo = lineNo;
      return cur;
    }
    const n: NodeAggregate = {
      name,
      cat,
      address,
      lineNo,
      inboundPolicies: [],
      outboundPolicies: [],
      inboundDnat: [],
      exposedPorts: [],
    };
    map.set(name, n);
    return n;
  };

  cfg.addresses.forEach((a) => {
    const c = classifyIntermediary(a.name);
    if (c) ensure(a.name, c, a.entries[0]?.value, a.lineNo);
  });
  cfg.addressGroups.forEach((g) => {
    const c = classifyIntermediary(g.name);
    if (c) ensure(g.name, c, undefined, g.lineNo);
  });
  cfg.natPools.forEach((p) => {
    const c = classifyIntermediary(p.name);
    if (c) {
      const addr =
        p.addressFrom && p.addressTo && p.addressFrom !== p.addressTo
          ? `${p.addressFrom}-${p.addressTo}`
          : p.addressFrom;
      ensure(p.name, c, addr, p.lineNo);
    }
  });

  cfg.policies.forEach((p) => {
    const a = map.get(p.srcAddr);
    if (a) a.outboundPolicies.push(p);
    const b = map.get(p.dstAddr);
    if (b) b.inboundPolicies.push(p);
  });
  cfg.natRules.forEach((r) => {
    const n = map.get(r.translatedPool);
    if (n) {
      n.inboundDnat.push(r);
      const port = r.servicePort ?? r.origDstService;
      if (port && !n.exposedPorts.includes(port)) n.exposedPorts.push(port);
    }
  });

  return [...map.values()].sort(
    (a, b) =>
      a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name)
  );
}
