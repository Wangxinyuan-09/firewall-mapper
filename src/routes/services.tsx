import { createFileRoute } from "@tanstack/react-router";
import { useConfigStore } from "@/lib/store";
import { EmptyConfig } from "@/components/EmptyConfig";
import { Badge, DataTable, LineLink, type Column } from "@/components/DataTable";
import { ObjectName } from "@/components/ObjectPreview";
import { RefsPreview } from "@/components/RefsPreview";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useShowFullPortRange } from "@/lib/uiPrefs";

export const Route = createFileRoute("/services")({
  head: () => ({
    meta: [
      { title: "服务对象 · 防火墙配置审计台" },
      {
        name: "description",
        content: "查看所有服务对象与服务组及其端口、引用关系。",
      },
    ],
  }),
  component: ServicesPage,
});

function ServicesPage() {
  const { cfg, xr } = useConfigStore();
  const [showFull] = useShowFullPortRange();
  if (!cfg || !xr) return <EmptyConfig />;

  const fmtPort = (p?: string) =>
    p ? (!showFull && p === "1-65535" ? "any" : p) : "any";
  const showSrc = (p?: string) =>
    !!p && !(!showFull && p === "1-65535");

  const svcCols: Column<(typeof cfg.services)[number]>[] = [
    {
      key: "name",
      header: "名称",
      cell: (s) => <span className="font-medium">{s.name}</span>,
      search: (s) => s.name,
    },
    {
      key: "entries",
      header: "协议/端口",
      cell: (s) => (
        <div className="space-y-0.5 font-mono text-xs">
          {s.entries.map((e, i) => (
            <div key={i}>
              <Badge tone="muted">{e.protocol}</Badge> dst {fmtPort(e.destPort)}
              {showSrc(e.sourcePort) ? ` · src ${e.sourcePort}` : ""}
            </div>
          ))}
        </div>
      ),
      search: (s) =>
        s.entries.map((e) => `${e.protocol} ${e.destPort ?? ""}`).join(" "),
    },
    {
      key: "desc",
      header: "描述",
      cell: (s) => (
        <span className="text-xs text-muted-foreground">
          {s.description ?? "—"}
        </span>
      ),
      search: (s) => s.description ?? "",
    },
    {
      key: "refs",
      header: "被引用",
      cell: (s) => <RefsPreview name={s.name} kind="service" />,
      search: (s) => String((xr.serviceUsedBy.get(s.name) ?? []).length),
    },
    {
      key: "line",
      header: "行号",
      cell: (s) => <LineLink line={s.lineNo} />,
      className: "w-20",
      hiddenWhenNoLineNo: true,
    },
  ];

  const sgCols: Column<(typeof cfg.serviceGroups)[number]>[] = [
    {
      key: "name",
      header: "组名",
      cell: (g) => <span className="font-medium">{g.name}</span>,
      search: (g) => g.name,
    },
    {
      key: "members",
      header: "成员",
      cell: (g) => (
        <div className="space-y-0.5">
          {g.members.map((m, i) => (
            <div key={i}><ObjectName name={m} /></div>
          ))}
        </div>
      ),
      search: (g) => g.members.join(" "),
    },
    {
      key: "desc",
      header: "描述",
      cell: (g) => (
        <span className="text-xs text-muted-foreground">
          {g.description ?? "—"}
        </span>
      ),
      search: (g) => g.description ?? "",
    },
    {
      key: "refs",
      header: "被引用",
      cell: (g) => <RefsPreview name={g.name} kind="service" />,
      search: (g) => String((xr.serviceUsedBy.get(g.name) ?? []).length),
    },
    {
      key: "line",
      header: "行号",
      cell: (g) => <LineLink line={g.lineNo} />,
      className: "w-20",
      hiddenWhenNoLineNo: true,
    },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">服务对象</h1>
      <Tabs defaultValue="svc">
        <TabsList>
          <TabsTrigger value="svc">
            服务对象 ({cfg.services.length})
          </TabsTrigger>
          <TabsTrigger value="grp">
            服务组 ({cfg.serviceGroups.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="svc" className="mt-4">
          <DataTable
            rows={cfg.services}
            columns={svcCols}
            filename="services.csv"
          />
        </TabsContent>
        <TabsContent value="grp" className="mt-4">
          <DataTable
            rows={cfg.serviceGroups}
            columns={sgCols}
            filename="service-groups.csv"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
