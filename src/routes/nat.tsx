import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useConfigStore } from "@/lib/store";
import { EmptyConfig } from "@/components/EmptyConfig";
import { Badge, DataTable, LineLink, type Column } from "@/components/DataTable";
import { ObjectName } from "@/components/ObjectPreview";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { NatRule } from "@/lib/parser/types";

export const Route = createFileRoute("/nat")({
  head: () => ({
    meta: [
      { title: "NAT · 防火墙配置审计台" },
      {
        name: "description",
        content: "查看 NAT 池、目的 NAT (DNAT) 与源 NAT (SNAT) 规则。",
      },
    ],
  }),
  component: NatPage,
});

function NatPage() {
  const { cfg } = useConfigStore();

  const dnatRules = useMemo(
    () =>
      cfg?.natRules.filter(
        (r) => r.kind === "destination" || r.kind === "static"
      ) ?? [],
    [cfg]
  );
  const snatRules = useMemo(
    () => cfg?.natRules.filter((r) => r.kind === "source") ?? [],
    [cfg]
  );

  if (!cfg) return <EmptyConfig />;


  const statusCol: Column<NatRule> = {
    key: "status",
    header: "状态",
    cell: (r) => (
      <div className="flex gap-1">
        {r.disabled && <Badge tone="muted">已禁用</Badge>}
        {r.log && <Badge tone="default">log</Badge>}
      </div>
    ),
    search: (r) => `${r.disabled ? "disabled" : ""} ${r.log ? "log" : ""}`,
  };

  const idCol: Column<NatRule> = {
    key: "id",
    header: "#ID",
    cell: (r) => <span className="font-mono">{r.id}</span>,
    search: (r) => r.id,
    className: "w-16",
  };

  const ifaceCol: Column<NatRule> = {
    key: "iface",
    header: "接口",
    cell: (r) => <span className="font-mono text-xs">{r.iface}</span>,
    search: (r) => r.iface,
  };

  const descCol: Column<NatRule> = {
    key: "desc",
    header: "描述",
    cell: (r) => (
      <span className="text-xs text-muted-foreground">
        {r.description ?? "—"}
      </span>
    ),
    search: (r) => r.description ?? "",
  };

  const lineCol: Column<NatRule> = {
    key: "line",
    header: "行号",
    cell: (r) => <LineLink line={r.lineNo} />,
    className: "w-20",
    hiddenWhenNoLineNo: true,
  };

  const dnatCols: Column<NatRule>[] = [
    idCol,
    statusCol,
    ifaceCol,
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
          <div>
            <ObjectName name={r.origDstService} />
          </div>
        </div>
      ),
      search: (r) => `${r.origDstAddr} ${r.origDstService}`,
    },
    {
      key: "trans",
      header: "转换为目的",
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
    descCol,
    lineCol,
  ];

  const snatCols: Column<NatRule>[] = [
    idCol,
    statusCol,
    ifaceCol,
    {
      key: "src",
      header: "原始源",
      cell: (r) => <ObjectName name={r.srcAddr} />,
      search: (r) => r.srcAddr,
    },
    {
      key: "dst",
      header: "目的",
      cell: (r) => <ObjectName name={r.origDstAddr} />,
      search: (r) => r.origDstAddr,
    },
    {
      key: "trans",
      header: "转换为源",
      cell: (r) => (
        <div className="space-y-0.5">
          {r.translatedSrc ? (
            <ObjectName name={r.translatedSrc} />
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
          {r.egressInterface && (
            <Badge tone="default">出接口取址</Badge>
          )}
        </div>
      ),
      search: (r) =>
        `${r.translatedSrc ?? ""} ${r.egressInterface ? "interface" : ""}`,
    },
    descCol,
    lineCol,
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
        或把内部源改写为对外可路由地址，是「源地址不一致」的根源。
      </p>
      <Tabs defaultValue="dnat">
        <TabsList>
          <TabsTrigger value="dnat">
            目的 NAT ({dnatRules.length})
          </TabsTrigger>
          <TabsTrigger value="snat">
            源 NAT ({snatRules.length})
          </TabsTrigger>
          <TabsTrigger value="pools">
            NAT 池 ({cfg.natPools.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="dnat" className="mt-4">
          <DataTable
            rows={dnatRules}
            columns={dnatCols}
            filename="nat-destination.csv"
          />
        </TabsContent>
        <TabsContent value="snat" className="mt-4">
          <DataTable
            rows={snatRules}
            columns={snatCols}
            filename="nat-source.csv"
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
