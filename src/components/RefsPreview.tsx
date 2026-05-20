import { Link } from "@tanstack/react-router";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Badge } from "@/components/DataTable";
import { useConfigStore } from "@/lib/store";
import type { RefUsage } from "@/lib/parser";

const byLabel: Record<RefUsage["by"], string> = {
  policy: "策略",
  nat: "NAT",
  "address-group": "地址组",
  "service-group": "服务组",
};

function useEnrich() {
  const { cfg } = useConfigStore();
  return (r: RefUsage) => {
    if (!cfg) return { title: r.detail, sub: "" };
    if (r.by === "policy") {
      const p = cfg.policies.find((x) => x.id === r.id);
      if (p)
        return {
          action: p.action,
          sub: `${p.srcZone}→${p.dstZone}  ${p.srcAddr} → ${p.dstAddr} : ${p.service}`,
        };
    }
    if (r.by === "nat") {
      const n = cfg.natRules.find((x) => x.id === r.id);
      if (n)
        return {
          action: n.kind,
          sub:
            n.kind === "destination"
              ? `${n.srcAddr} → ${n.origDstAddr}:${n.origDstService} ⇒ ${n.translatedPool}`
              : `${n.srcAddr} → ${n.origDstAddr} ⇒ ${n.translatedPool}`,
          desc: n.description,
        };
    }
    if (r.by === "address-group") {
      const g = cfg.addressGroups.find((x) => x.name === r.id);
      if (g)
        return {
          sub: `${g.name}（${g.members.length} 成员）`,
          desc: g.description,
        };
    }
    if (r.by === "service-group") {
      const g = cfg.serviceGroups.find((x) => x.name === r.id);
      if (g)
        return {
          sub: `${g.name}（${g.members.length} 成员）`,
          desc: g.description,
        };
    }
    return { sub: r.detail };
  };
}

export function RefsPreview({
  name,
  kind,
}: {
  name: string;
  kind: "address" | "service";
}) {
  const { xr } = useConfigStore();
  const enrich = useEnrich();
  if (!xr) return null;
  const refs =
    kind === "service"
      ? xr.serviceUsedBy.get(name) ?? []
      : xr.addressUsedBy.get(name) ?? [];

  if (refs.length === 0) return <Badge tone="warn">未引用</Badge>;

  const counts = refs.reduce<Record<string, number>>((acc, r) => {
    acc[r.by] = (acc[r.by] ?? 0) + 1;
    return acc;
  }, {});
  const summary = Object.entries(counts)
    .map(([k, v]) => `${byLabel[k as RefUsage["by"]]} ${v}`)
    .join(" · ");
  const shown = refs.slice(0, 50);

  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        <span className="text-xs cursor-help underline decoration-dotted underline-offset-2 text-primary">
          {refs.length} 处（{summary}）
        </span>
      </HoverCardTrigger>
      <HoverCardContent className="w-[32rem] max-h-[28rem] overflow-auto" align="start">
        <div className="space-y-2">
          <div className="text-sm font-semibold">
            {name} · 被引用 {refs.length} 处
          </div>
          <div className="text-xs text-muted-foreground">{summary}</div>
          <ul className="space-y-1.5">
            {shown.map((r, i) => {
              const e = enrich(r);
              return (
                <li key={i} className="text-xs border-l-2 border-border pl-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      to="/raw"
                      search={{ line: r.lineNo }}
                      className="text-primary hover:underline font-mono shrink-0"
                    >
                      L{r.lineNo}
                    </Link>
                    <Badge tone="muted">{byLabel[r.by]}</Badge>
                    {e.action && (
                      <Badge
                        tone={
                          e.action === "permit"
                            ? "ok"
                            : e.action === "deny"
                              ? "danger"
                              : "default"
                        }
                      >
                        {e.action}
                      </Badge>
                    )}
                    {e.sub && (
                      <span className="font-mono text-foreground break-all">
                        {e.sub}
                      </span>
                    )}
                  </div>
                  {e.desc && (
                    <div className="mt-0.5 text-muted-foreground italic break-all">
                      {e.desc}
                    </div>
                  )}
                </li>
              );
            })}
            {refs.length > shown.length && (
              <li className="text-xs text-muted-foreground">
                …还有 {refs.length - shown.length} 处
              </li>
            )}
          </ul>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
