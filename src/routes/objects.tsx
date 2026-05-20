import { createFileRoute } from "@tanstack/react-router";
import { useConfigStore } from "@/lib/store";
import { EmptyConfig } from "@/components/EmptyConfig";
import { Badge, DataTable, LineLink, type Column } from "@/components/DataTable";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/objects")({
  head: () => ({
    meta: [
      { title: "地址对象 · 防火墙配置审计台" },
      {
        name: "description",
        content: "查看所有地址对象与地址组、成员、引用关系。",
      },
    ],
  }),
  component: ObjectsPage,
});

function ObjectsPage() {
  const { cfg, xr } = useConfigStore();
  if (!cfg || !xr) return <EmptyConfig />;

  const addrCols: Column<(typeof cfg.addresses)[number]>[] = [
    {
      key: "name",
      header: "名称",
      cell: (a) => <span className="font-medium">{a.name}</span>,
      search: (a) => a.name,
    },
    {
      key: "entries",
      header: "内容",
      cell: (a) => (
        <div className="space-y-0.5 font-mono text-xs">
          {a.entries.map((e, i) => (
            <div key={i}>
              <Badge tone="muted">{e.kind}</Badge> {e.value}
            </div>
          ))}
        </div>
      ),
      search: (a) => a.entries.map((e) => `${e.kind} ${e.value}`).join(" "),
    },
    {
      key: "desc",
      header: "描述",
      cell: (a) => (
        <span className="text-xs text-muted-foreground">
          {a.description ?? "—"}
        </span>
      ),
      search: (a) => a.description ?? "",
    },
    {
      key: "refs",
      header: "被引用",
      cell: (a) => {
        const refs = xr.addressUsedBy.get(a.name) ?? [];
        if (refs.length === 0)
          return <Badge tone="warn">未引用</Badge>;
        return (
          <span className="text-xs">
            {refs.length} 处（
            {[...new Set(refs.map((r) => r.by))].join(", ")}）
          </span>
        );
      },
      search: (a) =>
        String((xr.addressUsedBy.get(a.name) ?? []).length),
    },
    {
      key: "line",
      header: "行号",
      cell: (a) => <LineLink line={a.lineNo} />,
      className: "w-20",
    },
  ];

  const groupCols: Column<(typeof cfg.addressGroups)[number]>[] = [
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
        <div className="space-y-0.5 font-mono text-xs">
          {g.members.map((m, i) => (
            <div key={i}>{m}</div>
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
      cell: (g) => {
        const refs = xr.addressUsedBy.get(g.name) ?? [];
        if (refs.length === 0) return <Badge tone="warn">未引用</Badge>;
        return <span className="text-xs">{refs.length} 处</span>;
      },
      search: (g) =>
        String((xr.addressUsedBy.get(g.name) ?? []).length),
    },
    {
      key: "line",
      header: "行号",
      cell: (g) => <LineLink line={g.lineNo} />,
      className: "w-20",
    },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">地址对象</h1>
      <Tabs defaultValue="addr">
        <TabsList>
          <TabsTrigger value="addr">
            地址对象 ({cfg.addresses.length})
          </TabsTrigger>
          <TabsTrigger value="grp">
            地址组 ({cfg.addressGroups.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="addr" className="mt-4">
          <DataTable
            rows={cfg.addresses}
            columns={addrCols}
            filename="addresses.csv"
          />
        </TabsContent>
        <TabsContent value="grp" className="mt-4">
          <DataTable
            rows={cfg.addressGroups}
            columns={groupCols}
            filename="address-groups.csv"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
