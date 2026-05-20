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
  ServiceGroup,
  ServiceObject,
} from "@/lib/parser/types";

type Kind = "address" | "address-group" | "service" | "service-group" | "unknown";

interface Resolved {
  kind: Kind;
  name: string;
  lineNo?: number;
  description?: string;
  addr?: AddressObject;
  addrGroup?: AddressGroup;
  svc?: ServiceObject;
  svcGroup?: ServiceGroup;
}

function useResolve(name: string): Resolved {
  const { cfg } = useConfigStore();
  if (!cfg || !name || name === "any")
    return { kind: "unknown", name };
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
  return { kind: "unknown", name };
}

const kindLabel: Record<Kind, string> = {
  address: "地址",
  "address-group": "地址组",
  service: "服务",
  "service-group": "服务组",
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

function GroupMembers({
  members,
  depth = 0,
}: {
  members: string[];
  depth?: number;
}) {
  const { cfg } = useConfigStore();
  if (!cfg) return null;
  if (depth > 2)
    return <div className="text-xs text-muted-foreground">…（已达展开深度）</div>;
  return (
    <ul className="space-y-1">
      {members.map((m, i) => {
        const a = cfg.addresses.find((x) => x.name === m);
        const ag = cfg.addressGroups.find((x) => x.name === m);
        const s = cfg.services.find((x) => x.name === m);
        const sg = cfg.serviceGroups.find((x) => x.name === m);
        return (
          <li key={i} className="text-xs">
            <span className="font-medium">{m}</span>
            {a && (
              <div className="mt-0.5 ml-3">
                <AddressEntries a={a} />
              </div>
            )}
            {s && (
              <div className="mt-0.5 ml-3">
                <ServiceEntries s={s} />
              </div>
            )}
            {ag && (
              <div className="mt-0.5 ml-3">
                <GroupMembers members={ag.members} depth={depth + 1} />
              </div>
            )}
            {sg && (
              <div className="mt-0.5 ml-3">
                <GroupMembers members={sg.members} depth={depth + 1} />
              </div>
            )}
            {!a && !ag && !s && !sg && (
              <span className="ml-2 text-muted-foreground">未定义</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function References({ name, kind }: { name: string; kind: Kind }) {
  const { xr } = useConfigStore();
  if (!xr) return null;
  const refs =
    kind === "service" || kind === "service-group"
      ? xr.serviceUsedBy.get(name) ?? []
      : xr.addressUsedBy.get(name) ?? [];
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
