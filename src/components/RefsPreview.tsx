import { useMemo, useState } from "react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Badge } from "@/components/DataTable";
import { useConfigStore } from "@/lib/store";
import type { RefUsage } from "@/lib/parser";
import { L, DescQuote } from "@/components/previewAtoms";
import type { NatRule, PolicyRule } from "@/lib/parser/types";
import { useShowPolicyZone } from "@/lib/uiPrefs";

const byLabel: Record<RefUsage["by"], string> = {
  policy: "策略",
  nat: "NAT",
  "address-group": "地址组",
  "service-group": "服务组",
};

const sectionOrder: RefUsage["by"][] = [
  "policy",
  "nat",
  "address-group",
  "service-group",
];

const actionLabel: Record<string, string> = {
  permit: "允许",
  deny: "拒绝",
};

const natKindLabel: Record<string, string> = {
  destination: "目的 NAT",
  source: "源 NAT",
  static: "静态 NAT",
};

const ANY_RE = /^any(-(src|dst|ip|service))?$/i;
const isAny = (v: string) => !v || ANY_RE.test(v);

function policyWeight(p: PolicyRule): number {
  const a = isAny(p.srcAddr);
  const b = isAny(p.dstAddr);
  if (a && b) return 100;
  if (a || b) return 10;
  return 0;
}

function natWeight(n: NatRule): number {
  const a = isAny(n.srcAddr);
  const b = isAny(n.origDstAddr);
  if (a && b) return 100;
  if (a || b) return 10;
  return 0;
}

function cmpId(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return a.localeCompare(b);
}

/** Highlight: bold/primary if value equals the previewed object name */
function H({ hit, value }: { hit: string; value: string }) {
  const v = value || "—";
  if (v === hit) {
    return <span className="text-primary font-medium">{v}</span>;
  }
  return <span className="text-foreground">{v}</span>;
}

function PolicyLine({ p, hit }: { p: PolicyRule; hit: string }) {
  const action = actionLabel[p.action] ?? p.action;
  const actionTone =
    p.action === "permit" ? "ok" : p.action === "deny" ? "danger" : "muted";
  const showSchedule = p.schedule && p.schedule !== "always" && p.schedule !== "-";
  const [showZonePref] = useShowPolicyZone();
  const showZone =
    showZonePref &&
    (p.srcZone || p.dstZone) &&
    !(p.srcZone === "any" && p.dstZone === "any");
  const hasMeta = showZone || showSchedule || p.id;
  return (
    <div className="space-y-0.5">
      <div className="flex items-baseline gap-2">
        <div className="flex items-baseline gap-x-2 gap-y-0.5 font-mono text-xs min-w-0 flex-1 flex-wrap">
          <span className="flex items-baseline gap-1 min-w-0">
            <L>源</L>
            <H hit={hit} value={p.srcAddr} />
          </span>
          <span className="flex items-baseline gap-1 min-w-0">
            <L>目的</L>
            <H hit={hit} value={p.dstAddr} />
          </span>
          <span className="flex items-baseline gap-1 min-w-0">
            <L>服务</L>
            <H hit={hit} value={p.service} />
          </span>
          {showSchedule && (
            <span className="flex items-baseline gap-1 min-w-0">
              <L>期限</L>
              <span className="text-violet-600 dark:text-violet-400">仅 {p.schedule}</span>
            </span>
          )}
        </div>
        <span className="shrink-0"><Badge tone={actionTone}>{action}</Badge></span>
      </div>
      {(showZone || p.id) && (
        <div className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap text-[11px] text-muted-foreground pl-0.5">
          {showZone && (
            <span className="flex items-baseline gap-1">
              <L>区域</L>
              <span className="font-mono">
                {p.srcZone || "any"}→{p.dstZone || "any"}
              </span>
            </span>
          )}
          {p.id && <span className="ml-auto font-mono">#{p.id}</span>}
        </div>
      )}
    </div>
  );
}

function NatLine({ n, hit }: { n: NatRule; hit: string }) {
  const k = natKindLabel[n.kind] ?? n.kind;
  const hasMeta = n.disabled || n.log || n.description || n.id;
  return (
    <div className="space-y-0.5">
      <div className="flex items-baseline gap-2">
        <div className="flex items-baseline gap-x-2 font-mono text-xs min-w-0 flex-1 truncate">
          <span className="flex items-baseline gap-1 min-w-0">
            <L>原始</L>
            <H hit={hit} value={n.srcAddr} />
            <span className="text-muted-foreground">→</span>
            <H hit={hit} value={n.origDstAddr} />
            {n.origDstService && (
              <span className="text-muted-foreground">:{n.origDstService}</span>
            )}
          </span>
          <span className="flex items-baseline gap-1 min-w-0">
            <L>转换为</L>
            <H hit={hit} value={n.translatedPool} />
            {n.servicePort && (
              <span className="text-muted-foreground">:{n.servicePort}</span>
            )}
          </span>
        </div>
        <span className="shrink-0"><Badge tone="default">{k}</Badge></span>
      </div>
      {hasMeta && (
        <div className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap text-[11px] text-muted-foreground pl-0.5">
          {n.description && (
            <DescQuote as="span" className="line-clamp-2 min-w-0 text-[11px]">
              {n.description}
            </DescQuote>
          )}
          {n.disabled && <span className="text-amber-600">已禁用</span>}
          {n.log && <span>log</span>}
          {n.id && <span className="ml-auto font-mono">#{n.id}</span>}
        </div>
      )}
    </div>
  );
}

function GroupLine({
  name,
  count,
  description,
  hit,
}: {
  name: string;
  count: number;
  description?: string;
  hit: string;
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-baseline gap-x-3 flex-wrap font-mono text-sm">
        <span className="flex items-baseline gap-1">
          <L>名称</L>
          <H hit={hit} value={name} />
        </span>
        <span className="ml-auto">
          <Badge tone="muted">成员 {count}</Badge>
        </span>
      </div>
      {description && (
        <DescQuote className="text-[11px] line-clamp-2">{description}</DescQuote>
      )}
    </div>
  );
}

interface Section {
  by: RefUsage["by"];
  items: RefUsage[];
  anyAnyCount: number;
}

interface IndirectItem {
  by: "policy" | "nat";
  id: string;
  viaGroups: string[];
}

interface IndirectSection {
  by: "policy" | "nat";
  items: IndirectItem[];
  anyAnyCount: number;
}

export function RefsPreview({
  name,
  kind,
}: {
  name: string;
  kind: "address" | "service";
}) {
  const { cfg, xr } = useConfigStore();
  const refs =
    xr
      ? kind === "service"
        ? xr.serviceUsedBy.get(name) ?? []
        : xr.addressUsedBy.get(name) ?? []
      : [];

  const sections = useMemo<Section[]>(() => {
    if (!cfg) return [];
    const groups = new Map<RefUsage["by"], RefUsage[]>();
    refs.forEach((r) => {
      const arr = groups.get(r.by) ?? [];
      arr.push(r);
      groups.set(r.by, arr);
    });
    return sectionOrder
      .filter((k) => groups.has(k))
      .map((by) => {
        const items = [...groups.get(by)!];
        let anyAnyCount = 0;
        if (by === "policy") {
          const map = new Map(cfg.policies.map((p) => [p.id, p]));
          items.sort((a, b) => {
            const pa = map.get(a.id);
            const pb = map.get(b.id);
            const wa = pa ? policyWeight(pa) : 0;
            const wb = pb ? policyWeight(pb) : 0;
            if (wa !== wb) return wa - wb;
            return cmpId(a.id, b.id);
          });
          anyAnyCount = items.filter((r) => {
            const p = map.get(r.id);
            return p && policyWeight(p) === 100;
          }).length;
        } else if (by === "nat") {
          const map = new Map(cfg.natRules.map((n) => [n.id, n]));
          items.sort((a, b) => {
            const na = map.get(a.id);
            const nb = map.get(b.id);
            const wa = na ? natWeight(na) : 0;
            const wb = nb ? natWeight(nb) : 0;
            if (wa !== wb) return wa - wb;
            return cmpId(a.id, b.id);
          });
          anyAnyCount = items.filter((r) => {
            const n = map.get(r.id);
            return n && natWeight(n) === 100;
          }).length;
        }
        return { by, items, anyAnyCount };
      });
  }, [cfg, refs]);

  const indirectSections = useMemo<IndirectSection[]>(() => {
    if (!cfg || !xr) return [];
    const groupKey: RefUsage["by"] =
      kind === "service" ? "service-group" : "address-group";
    const usedByMap =
      kind === "service" ? xr.serviceUsedBy : xr.addressUsedBy;
    const directKeys = new Set(
      refs
        .filter((r) => r.by === "policy" || r.by === "nat")
        .map((r) => `${r.by}#${r.id}`),
    );
    // groupName -> (by#id -> viaGroups accumulator)
    const acc = new Map<string, IndirectItem>();
    const groupNames = refs.filter((r) => r.by === groupKey).map((r) => r.id);
    for (const gname of groupNames) {
      const usages = usedByMap.get(gname) ?? [];
      for (const u of usages) {
        if (u.by !== "policy" && u.by !== "nat") continue;
        const key = `${u.by}#${u.id}`;
        if (directKeys.has(key)) continue;
        const existing = acc.get(key);
        if (existing) {
          if (!existing.viaGroups.includes(gname))
            existing.viaGroups.push(gname);
        } else {
          acc.set(key, { by: u.by, id: u.id, viaGroups: [gname] });
        }
      }
    }
    const all = [...acc.values()];
    const out: IndirectSection[] = [];
    for (const by of ["policy", "nat"] as const) {
      const items = all.filter((i) => i.by === by);
      if (items.length === 0) continue;
      let anyAnyCount = 0;
      if (by === "policy") {
        const map = new Map(cfg.policies.map((p) => [p.id, p]));
        items.sort((a, b) => {
          const wa = map.get(a.id) ? policyWeight(map.get(a.id)!) : 0;
          const wb = map.get(b.id) ? policyWeight(map.get(b.id)!) : 0;
          if (wa !== wb) return wa - wb;
          return cmpId(a.id, b.id);
        });
        anyAnyCount = items.filter(
          (i) => map.get(i.id) && policyWeight(map.get(i.id)!) === 100,
        ).length;
      } else {
        const map = new Map(cfg.natRules.map((n) => [n.id, n]));
        items.sort((a, b) => {
          const wa = map.get(a.id) ? natWeight(map.get(a.id)!) : 0;
          const wb = map.get(b.id) ? natWeight(map.get(b.id)!) : 0;
          if (wa !== wb) return wa - wb;
          return cmpId(a.id, b.id);
        });
        anyAnyCount = items.filter(
          (i) => map.get(i.id) && natWeight(map.get(i.id)!) === 100,
        ).length;
      }
      out.push({ by, items, anyAnyCount });
    }
    return out;
  }, [cfg, xr, refs, kind]);

  if (!xr) return null;
  if (refs.length === 0) return <Badge tone="warn">未引用</Badge>;

  const summary = sections
    .map((s) => `${byLabel[s.by]} ${s.items.length}`)
    .join(" · ");
  const indirectSummary = indirectSections
    .map((s) => `${byLabel[s.by]} ${s.items.length}`)
    .join(" · ");
  const indirectTotal = indirectSections.reduce(
    (n, s) => n + s.items.length,
    0,
  );

  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        <span className="text-xs cursor-help underline decoration-dotted underline-offset-2 text-primary">
          {refs.length} 处 · {summary}
          {indirectTotal > 0 && (
            <span className="text-muted-foreground">
              {" "}
              · 间接 {indirectTotal}
            </span>
          )}
        </span>
      </HoverCardTrigger>
      <HoverCardContent
        className="w-[40rem] max-h-[28rem] overflow-auto"
        align="start"
      >
        <div className="space-y-3">
          <div className="text-sm">
            <span className="font-semibold">{name}</span>
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              共 {refs.length} 处直接引用 · {summary}
              {indirectTotal > 0 && ` · 间接 ${indirectTotal}（${indirectSummary}）`}
            </span>
          </div>
          {sections.map((s) => (
            <SectionBlock key={s.by} section={s} hit={name} cfg={cfg!} />
          ))}
          {indirectSections.length > 0 && (
            <div className="space-y-2 pt-1 border-t border-border/40">
              <div className="text-xs font-medium text-muted-foreground">
                通过组的间接引用
              </div>
              {indirectSections.map((s) => (
                <IndirectSectionBlock
                  key={s.by}
                  section={s}
                  hit={name}
                  cfg={cfg!}
                />
              ))}
            </div>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function ViaBadge({ groups }: { groups: string[] }) {
  return (
    <span className="text-[10px] text-muted-foreground font-mono">
      via {groups.join(", ")}
    </span>
  );
}

function IndirectSectionBlock({
  section,
  hit,
  cfg,
}: {
  section: IndirectSection;
  hit: string;
  cfg: NonNullable<ReturnType<typeof useConfigStore>["cfg"]>;
}) {
  const [showAny, setShowAny] = useState(false);
  const { by, items, anyAnyCount } = section;
  const visibleItems = showAny
    ? items
    : items.filter((_, i) => i < items.length - anyAnyCount);
  const max = 30;
  const shown = visibleItems.slice(0, max);
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span>
          {byLabel[by]}（{items.length}）
        </span>
        {anyAnyCount > 0 && (
          <button
            type="button"
            onClick={() => setShowAny((v) => !v)}
            className="text-primary hover:text-primary/80 hover:underline"
          >
            {showAny ? "收起" : "展开"} {anyAnyCount} 条 any-any 引用
          </button>
        )}
      </div>
      {shown.length > 0 && (
        <ul className="divide-y divide-border/40 rounded-md border border-border/40">
          {shown.map((r, i) => (
            <li key={i} className="py-1.5 px-2 space-y-0.5">
              {by === "policy" && (() => {
                const p = cfg.policies.find((x) => x.id === r.id);
                return p ? (
                  <PolicyLine p={p} hit={hit} />
                ) : (
                  <span className="text-xs text-muted-foreground">
                    策略 #{r.id}
                  </span>
                );
              })()}
              {by === "nat" && (() => {
                const n = cfg.natRules.find((x) => x.id === r.id);
                return n ? (
                  <NatLine n={n} hit={hit} />
                ) : (
                  <span className="text-xs text-muted-foreground">
                    NAT #{r.id}
                  </span>
                );
              })()}
              <div className="pl-0.5">
                <ViaBadge groups={r.viaGroups} />
              </div>
            </li>
          ))}
          {visibleItems.length > shown.length && (
            <li className="text-xs text-muted-foreground py-1.5 px-2">
              …还有 {visibleItems.length - shown.length} 处
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function SectionBlock({
  section,
  hit,
  cfg,
}: {
  section: Section;
  hit: string;
  cfg: NonNullable<ReturnType<typeof useConfigStore>["cfg"]>;
}) {
  const [showAny, setShowAny] = useState(false);
  const { by, items, anyAnyCount } = section;
  const allAnyAny = anyAnyCount > 0 && anyAnyCount === items.length;
  const visibleItems =
    by === "policy" || by === "nat"
      ? showAny
        ? items
        : items.filter((_, i) => i < items.length - anyAnyCount)
      : items;
  const max = 30;
  const shown = visibleItems.slice(0, max);

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span>
          {byLabel[by]}（{items.length}）
        </span>
        {anyAnyCount > 0 && (
          <button
            type="button"
            onClick={() => setShowAny((v) => !v)}
            className="text-primary hover:text-primary/80 hover:underline"
          >
            {showAny ? "收起" : "展开"} {anyAnyCount} 条 any-any 引用
          </button>
        )}
      </div>
      {allAnyAny && !showAny && (
        <div className="text-xs text-muted-foreground italic">
          该对象仅被通配规则命中，对实际收敛无意义。
        </div>
      )}
      {shown.length > 0 && (
        <ul className="divide-y divide-border/40 rounded-md border border-border/40">
          {shown.map((r, i) => (
            <li key={i} className="py-1.5 px-2">
              {by === "policy" && (() => {
                const p = cfg.policies.find((x) => x.id === r.id);
                return p ? (
                  <PolicyLine p={p} hit={hit} />
                ) : (
                  <span className="text-xs text-muted-foreground">
                    策略 #{r.id}
                  </span>
                );
              })()}
              {by === "nat" && (() => {
                const n = cfg.natRules.find((x) => x.id === r.id);
                return n ? (
                  <NatLine n={n} hit={hit} />
                ) : (
                  <span className="text-xs text-muted-foreground">
                    NAT #{r.id}
                  </span>
                );
              })()}
              {by === "address-group" && (() => {
                const g = cfg.addressGroups.find((x) => x.name === r.id);
                return (
                  <GroupLine
                    name={g?.name ?? r.id}
                    count={g?.members.length ?? 0}
                    description={g?.description}
                    hit={hit}
                  />
                );
              })()}
              {by === "service-group" && (() => {
                const g = cfg.serviceGroups.find((x) => x.name === r.id);
                return (
                  <GroupLine
                    name={g?.name ?? r.id}
                    count={g?.members.length ?? 0}
                    description={g?.description}
                    hit={hit}
                  />
                );
              })()}
            </li>
          ))}
          {visibleItems.length > shown.length && (
            <li className="text-xs text-muted-foreground py-1.5 px-2">
              …还有 {visibleItems.length - shown.length} 处
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
