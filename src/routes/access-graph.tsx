import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useConfigStore } from "@/lib/store";
import { EmptyConfig } from "@/components/EmptyConfig";
import { Badge, LineLink } from "@/components/DataTable";
import { useShowFullPortRange, useShowLineNumbers } from "@/lib/uiPrefs";
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
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Check,
  ChevronsUpDown,
  X,
} from "lucide-react";
import {
  buildFlows,
  facetFor,
  filterFlows,
  sortFlows,
  classifyIntermediary,
  CAT_LABEL,
  isIpLiteral,
  resolveEndpoint,
  type Flow,
  type FlowDnatEntry,
  type FlowPolicySegment,
  type FacetOption,
} from "@/lib/access";
import { cn } from "@/lib/utils";

interface SearchParams {
  src?: string;
  dst?: string;
  svc?: string;
  dnat?: string;
  bad?: string;
}

export const Route = createFileRoute("/access-graph")({
  head: () => ({
    meta: [
      { title: "访问路径分析 · 防火墙配置审计台" },
      {
        name: "description",
        content:
          "按 源→目的 流向聚合 DNAT 端口和策略服务，分析端口暴露、策略覆盖与孤儿入口。",
      },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    src: typeof s.src === "string" ? s.src : undefined,
    dst: typeof s.dst === "string" ? s.dst : undefined,
    svc: typeof s.svc === "string" ? s.svc : undefined,
    dnat: typeof s.dnat === "string" ? s.dnat : undefined,
    bad: typeof s.bad === "string" ? s.bad : undefined,
  }),
  component: AccessGraphPage,
});

function AccessGraphPage() {
  const { cfg } = useConfigStore();
  const search = useSearch({ from: "/access-graph" });
  const navigate = useNavigate({ from: "/access-graph" });

  const src = search.src ?? "";
  const dst = search.dst ?? "";
  const svc = search.svc ?? "";
  const onlyDnat = search.dnat === "1";
  const onlyAbnormal = search.bad === "1";

  const setParam = (key: keyof SearchParams, value: string | undefined) => {
    navigate({
      search: (prev: SearchParams) => ({
        ...prev,
        [key]: value && value.length > 0 ? value : undefined,
      }),
      replace: true,
    });
  };

  const allFlows = useMemo(() => (cfg ? buildFlows(cfg) : []), [cfg]);

  const filter = { src, dst, svc, onlyDnat, onlyAbnormal };

  const facetSrc = useMemo(
    () => (cfg ? facetFor(allFlows, cfg, "src", filter) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allFlows, cfg, dst, svc, onlyDnat, onlyAbnormal]
  );
  const facetDst = useMemo(
    () => (cfg ? facetFor(allFlows, cfg, "dst", filter) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allFlows, cfg, src, svc, onlyDnat, onlyAbnormal]
  );
  const facetSvc = useMemo(
    () => (cfg ? facetFor(allFlows, cfg, "svc", filter) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allFlows, cfg, src, dst, onlyDnat, onlyAbnormal]
  );

  const flows = useMemo(
    () => (cfg ? sortFlows(filterFlows(allFlows, cfg, filter)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allFlows, cfg, src, dst, svc, onlyDnat, onlyAbnormal]
  );

  if (!cfg) return <EmptyConfig />;

  const totalAbnormal = allFlows.filter(
    (f) => f.coverage.kind === "orphan" || f.coverage.kind === "partial"
  ).length;
  const totalDnat = allFlows.filter((f) => f.dnat.length > 0).length;

  const literalSrcHit =
    src && isIpLiteral(src) ? resolveEndpoint(src, cfg).literalHits : [];
  const literalDstHit =
    dst && isIpLiteral(dst) ? resolveEndpoint(dst, cfg).literalHits : [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">访问路径分析</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          每张卡片 = 一条 <code>源 → 目的</code> 流向，聚合该方向上的所有 DNAT 端口与策略服务。
          下拉选项已按已选条件联动收敛。
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <FacetPicker
            label="源"
            value={src}
            options={facetSrc}
            onChange={(v) => setParam("src", v)}
            placeholder="选择 / 搜索 / 输入 IP"
          />
          <FacetPicker
            label="目的"
            value={dst}
            options={facetDst}
            onChange={(v) => setParam("dst", v)}
            placeholder="选择 / 搜索 / 输入 IP"
          />
          <FacetPicker
            label="服务"
            value={svc}
            options={facetSvc}
            onChange={(v) => setParam("svc", v)}
            placeholder="选择 / 搜索 / 输入 tcp/443"
            width="w-44"
          />
          <div className="flex items-center gap-2">
            <ChipToggle
              active={onlyDnat}
              onClick={() => setParam("dnat", onlyDnat ? undefined : "1")}
            >
              只看 DNAT
              <span className="ml-1 text-muted-foreground">{totalDnat}</span>
            </ChipToggle>
            <ChipToggle
              active={onlyAbnormal}
              onClick={() => setParam("bad", onlyAbnormal ? undefined : "1")}
              tone="warn"
            >
              只看异常
              <span className="ml-1 text-muted-foreground">{totalAbnormal}</span>
            </ChipToggle>
          </div>
          <div className="ml-auto text-xs text-muted-foreground">
            {flows.length} / {allFlows.length} 条流向
          </div>
        </div>
        {(literalSrcHit.length > 0 || literalDstHit.length > 0) && (
          <div className="mt-3 space-y-1 text-xs text-muted-foreground">
            {literalSrcHit.length > 0 && (
              <LiteralHint label="源" hits={literalSrcHit} />
            )}
            {literalDstHit.length > 0 && (
              <LiteralHint label="目的" hits={literalDstHit} />
            )}
          </div>
        )}
      </div>

      {flows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          当前筛选下没有任何流向。试着清除部分条件。
        </div>
      ) : (
        <div className="space-y-3">
          {flows.map((f) => (
            <FlowCard key={f.key} flow={f} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- FacetPicker ----------

function FacetPicker({
  label,
  value,
  options,
  onChange,
  placeholder,
  width = "w-56",
}: {
  label: string;
  value: string;
  options: FacetOption[];
  onChange: (v: string) => void;
  placeholder: string;
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = options.filter((o) =>
    o.name.toLowerCase().includes(query.toLowerCase())
  );
  const showLiteral =
    query.length > 0 &&
    !options.some((o) => o.name === query) &&
    (isIpLiteral(query) || /^[a-z]+\/\d+/i.test(query));

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      <div className="flex items-center gap-1">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className={cn(width, "justify-between font-mono text-xs")}
            >
              <span className={value ? "" : "text-muted-foreground"}>
                {value || `(全部 ${options.length})`}
              </span>
              <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className={cn(width, "p-0")}>
            <Command shouldFilter={false}>
              <CommandInput
                value={query}
                onValueChange={setQuery}
                placeholder={placeholder}
                className="h-9 text-xs"
              />
              <CommandList>
                <CommandEmpty className="py-4 text-xs">
                  没有符合的选项
                </CommandEmpty>
                {showLiteral && (
                  <CommandGroup heading="字面值">
                    <CommandItem
                      value={query}
                      onSelect={() => {
                        onChange(query);
                        setOpen(false);
                        setQuery("");
                      }}
                      className="text-xs"
                    >
                      <Check className="mr-2 h-3.5 w-3.5 opacity-0" />
                      使用 <span className="ml-1 font-mono">{query}</span>
                    </CommandItem>
                  </CommandGroup>
                )}
                <CommandGroup heading={`选项 (${filtered.length})`}>
                  {filtered.map((o) => (
                    <CommandItem
                      key={o.name}
                      value={o.name}
                      onSelect={() => {
                        onChange(o.name === value ? "" : o.name);
                        setOpen(false);
                        setQuery("");
                      }}
                      className="text-xs"
                    >
                      <Check
                        className={cn(
                          "mr-2 h-3.5 w-3.5",
                          value === o.name ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <span className="flex-1 font-mono">{o.name}</span>
                      <span className="ml-2 text-[10px] text-muted-foreground">
                        {o.count}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {value && (
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => onChange("")}
            title="清除"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

function ChipToggle({
  active,
  onClick,
  children,
  tone = "default",
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: "default" | "warn";
}) {
  const base =
    "h-7 rounded-full border px-2.5 text-xs font-medium transition";
  const cls = active
    ? tone === "warn"
      ? "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300"
      : "border-primary/50 bg-primary/10 text-primary"
    : "border-border bg-card text-muted-foreground hover:bg-secondary/60";
  return (
    <button type="button" onClick={onClick} className={cn(base, cls)}>
      {children}
    </button>
  );
}

function LiteralHint({ label, hits }: { label: string; hits: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-muted-foreground">{label} IP 命中对象:</span>
      {hits.length === 0 ? (
        <span className="text-amber-600 dark:text-amber-400">无</span>
      ) : (
        hits.map((h) => (
          <Badge key={h} tone="muted">
            {h}
          </Badge>
        ))
      )}
    </div>
  );
}

// ---------- FlowCard ----------

function FlowCard({ flow }: { flow: Flow }) {
  const [showFull] = useShowFullPortRange();
  const [showLineNo] = useShowLineNumbers();
  const cat = classifyIntermediary(flow.dst);
  const hasDnat = flow.dnat.length > 0;

  // group consecutive policies by (action, id) — by sorted id already
  const permitSegs = flow.policies.filter((s) => s.policy.action === "permit");
  const denySegs = flow.policies.filter((s) => s.policy.action === "deny");
  const otherSegs = flow.policies.filter(
    (s) => s.policy.action !== "permit" && s.policy.action !== "deny"
  );

  // determine which permit is "first match" per port (mocked: first sorted permit not preceded by deny on same port)
  const firstHitPolicyId = (() => {
    for (const seg of flow.policies) {
      if (seg.policy.action === "permit" || seg.policy.action === "deny") {
        return seg.policy.id;
      }
    }
    return undefined;
  })();

  return (
    <article className="rounded-lg border border-border bg-card">
      {/* header */}
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <NodeChip name={flow.src} role="src" />
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <ArrowRight className="h-4 w-4" />
          {hasDnat ? (
            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-700 dark:text-amber-300">
              DNAT
            </span>
          ) : (
            <span>直连</span>
          )}
          <ArrowRight className="h-4 w-4" />
        </div>
        <NodeChip name={flow.dst} role="dst" cat={cat ?? undefined} />
        <div className="ml-auto">
          <CoverageBadge flow={flow} />
        </div>
      </header>

      {/* DNAT entries */}
      {hasDnat && (
        <section className="border-b border-border px-4 py-3">
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">
            入口端口聚合（{flow.dnat.length} 条 DNAT）
          </div>
          <div className="space-y-1 font-mono text-xs">
            {flow.dnat.map((d) => (
              <DnatRow key={d.rule.id} entry={d} showFull={showFull} showLineNo={showLineNo} dst={flow.dst} />
            ))}
          </div>
          {flow.coverage.kind === "partial" && flow.coverage.gap.length > 0 && (
            <div className="mt-2 text-xs text-amber-700 dark:text-amber-400">
              ⚠ 未被任何 permit 策略覆盖的暴露端口：
              {flow.coverage.gap.map((g) => (
                <code key={g} className="ml-1.5">
                  {g}
                </code>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Policies */}
      <section className="px-4 py-3">
        {flow.policies.length === 0 ? (
          <div className="text-xs text-muted-foreground">
            {hasDnat ? (
              <span className="text-amber-700 dark:text-amber-400">
                ⚠ 孤儿入口：有 DNAT 转换，但没有任何策略匹配该 源→目的——端口可能开了但不通
              </span>
            ) : (
              "未配置任何放行/拒绝策略"
            )}
          </div>
        ) : (
          <>
            <div className="mb-1.5 text-xs font-medium text-muted-foreground">
              放行策略（按服务聚合，按 ID 排序）
            </div>
            <div className="space-y-1">
              {[...permitSegs, ...denySegs, ...otherSegs].map((seg) => (
                <PolicyRow
                  key={seg.policy.id + "@" + seg.policy.lineNo}
                  seg={seg}
                  isFirst={seg.policy.id === firstHitPolicyId}
                  showLineNo={showLineNo}
                />
              ))}
            </div>
          </>
        )}
      </section>
    </article>
  );
}

function NodeChip({
  name,
  role,
  cat,
}: {
  name: string;
  role: "src" | "dst";
  cat?: ReturnType<typeof classifyIntermediary>;
}) {
  const cls =
    role === "src"
      ? "border-emerald-500/40 bg-emerald-500/10"
      : "border-blue-500/40 bg-blue-500/10";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-sm",
        cls
      )}
    >
      <span>{name}</span>
      {cat && (
        <span className="rounded bg-background/60 px-1 text-[10px] uppercase text-muted-foreground">
          {CAT_LABEL[cat]}
        </span>
      )}
    </span>
  );
}

function CoverageBadge({ flow }: { flow: Flow }) {
  const k = flow.coverage.kind;
  if (k === "ok")
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5" />
        全端口已放行
      </span>
    );
  if (k === "partial")
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400">
        <AlertTriangle className="h-3.5 w-3.5" />
        部分端口缺策略
      </span>
    );
  if (k === "orphan")
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
        <XCircle className="h-3.5 w-3.5" />
        孤儿 DNAT
      </span>
    );
  // no-nat
  if (flow.permitPorts.size > 0)
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/40 px-2 py-0.5 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5" />
        无 NAT · 直连放行
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/40 px-2 py-0.5 text-xs text-muted-foreground">
      <Info className="h-3.5 w-3.5" />
      仅拒绝
    </span>
  );
}

function fmtPort(p: string, showFull: boolean): string {
  if (!p) return "";
  if (!showFull && p === "1-65535") return "any";
  return p;
}

function DnatRow({
  entry,
  dst,
  showFull,
  showLineNo,
}: {
  entry: FlowDnatEntry;
  dst: string;
  showFull: boolean;
  showLineNo: boolean;
}) {
  const portChanged =
    entry.entryPort &&
    entry.backendPort &&
    entry.entryPort !== entry.backendPort;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge tone="muted">#{entry.rule.id}</Badge>
      <span>{entry.entryAddr}</span>
      {entry.entryPort && (
        <span className="text-muted-foreground">
          :{fmtPort(entry.entryPort, showFull)}
        </span>
      )}
      <ArrowRight className="h-3 w-3 text-muted-foreground" />
      <span className="text-foreground">{dst}</span>
      {entry.backendPort && (
        <span
          className={cn(
            portChanged
              ? "text-amber-700 dark:text-amber-400"
              : "text-muted-foreground"
          )}
        >
          :{fmtPort(entry.backendPort, showFull)}
        </span>
      )}
      {entry.rule.iface && (
        <span className="text-[10px] text-muted-foreground">
          [{entry.rule.iface}]
        </span>
      )}
      {entry.rule.disabled && <Badge tone="warn">已禁用</Badge>}
      {entry.rule.log && <Badge tone="muted">log</Badge>}
      {showLineNo && (
        <span className="ml-auto">
          <LineLink line={entry.rule.lineNo} />
        </span>
      )}
    </div>
  );
}

function PolicyRow({
  seg,
  isFirst,
  showLineNo,
}: {
  seg: FlowPolicySegment;
  isFirst: boolean;
  showLineNo: boolean;
}) {
  const action = seg.policy.action;
  const tone =
    action === "permit"
      ? "bg-emerald-500/5 border-emerald-500/30"
      : action === "deny"
        ? "bg-destructive/5 border-destructive/30"
        : "bg-secondary/40 border-border";
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded border px-2 py-1 font-mono text-xs",
        tone
      )}
    >
      <span className="text-[10px] text-muted-foreground">
        {isFirst ? "▶ 首条" : ""}
      </span>
      <Badge tone={action === "permit" ? "ok" : action === "deny" ? "danger" : "muted"}>
        {action}
      </Badge>
      <span className="text-muted-foreground">#{seg.policy.id}</span>
      <span className="text-[10px] text-muted-foreground">
        {seg.policy.srcZone}→{seg.policy.dstZone}
      </span>
      <div className="flex flex-wrap items-center gap-1">
        {seg.ports.map((p) => (
          <span
            key={p}
            className="rounded bg-background/60 px-1.5 py-0.5 text-[11px]"
          >
            {p}
          </span>
        ))}
      </div>
      {seg.policy.schedule && seg.policy.schedule !== "any" && (
        <span className="text-[10px] text-muted-foreground">
          期限 {seg.policy.schedule}
        </span>
      )}
      {showLineNo && (
        <span className="ml-auto">
          <LineLink line={seg.policy.lineNo} />
        </span>
      )}
    </div>
  );
}
