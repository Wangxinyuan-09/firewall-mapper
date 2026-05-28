import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useMemo, useRef, useEffect, useState } from "react";
import { useConfigStore } from "@/lib/store";
import { EmptyConfig } from "@/components/EmptyConfig";
import {
  Badge,
  DataTable,
  LineLink,
  type Column,
} from "@/components/DataTable";
import { ObjectName } from "@/components/ObjectPreview";
import { RefsPreview } from "@/components/RefsPreview";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useShowFullPortRange } from "@/lib/uiPrefs";
import {
  isIpLiteral,
  serviceToPorts,
  findAddressesContainingIp,
} from "@/lib/access";
import { Search, X } from "lucide-react";
import type {
  AddressObject,
  AddressGroup,
  ServiceObject,
  ServiceGroup,
  PolicyRule,
  NatRule,
  NatPool,
} from "@/lib/parser/types";

/* ---------- route ---------- */

interface SearchParams {
  q?: string;
}

export const Route = createFileRoute("/search")({
  head: () => ({
    meta: [
      { title: "全局搜索 · 防火墙配置审计台" },
      {
        name: "description",
        content: "跨模块搜索 IP、对象名、服务名或端口号，定位相关配置。",
      },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    q: typeof s.q === "string" ? s.q : undefined,
  }),
  component: SearchPage,
});

/* ---------- search result type ---------- */

type GlobalSearchResults = {
  query: string;
  addresses: AddressObject[];
  addressGroups: AddressGroup[];
  services: ServiceObject[];
  serviceGroups: ServiceGroup[];
  policies: PolicyRule[];
  natRules: NatRule[];
  natPools: NatPool[];
};

const emptyResults: GlobalSearchResults = {
  query: "",
  addresses: [],
  addressGroups: [],
  services: [],
  serviceGroups: [],
  policies: [],
  natRules: [],
  natPools: [],
};

/* ---------- tab key type ---------- */

type TabKey =
  | "addr"
  | "addrGrp"
  | "svc"
  | "svcGrp"
  | "policy"
  | "dnat"
  | "snat"
  | "pool";

interface TabDef {
  key: TabKey;
  label: string;
  count: number;
}

/* ---------- page ---------- */

function SearchPage() {
  const { cfg, xr } = useConfigStore();
  const navigate = useNavigate();
  const urlSearch = useSearch({ strict: false }) as SearchParams;
  const inputRef = useRef<HTMLInputElement>(null);
  const [showFull] = useShowFullPortRange();

  const query = urlSearch.q ?? "";

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const setQuery = (v: string) => {
    navigate({ to: "/search", search: v ? { q: v } : {} });
  };

  /* ---- search logic ---- */

  const results = useMemo<GlobalSearchResults>(() => {
    const q = query.trim().toLowerCase();
    if (!cfg || !xr || !q) return { ...emptyResults, query: q };

    const matchesText = (text?: string) =>
      !!text && text.toLowerCase().includes(q);
    const isIp = isIpLiteral(q);

    // combine ipToNames (exact host) + findAddressesContainingIp (CIDR/range)
    const ipNames = new Set<string>();
    if (isIp) {
      (xr.ipToNames.get(q) ?? []).forEach((n) => ipNames.add(n));
      findAddressesContainingIp(q, cfg).forEach((n) => ipNames.add(n));
    }

    const matchesAddressName = (name?: string) =>
      !!name && (matchesText(name) || ipNames.has(name));
    const matchesServiceValue = (serviceName: string) =>
      matchesText(serviceName) ||
      serviceToPorts(serviceName, cfg).some((p) =>
        p.toLowerCase().includes(q)
      );

    // address objects
    const addresses = cfg.addresses.filter((a) => {
      if (ipNames.has(a.name)) return true;
      if (matchesText(a.name) || matchesText(a.description)) return true;
      return a.entries.some((e) => matchesText(e.value));
    });

    // address groups
    const addressGroups = cfg.addressGroups.filter((g) => {
      if (ipNames.has(g.name)) return true;
      if (matchesText(g.name) || matchesText(g.description)) return true;
      return g.members.some(
        (m) => matchesText(m) || ipNames.has(m)
      );
    });

    // service objects
    const services = cfg.services.filter((s) => {
      if (matchesText(s.name) || matchesText(s.description)) return true;
      if (serviceToPorts(s.name, cfg).some((p) => p.toLowerCase().includes(q)))
        return true;
      return s.entries.some(
        (e) =>
          matchesText(e.protocol) ||
          matchesText(e.destPort) ||
          matchesText(e.sourcePort) ||
          matchesText(`${e.protocol}/${e.destPort ?? ""}`)
      );
    });

    // service groups
    const serviceGroups = cfg.serviceGroups.filter((g) => {
      if (matchesText(g.name) || matchesText(g.description)) return true;
      return g.members.some(
        (m) =>
          matchesText(m) ||
          serviceToPorts(m, cfg).some((p) => p.toLowerCase().includes(q))
      );
    });

    // policies
    const policies = cfg.policies.filter((p) => {
      if (matchesText(p.id) || matchesText(p.action)) return true;
      if (
        matchesText(p.srcZone) ||
        matchesText(p.dstZone) ||
        matchesText(p.schedule)
      )
        return true;
      return (
        matchesAddressName(p.srcAddr) ||
        matchesAddressName(p.dstAddr) ||
        matchesServiceValue(p.service)
      );
    });

    // NAT rules
    const natRules = cfg.natRules.filter((r) => {
      if (matchesText(r.id) || matchesText(r.iface) || matchesText(r.kind))
        return true;
      if (matchesText(r.description)) return true;
      const addressHit =
        matchesAddressName(r.srcAddr) ||
        matchesAddressName(r.origDstAddr) ||
        matchesAddressName(r.translatedPool) ||
        matchesAddressName(r.translatedSrc);
      const serviceHit =
        matchesServiceValue(r.origDstService ?? "") ||
        matchesText(r.servicePort ?? "");
      return addressHit || serviceHit;
    });

    // NAT pools
    const natPools = cfg.natPools.filter((p) => {
      if (ipNames.has(p.name)) return true;
      if (matchesText(p.name) || matchesText(p.description)) return true;
      return (
        matchesText(p.addressFrom) ||
        matchesText(p.addressTo)
      );
    });

    return {
      query: q,
      addresses,
      addressGroups,
      services,
      serviceGroups,
      policies,
      natRules,
      natPools,
    };
  }, [query, cfg, xr]);

  /* ---- compute tabs ---- */

  const dnatRules = useMemo(
    () =>
      results.natRules.filter(
        (r) => r.kind === "destination" || r.kind === "static"
      ),
    [results.natRules]
  );
  const snatRules = useMemo(
    () => results.natRules.filter((r) => r.kind === "source"),
    [results.natRules]
  );

  const allTabDefs: TabDef[] = [
    { key: "addr", label: "地址对象", count: results.addresses.length },
    { key: "addrGrp", label: "地址组", count: results.addressGroups.length },
    { key: "svc", label: "服务对象", count: results.services.length },
    { key: "svcGrp", label: "服务组", count: results.serviceGroups.length },
    { key: "policy", label: "策略", count: results.policies.length },
    { key: "dnat", label: "DNAT", count: dnatRules.length },
    { key: "snat", label: "SNAT", count: snatRules.length },
    { key: "pool", label: "NAT 池", count: results.natPools.length },
  ];

  const tabs = allTabDefs.filter((t) => t.count > 0);
  const totalCount = allTabDefs.reduce((s, t) => s + t.count, 0);
  const hasQuery = query.trim().length > 0;

  const [activeTab, setActiveTab] = useState<TabKey>("addr");
  // auto-switch to first non-empty tab when results change
  useEffect(() => {
    if (tabs.length > 0 && !tabs.some((t) => t.key === activeTab)) {
      setActiveTab(tabs[0].key);
    }
  }, [tabs, activeTab]);

  /* ---- column definitions (matching each module page) ---- */

  const fmtPort = (p?: string) =>
    p ? (!showFull && p === "1-65535" ? "any" : p) : "any";
  const showSrc = (p?: string) => !!p && !(!showFull && p === "1-65535");

  // address object columns
  const addrCols: Column<AddressObject>[] = [
    {
      key: "name",
      header: "名称",
      cell: (a) => <span className="font-medium">{a.name}</span>,
      search: (a) => a.name,
    },
    {
      key: "entries",
      header: "内容",
      cell: (a) => (
        <div className="space-y-0.5 font-mono text-xs">
          {a.entries.map((e, i) => (
            <div key={i}>
              <Badge tone="muted">{e.kind}</Badge> {e.value}
            </div>
          ))}
        </div>
      ),
      search: (a) => a.entries.map((e) => `${e.kind} ${e.value}`).join(" "),
    },
    {
      key: "desc",
      header: "描述",
      cell: (a) => (
        <span className="text-xs text-muted-foreground">
          {a.description ?? "—"}
        </span>
      ),
      search: (a) => a.description ?? "",
    },
    {
      key: "refs",
      header: "被引用",
      cell: (a) => <RefsPreview name={a.name} kind="address" />,
      search: (a) =>
        String((xr?.addressUsedBy.get(a.name) ?? []).length),
    },
    {
      key: "line",
      header: "行号",
      cell: (a) => <LineLink line={a.lineNo} />,
      className: "w-20",
      hiddenWhenNoLineNo: true,
    },
  ];

  // address group columns
  const addrGrpCols: Column<AddressGroup>[] = [
    {
      key: "name",
      header: "组名",
      cell: (g) => <span className="font-medium">{g.name}</span>,
      search: (g) => g.name,
    },
    {
      key: "members",
      header: "成员",
      cell: (g) => (
        <div className="space-y-0.5">
          {g.members.map((m, i) => (
            <div key={i}>
              <ObjectName name={m} />
            </div>
          ))}
        </div>
      ),
      search: (g) => g.members.join(" "),
    },
    {
      key: "desc",
      header: "描述",
      cell: (g) => (
        <span className="text-xs text-muted-foreground">
          {g.description ?? "—"}
        </span>
      ),
      search: (g) => g.description ?? "",
    },
    {
      key: "refs",
      header: "被引用",
      cell: (g) => <RefsPreview name={g.name} kind="address" />,
      search: (g) =>
        String((xr?.addressUsedBy.get(g.name) ?? []).length),
    },
    {
      key: "line",
      header: "行号",
      cell: (g) => <LineLink line={g.lineNo} />,
      className: "w-20",
      hiddenWhenNoLineNo: true,
    },
  ];

  // service object columns
  const svcCols: Column<ServiceObject>[] = [
    {
      key: "name",
      header: "名称",
      cell: (s) => <span className="font-medium">{s.name}</span>,
      search: (s) => s.name,
    },
    {
      key: "entries",
      header: "协议/端口",
      cell: (s) => (
        <div className="space-y-0.5 font-mono text-xs">
          {s.entries.map((e, i) => (
            <div key={i}>
              <Badge tone="muted">{e.protocol}</Badge> dst {fmtPort(e.destPort)}
              {showSrc(e.sourcePort) ? ` · src ${e.sourcePort}` : ""}
            </div>
          ))}
        </div>
      ),
      search: (s) =>
        s.entries.map((e) => `${e.protocol} ${e.destPort ?? ""}`).join(" "),
    },
    {
      key: "desc",
      header: "描述",
      cell: (s) => (
        <span className="text-xs text-muted-foreground">
          {s.description ?? "—"}
        </span>
      ),
      search: (s) => s.description ?? "",
    },
    {
      key: "refs",
      header: "被引用",
      cell: (s) => <RefsPreview name={s.name} kind="service" />,
      search: (s) =>
        String((xr?.serviceUsedBy.get(s.name) ?? []).length),
    },
    {
      key: "line",
      header: "行号",
      cell: (s) => <LineLink line={s.lineNo} />,
      className: "w-20",
      hiddenWhenNoLineNo: true,
    },
  ];

  // service group columns
  const svcGrpCols: Column<ServiceGroup>[] = [
    {
      key: "name",
      header: "组名",
      cell: (g) => <span className="font-medium">{g.name}</span>,
      search: (g) => g.name,
    },
    {
      key: "members",
      header: "成员",
      cell: (g) => (
        <div className="space-y-0.5">
          {g.members.map((m, i) => (
            <div key={i}>
              <ObjectName name={m} />
            </div>
          ))}
        </div>
      ),
      search: (g) =>
        `${g.members.join(" ")} ${g.members
          .flatMap((m) => serviceToPorts(m, cfg!))
          .join(" ")}`,
    },
    {
      key: "desc",
      header: "描述",
      cell: (g) => (
        <span className="text-xs text-muted-foreground">
          {g.description ?? "—"}
        </span>
      ),
      search: (g) => g.description ?? "",
    },
    {
      key: "refs",
      header: "被引用",
      cell: (g) => <RefsPreview name={g.name} kind="service" />,
      search: (g) =>
        String((xr?.serviceUsedBy.get(g.name) ?? []).length),
    },
    {
      key: "line",
      header: "行号",
      cell: (g) => <LineLink line={g.lineNo} />,
      className: "w-20",
      hiddenWhenNoLineNo: true,
    },
  ];

  // policy columns
  const policyCols: Column<PolicyRule>[] = [
    {
      key: "id",
      header: "#ID",
      cell: (p) => <span className="font-mono">{p.id}</span>,
      search: (p) => p.id,
      className: "w-16",
    },
    {
      key: "action",
      header: "动作",
      cell: (p) => (
        <Badge tone={p.action === "permit" ? "ok" : "danger"}>
          {p.action}
        </Badge>
      ),
      search: (p) => p.action,
      className: "w-20",
    },
    {
      key: "src",
      header: "源",
      cell: (p) => <ObjectName name={p.srcAddr} />,
      search: (p) =>
        `${p.srcAddr} ${(xr?.addressToValues.get(p.srcAddr) ?? []).join(" ")}`,
    },
    {
      key: "dst",
      header: "目的",
      cell: (p) => <ObjectName name={p.dstAddr} />,
      search: (p) =>
        `${p.dstAddr} ${(xr?.addressToValues.get(p.dstAddr) ?? []).join(" ")}`,
    },
    {
      key: "svc",
      header: "服务",
      cell: (p) => <ObjectName name={p.service} />,
      search: (p) =>
        `${p.service} ${serviceToPorts(p.service, cfg!).join(" ")}`,
    },
    {
      key: "zone",
      header: "Zone",
      cell: (p) => (
        <span className="font-mono text-xs text-muted-foreground">
          {p.srcZone} → {p.dstZone}
        </span>
      ),
      search: (p) => `${p.srcZone} ${p.dstZone}`,
    },
    {
      key: "schedule",
      header: "期限",
      cell: (p) => <span className="text-xs">{p.schedule}</span>,
      search: (p) => p.schedule,
    },
    {
      key: "line",
      header: "行号",
      cell: (p) => <LineLink line={p.lineNo} />,
      className: "w-20",
      hiddenWhenNoLineNo: true,
    },
  ];

  // NAT shared columns
  const natStatusCol: Column<NatRule> = {
    key: "status",
    header: "状态",
    cell: (r) => (
      <div className="flex gap-1">
        {r.disabled && <Badge tone="muted">已禁用</Badge>}
        {r.log && <Badge tone="default">log</Badge>}
      </div>
    ),
    search: (r) => `${r.disabled ? "disabled" : ""} ${r.log ? "log" : ""}`,
  };
  const natIdCol: Column<NatRule> = {
    key: "id",
    header: "#ID",
    cell: (r) => <span className="font-mono">{r.id}</span>,
    search: (r) => r.id,
    className: "w-16",
  };
  const natIfaceCol: Column<NatRule> = {
    key: "iface",
    header: "接口",
    cell: (r) => <span className="font-mono text-xs">{r.iface}</span>,
    search: (r) => r.iface,
  };
  const natDescCol: Column<NatRule> = {
    key: "desc",
    header: "描述",
    cell: (r) => (
      <span className="text-xs text-muted-foreground">
        {r.description ?? "—"}
      </span>
    ),
    search: (r) => r.description ?? "",
  };
  const natLineCol: Column<NatRule> = {
    key: "line",
    header: "行号",
    cell: (r) => <LineLink line={r.lineNo} />,
    className: "w-20",
    hiddenWhenNoLineNo: true,
  };

  // DNAT columns
  const dnatCols: Column<NatRule>[] = [
    natIdCol,
    natStatusCol,
    natIfaceCol,
    {
      key: "src",
      header: "源",
      cell: (r) => <ObjectName name={r.srcAddr} />,
      search: (r) =>
        `${r.srcAddr} ${(xr?.addressToValues.get(r.srcAddr) ?? []).join(" ")}`,
    },
    {
      key: "orig",
      header: "原目的 → 端口/服务",
      cell: (r) => (
        <div className="space-y-0.5">
          <ObjectName name={r.origDstAddr} />
          <div>
            <ObjectName name={r.origDstService} />
          </div>
        </div>
      ),
      search: (r) =>
        `${r.origDstAddr} ${(xr?.addressToValues.get(r.origDstAddr) ?? []).join(" ")} ${r.origDstService}`,
    },
    {
      key: "trans",
      header: "转换为目的",
      cell: (r) => (
        <div className="space-y-0.5">
          <ObjectName name={r.translatedPool} />
          {r.servicePort && (
            <div className="font-mono text-xs text-muted-foreground">
              service {r.servicePort}
            </div>
          )}
        </div>
      ),
      search: (r) =>
        `${r.translatedPool} ${(xr?.addressToValues.get(r.translatedPool) ?? []).join(" ")} ${r.servicePort ?? ""}`,
    },
    natDescCol,
    natLineCol,
  ];

  // SNAT columns
  const snatCols: Column<NatRule>[] = [
    natIdCol,
    natStatusCol,
    natIfaceCol,
    {
      key: "src",
      header: "原始源",
      cell: (r) => <ObjectName name={r.srcAddr} />,
      search: (r) =>
        `${r.srcAddr} ${(xr?.addressToValues.get(r.srcAddr) ?? []).join(" ")}`,
    },
    {
      key: "dst",
      header: "目的",
      cell: (r) => <ObjectName name={r.origDstAddr} />,
      search: (r) =>
        `${r.origDstAddr} ${(xr?.addressToValues.get(r.origDstAddr) ?? []).join(" ")}`,
    },
    {
      key: "trans",
      header: "转换为源",
      cell: (r) => (
        <div className="space-y-0.5">
          {r.translatedSrc ? (
            <ObjectName name={r.translatedSrc} />
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
          {r.egressInterface && <Badge tone="default">出接口取址</Badge>}
        </div>
      ),
      search: (r) =>
        `${r.translatedSrc ?? ""} ${(xr?.addressToValues.get(r.translatedSrc ?? "") ?? []).join(" ")} ${r.egressInterface ? "interface" : ""}`,
    },
    natDescCol,
    natLineCol,
  ];

  // NAT pool columns
  const poolCols: Column<NatPool>[] = [
    {
      key: "name",
      header: "池名",
      cell: (p) => <span className="font-medium">{p.name}</span>,
      search: (p) => p.name,
    },
    {
      key: "ip",
      header: "地址范围",
      cell: (p) => (
        <span className="font-mono text-xs">
          {p.addressFrom ?? "—"}
          {p.addressTo && p.addressTo !== p.addressFrom
            ? ` ~ ${p.addressTo}`
            : ""}
        </span>
      ),
      search: (p) => `${p.addressFrom ?? ""} ${p.addressTo ?? ""}`,
    },
    {
      key: "desc",
      header: "描述",
      cell: (p) => (
        <span className="text-xs text-muted-foreground">
          {p.description ?? "—"}
        </span>
      ),
      search: (p) => p.description ?? "",
    },
    {
      key: "line",
      header: "行号",
      cell: (p) => <LineLink line={p.lineNo} />,
      className: "w-20",
      hiddenWhenNoLineNo: true,
    },
  ];

  /* ---- render ---- */

  if (!cfg || !xr) return <EmptyConfig />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">全局搜索</h1>
        <p className="text-sm text-muted-foreground">
          输入 IP、对象名、服务名或端口号，跨全部模块定位相关配置。
        </p>
      </div>

      {/* search input */}
      <div className="relative max-w-2xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          placeholder="搜索 IP / 对象名 / 服务名 / 端口"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-12 pl-10 pr-10 text-lg"
        />
        {query && (
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 p-0"
            onClick={() => setQuery("")}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* results */}
      {!hasQuery ? (
        <p className="text-sm text-muted-foreground">
          在此处输入 IP、对象名、服务名或端口号，可跨全部模块定位相关配置。
        </p>
      ) : totalCount === 0 ? (
        <p className="text-sm text-muted-foreground">
          未找到匹配「{query.trim()}」的结果。
        </p>
      ) : (
        <>
          {/* stats bar */}
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            {tabs
              .filter((t) => t.count > 0)
              .map((t) => (
                <span key={t.key} className="rounded bg-secondary px-2 py-1">
                  {t.label} {t.count}
                </span>
              ))}
            <span className="px-2 py-1 font-medium">
              共 {totalCount} 条结果
            </span>
          </div>

          {/* tabs */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
            <TabsList className="flex-wrap">
              {tabs.map((t) => (
                <TabsTrigger key={t.key} value={t.key}>
                  {t.label} ({t.count})
                </TabsTrigger>
              ))}
            </TabsList>

            {tabs.some((t) => t.key === "addr") && (
              <TabsContent value="addr" className="mt-4">
                <DataTable
                  rows={results.addresses}
                  columns={addrCols}
                  filename="search-addresses.csv"
                  emptyText="无匹配地址对象"
                />
              </TabsContent>
            )}
            {tabs.some((t) => t.key === "addrGrp") && (
              <TabsContent value="addrGrp" className="mt-4">
                <DataTable
                  rows={results.addressGroups}
                  columns={addrGrpCols}
                  filename="search-address-groups.csv"
                  emptyText="无匹配地址组"
                />
              </TabsContent>
            )}
            {tabs.some((t) => t.key === "svc") && (
              <TabsContent value="svc" className="mt-4">
                <DataTable
                  rows={results.services}
                  columns={svcCols}
                  filename="search-services.csv"
                  emptyText="无匹配服务对象"
                />
              </TabsContent>
            )}
            {tabs.some((t) => t.key === "svcGrp") && (
              <TabsContent value="svcGrp" className="mt-4">
                <DataTable
                  rows={results.serviceGroups}
                  columns={svcGrpCols}
                  filename="search-service-groups.csv"
                  emptyText="无匹配服务组"
                />
              </TabsContent>
            )}
            {tabs.some((t) => t.key === "policy") && (
              <TabsContent value="policy" className="mt-4">
                <DataTable
                  rows={results.policies}
                  columns={policyCols}
                  filename="search-policies.csv"
                  emptyText="无匹配策略"
                />
              </TabsContent>
            )}
            {tabs.some((t) => t.key === "dnat") && (
              <TabsContent value="dnat" className="mt-4">
                <DataTable
                  rows={dnatRules}
                  columns={dnatCols}
                  filename="search-dnat.csv"
                  emptyText="无匹配 DNAT 规则"
                />
              </TabsContent>
            )}
            {tabs.some((t) => t.key === "snat") && (
              <TabsContent value="snat" className="mt-4">
                <DataTable
                  rows={snatRules}
                  columns={snatCols}
                  filename="search-snat.csv"
                  emptyText="无匹配 SNAT 规则"
                />
              </TabsContent>
            )}
            {tabs.some((t) => t.key === "pool") && (
              <TabsContent value="pool" className="mt-4">
                <DataTable
                  rows={results.natPools}
                  columns={poolCols}
                  filename="search-nat-pools.csv"
                  emptyText="无匹配 NAT 池"
                />
              </TabsContent>
            )}
          </Tabs>
        </>
      )}
    </div>
  );
}
