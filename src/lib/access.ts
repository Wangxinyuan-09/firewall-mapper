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

// ---------- flow model: aggregate src→dst with DNAT + policies ----------

export interface FlowDnatEntry {
  rule: NatRule;
  entryAddr: string;
  entryPort: string; // "" if any
  backendPort: string; // "" if not translated; equals entryPort when no port change
}

export interface FlowPolicySegment {
  policy: PolicyRule;
  ports: string[]; // expanded literal ports (or ["any"])
}

export type CoverageKind = "ok" | "partial" | "orphan" | "no-nat";

export interface FlowCoverage {
  kind: CoverageKind;
  exposed: string[]; // expanded DNAT backend ports
  gap: string[]; // exposed ports not covered by any permit
}

export interface Flow {
  key: string;
  src: string;
  dst: string;
  dnat: FlowDnatEntry[];
  policies: FlowPolicySegment[];
  permitPorts: Set<string>;
  denyPorts: Set<string>;
  allPorts: Set<string>; // union of dnat ports + policy ports (for service facet)
  coverage: FlowCoverage;
}

/** Expand a service name (object/group) to literal "proto/port" strings. */
export function serviceToPorts(
  name: string,
  cfg: ParsedConfig,
  seen: Set<string> = new Set()
): string[] {
  if (!name || name === "any") return ["any"];
  if (seen.has(name)) return [];
  seen.add(name);
  const svc = cfg.services.find((s) => s.name === name);
  if (svc) {
    return svc.entries.map((e) =>
      e.destPort ? `${e.protocol}/${e.destPort}` : e.protocol
    );
  }
  const grp = cfg.serviceGroups.find((g) => g.name === name);
  if (grp) {
    const out = new Set<string>();
    grp.members.forEach((m) =>
      serviceToPorts(m, cfg, seen).forEach((p) => out.add(p))
    );
    return [...out];
  }
  return [name]; // literal "tcp/443" or unknown
}

export function buildFlows(cfg: ParsedConfig): Flow[] {
  const map = new Map<string, Flow>();
  const ensure = (src: string, dst: string): Flow => {
    const k = `${src}\t${dst}`;
    let f = map.get(k);
    if (!f) {
      f = {
        key: k,
        src,
        dst,
        dnat: [],
        policies: [],
        permitPorts: new Set(),
        denyPorts: new Set(),
        allPorts: new Set(),
        coverage: { kind: "no-nat", exposed: [], gap: [] },
      };
      map.set(k, f);
    }
    return f;
  };

  cfg.natRules.forEach((n) => {
    if (n.kind !== "destination" && n.kind !== "static") return;
    if (!n.translatedPool) return;
    const entryPort =
      n.origDstService && n.origDstService !== "any" ? n.origDstService : "";
    const backendPort = n.servicePort || entryPort;
    const f = ensure(n.srcAddr || "any", n.translatedPool);
    f.dnat.push({
      rule: n,
      entryAddr: n.origDstAddr,
      entryPort,
      backendPort,
    });
    const expanded = backendPort ? serviceToPorts(backendPort, cfg) : ["any"];
    expanded.forEach((p) => f.allPorts.add(p));
  });

  cfg.policies.forEach((p) => {
    const f = ensure(p.srcAddr, p.dstAddr);
    const ports = serviceToPorts(p.service, cfg);
    f.policies.push({ policy: p, ports });
    ports.forEach((port) => {
      f.allPorts.add(port);
      if (p.action === "permit") f.permitPorts.add(port);
      else if (p.action === "deny") f.denyPorts.add(port);
    });
  });

  map.forEach((f) => {
    f.policies.sort(
      (a, b) => Number(a.policy.id) - Number(b.policy.id) || a.policy.lineNo - b.policy.lineNo
    );
    if (f.dnat.length === 0) {
      f.coverage = { kind: "no-nat", exposed: [], gap: [] };
      return;
    }
    const exposedSet = new Set<string>();
    f.dnat.forEach((d) => {
      const ports = d.backendPort ? serviceToPorts(d.backendPort, cfg) : ["any"];
      ports.forEach((p) => exposedSet.add(p));
    });
    const exposed = [...exposedSet];
    const hasAnyPermit = f.permitPorts.has("any");
    const gap = hasAnyPermit
      ? []
      : exposed.filter((p) => p !== "any" && !f.permitPorts.has(p));
    const kind: CoverageKind =
      f.permitPorts.size === 0 ? "orphan" : gap.length === 0 ? "ok" : "partial";
    f.coverage = { kind, exposed, gap };
  });

  return [...map.values()];
}

export interface FacetOption {
  name: string;
  count: number;
}

export interface FlowFilter {
  src?: string;
  dst?: string;
  svc?: string;
  onlyDnat?: boolean;
  onlyAbnormal?: boolean;
}

function flowMatchSrc(f: Flow, value: string | undefined, cfg: ParsedConfig): boolean {
  if (!value || value === "any") return true;
  if (f.src === "any") return true;
  if (f.src === value) return true;
  // literal IP / object — expand and check membership
  const names = resolveEndpoint(value, cfg).names;
  return names.has(f.src);
}

function flowMatchDst(f: Flow, value: string | undefined, cfg: ParsedConfig): boolean {
  if (!value || value === "any") return true;
  if (f.dst === "any") return true;
  if (f.dst === value) return true;
  const names = resolveEndpoint(value, cfg).names;
  return names.has(f.dst);
}

function flowMatchSvc(f: Flow, value: string | undefined, cfg: ParsedConfig): boolean {
  if (!value || value === "any") return true;
  if (f.allPorts.has("any")) return true;
  const ports = serviceToPorts(value, cfg);
  return ports.some((p) => p === "any" || f.allPorts.has(p));
}

export function filterFlows(
  flows: Flow[],
  cfg: ParsedConfig,
  filter: FlowFilter
): Flow[] {
  return flows.filter((f) => {
    if (!flowMatchSrc(f, filter.src, cfg)) return false;
    if (!flowMatchDst(f, filter.dst, cfg)) return false;
    if (!flowMatchSvc(f, filter.svc, cfg)) return false;
    if (filter.onlyDnat && f.dnat.length === 0) return false;
    if (
      filter.onlyAbnormal &&
      f.coverage.kind !== "orphan" &&
      f.coverage.kind !== "partial"
    )
      return false;
    return true;
  });
}

/** Facet options for one field, computed from flows filtered by the OTHER fields. */
export function facetFor(
  flows: Flow[],
  cfg: ParsedConfig,
  field: "src" | "dst" | "svc",
  filter: FlowFilter
): FacetOption[] {
  const sub: FlowFilter = { ...filter };
  if (field === "src") sub.src = undefined;
  if (field === "dst") sub.dst = undefined;
  if (field === "svc") sub.svc = undefined;
  const list = filterFlows(flows, cfg, sub);
  const m = new Map<string, number>();
  if (field === "src") {
    list.forEach((f) => m.set(f.src, (m.get(f.src) ?? 0) + 1));
  } else if (field === "dst") {
    list.forEach((f) => m.set(f.dst, (m.get(f.dst) ?? 0) + 1));
  } else {
    list.forEach((f) =>
      f.allPorts.forEach((p) => m.set(p, (m.get(p) ?? 0) + 1))
    );
  }
  return [...m.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function sortFlows(flows: Flow[]): Flow[] {
  const score = (f: Flow): number => {
    if (f.coverage.kind === "orphan") return 0;
    if (f.coverage.kind === "partial") return 1;
    if (f.dnat.length > 0) return 2;
    return 3;
  };
  return [...flows].sort(
    (a, b) =>
      score(a) - score(b) ||
      a.src.localeCompare(b.src) ||
      a.dst.localeCompare(b.dst)
  );
}

