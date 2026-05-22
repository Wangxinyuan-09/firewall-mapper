import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useConfigStore } from "@/lib/store";
import { EmptyConfig } from "@/components/EmptyConfig";
import { Badge, LineLink } from "@/components/DataTable";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Shield,
  Router,
  Lock,
  ArrowLeftRight,
  Scale,
  ArrowRight,
  ChevronDown,
  Search,
  X,
  ExternalLink,
  Layers,
} from "lucide-react";
import {
  getNodeAggregates,
  CAT_LABEL,
  type IntermediaryCat,
  type NodeAggregate,
} from "@/lib/access";
import { useShowFullPortRange } from "@/lib/uiPrefs";

export const Route = createFileRoute("/intermediaries")({
  head: () => ({
    meta: [
      { title: "中间节点 · 防火墙配置审计台" },
      {
        name: "description",
        content:
          "按命名识别 WAF / 网关 / 代理 / 堡垒机 / 负载均衡，并展示每个节点的上下游引用。",
      },
    ],
  }),
  component: IntermediariesPage,
});

const CAT_ICON: Record<IntermediaryCat, React.ComponentType<{ className?: string }>> = {
  waf: Shield,
  gateway: Router,
  bastion: Lock,
  proxy: ArrowLeftRight,
  lb: Scale,
};

const CAT_BORDER_L: Record<IntermediaryCat, string> = {
  waf: "border-l-rose-500",
  gateway: "border-l-blue-500",
  bastion: "border-l-purple-500",
  proxy: "border-l-amber-500",
  lb: "border-l-emerald-500",
};

const CAT_DOT: Record<IntermediaryCat, string> = {
  waf: "bg-rose-500",
  gateway: "bg-blue-500",
  bastion: "bg-purple-500",
  proxy: "bg-amber-500",
  lb: "bg-emerald-500",
};

const CAT_RING: Record<IntermediaryCat, string> = {
  waf: "ring-rose-500/40",
  gateway: "ring-blue-500/40",
  bastion: "ring-purple-500/40",
  proxy: "ring-amber-500/40",
  lb: "ring-emerald-500/40",
};

const CAT_ACTIVE_BORDER: Record<IntermediaryCat, string> = {
  waf: "border-rose-500/50",
  gateway: "border-blue-500/50",
  bastion: "border-purple-500/50",
  proxy: "border-amber-500/50",
  lb: "border-emerald-500/50",
};

const CAT_ACTIVE_BG: Record<IntermediaryCat, string> = {
  waf: "bg-rose-500/10",
  gateway: "bg-blue-500/10",
  bastion: "bg-purple-500/10",
  proxy: "bg-amber-500/10",
  lb: "bg-emerald-500/10",
};

const CAT_ICON_TEXT: Record<IntermediaryCat, string> = {
  waf: "text-rose-600 dark:text-rose-400",
  gateway: "text-blue-600 dark:text-blue-400",
  bastion: "text-purple-600 dark:text-purple-400",
  proxy: "text-amber-600 dark:text-amber-400",
  lb: "text-emerald-600 dark:text-emerald-400",
};

const CAT_ICON_BG: Record<IntermediaryCat, string> = {
  waf: "bg-rose-500/10",
  gateway: "bg-blue-500/10",
  bastion: "bg-purple-500/10",
  proxy: "bg-amber-500/10",
  lb: "bg-emerald-500/10",
};

const CAT_LABEL_COLOR: Record<IntermediaryCat, string> = {
  waf: "text-rose-600 dark:text-rose-400",
  gateway: "text-blue-600 dark:text-blue-400",
  bastion: "text-purple-600 dark:text-purple-400",
  proxy: "text-amber-600 dark:text-amber-400",
  lb: "text-emerald-600 dark:text-emerald-400",
};

const CAT_ORDER: IntermediaryCat[] = ["waf", "gateway", "bastion", "proxy", "lb"];

function IntermediariesPage() {
  const { cfg } = useConfigStore();
  const [q, setQ] = useState("");
  const [activeCat, setActiveCat] = useState<IntermediaryCat | null>(null);

  const nodes = useMemo(() => (cfg ? getNodeAggregates(cfg) : []), [cfg]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return nodes.filter((n) => {
      if (activeCat && n.cat !== activeCat) return false;
      if (!needle) return true;
      return (
        n.name.toLowerCase().includes(needle) ||
        (n.address ?? "").toLowerCase().includes(needle)
      );
    });
  }, [nodes, q, activeCat]);

  const catCounts = useMemo(() => {
    const m = new Map<IntermediaryCat, number>();
    nodes.forEach((n) => m.set(n.cat, (m.get(n.cat) ?? 0) + 1));
    return m;
  }, [nodes]);

  if (!cfg) return <EmptyConfig />;

  const grouped = CAT_ORDER.map((c) => ({
    cat: c,
    items: filtered.filter((n) => n.cat === c),
  })).filter((g) => g.items.length > 0);

  const totalRefs = nodes.reduce(
    (s, n) => s + n.inboundDnat.length + n.inboundPolicies.length + n.outboundPolicies.length,
    0,
  );

  return (
    <div className="space-y-6">
      {/* ---- page header ---- */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">中间节点</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            按命名识别 WAF、网关、堡垒机、代理、负载均衡等中间件，聚合展示每个节点的上下游策略与 NAT 引用。
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5" />
            {nodes.length} 个节点
          </span>
          <span className="opacity-40">|</span>
          <span>{totalRefs} 条关联规则</span>
        </div>
      </div>

      {/* ---- category stats ribbon ---- */}
      <div className="grid grid-cols-5 gap-2">
        {CAT_ORDER.map((c) => {
          const Icon = CAT_ICON[c];
          const count = catCounts.get(c) ?? 0;
          const active = activeCat === c;
          return (
            <button
              key={c}
              onClick={() => setActiveCat(active ? null : c)}
              className={cn(
                "relative flex flex-col items-center gap-1 rounded-xl border px-3 py-3 text-center transition-all",
                active
                  ? cn(CAT_ACTIVE_BORDER[c], CAT_ACTIVE_BG[c], "shadow-sm")
                  : "border-border/60 bg-card hover:border-border hover:bg-secondary/30",
              )}
            >
              <Icon
                className={cn(
                  "h-5 w-5",
                  active ? CAT_ICON_TEXT[c].split(" ")[0] : "text-muted-foreground/60",
                )}
              />
              <span
                className={cn(
                  "text-[11px] font-medium",
                  active && CAT_LABEL_COLOR[c],
                )}
              >
                {CAT_LABEL[c]}
              </span>
              <span
                className={cn(
                  "text-lg font-bold tabular-nums tracking-tight",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ---- search bar ---- */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative flex-1" style={{ minWidth: 200, maxWidth: 360 }}>
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索名称或 IP…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
          />
          {q && (
            <button
              onClick={() => setQ("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {activeCat && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1 px-2.5 text-xs"
            onClick={() => setActiveCat(null)}
          >
            清除筛选
            <X className="h-3 w-3" />
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} 个匹配
        </span>
      </div>

      {/* ---- node list ---- */}
      {grouped.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card py-16">
          <Layers className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">没有匹配的中间节点</p>
          <p className="max-w-sm text-center text-xs text-muted-foreground/60">
            节点通过命名启发式自动识别：含 waf / 堡垒 / 网关 / 代理 / 负载 等关键词的对象会被归类。
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map((g) => (
            <section key={g.cat}>
              <div className="mb-3 flex items-center gap-2.5">
                <span className={cn("h-2.5 w-2.5 rounded-full", CAT_DOT[g.cat])} />
                <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                  {CAT_LABEL[g.cat]}
                </h2>
                <span className="rounded bg-secondary px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
                  {g.items.length}
                </span>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {g.items.map((n) => (
                  <NodeCard key={`${n.cat}:${n.name}`} node={n} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* ---- footer note ---- */}
      <p className="rounded-lg border border-border/50 bg-secondary/20 px-4 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
        识别规则：对象名称含 <code className="rounded bg-secondary px-1 text-[11px]">waf</code> → WAF；含
        <code className="rounded bg-secondary px-1 text-[11px]">堡垒 / bastion</code> → 堡垒机；含
        <code className="rounded bg-secondary px-1 text-[11px]">网关 / gateway / api-</code> → 网关；含
        <code className="rounded bg-secondary px-1 text-[11px]">代理 / proxy</code> → 代理；含
        <code className="rounded bg-secondary px-1 text-[11px]">负载 / lb / slb</code> → 负载均衡。
        策略关联通过 srcAddr / dstAddr 及 NAT translatedPool 的名称匹配完成。
      </p>
    </div>
  );
}

// ---------- NodeCard ----------

function NodeCard({ node }: { node: NodeAggregate }) {
  const [open, setOpen] = useState(false);
  const [showFull] = useShowFullPortRange();
  const Icon = CAT_ICON[node.cat];

  const ports = useMemo(() => {
    const set = new Set<string>();
    node.exposedPorts.forEach((p) => {
      set.add(!showFull && p === "1-65535" ? "any" : p);
    });
    return [...set];
  }, [node.exposedPorts, showFull]);

  const hasDetails =
    node.inboundDnat.length > 0 ||
    node.inboundPolicies.length > 0 ||
    node.outboundPolicies.length > 0;

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn(
        "group rounded-xl border border-border bg-card transition-shadow hover:shadow-sm",
        "border-l-[3px]",
        CAT_BORDER_L[node.cat],
        open && "shadow-md",
      )}
    >
      <CollapsibleTrigger asChild>
        <button className="flex w-full items-start gap-3 p-4 text-left">
          {/* left: icon */}
          <div
            className={cn(
              "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset",
              CAT_ICON_TEXT[node.cat],
              CAT_ICON_BG[node.cat],
              CAT_RING[node.cat],
            )}
          >
            <Icon className="h-4.5 w-4.5" />
          </div>

          {/* center: info */}
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="truncate text-sm font-semibold">{node.name}</span>
              <Badge tone="muted" className="text-[10px]">
                {CAT_LABEL[node.cat]}
              </Badge>
            </div>

            {node.address && (
              <p className="truncate font-mono text-xs text-muted-foreground/80">
                {node.address}
              </p>
            )}

            {/* stats inline */}
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 pt-0.5 text-[11px]">
              {node.inboundDnat.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded bg-foreground/8 px-1.5 py-0.5 font-medium">
                  <ArrowRight className="h-3 w-3" />
                  DNAT {node.inboundDnat.length}
                </span>
              )}
              {node.inboundPolicies.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded bg-foreground/8 px-1.5 py-0.5 font-medium">
                  被访问 {node.inboundPolicies.length}
                </span>
              )}
              {node.outboundPolicies.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded bg-foreground/8 px-1.5 py-0.5 font-medium">
                  对外 {node.outboundPolicies.length}
                </span>
              )}
              {ports.map((p) => (
                <span
                  key={p}
                  className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-primary"
                >
                  :{p}
                </span>
              ))}
            </div>
          </div>

          {/* right: actions */}
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <LineLink line={node.lineNo} />
            {hasDetails && (
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-muted-foreground/50 transition-transform",
                  open && "rotate-180",
                )}
              />
            )}
          </div>
        </button>
      </CollapsibleTrigger>

      {hasDetails && (
        <CollapsibleContent className="border-t border-border/30 bg-background/40 px-4 pb-4 pt-3">
          <NodeDetail node={node} />
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}

// ---------- NodeDetail ----------

function NodeDetail({ node }: { node: NodeAggregate }) {
  const [showFull] = useShowFullPortRange();
  const fmtPort = (p?: string) =>
    !p ? "" : !showFull && p === "1-65535" ? "any" : p;

  return (
    <div className="space-y-3 text-xs">
      {/* inbound DNAT */}
      {node.inboundDnat.length > 0 && (
        <section>
          <h4 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <ArrowRight className="h-3 w-3" />
            入站 DNAT ({node.inboundDnat.length})
          </h4>
          <ul className="space-y-1">
            {node.inboundDnat.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-1.5 rounded-md bg-secondary/50 px-2.5 py-1.5 font-mono"
              >
                <Badge tone="muted">#{r.id}</Badge>
                <span>{r.origDstAddr}</span>
                {r.origDstService && r.origDstService !== "any" && (
                  <span className="text-muted-foreground">
                    :{fmtPort(r.origDstService)}
                  </span>
                )}
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <span className="font-medium">{r.translatedPool}</span>
                {r.servicePort && (
                  <span className="text-muted-foreground">
                    :{fmtPort(r.servicePort)}
                  </span>
                )}
                <span className="ml-auto">
                  <LineLink line={r.lineNo} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* inbound policies */}
      {node.inboundPolicies.length > 0 && (
        <section>
          <h4 className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <ArrowRight className="h-3 w-3 rotate-90" />
              谁可以访问 ({node.inboundPolicies.length})
            </span>
            <Link
              to="/access-graph"
              search={{ dst: node.name }}
              className="inline-flex items-center gap-1 font-normal normal-case text-primary hover:underline"
            >
              访问图 <ExternalLink className="h-3 w-3" />
            </Link>
          </h4>
          <PolicyMiniList
            rows={node.inboundPolicies}
            sideLabel="src"
          />
        </section>
      )}

      {/* outbound policies */}
      {node.outboundPolicies.length > 0 && (
        <section>
          <h4 className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <ArrowRight className="h-3 w-3 -rotate-90" />
              对外访问 ({node.outboundPolicies.length})
            </span>
            <Link
              to="/access-graph"
              search={{ src: node.name }}
              className="inline-flex items-center gap-1 font-normal normal-case text-primary hover:underline"
            >
              访问图 <ExternalLink className="h-3 w-3" />
            </Link>
          </h4>
          <PolicyMiniList
            rows={node.outboundPolicies}
            sideLabel="dst"
          />
        </section>
      )}
    </div>
  );
}

// ---------- PolicyMiniList ----------

function PolicyMiniList({
  rows,
  sideLabel,
}: {
  rows: import("@/lib/parser/types").PolicyRule[];
  sideLabel: "src" | "dst";
}) {
  const max = 6;
  const shown = rows.slice(0, max);
  return (
    <ul className="divide-y divide-border/30 rounded-md border border-border/40">
      {shown.map((p) => (
        <li
          key={`${p.id}@${p.lineNo}`}
          className="flex flex-wrap items-center gap-1.5 px-2.5 py-1.5 font-mono"
        >
          <Badge tone={p.action === "permit" ? "ok" : "danger"} className="text-[10px]">
            #{p.id} {p.action === "permit" ? "放行" : "拒绝"}
          </Badge>
          <span className="text-muted-foreground">
            {sideLabel === "src" ? p.srcAddr : p.dstAddr}
          </span>
          <ArrowRight className="h-3 w-3 text-muted-foreground/60" />
          <span>
            {sideLabel === "src" ? p.dstAddr : p.srcAddr}
          </span>
          <span className="text-muted-foreground/60">· {p.service}</span>
          <span className="ml-auto">
            <LineLink line={p.lineNo} />
          </span>
        </li>
      ))}
      {rows.length > max && (
        <li className="px-2.5 py-1.5 text-center text-muted-foreground">
          + {rows.length - max} 条规则
        </li>
      )}
    </ul>
  );
}
