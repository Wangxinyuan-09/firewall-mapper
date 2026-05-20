import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useConfigStore } from "@/lib/store";
import { EmptyConfig } from "@/components/EmptyConfig";
import { Badge, LineLink } from "@/components/DataTable";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ArrowRight } from "lucide-react";
import { L } from "@/components/previewAtoms";
import {
  buildNodeAggregates,
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

const CAT_TONE: Record<IntermediaryCat, string> = {
  waf: "border-rose-500/50 bg-rose-500/10",
  gateway: "border-blue-500/50 bg-blue-500/10",
  proxy: "border-amber-500/50 bg-amber-500/10",
  bastion: "border-purple-500/50 bg-purple-500/10",
  lb: "border-emerald-500/50 bg-emerald-500/10",
};

const CAT_ORDER: IntermediaryCat[] = [
  "waf",
  "gateway",
  "bastion",
  "proxy",
  "lb",
];

function IntermediariesPage() {
  const { cfg } = useConfigStore();
  const [q, setQ] = useState("");
  const [activeCats, setActiveCats] = useState<Set<IntermediaryCat>>(new Set());

  const nodes = useMemo(
    () => (cfg ? buildNodeAggregates(cfg) : []),
    [cfg]
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return nodes.filter((n) => {
      if (activeCats.size && !activeCats.has(n.cat)) return false;
      if (!needle) return true;
      return (
        n.name.toLowerCase().includes(needle) ||
        (n.address ?? "").toLowerCase().includes(needle)
      );
    });
  }, [nodes, q, activeCats]);

  if (!cfg) return <EmptyConfig />;

  const grouped = CAT_ORDER.map((c) => ({
    cat: c,
    items: filtered.filter((n) => n.cat === c),
  })).filter((g) => g.items.length > 0);

  const toggleCat = (c: IntermediaryCat) => {
    setActiveCats((prev) => {
      const next = new Set(prev);
      next.has(c) ? next.delete(c) : next.add(c);
      return next;
    });
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">中间节点拓扑</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          按命名启发式识别后，聚合每个节点的入站 DNAT、对外策略、被引用策略与暴露端口。
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
        <Input
          placeholder="按名称/IP 搜索"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          {CAT_ORDER.map((c) => {
            const count = nodes.filter((n) => n.cat === c).length;
            if (!count) return null;
            const active = activeCats.has(c);
            return (
              <button
                key={c}
                onClick={() => toggleCat(c)}
                className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                  active
                    ? "border-primary bg-primary/15 text-foreground"
                    : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground"
                }`}
              >
                {CAT_LABEL[c]} · {count}
              </button>
            );
          })}
          {activeCats.size > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={() => setActiveCats(new Set())}
            >
              清空
            </Button>
          )}
        </div>
        <div className="ml-auto text-xs text-muted-foreground">
          共 {filtered.length} / {nodes.length} 个节点
        </div>
      </div>

      {grouped.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          没有匹配的中间节点。识别规则见页面下方说明。
        </div>
      ) : (
        grouped.map((g) => (
          <section key={g.cat}>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${CAT_TONE[g.cat].split(" ")[1]}`}
              />
              {CAT_LABEL[g.cat]}
              <span className="text-xs font-normal text-muted-foreground/70">
                · {g.items.length}
              </span>
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              {g.items.map((n) => (
                <NodeCard key={`${n.cat}:${n.name}`} node={n} />
              ))}
            </div>
          </section>
        ))
      )}

      <p className="rounded-md border border-border/60 bg-secondary/30 p-3 text-xs text-muted-foreground">
        识别规则：含 <code>waf</code> → WAF；含「堡垒/bastion」→ 堡垒机；含「数据库网关/api网关/api-/gateway」→
        网关；含「代理/proxy」→ 代理；含「负载/lb/slb」→ 负载均衡。
        上下游统计基于策略 <code>srcAddr/dstAddr</code> 与 NAT <code>translatedPool</code> 的名称匹配。
      </p>
    </div>
  );
}

function NodeCard({ node }: { node: NodeAggregate }) {
  const [open, setOpen] = useState(false);
  const [showFull] = useShowFullPortRange();
  const tone = CAT_TONE[node.cat];

  const ports = useMemo(() => {
    const set = new Set<string>();
    node.exposedPorts.forEach((p) => {
      if (!showFull && p === "1-65535") set.add("any");
      else set.add(p);
    });
    return [...set];
  }, [node.exposedPorts, showFull]);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={`rounded-lg border ${tone}`}
    >
      <CollapsibleTrigger asChild>
        <button className="flex w-full items-start gap-3 p-3 text-left">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="truncate font-medium">{node.name}</span>
              <Badge tone="muted">{CAT_LABEL[node.cat]}</Badge>
              {node.address && (
                <span className="font-mono text-xs text-muted-foreground">
                  {node.address}
                </span>
              )}
              <span className="ml-auto">
                <LineLink line={node.lineNo} />
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <Stat label="入站DNAT" value={node.inboundDnat.length} />
              <Stat label="被访问" value={node.inboundPolicies.length} />
              <Stat label="对外访问" value={node.outboundPolicies.length} />
              {ports.length > 0 && (
                <span className="flex items-center gap-1">
                  <L>暴露</L>
                  <span className="font-mono text-foreground/90">
                    {ports.join(", ")}
                  </span>
                </span>
              )}
            </div>
          </div>
          <ChevronDown
            className={`mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t border-border/50 bg-background/50 px-3 pb-3 pt-2">
        <NodeDetail node={node} />
      </CollapsibleContent>
    </Collapsible>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span className="flex items-center gap-1">
      <L>{label}</L>
      <span
        className={`font-mono ${value > 0 ? "text-foreground" : "text-muted-foreground/60"}`}
      >
        {value}
      </span>
    </span>
  );
}

function NodeDetail({ node }: { node: NodeAggregate }) {
  const [showFull] = useShowFullPortRange();
  const fmtPort = (p?: string) =>
    !p ? "" : !showFull && p === "1-65535" ? "any" : p;

  return (
    <div className="space-y-3 pt-1 text-xs">
      {node.inboundDnat.length > 0 && (
        <section>
          <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            入站 DNAT（{node.inboundDnat.length}）
          </h4>
          <ul className="space-y-1">
            {node.inboundDnat.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-1.5 rounded bg-secondary/40 px-2 py-1 font-mono"
              >
                <Badge tone="muted">#{r.id}</Badge>
                <span>{r.origDstAddr}</span>
                {r.origDstService && r.origDstService !== "any" && (
                  <span className="text-muted-foreground">
                    :{fmtPort(r.origDstService)}
                  </span>
                )}
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <span className="text-foreground">{r.translatedPool}</span>
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

      {node.inboundPolicies.length > 0 && (
        <section>
          <h4 className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            谁可以访问该节点（{node.inboundPolicies.length}）
            <Link
              to="/access-graph"
              search={{ dst: node.name }}
              className="ml-auto text-[11px] font-normal normal-case text-primary hover:underline"
            >
              在访问关系中查看 →
            </Link>
          </h4>
          <PolicyMiniList rows={node.inboundPolicies} sideLabel="src" />
        </section>
      )}

      {node.outboundPolicies.length > 0 && (
        <section>
          <h4 className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            该节点对外访问（{node.outboundPolicies.length}）
            <Link
              to="/access-graph"
              search={{ src: node.name }}
              className="ml-auto text-[11px] font-normal normal-case text-primary hover:underline"
            >
              在访问关系中查看 →
            </Link>
          </h4>
          <PolicyMiniList rows={node.outboundPolicies} sideLabel="dst" />
        </section>
      )}

      {node.inboundDnat.length === 0 &&
        node.inboundPolicies.length === 0 &&
        node.outboundPolicies.length === 0 && (
          <p className="text-muted-foreground">
            未发现任何引用——可能为孤立对象。
          </p>
        )}
    </div>
  );
}

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
    <ul className="divide-y divide-border/40 rounded border border-border/50">
      {shown.map((p) => (
        <li
          key={p.id}
          className="flex flex-wrap items-center gap-1.5 px-2 py-1 font-mono"
        >
          <Badge tone={p.action === "permit" ? "ok" : "danger"}>
            #{p.id} {p.action}
          </Badge>
          <span className="text-muted-foreground">{sideLabel === "src" ? p.srcAddr : p.dstAddr}</span>
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <span>{sideLabel === "src" ? p.dstAddr : p.srcAddr}</span>
          <span className="text-muted-foreground">· {p.service}</span>
          <span className="ml-auto">
            <LineLink line={p.lineNo} />
          </span>
        </li>
      ))}
      {rows.length > max && (
        <li className="px-2 py-1 text-muted-foreground">
          还有 {rows.length - max} 条…
        </li>
      )}
    </ul>
  );
}
