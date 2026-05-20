import { createFileRoute } from "@tanstack/react-router";
import { useConfigStore } from "@/lib/store";
import { EmptyConfig } from "@/components/EmptyConfig";
import { Badge, DataTable, LineLink, type Column } from "@/components/DataTable";
import { ObjectName } from "@/components/ObjectPreview";

export const Route = createFileRoute("/policies")({
  head: () => ({
    meta: [
      { title: "策略 · 防火墙配置审计台" },
      {
        name: "description",
        content: "查看所有放行/拒绝策略：源/目的/服务/调度/动作。",
      },
    ],
  }),
  component: PoliciesPage,
});

function PoliciesPage() {
  const { cfg } = useConfigStore();
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
      search: (p) => p.srcAddr,
    },
    {
      key: "dst",
      header: "目的",
      cell: (p) => <ObjectName name={p.dstAddr} />,
      search: (p) => p.dstAddr,
    },
    {
      key: "svc",
      header: "服务",
      cell: (p) => <ObjectName name={p.service} />,
      search: (p) => p.service,
    },
    {
      key: "zone",
      header: "Zone",
      cell: (p) => (
        <span className="font-mono text-xs text-muted-foreground">
          {p.srcZone} → {p.dstZone}
        </span>
      ),
      search: (p) => `${p.srcZone} ${p.dstZone}`,
    },
    {
      key: "schedule",
      header: "调度",
      cell: (p) => <span className="text-xs">{p.schedule}</span>,
      search: (p) => p.schedule,
    },
    {
      key: "line",
      header: "行号",
      cell: (p) => <LineLink line={p.lineNo} />,
      className: "w-20",
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
