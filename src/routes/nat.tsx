import { createFileRoute } from "@tanstack/react-router";
import { useConfigStore } from "@/lib/store";
import { EmptyConfig } from "@/components/EmptyConfig";
import { Badge, DataTable, LineLink, type Column } from "@/components/DataTable";
import { ObjectName } from "@/components/ObjectPreview";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/nat")({
  head: () => ({
    meta: [
      { title: "NAT · 防火墙配置审计台" },
      {
        name: "description",
        content: "查看 NAT 池与 DNAT 规则：原始地址/端口 → 转换后地址。",
      },
    ],
  }),
  component: NatPage,
});

function NatPage() {
  const { cfg } = useConfigStore();
  if (!cfg) return <EmptyConfig />;

  const ruleCols: Column<(typeof cfg.natRules)[number]>[] = [
    {
      key: "id",
      header: "#ID",
      cell: (r) => <span className="font-mono">{r.id}</span>,
      search: (r) => r.id,
      className: "w-16",
    },
    {
      key: "status",
      header: "状态",
      cell: (r) => (
        <div className="flex gap-1">
          {r.disabled && <Badge tone="muted">已禁用</Badge>}
          {r.log && <Badge tone="default">log</Badge>}
        </div>
      ),
      search: (r) => `${r.disabled ? "disabled" : ""} ${r.log ? "log" : ""}`,
    },
    {
      key: "iface",
      header: "接口",
      cell: (r) => <span className="font-mono text-xs">{r.iface}</span>,
      search: (r) => r.iface,
    },
    {
      key: "src",
      header: "源",
      cell: (r) => <ObjectName name={r.srcAddr} />,
      search: (r) => r.srcAddr,
    },
    {
      key: "orig",
      header: "原目的 → 端口/服务",
      cell: (r) => (
        <div className="space-y-0.5">
          <ObjectName name={r.origDstAddr} />
          <div><ObjectName name={r.origDstService} /></div>
        </div>
      ),
      search: (r) => `${r.origDstAddr} ${r.origDstService}`,
    },
    {
      key: "trans",
      header: "转换为",
      cell: (r) => (
        <div className="space-y-0.5">
          <ObjectName name={r.translatedPool} />
          {r.servicePort && (
            <div className="font-mono text-xs text-muted-foreground">
              service {r.servicePort}
            </div>
          )}
        </div>
      ),
      search: (r) => `${r.translatedPool} ${r.servicePort ?? ""}`,
    },
    {
      key: "desc",
      header: "描述",
      cell: (r) => (
        <span className="text-xs text-muted-foreground">
          {r.description ?? "—"}
        </span>
      ),
      search: (r) => r.description ?? "",
    },
    {
      key: "line",
      header: "行号",
      cell: (r) => <LineLink line={r.lineNo} />,
      className: "w-20",
      hiddenWhenNoLineNo: true,
    },
  ];

  const poolCols: Column<(typeof cfg.natPools)[number]>[] = [
    {
      key: "name",
      header: "池名",
      cell: (p) => <span className="font-medium">{p.name}</span>,
      search: (p) => p.name,
    },
    {
      key: "ip",
      header: "地址范围",
      cell: (p) => (
        <span className="font-mono text-xs">
          {p.addressFrom ?? "—"}
          {p.addressTo && p.addressTo !== p.addressFrom
            ? ` ~ ${p.addressTo}`
            : ""}
        </span>
      ),
      search: (p) => `${p.addressFrom ?? ""} ${p.addressTo ?? ""}`,
    },
    {
      key: "desc",
      header: "描述",
      cell: (p) => (
        <span className="text-xs text-muted-foreground">
          {p.description ?? "—"}
        </span>
      ),
      search: (p) => p.description ?? "",
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
      <h1 className="text-2xl font-semibold">NAT</h1>
      <p className="text-sm text-muted-foreground">
        防火墙看到的源/目的与业务理解的可能不同。NAT 规则把外部访问映射到内部 IP，
        是「源地址不一致」的根源。
      </p>
      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules">
            NAT 规则 ({cfg.natRules.length})
          </TabsTrigger>
          <TabsTrigger value="pools">
            NAT 池 ({cfg.natPools.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="rules" className="mt-4">
          <DataTable
            rows={cfg.natRules}
            columns={ruleCols}
            filename="nat-rules.csv"
          />
        </TabsContent>
        <TabsContent value="pools" className="mt-4">
          <DataTable
            rows={cfg.natPools}
            columns={poolCols}
            filename="nat-pools.csv"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
