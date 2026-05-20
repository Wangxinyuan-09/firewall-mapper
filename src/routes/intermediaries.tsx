import { createFileRoute } from "@tanstack/react-router";
import { useConfigStore } from "@/lib/store";
import { EmptyConfig } from "@/components/EmptyConfig";
import { Badge, DataTable, type Column } from "@/components/DataTable";

const CAT_LABEL: Record<string, string> = {
  waf: "WAF",
  gateway: "网关",
  proxy: "代理",
  bastion: "堡垒机",
  lb: "负载均衡",
  other: "其它",
};

export const Route = createFileRoute("/intermediaries")({
  head: () => ({
    meta: [
      { title: "中间节点 · 防火墙配置审计台" },
      {
        name: "description",
        content:
          "基于命名识别配置中的 WAF、API/数据库网关、代理、堡垒机、负载均衡。",
      },
    ],
  }),
  component: IntermediariesPage,
});

function IntermediariesPage() {
  const { cfg } = useConfigStore();
  if (!cfg) return <EmptyConfig />;

  const cols: Column<(typeof cfg.intermediaries)[number]>[] = [
    {
      key: "cat",
      header: "类别",
      cell: (n) => <Badge>{CAT_LABEL[n.category] ?? n.category}</Badge>,
      search: (n) => CAT_LABEL[n.category] ?? n.category,
      className: "w-24",
    },
    {
      key: "name",
      header: "名称",
      cell: (n) => <span className="font-medium">{n.name}</span>,
      search: (n) => n.name,
    },
    {
      key: "addr",
      header: "代表 IP",
      cell: (n) => (
        <span className="font-mono text-xs">{n.address ?? "—"}</span>
      ),
      search: (n) => n.address ?? "",
    },
    {
      key: "evidence",
      header: "识别依据",
      cell: (n) => (
        <span className="text-xs text-muted-foreground">
          {n.evidence.join("；")}
        </span>
      ),
      search: (n) => n.evidence.join(" "),
    },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">中间节点</h1>
      <p className="text-sm text-muted-foreground">
        按对象/池/组的命名启发式识别。识别规则：含 <code>waf</code> →
        WAF；含「堡垒/bastion」→ 堡垒机；含「数据库网关/api 网关/api-/gateway」→
        网关；含「代理/proxy」→ 代理；含「负载/lb/slb」→ 负载均衡。
      </p>
      <DataTable
        rows={cfg.intermediaries}
        columns={cols}
        filename="intermediaries.csv"
      />
    </div>
  );
}
