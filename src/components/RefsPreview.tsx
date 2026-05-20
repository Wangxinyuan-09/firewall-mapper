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

interface Enriched {
  /** 适合直接读的人话描述 */
  text: string;
  /** 颜色：动作/状态 */
  tone?: "ok" | "danger" | "warn" | "muted" | "default";
  /** 前缀小徽标文本，如 "#12 允许" / "#3 目的 NAT" / "成员 5" */
  tag?: string;
  /** 副信息：描述等 */
  desc?: string;
}

function useEnrich() {
  const { cfg } = useConfigStore();
  return (r: RefUsage): Enriched => {
    if (!cfg) return { text: r.detail };

    if (r.by === "policy") {
      const p = cfg.policies.find((x) => x.id === r.id);
      if (!p) return { text: `策略 #${r.id}` };
      const action = actionLabel[p.action] ?? p.action;
      return {
        tag: `#${p.id} ${action}`,
        tone: p.action === "permit" ? "ok" : p.action === "deny" ? "danger" : "muted",
        text: `${p.srcZone} → ${p.dstZone}　${p.srcAddr} → ${p.dstAddr}　服务 ${p.service}`,
      };
    }

    if (r.by === "nat") {
      const n = cfg.natRules.find((x) => x.id === r.id);
      if (!n) return { text: `NAT #${r.id}` };
      const k = natKindLabel[n.kind] ?? n.kind;
      let text = "";
      if (n.kind === "destination") {
        text = `来自 ${n.srcAddr} 访问 ${n.origDstAddr}:${n.origDstService} ⇒ 转到 ${n.translatedPool}`;
      } else if (n.kind === "source") {
        text = `源 ${n.srcAddr} ⇒ ${n.translatedPool}（目的 ${n.origDstAddr}）`;
      } else {
        text = `${n.srcAddr} ⇔ ${n.translatedPool}`;
      }
      return {
        tag: `#${n.id} ${k}`,
        tone: n.disabled ? "muted" : "default",
        text,
        desc: n.description,
      };
    }

    if (r.by === "address-group") {
      const g = cfg.addressGroups.find((x) => x.name === r.id);
      if (!g) return { text: `地址组 ${r.id}` };
      return {
        tag: `成员 ${g.members.length}`,
        text: g.name,
        desc: g.description,
      };
    }

    if (r.by === "service-group") {
      const g = cfg.serviceGroups.find((x) => x.name === r.id);
      if (!g) return { text: `服务组 ${r.id}` };
      return {
        tag: `成员 ${g.members.length}`,
        text: g.name,
        desc: g.description,
      };
    }

    return { text: r.detail };
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

  // 分组
  const groups = new Map<RefUsage["by"], RefUsage[]>();
  refs.forEach((r) => {
    const arr = groups.get(r.by) ?? [];
    arr.push(r);
    groups.set(r.by, arr);
  });

  const summary = sectionOrder
    .filter((k) => groups.has(k))
    .map((k) => `${byLabel[k]} ${groups.get(k)!.length}`)
    .join(" · ");

  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        <span className="text-xs cursor-help underline decoration-dotted underline-offset-2 text-primary">
          {refs.length} 处（{summary}）
        </span>
      </HoverCardTrigger>
      <HoverCardContent
        className="w-[34rem] max-h-[28rem] overflow-auto"
        align="start"
      >
        <div className="space-y-3">
          <div className="text-sm font-semibold">
            {name}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              共 {refs.length} 处引用
            </span>
          </div>

          {sectionOrder
            .filter((k) => groups.has(k))
            .map((sec) => {
              const items = groups.get(sec)!;
              const shown = items.slice(0, 30);
              return (
                <div key={sec} className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">
                    {byLabel[sec]}（{items.length}）
                  </div>
                  <ul className="space-y-1">
                    {shown.map((r, i) => {
                      const e = enrich(r);
                      return (
                        <li
                          key={i}
                          className="text-xs border-l-2 border-border pl-2 py-0.5"
                        >
                          <div className="flex items-baseline gap-2 flex-wrap">
                            {e.tag && (
                              <Badge tone={e.tone ?? "default"}>{e.tag}</Badge>
                            )}
                            <span className="font-mono text-foreground break-all flex-1 min-w-0">
                              {e.text}
                            </span>
                            <Link
                              to="/raw"
                              search={{ line: r.lineNo }}
                              className="text-muted-foreground hover:text-primary hover:underline shrink-0"
                              title={`跳转到第 ${r.lineNo} 行原文`}
                            >
                              查看原文
                            </Link>
                          </div>
                          {e.desc && (
                            <div className="mt-0.5 text-muted-foreground italic break-all">
                              {e.desc}
                            </div>
                          )}
                        </li>
                      );
                    })}
                    {items.length > shown.length && (
                      <li className="text-xs text-muted-foreground pl-2">
                        …还有 {items.length - shown.length} 处
                      </li>
                    )}
                  </ul>
                </div>
              );
            })}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
