import { Link } from "@tanstack/react-router";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Badge } from "@/components/DataTable";
import { useConfigStore } from "@/lib/store";
import type {
  AddressGroup,
  AddressObject,
  NatPool,
  ServiceGroup,
  ServiceObject,
} from "@/lib/parser/types";

type Kind =
  | "address"
  | "address-group"
  | "service"
  | "service-group"
  | "nat-pool"
  | "literal-ip"
  | "literal-port"
  | "literal-any"
  | "unknown";

interface Resolved {
  kind: Kind;
  name: string;
  lineNo?: number;
  description?: string;
  literal?: string; // 解析为字面量时的说明
  addr?: AddressObject;
  addrGroup?: AddressGroup;
  svc?: ServiceObject;
  svcGroup?: ServiceGroup;
  pool?: NatPool;
}

const IP_RE = /^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/;
const RANGE_RE = /^\d{1,3}(\.\d{1,3}){3}-\d{1,3}(\.\d{1,3}){3}$/;
const PORT_RE = /^\d{1,5}(-\d{1,5})?$/;
const ANY_RE = /^any(-(src|dst|ip|service))?$/i;

function classifyLiteral(name: string): Resolved | null {
  if (ANY_RE.test(name))
    return { kind: "literal-any", name, literal: "通配（不限制）" };
  if (IP_RE.test(name))
    return { kind: "literal-ip", name, literal: "字面 IP / 网段" };
  if (RANGE_RE.test(name))
    return { kind: "literal-ip", name, literal: "字面 IP 区间" };
  if (PORT_RE.test(name))
    return { kind: "literal-port", name, literal: "字面端口" };
  return null;
}

function useResolve(name: string): Resolved {
  const { cfg } = useConfigStore();
  if (!cfg || !name) return { kind: "unknown", name };
  const a = cfg.addresses.find((x) => x.name === name);
  if (a)
    return { kind: "address", name, lineNo: a.lineNo, description: a.description, addr: a };
  const ag = cfg.addressGroups.find((x) => x.name === name);
  if (ag)
    return {
      kind: "address-group",
      name,
      lineNo: ag.lineNo,
      description: ag.description,
      addrGroup: ag,
    };
  const s = cfg.services.find((x) => x.name === name);
  if (s)
    return { kind: "service", name, lineNo: s.lineNo, description: s.description, svc: s };
  const sg = cfg.serviceGroups.find((x) => x.name === name);
  if (sg)
    return {
      kind: "service-group",
      name,
      lineNo: sg.lineNo,
      description: sg.description,
      svcGroup: sg,
    };
  const p = cfg.natPools.find((x) => x.name === name);
  if (p)
    return {
      kind: "nat-pool",
      name,
      lineNo: p.lineNo,
      description: p.description,
      pool: p,
    };
  const lit = classifyLiteral(name);
  if (lit) return lit;
  return { kind: "unknown", name };
}

const kindLabel: Record<Kind, string> = {
  address: "地址",
  "address-group": "地址组",
  service: "服务",
  "service-group": "服务组",
  "nat-pool": "NAT 池",
  "literal-ip": "字面 IP",
  "literal-port": "字面端口",
  "literal-any": "通配",
  unknown: "未定义",
};



function AddressEntries({ a }: { a: AddressObject }) {
  return (
    <div className="space-y-0.5 font-mono text-xs">
      {a.entries.length === 0 ? (
        <span className="text-muted-foreground">（空）</span>
      ) : (
        a.entries.map((e, i) => (
          <div key={i}>
            <Badge tone="muted">{e.kind}</Badge> {e.value}
          </div>
        ))
      )}
    </div>
  );
}

function ServiceEntries({ s }: { s: ServiceObject }) {
  return (
    <div className="space-y-0.5 font-mono text-xs">
      {s.entries.length === 0 ? (
        <span className="text-muted-foreground">（空）</span>
      ) : (
        s.entries.map((e, i) => (
          <div key={i}>
            <Badge tone="muted">{e.protocol}</Badge> dst {e.destPort ?? "any"}
            {e.sourcePort ? ` · src ${e.sourcePort}` : ""}
          </div>
        ))
      )}
    </div>
  );
}

function MemberRow({ m }: { m: string }) {
  const { cfg, xr } = useConfigStore();
  if (!cfg) return null;
  const a = cfg.addresses.find((x) => x.name === m);
  const ag = cfg.addressGroups.find((x) => x.name === m);
  const s = cfg.services.find((x) => x.name === m);
  const sg = cfg.serviceGroups.find((x) => x.name === m);

  let kindTag = "未定义";
  let summary = "";
  if (a) {
    kindTag = "地址";
    summary =
      a.entries.map((e) => `${e.kind}:${e.value}`).slice(0, 3).join("，") +
      (a.entries.length > 3 ? " …" : "");
  } else if (ag) {
    kindTag = "地址组";
    summary = `${ag.members.length} 成员`;
  } else if (s) {
    kindTag = "服务";
    summary =
      s.entries
        .map(
          (e) =>
            `${e.protocol}/${e.destPort ?? "any"}${e.sourcePort ? `←${e.sourcePort}` : ""}`,
        )
        .slice(0, 3)
        .join("，") + (s.entries.length > 3 ? " …" : "");
  } else if (sg) {
    kindTag = "服务组";
    summary = `${sg.members.length} 成员`;
  }

  const desc = a?.description ?? ag?.description ?? s?.description ?? sg?.description;
  const refCount =
    (s || sg
      ? xr?.serviceUsedBy.get(m)?.length
      : xr?.addressUsedBy.get(m)?.length) ?? 0;
  const unresolved = !a && !ag && !s && !sg;

  return (
    <li className="text-xs flex items-start gap-2 flex-wrap">
      <Badge tone={unresolved ? "danger" : "muted"}>{kindTag}</Badge>
      <ObjectName name={m} />
      {summary && (
        <span className="font-mono text-muted-foreground break-all">{summary}</span>
      )}
      {refCount > 0 ? (
        <Badge tone="default">引用 {refCount}</Badge>
      ) : !unresolved ? (
        <Badge tone="warn">未引用</Badge>
      ) : null}
      {desc && <span className="text-muted-foreground italic">{desc}</span>}
    </li>
  );
}

function GroupMembers({ members }: { members: string[] }) {
  if (members.length === 0)
    return <div className="text-xs text-muted-foreground">（空）</div>;
  return (
    <ul className="space-y-1">
      {members.map((m, i) => (
        <MemberRow key={i} m={m} />
      ))}
    </ul>
  );
}

function References({ resolved }: { resolved: Resolved }) {
  const { xr, cfg } = useConfigStore();
  const { kind, name } = resolved;
  if (
    kind === "literal-any" ||
    kind === "literal-ip" ||
    kind === "literal-port" ||
    kind === "unknown"
  )
    return null;

  let refs =
    kind === "service" || kind === "service-group"
      ? xr?.serviceUsedBy.get(name) ?? []
      : xr?.addressUsedBy.get(name) ?? [];

  // NAT 池：扫描 natRules.translatedPool
  if (kind === "nat-pool" && cfg) {
    refs = cfg.natRules
      .filter((r) => r.translatedPool === name)
      .map((r) => ({
        by: "nat" as const,
        id: r.id,
        lineNo: r.lineNo,
        detail: `NAT #${r.id} ${r.kind}`,
      }));
  }

  if (refs.length === 0)
    return (
      <div className="mt-2 text-xs">
        <Badge tone="warn">未被引用</Badge>
      </div>
    );
  const shown = refs.slice(0, 8);
  return (
    <div className="mt-2 space-y-1">
      <div className="text-xs font-medium text-muted-foreground">
        被引用 {refs.length} 处
      </div>
      <ul className="space-y-0.5">
        {shown.map((r, i) => (
          <li key={i} className="text-xs">
            <Link
              to="/raw"
              search={{ line: r.lineNo }}
              className="text-primary hover:underline"
            >
              L{r.lineNo}
            </Link>{" "}
            <span className="text-muted-foreground">{r.detail}</span>
          </li>
        ))}
        {refs.length > shown.length && (
          <li className="text-xs text-muted-foreground">
            …还有 {refs.length - shown.length} 处
          </li>
        )}
      </ul>
    </div>
  );
}

function PoolDetail({ p }: { p: NatPool }) {
  return (
    <div className="font-mono text-xs">
      {p.addressFrom ?? "—"}
      {p.addressTo && p.addressTo !== p.addressFrom ? ` ~ ${p.addressTo}` : ""}
    </div>
  );
}

export function ObjectName({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) {
  const r = useResolve(name);
  const isAny = !name || name === "any";

  if (isAny) {
    return (
      <span className={`font-mono text-xs text-muted-foreground ${className}`}>
        {name || "—"}
      </span>
    );
  }

  const trigger = (
    <span
      className={`font-mono text-xs cursor-help underline decoration-dotted underline-offset-2 ${
        r.kind === "unknown" ? "text-destructive" : "text-primary"
      } ${className}`}
    >
      {name}
    </span>
  );

  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>{trigger}</HoverCardTrigger>
      <HoverCardContent className="w-96 max-h-96 overflow-auto" align="start">
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-sm font-semibold">{r.name}</div>
              <div className="text-xs text-muted-foreground">
                <Badge tone={r.kind === "unknown" ? "danger" : "default"}>
                  {kindLabel[r.kind]}
                </Badge>
                {r.lineNo && (
                  <>
                    {" · "}
                    <Link
                      to="/raw"
                      search={{ line: r.lineNo }}
                      className="text-primary hover:underline"
                    >
                      L{r.lineNo}
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
          {r.description && (
            <div className="text-xs text-muted-foreground">{r.description}</div>
          )}
          {r.addr && <AddressEntries a={r.addr} />}
          {r.svc && <ServiceEntries s={r.svc} />}
          {r.addrGroup && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">
                成员（{r.addrGroup.members.length}）
              </div>
              <GroupMembers members={r.addrGroup.members} />
            </div>
          )}
          {r.svcGroup && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">
                成员（{r.svcGroup.members.length}）
              </div>
              <GroupMembers members={r.svcGroup.members} />
            </div>
          )}
          {r.kind === "unknown" && (
            <div className="text-xs text-destructive">
              在配置中找不到该名称的定义，可能引用了已删除的对象。
            </div>
          )}
          <References name={r.name} kind={r.kind} />
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
