import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useConfigStore } from "@/lib/store";
import type { NatRule, PolicyRule, ParsedConfig } from "@/lib/parser/types";
import { EmptyConfig } from "@/components/EmptyConfig";
import { Badge, LineLink } from "@/components/DataTable";
import { useShowLineNumbers, useShowFullPortRange } from "@/lib/uiPrefs";
import { useMemo, useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  ArrowLeftRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Check,
  ChevronsUpDown,
} from "lucide-react";
import { L } from "@/components/previewAtoms";
import {
  classifyIntermediary,
  expandServiceNames,
  resolveEndpoint,
  summarizeService,
  CAT_LABEL,
  isIpLiteral,
} from "@/lib/access";
import { cn } from "@/lib/utils";

interface SearchParams {
  src?: string;
  dst?: string;
  svc?: string;
}

export const Route = createFileRoute("/access-graph")({
  head: () => ({
    meta: [
      { title: "访问路径分析 · 防火墙配置审计台" },
      {
        name: "description",
        content:
          "选源/目的/服务，查看命中策略、DNAT 入口转换、经过的中间节点与放行结论。",
      },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    src: typeof s.src === "string" ? s.src : undefined,
    dst: typeof s.dst === "string" ? s.dst : undefined,
    svc: typeof s.svc === "string" ? s.svc : undefined,
  }),
  component: AccessGraphPage,
});

function AccessGraphPage() {
  const { cfg } = useConfigStore();
  const search = useSearch({ from: "/access-graph" });
  const navigate = useNavigate({ from: "/access-graph" });
  const [showLineNo] = useShowLineNumbers();
  const [showFull] = useShowFullPortRange();

  const src = search.src ?? "any";
  const dst = search.dst ?? "any";
  const svc = search.svc ?? "any";

  const setParam = (key: keyof SearchParams, value: string) => {
    navigate({
      search: (prev: SearchParams) => ({
        ...prev,
        [key]: value === "any" ? undefined : value,
      }),
      replace: true,
    });
  };
  const swap = () => {
    navigate({
      search: (prev: SearchParams) => ({ ...prev, src: prev.dst, dst: prev.src }),
      replace: true,
    });
  };

  const allAddrNames = useMemo(() => {
    if (!cfg) return [] as string[];
    const s = new Set<string>(["any"]);
    cfg.addresses.forEach((a) => s.add(a.name));
    cfg.addressGroups.forEach((g) => s.add(g.name));
    return [...s].sort();
  }, [cfg]);

  const allSvcNames = useMemo(() => {
    if (!cfg) return [] as string[];
    const s = new Set<string>(["any"]);
    cfg.services.forEach((x) => s.add(x.name));
    cfg.serviceGroups.forEach((x) => s.add(x.name));
    return [...s].sort();
  }, [cfg]);

  const resolved = useMemo(() => {
    if (!cfg) return null;
    const srcR = resolveEndpoint(src, cfg);
    const dstR = resolveEndpoint(dst, cfg);
    const svcSet = svc === "any" ? new Set(["any"]) : expandServiceNames(svc, cfg);
    return { srcR, dstR, svcSet };
  }, [cfg, src, dst, svc]);

  const matched = useMemo(() => {
    if (!cfg || !resolved)
      return { policies: [] as PolicyRule[], nats: [] as NatRule[] };
    const { srcR, dstR, svcSet } = resolved;
    const matchAddr = (
      input: string,
      ruleVal: string,
      set: Set<string>
    ): boolean => {
      if (input === "any") return true;
      if (ruleVal === "any") return true;
      return set.has(ruleVal);
    };
    const matchSvc = (ruleVal: string): boolean => {
      if (svc === "any") return true;
      if (ruleVal === "any") return true;
      return svcSet.has(ruleVal);
    };
    const policies = cfg.policies
      .filter(
        (p) =>
          matchAddr(src, p.srcAddr, srcR.names) &&
          matchAddr(dst, p.dstAddr, dstR.names) &&
          matchSvc(p.service)
      )
      .sort((a, b) => Number(a.id) - Number(b.id));
    const nats = cfg.natRules.filter(
      (n) =>
        matchAddr(src, n.srcAddr, srcR.names) &&
        (matchAddr(dst, n.origDstAddr, dstR.names) ||
          dstR.names.has(n.translatedPool))
    );
    return { policies, nats };
  }, [cfg, resolved, src, dst, svc]);

  if (!cfg) return <EmptyConfig />;

  const bothAny = src === "any" && dst === "any" && svc === "any";
  const firstHit = matched.policies[0];
  const verdict = computeVerdict(firstHit, matched.nats);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">访问路径分析</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          选定源/目的/服务（或直接输入 IP / <code>tcp/443</code>），系统会按对象组展开并模拟首条命中。
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <EndpointPicker
            label="源"
            value={src}
            onChange={(v) => setParam("src", v)}
            options={allAddrNames}
            placeholder="对象名 或 IP/CIDR"
          />
          <Button
            size="icon"
            variant="ghost"
            onClick={swap}
            className="mb-1 h-8 w-8"
            title="交换源/目的"
          >
            <ArrowLeftRight className="h-4 w-4" />
          </Button>
          <EndpointPicker
            label="目的"
            value={dst}
            onChange={(v) => setParam("dst", v)}
            options={allAddrNames}
            placeholder="对象名 或 IP/CIDR"
          />
          <ServicePicker
            value={svc}
            onChange={(v) => setParam("svc", v)}
            options={allSvcNames}
          />
          <div className="ml-auto text-xs text-muted-foreground">
            {matched.policies.length} 条策略 / {matched.nats.length} 条 NAT
          </div>
        </div>
        {resolved && (resolved.srcR.literalHits.length > 0 || resolved.dstR.literalHits.length > 0) && (
          <div className="mt-3 space-y-1 text-xs text-muted-foreground">
            {resolved.srcR.literalHits.length > 0 && (
              <ExpandedHint label="源" hits={resolved.srcR.literalHits} />
            )}
            {resolved.dstR.literalHits.length > 0 && (
              <ExpandedHint label="目的" hits={resolved.dstR.literalHits} />
            )}
          </div>
        )}
        {src !== "any" && isIpLiteral(src) && resolved?.srcR.literalHits.length === 0 && (
          <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
            源 IP <code>{src}</code> 没有任何地址对象覆盖——以下结果仅匹配 <code>any</code> 规则。
          </p>
        )}
        {dst !== "any" && isIpLiteral(dst) && resolved?.dstR.literalHits.length === 0 && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            目的 IP <code>{dst}</code> 没有任何地址对象覆盖——以下结果仅匹配 <code>any</code> 规则。
          </p>
        )}
      </div>

      {bothAny ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          请至少指定一端（源 / 目的 / 服务），避免列出全表。
        </div>
      ) : (
        <>
          <VerdictBanner verdict={verdict} firstHit={firstHit} nats={matched.nats} />

          {matched.nats.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">DNAT 入口转换</h2>
              <div className="space-y-2 rounded-lg border border-border bg-card p-3">
                {matched.nats.map((n) => (
                  <DnatChain key={n.id} rule={n} showFull={showFull} />
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-2 text-sm font-semibold text-muted-foreground">路径示意</h2>
            <div className="overflow-x-auto rounded-lg border border-border bg-card p-5">
              <ChainView
                src={src}
                dst={dst}
                svc={svc}
                cfg={cfg}
                policies={matched.policies}
                nats={matched.nats}
                verdict={verdict}
              />
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
              命中的策略（{matched.policies.length}）
            </h2>
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">序</th>
                    <th className="px-3 py-2 text-left">#</th>
                    <th className="px-3 py-2 text-left">动作</th>
                    <th className="px-3 py-2 text-left">源区</th>
                    <th className="px-3 py-2 text-left">源</th>
                    <th className="px-3 py-2 text-left">目的</th>
                    <th className="px-3 py-2 text-left">服务</th>
                    <th className="px-3 py-2 text-left">期限</th>
                    {showLineNo && <th className="px-3 py-2 text-left">行号</th>}
                  </tr>
                </thead>
                <tbody>
                  {matched.policies.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                        未命中任何策略
                      </td>
                    </tr>
                  ) : (
                    matched.policies.map((p, idx) => (
                      <tr
                        key={p.id}
                        className={`border-t border-border ${
                          idx === 0
                            ? p.action === "permit"
                              ? "bg-emerald-500/5"
                              : "bg-destructive/5"
                            : ""
                        }`}
                      >
                        <td className="px-3 py-1.5 text-xs text-muted-foreground">
                          {idx === 0 ? "▶ 首条" : idx + 1}
                        </td>
                        <td className="px-3 py-1.5 font-mono">{p.id}</td>
                        <td className="px-3 py-1.5">
                          <Badge tone={p.action === "permit" ? "ok" : "danger"}>
                            {p.action}
                          </Badge>
                        </td>
                        <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">
                          {p.srcZone}→{p.dstZone}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-xs">{p.srcAddr}</td>
                        <td className="px-3 py-1.5 font-mono text-xs">{p.dstAddr}</td>
                        <td className="px-3 py-1.5 font-mono text-xs">{p.service}</td>
                        <td className="px-3 py-1.5 text-xs">{p.schedule}</td>
                        {showLineNo && (
                          <td className="px-3 py-1.5">
                            <LineLink line={p.lineNo} />
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {matched.nats.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
                命中的 NAT（{matched.nats.length}）
              </h2>
              <div className="overflow-x-auto rounded-lg border border-border bg-card">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">#</th>
                      <th className="px-3 py-2 text-left">iface</th>
                      <th className="px-3 py-2 text-left">源</th>
                      <th className="px-3 py-2 text-left">原目的:端口</th>
                      <th className="px-3 py-2 text-left">→ 转换为</th>
                      <th className="px-3 py-2 text-left">描述</th>
                      {showLineNo && <th className="px-3 py-2 text-left">行号</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {matched.nats.map((r) => (
                      <tr key={r.id} className="border-t border-border">
                        <td className="px-3 py-1.5 font-mono">{r.id}</td>
                        <td className="px-3 py-1.5 font-mono text-xs">{r.iface}</td>
                        <td className="px-3 py-1.5 font-mono text-xs">{r.srcAddr}</td>
                        <td className="px-3 py-1.5 font-mono text-xs">
                          {r.origDstAddr}
                          {r.origDstService && r.origDstService !== "any" && (
                            <span className="text-muted-foreground">:{fmt(r.origDstService, showFull)}</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-xs">
                          {r.translatedPool}
                          {r.servicePort && (
                            <span className="text-muted-foreground">:{fmt(r.servicePort, showFull)}</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-xs text-muted-foreground">
                          {r.description ?? "—"}
                          {r.disabled && <Badge tone="warn">已禁用</Badge>}
                        </td>
                        {showLineNo && (
                          <td className="px-3 py-1.5">
                            <LineLink line={r.lineNo} />
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function fmt(p: string | undefined, showFull: boolean): string {
  if (!p) return "";
  if (!showFull && p === "1-65535") return "any";
  return p;
}

function EndpointPicker({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const displayValue = value === "any" ? "any" : value;

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      <div className="flex gap-1.5">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="w-52 justify-between font-mono text-xs"
            >
              {displayValue}
              <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-52 p-0">
            <Command>
              <CommandInput placeholder="搜索对象…" className="h-9 text-xs" />
              <CommandList>
                <CommandEmpty className="py-4 text-xs">未找到匹配项</CommandEmpty>
                <CommandGroup>
                  {options.map((n) => (
                    <CommandItem
                      key={n}
                      value={n}
                      onSelect={(currentValue) => {
                        onChange(currentValue === value ? "any" : currentValue);
                        setOpen(false);
                      }}
                      className="text-xs"
                    >
                      <Check
                        className={cn(
                          "mr-2 h-3.5 w-3.5",
                          value === n ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {n}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <Input
          value={value === "any" ? "" : value}
          onChange={(e) => onChange(e.target.value || "any")}
          placeholder={placeholder}
          className="w-40 font-mono text-xs"
        />
      </div>
    </div>
  );
}

function ServicePicker({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  const [open, setOpen] = useState(false);
  const displayValue = value === "any" ? "any" : value;

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground">服务</label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-44 justify-between font-mono text-xs"
          >
            {displayValue}
            <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-44 p-0">
          <Command>
            <CommandInput placeholder="搜索服务…" className="h-9 text-xs" />
            <CommandList>
              <CommandEmpty className="py-4 text-xs">未找到匹配项</CommandEmpty>
              <CommandGroup>
                {options.map((n) => (
                  <CommandItem
                    key={n}
                    value={n}
                    onSelect={(currentValue) => {
                      onChange(currentValue === value ? "any" : currentValue);
                      setOpen(false);
                    }}
                    className="text-xs"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-3.5 w-3.5",
                        value === n ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {n}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function ExpandedHint({ label, hits }: { label: string; hits: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <L>{label}已展开为</L>
      {hits.map((h) => (
        <Badge key={h} tone="muted">
          {h}
        </Badge>
      ))}
    </div>
  );
}

type VerdictKind = "permit" | "deny" | "nat-only" | "none";
interface Verdict {
  kind: VerdictKind;
  message: string;
}

function computeVerdict(first: PolicyRule | undefined, nats: NatRule[]): Verdict {
  if (first) {
    if (first.action === "permit")
      return {
        kind: "permit",
        message: `允许 · 命中策略 #${first.id} (permit)${nats.length ? ` · 经过 ${nats.length} 条 NAT` : ""}`,
      };
    return {
      kind: "deny",
      message: `拒绝 · 命中策略 #${first.id} (${first.action})`,
    };
  }
  if (nats.length > 0)
    return {
      kind: "nat-only",
      message: `有 ${nats.length} 条 DNAT 转换，但未命中任何放行策略——实际可能不通`,
    };
  return { kind: "none", message: "无任何匹配的策略或 NAT" };
}

function VerdictBanner({
  verdict,
  firstHit,
  nats,
}: {
  verdict: Verdict;
  firstHit?: PolicyRule;
  nats: NatRule[];
}) {
  const map = {
    permit: {
      icon: <CheckCircle2 className="h-5 w-5" />,
      cls: "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    },
    deny: {
      icon: <XCircle className="h-5 w-5" />,
      cls: "border-destructive/50 bg-destructive/10 text-destructive",
    },
    "nat-only": {
      icon: <AlertTriangle className="h-5 w-5" />,
      cls: "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    },
    none: {
      icon: <Info className="h-5 w-5" />,
      cls: "border-border bg-secondary/40 text-muted-foreground",
    },
  } as const;
  const s = map[verdict.kind];
  const showFull = useShowFullPortRange()[0];
  return (
    <div className={`flex items-start gap-3 rounded-lg border p-3 ${s.cls}`}>
      <div className="mt-0.5">{s.icon}</div>
      <div className="flex-1 text-sm">
        <div className="font-medium">{verdict.message}</div>
        {firstHit && (
          <div className="mt-1 font-mono text-xs opacity-80">
            {firstHit.srcAddr} → {firstHit.dstAddr} · {firstHit.service} · {firstHit.schedule}
          </div>
        )}
        {verdict.kind === "nat-only" && nats[0] && (
          <div className="mt-1 font-mono text-xs opacity-80">
            最近一条 DNAT: {nats[0].origDstAddr}
            {nats[0].origDstService && nats[0].origDstService !== "any" && `:${fmt(nats[0].origDstService, showFull)}`}
            {" → "}
            {nats[0].translatedPool}
          </div>
        )}
      </div>
    </div>
  );
}

function DnatChain({ rule, showFull }: { rule: NatRule; showFull: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
      <Badge tone="muted">#{rule.id}</Badge>
      <span className="text-muted-foreground">[{rule.iface}]</span>
      <span>{rule.srcAddr}</span>
      <ArrowRight className="h-3 w-3 text-muted-foreground" />
      <span>{rule.origDstAddr}</span>
      {rule.origDstService && rule.origDstService !== "any" && (
        <span className="text-muted-foreground">:{fmt(rule.origDstService, showFull)}</span>
      )}
      <ArrowRight className="h-3 w-3 text-muted-foreground" />
      <span className="text-foreground">{rule.translatedPool}</span>
      {rule.servicePort && (
        <span className="text-muted-foreground">:{fmt(rule.servicePort, showFull)}</span>
      )}
      {rule.disabled && <Badge tone="warn">已禁用</Badge>}
      {rule.log && <Badge tone="muted">log</Badge>}
      <span className="ml-auto">
        <LineLink line={rule.lineNo} />
      </span>
    </div>
  );
}

function ChainView({
  src,
  dst,
  svc,
  cfg,
  policies,
  nats,
  verdict,
}: {
  src: string;
  dst: string;
  svc: string;
  cfg: ParsedConfig;
  policies: PolicyRule[];
  nats: NatRule[];
  verdict: Verdict;
}) {
  void cfg;
  const inter = new Set<string>();
  nats.forEach((n) => {
    const c = classifyIntermediary(n.translatedPool);
    if (c) inter.add(`${CAT_LABEL[c]}: ${n.translatedPool}`);
  });
  policies.forEach((p) => {
    const c = classifyIntermediary(p.dstAddr);
    if (c) inter.add(`${CAT_LABEL[c]}: ${p.dstAddr}`);
  });
  const svcLabel = svc === "any" ? "any" : summarizeService(svc, cfg);
  const arrowCls =
    verdict.kind === "permit"
      ? "text-emerald-500"
      : verdict.kind === "deny"
        ? "text-destructive"
        : verdict.kind === "nat-only"
          ? "text-amber-500"
          : "text-muted-foreground";

  return (
    <div className="flex flex-wrap items-center gap-3">
      <ChainNode label="源" name={src} tone="src" />
      <ArrowRight className={`h-5 w-5 ${arrowCls}`} />
      {[...inter].map((it) => (
        <span key={it} className="flex items-center gap-3">
          <ChainNode label="中间节点" name={it} tone="mid" />
          <ArrowRight className={`h-5 w-5 ${arrowCls}`} />
        </span>
      ))}
      <ChainNode label="目的" name={dst} tone="dst" sub={`服务 ${svcLabel}`} />
      <div className="ml-4 text-xs text-muted-foreground">
        {policies.length} 条策略 · {nats.length} 条 NAT
      </div>
    </div>
  );
}

function ChainNode({
  label,
  name,
  tone,
  sub,
}: {
  label: string;
  name: string;
  tone: "src" | "mid" | "dst";
  sub?: string;
}) {
  const cls =
    tone === "src"
      ? "border-emerald-500/50 bg-emerald-500/10"
      : tone === "dst"
        ? "border-blue-500/50 bg-blue-500/10"
        : "border-amber-500/50 bg-amber-500/10";
  return (
    <div className={`rounded-lg border px-3 py-2 ${cls}`}>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="font-mono text-sm">{name}</div>
      {sub && <div className="mt-0.5 text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
