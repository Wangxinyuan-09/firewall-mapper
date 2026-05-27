import { createFileRoute } from "@tanstack/react-router";
import { useConfigStore } from "@/lib/store";
import { EmptyConfig } from "@/components/EmptyConfig";
import { Badge, DataTable, LineLink, type Column } from "@/components/DataTable";
import { ObjectName } from "@/components/ObjectPreview";
import { serviceToPorts } from "@/lib/access";
import { useShowPolicyZone } from "@/lib/uiPrefs";

export const Route = createFileRoute("/policies")({
  head: () => ({
    meta: [
      { title: "策略 · 防火墙配置审计台" },
      {
        name: "description",
        content: "查看所有放行/拒绝策略：源/目的/服务/期限/动作。",
      },
    ],
  }),
  component: PoliciesPage,
});

function PoliciesPage() {
  const { cfg, xr } = useConfigStore();
  const [showZone] = useShowPolicyZone();
  if (!cfg) return <EmptyConfig />;

  const cols: Column<(typeof cfg.policies)[number]>[] = [
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
        `${p.service} ${serviceToPorts(p.service, cfg).join(" ")}`,
    },
    ...(showZone
      ? [
          {
            key: "zone",
            header: "Zone",
            cell: (p: (typeof cfg.policies)[number]) => {
              const isAnyAny =
                (!p.srcZone || p.srcZone === "any") &&
                (!p.dstZone || p.dstZone === "any");
              if (isAnyAny) {
                return <span className="text-xs text-muted-foreground">—</span>;
              }
              return (
                <span className="font-mono text-xs text-muted-foreground">
                  {p.srcZone} → {p.dstZone}
                </span>
              );
            },
            search: (p: (typeof cfg.policies)[number]) =>
              `${p.srcZone} ${p.dstZone}`,
          } satisfies Column<(typeof cfg.policies)[number]>,
        ]
      : []),
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

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">策略</h1>
      <p className="text-sm text-muted-foreground">
        共 {cfg.policies.length} 条。表内策略按导出顺序排列。
      </p>
      <DataTable rows={cfg.policies} columns={cols} filename="policies.csv" />
    </div>
  );
}
