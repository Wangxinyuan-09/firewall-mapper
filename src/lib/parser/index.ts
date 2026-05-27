import type {
  AddressGroup,
  AddressObject,
  InterfaceEntry,
  IntermediaryNode,
  NatPool,
  NatRule,
  ParsedConfig,
  PolicyRule,
  ScheduleEntry,
  ServiceGroup,
  ServiceObject,
} from "./types";

// 分词：把每行拆成 tokens，尊重连续空白
function tokens(line: string): string[] {
  return line.trim().split(/\s+/).filter(Boolean);
}

function indent(line: string): number {
  const m = line.match(/^(\s*)/);
  return m ? m[1].length : 0;
}

export function parseConfig(raw: string, fileName?: string): ParsedConfig {
  const rawLines = raw.split(/\r?\n/);
  const out: ParsedConfig = {
    meta: { totalLines: rawLines.length, fileName },
    addresses: [],
    addressGroups: [],
    services: [],
    serviceGroups: [],
    policies: [],
    natPools: [],
    natRules: [],
    interfaces: [],
    schedules: [],
    intermediaries: [],
    rawLines,
  };

  // 用 Map 去重（同名块多次出现时，后一次覆盖/合并）
  const addrMap = new Map<string, AddressObject>();
  const agMap = new Map<string, AddressGroup>();
  const svcMap = new Map<string, ServiceObject>();
  const sgMap = new Map<string, ServiceGroup>();
  const natMap = new Map<string, NatRule>();

  let i = 0;
  while (i < rawLines.length) {
    const line = rawLines[i];
    const lineNo = i + 1;
    const t = tokens(line);
    if (t.length === 0 || line.startsWith("!")) {
      // metadata
      if (line.startsWith("!$Version:")) out.meta.version = line.slice(10).trim();
      if (line.startsWith("!$Buildtime:")) out.meta.buildtime = line.slice(12).trim();
      i++;
      continue;
    }
    // 仅处理列 0 的指令；缩进行交给块解析器
    if (indent(line) > 0) {
      i++;
      continue;
    }

    const head = t[0];

    // ---------- address ----------
    if (head === "address" && t.length >= 2) {
      const name = t.slice(1).join(" ");
      const obj: AddressObject =
        addrMap.get(name) ?? { name, entries: [], lineNo };
      // 读子项
      let j = i + 1;
      while (j < rawLines.length && indent(rawLines[j]) > 0) {
        const sub = tokens(rawLines[j]);
        if (sub[0] === "host-address" && sub[1])
          obj.entries.push({ kind: "host", value: sub[1] });
        else if (sub[0] === "net-address" && sub[1])
          obj.entries.push({ kind: "net", value: sub[1] });
        else if (sub[0] === "range-address" && sub[1] && sub[2])
          obj.entries.push({ kind: "range", value: `${sub[1]}-${sub[2]}` });
        else if (sub[0] === "domain-address" && sub[1])
          obj.entries.push({ kind: "domain", value: sub[1] });
        else if (sub[0] === "mac-address" && sub[1])
          obj.entries.push({ kind: "mac", value: sub[1] });
        else if (sub[0] === "description")
          obj.description = sub.slice(1).join(" ");
        j++;
      }
      addrMap.set(name, obj);
      i = j;
      continue;
    }

    // ---------- address-group ----------
    if (head === "address-group" && t.length >= 2) {
      const name = t.slice(1).join(" ");
      const obj: AddressGroup =
        agMap.get(name) ?? { name, members: [], lineNo };
      let j = i + 1;
      while (j < rawLines.length && indent(rawLines[j]) > 0) {
        const sub = tokens(rawLines[j]);
        if (sub[0] === "address-object" && sub[1])
          obj.members.push(sub.slice(1).join(" "));
        else if (sub[0] === "description")
          obj.description = sub.slice(1).join(" ");
        j++;
      }
      agMap.set(name, obj);
      i = j;
      continue;
    }

    // ---------- service ----------
    if (head === "service" && t.length >= 2) {
      const name = t.slice(1).join(" ");
      const obj: ServiceObject =
        svcMap.get(name) ?? { name, entries: [], lineNo };
      let j = i + 1;
      while (j < rawLines.length && indent(rawLines[j]) > 0) {
        const sub = tokens(rawLines[j]);
        const proto = sub[0];
        if (["tcp", "udp", "icmp", "ip"].includes(proto)) {
          // 形如：tcp dest 443 source 1 65535
          let destPort: string | undefined;
          let sourcePort: string | undefined;
          for (let k = 1; k < sub.length; k++) {
            if (sub[k] === "dest" && sub[k + 1]) {
              destPort = sub[k + 1];
              if (sub[k + 2] && /^\d+$/.test(sub[k + 2])) {
                destPort = `${sub[k + 1]}-${sub[k + 2]}`;
                k += 2;
              } else {
                k += 1;
              }
            } else if (sub[k] === "source" && sub[k + 1]) {
              sourcePort = sub[k + 1];
              if (sub[k + 2] && /^\d+$/.test(sub[k + 2])) {
                sourcePort = `${sub[k + 1]}-${sub[k + 2]}`;
                k += 2;
              } else {
                k += 1;
              }
            }
          }
          obj.entries.push({ protocol: proto, destPort, sourcePort });
        } else if (sub[0] === "description") {
          obj.description = sub.slice(1).join(" ");
        }
        j++;
      }
      svcMap.set(name, obj);
      i = j;
      continue;
    }

    // ---------- service-group ----------
    if (head === "service-group" && t.length >= 2) {
      const name = t.slice(1).join(" ");
      const obj: ServiceGroup =
        sgMap.get(name) ?? { name, members: [], lineNo };
      let j = i + 1;
      while (j < rawLines.length && indent(rawLines[j]) > 0) {
        const sub = tokens(rawLines[j]);
        if (sub[0] === "service-object" && sub[1])
          obj.members.push(sub.slice(1).join(" "));
        else if (sub[0] === "description")
          obj.description = sub.slice(1).join(" ");
        j++;
      }
      sgMap.set(name, obj);
      i = j;
      continue;
    }

    // ---------- policy 单行 ----------
    if (head === "policy" && /^\d+$/.test(t[1] ?? "")) {
      // policy ID srcZone dstZone srcAddr dstAddr service f7 f8 schedule action
      if (t.length >= 11) {
        const p: PolicyRule = {
          id: t[1],
          srcZone: t[2],
          dstZone: t[3],
          srcAddr: t[4],
          dstAddr: t[5],
          service: t[6],
          field7: t[7],
          field8: t[8],
          schedule: t[9],
          action: t[10] as PolicyRule["action"],
          lineNo,
          raw: line.trim(),
        };
        out.policies.push(p);
      }
      i++;
      continue;
    }

    // ---------- ip nat pool ----------
    if (head === "ip" && t[1] === "nat" && t[2] === "pool") {
      const name = t.slice(3).join(" ");
      const pool: NatPool = { name, lineNo };
      let j = i + 1;
      while (j < rawLines.length && indent(rawLines[j]) > 0) {
        const sub = tokens(rawLines[j]);
        if (sub[0] === "description") pool.description = sub.slice(1).join(" ");
        else if (sub[0] === "ip" && sub[1] === "address") {
          pool.addressFrom = sub[2];
          pool.addressTo = sub[3];
        }
        j++;
      }
      out.natPools.push(pool);
      i = j;
      continue;
    }

    // ---------- ip nat destination （单行 DNAT） ----------
    if (head === "ip" && t[1] === "nat" && t[2] === "destination") {
      // ip nat destination <iface> <src> <preDstAddr> <preDstService> <natPool> [service <port>] [log] <id>
      const rest = t.slice(3);
      // 最后一个 token 是数字 ID
      let id = "";
      let log = false;
      let servicePort: string | undefined;
      const trimmed = [...rest];
      const last = trimmed[trimmed.length - 1];
      if (last && /^\d+$/.test(last)) {
        id = last;
        trimmed.pop();
      }
      if (trimmed[trimmed.length - 1] === "log") {
        log = true;
        trimmed.pop();
      }
      if (
        trimmed.length >= 2 &&
        trimmed[trimmed.length - 2] === "service"
      ) {
        servicePort = trimmed[trimmed.length - 1];
        trimmed.splice(trimmed.length - 2, 2);
      }
      // 剩 5 项：iface src origDstAddr origDstService translatedPool
      if (trimmed.length >= 5 && id) {
        const [iface, srcAddr, origDstAddr, origDstService, translatedPool] =
          trimmed;
        const rule: NatRule = {
          id,
          kind: "destination",
          iface,
          srcAddr,
          origDstAddr,
          origDstService,
          translatedPool,
          servicePort,
          log,
          lineNo,
          raw: line.trim(),
        };
        natMap.set(id, rule);
      }
      i++;
      continue;
    }

    // ---------- ip nat source （单行 SNAT） ----------
    // 形如：ip nat source <iface> <srcAddr> <origDstAddr> <translatedSrc> {interface | <poolAddr>} [log] <id>
    if (head === "ip" && t[1] === "nat" && t[2] === "source") {
      const rest = t.slice(3);
      let id = "";
      let log = false;
      const trimmed = [...rest];
      const last = trimmed[trimmed.length - 1];
      if (last && /^\d+$/.test(last)) {
        id = last;
        trimmed.pop();
      }
      if (trimmed[trimmed.length - 1] === "log") {
        log = true;
        trimmed.pop();
      }
      // 剩余至少 5 项：iface src origDst translatedSrc {interface|poolAddr}
      if (trimmed.length >= 5 && id) {
        const iface = trimmed[0];
        const srcAddr = trimmed[1];
        const origDstAddr = trimmed[2];
        const translatedSrc = trimmed[3];
        const tail = trimmed[4];
        const egressInterface = tail === "interface";
        const rule: NatRule = {
          id,
          kind: "source",
          iface,
          srcAddr,
          origDstAddr,
          origDstService: "any",
          translatedPool: egressInterface ? "" : tail,
          translatedSrc,
          egressInterface,
          log,
          lineNo,
          raw: line.trim(),
        };
        natMap.set(id, rule);
      }
      i++;
      continue;
    }

    // ---------- ip nat <id> <attr...> （NAT 元数据续行） ----------
    if (head === "ip" && t[1] === "nat" && /^\d+$/.test(t[2] ?? "")) {
      const id = t[2];
      const r = natMap.get(id);
      if (r) {
        if (t[3] === "description") r.description = t.slice(4).join(" ");
        else if (t[3] === "disable") r.disabled = true;
      }
      i++;
      continue;
    }

    // ---------- interface ----------
    if (head === "interface" && t.length >= 2) {
      const name = t.slice(1).join(" ");
      const iface: InterfaceEntry = { name, ips: [], attrs: [], lineNo };
      let j = i + 1;
      while (j < rawLines.length && indent(rawLines[j]) > 0) {
        const sub = tokens(rawLines[j]);
        if (sub[0] === "ip" && sub[1] === "address" && sub[2])
          iface.ips.push(sub.slice(2).join(" "));
        else iface.attrs.push(sub.join(" "));
        j++;
      }
      out.interfaces.push(iface);
      i = j;
      continue;
    }

    // ---------- schedule ----------
    if (head === "schedule" && t.length >= 3) {
      const kind = t[1];
      const name = t.slice(2).join(" ");
      const sched: ScheduleEntry = { kind, name, lineNo };
      let j = i + 1;
      while (j < rawLines.length && indent(rawLines[j]) > 0) {
        const sub = tokens(rawLines[j]);
        if (sub[0] === "description") sched.description = sub.slice(1).join(" ");
        else if (sub[0] === "absolute") sched.absolute = sub.slice(1).join(" ");
        else if (sub[0] === "periodic") sched.periodic = sub.slice(1).join(" ");
        j++;
      }
      out.schedules.push(sched);
      i = j;
      continue;
    }

    i++;
  }

  out.addresses = [...addrMap.values()].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  out.addressGroups = [...agMap.values()].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  out.services = [...svcMap.values()].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  out.serviceGroups = [...sgMap.values()].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  out.natRules = [...natMap.values()].sort(
    (a, b) => Number(b.id) - Number(a.id)
  );

  out.intermediaries = detectIntermediaries(out);
  return out;
}

// 根据命名/池/策略推断中间节点
function detectIntermediaries(cfg: ParsedConfig): IntermediaryNode[] {
  const nodes: IntermediaryNode[] = [];
  const seen = new Set<string>();
  const push = (n: IntermediaryNode) => {
    const k = `${n.category}::${n.name}`;
    if (seen.has(k)) return;
    seen.add(k);
    nodes.push(n);
  };

  const classify = (
    name: string
  ): IntermediaryNode["category"] | undefined => {
    const lower = name.toLowerCase();
    if (lower.includes("waf")) return "waf";
    if (name.includes("堡垒")) return "bastion";
    if (lower.includes("bastion")) return "bastion";
    if (name.includes("数据库网关") || name.includes("api网关") || lower.includes("gateway") || lower.includes("api-")) return "gateway";
    if (name.includes("代理") || lower.includes("proxy")) return "proxy";
    if (name.includes("负载") || lower.includes("lb") || lower.includes("slb")) return "lb";
    return undefined;
  };

  // 从地址对象 + 地址组 + nat 池里都尝试归类
  const collectFrom = (
    name: string,
    address: string | undefined,
    evidence: string
  ) => {
    const c = classify(name);
    if (c) push({ category: c, name, address, evidence: [evidence] });
  };

  cfg.addresses.forEach((a) =>
    collectFrom(
      a.name,
      a.entries[0]?.value,
      `address ${a.name} (line ${a.lineNo})`
    )
  );
  cfg.addressGroups.forEach((g) =>
    collectFrom(g.name, undefined, `address-group ${g.name} (line ${g.lineNo})`)
  );
  cfg.natPools.forEach((p) =>
    collectFrom(
      p.name,
      p.addressFrom,
      `nat-pool ${p.name} (line ${p.lineNo})`
    )
  );

  return nodes.sort((a, b) => a.category.localeCompare(b.category));
}

// ---------- 引用图（反向索引） ----------

export interface CrossRef {
  // name(addr/addr-group/service/service-group) -> 引用方说明
  addressUsedBy: Map<string, RefUsage[]>;
  serviceUsedBy: Map<string, RefUsage[]>;
  // address name -> 展开的地址值（例如 host/net/range）
  addressToValues: Map<string, string[]>;
  // ip 字面量 -> 包含该 ip 的对象/组名列表
  ipToNames: Map<string, string[]>;
}

export interface RefUsage {
  by: "policy" | "address-group" | "service-group" | "nat";
  id: string;
  detail: string;
  lineNo: number;
}

export function buildCrossRef(cfg: ParsedConfig): CrossRef {
  const addressUsedBy = new Map<string, RefUsage[]>();
  const serviceUsedBy = new Map<string, RefUsage[]>();
  const addressToValues = new Map<string, string[]>();
  const ipToNames = new Map<string, string[]>();
  const add = (
    map: Map<string, RefUsage[]>,
    key: string,
    u: RefUsage
  ) => {
    if (!key || key === "any") return;
    const arr = map.get(key) ?? [];
    arr.push(u);
    map.set(key, arr);
  };

  cfg.addressGroups.forEach((g) => {
    g.members.forEach((m) =>
      add(addressUsedBy, m, {
        by: "address-group",
        id: g.name,
        detail: `地址组 ${g.name}`,
        lineNo: g.lineNo,
      })
    );
  });
  cfg.serviceGroups.forEach((g) => {
    g.members.forEach((m) =>
      add(serviceUsedBy, m, {
        by: "service-group",
        id: g.name,
        detail: `服务组 ${g.name}`,
        lineNo: g.lineNo,
      })
    );
  });
  cfg.policies.forEach((p) => {
    [p.srcAddr, p.dstAddr].forEach((a) =>
      add(addressUsedBy, a, {
        by: "policy",
        id: p.id,
        detail: `策略 #${p.id} (${p.action})`,
        lineNo: p.lineNo,
      })
    );
    add(serviceUsedBy, p.service, {
      by: "policy",
      id: p.id,
      detail: `策略 #${p.id}`,
      lineNo: p.lineNo,
    });
  });
  cfg.natRules.forEach((r) => {
    [r.srcAddr, r.origDstAddr, r.translatedPool, r.translatedSrc].forEach((a) => {
      if (!a) return;
      add(addressUsedBy, a, {
        by: "nat",
        id: r.id,
        detail: `NAT #${r.id}`,
        lineNo: r.lineNo,
      });
    });
    add(serviceUsedBy, r.origDstService, {
      by: "nat",
      id: r.id,
      detail: `NAT #${r.id}`,
      lineNo: r.lineNo,
    });
  });

  // build addressToValues: address -> its entries; address-group -> flatten members' entries
  const addrMap = new Map<string, string[]>();
  cfg.addresses.forEach((a) => {
    const vals = a.entries.map((e) => e.value);
    addrMap.set(a.name, vals);
    addressToValues.set(a.name, vals);
    // record ip->name for host entries
    a.entries
      .filter((e) => e.value && e.value.match(/^\d+\.\d+\.\d+\.\d+$/))
      .forEach((e) => {
        const arr = ipToNames.get(e.value) ?? [];
        arr.push(a.name);
        ipToNames.set(e.value, arr);
      });
  });

  // helper to resolve group members recursively (avoid cycles)
  const resolveGroup = (g: typeof cfg.addressGroups[number], seen = new Set<string>()): string[] => {
    if (seen.has(g.name)) return [];
    seen.add(g.name);
    const out: string[] = [];
    g.members.forEach((m) => {
      if (addrMap.has(m)) out.push(...(addrMap.get(m) ?? []));
      else {
        const sub = cfg.addressGroups.find((gg) => gg.name === m);
        if (sub) out.push(...resolveGroup(sub, seen));
      }
    });
    return out;
  };

  cfg.addressGroups.forEach((g) => {
    const vals = resolveGroup(g);
    addressToValues.set(g.name, vals);
    vals.forEach((v) => {
      if (v.match(/^\d+\.\d+\.\d+\.\d+$/)) {
        const arr = ipToNames.get(v) ?? [];
        arr.push(g.name);
        ipToNames.set(v, arr);
      }
    });
  });

  // NAT pools may contain literal addresses
  cfg.natPools.forEach((p) => {
    const vals: string[] = [];
    if (p.addressFrom) vals.push(p.addressFrom);
    if (p.addressTo && p.addressTo !== p.addressFrom) vals.push(p.addressTo);
    if (vals.length > 0) addressToValues.set(p.name, vals);
    vals.forEach((v) => {
      if (v.match(/^\d+\.\d+\.\d+\.\d+$/)) {
        const arr = ipToNames.get(v) ?? [];
        arr.push(p.name);
        ipToNames.set(v, arr);
      }
    });
  });

  return { addressUsedBy, serviceUsedBy, addressToValues, ipToNames };
}

// ---------- 审计 ----------

import type { AuditFinding } from "./types";

export function runAudit(cfg: ParsedConfig, xr: CrossRef): AuditFinding[] {
  const out: AuditFinding[] = [];
  let n = 0;
  const id = () => `f${++n}`;

  // 未引用对象
  cfg.addresses.forEach((a) => {
    if (!xr.addressUsedBy.has(a.name)) {
      out.push({
        id: id(),
        severity: "info",
        category: "未引用",
        title: `地址对象未被任何策略/组/NAT 引用：${a.name}`,
        detail: a.description ?? "",
        refLine: a.lineNo,
        refKind: "address",
        refName: a.name,
      });
    }
  });
  cfg.addressGroups.forEach((g) => {
    if (!xr.addressUsedBy.has(g.name)) {
      out.push({
        id: id(),
        severity: "info",
        category: "未引用",
        title: `地址组未被引用：${g.name}`,
        detail: `成员 ${g.members.length} 个`,
        refLine: g.lineNo,
        refKind: "address-group",
        refName: g.name,
      });
    }
  });
  cfg.services.forEach((s) => {
    if (!xr.serviceUsedBy.has(s.name)) {
      out.push({
        id: id(),
        severity: "info",
        category: "未引用",
        title: `服务对象未被引用：${s.name}`,
        detail: s.entries
          .map((e) => `${e.protocol}/${e.destPort ?? ""}`)
          .join(", "),
        refLine: s.lineNo,
        refKind: "service",
        refName: s.name,
      });
    }
  });
  cfg.serviceGroups.forEach((g) => {
    if (!xr.serviceUsedBy.has(g.name)) {
      out.push({
        id: id(),
        severity: "info",
        category: "未引用",
        title: `服务组未被引用：${g.name}`,
        detail: `成员 ${g.members.length} 个`,
        refLine: g.lineNo,
        refKind: "service-group",
        refName: g.name,
      });
    }
  });

  // 宽松策略
  cfg.policies.forEach((p) => {
    const anyCount = [p.srcAddr, p.dstAddr, p.service].filter(
      (x) => x === "any"
    ).length;
    if (p.action === "permit" && anyCount >= 2) {
      out.push({
        id: id(),
        severity: anyCount === 3 ? "high" : "warn",
        category: "宽松策略",
        title: `策略 #${p.id} 含 ${anyCount} 个 any（${p.action}）`,
        detail: p.raw,
        refLine: p.lineNo,
        refKind: "policy",
        refName: p.id,
      });
    }
  });

  // 命名混乱：同 IP 不同名
  const ipToNames = new Map<string, string[]>();
  cfg.addresses.forEach((a) => {
    const hosts = a.entries
      .filter((e) => e.kind === "host")
      .map((e) => e.value);
    hosts.forEach((ip) => {
      const arr = ipToNames.get(ip) ?? [];
      arr.push(a.name);
      ipToNames.set(ip, arr);
    });
  });
  ipToNames.forEach((names, ip) => {
    if (names.length > 1) {
      out.push({
        id: id(),
        severity: "warn",
        category: "重复定义",
        title: `IP ${ip} 同时被 ${names.length} 个对象定义`,
        detail: names.join(" / "),
      });
    }
  });

  // 缺描述的策略
  cfg.policies.forEach((p) => {
    // policy 本身没有 description 字段（在此格式中），跳过
    void p;
  });

  return out;
}
