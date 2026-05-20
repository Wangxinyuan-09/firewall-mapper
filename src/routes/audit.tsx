import { createFileRoute } from "@tanstack/react-router";
import { useConfigStore } from "@/lib/store";
import { EmptyConfig } from "@/components/EmptyConfig";
import { Badge, DataTable, LineLink, type Column } from "@/components/DataTable";
import type { AuditFinding } from "@/lib/parser/types";

export const Route = createFileRoute("/audit")({
  head: () => ({
    meta: [
      { title: "审计 · 防火墙配置审计台" },
      {
        name: "description",
        content: "宽松策略、未引用对象、重复定义、命名混乱等审计提示。",
      },
    ],
  }),
  component: AuditPage,
});

function AuditPage() {
  const { cfg, audit } = useConfigStore();
  if (!cfg) return <EmptyConfig />;

  const cols: Column<AuditFinding>[] = [
    {
      key: "sev",
      header: "等级",
      cell: (f) => (
        <Badge
          tone={
            f.severity === "high"
              ? "danger"
              : f.severity === "warn"
                ? "warn"
                : "muted"
          }
        >
          {f.severity}
        </Badge>
      ),
      search: (f) => f.severity,
      className: "w-20",
    },
    {
      key: "cat",
      header: "类别",
      cell: (f) => <span className="text-xs">{f.category}</span>,
      search: (f) => f.category,
      className: "w-24",
    },
    {
      key: "title",
      header: "问题",
      cell: (f) => <span>{f.title}</span>,
      search: (f) => f.title,
    },
    {
      key: "detail",
      header: "详情",
      cell: (f) => (
        <span className="text-xs text-muted-foreground">{f.detail}</span>
      ),
      search: (f) => f.detail,
    },
    {
      key: "line",
      header: "行号",
      cell: (f) => <LineLink line={f.refLine} />,
      className: "w-20",
      hiddenWhenNoLineNo: true,
    },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">审计提示</h1>
      <p className="text-sm text-muted-foreground">
        启发式规则：未被引用的对象、宽松到 any-any 的放行策略、同 IP 多次命名等。
      </p>
      <DataTable rows={audit} columns={cols} filename="audit.csv" />
    </div>
  );
}
