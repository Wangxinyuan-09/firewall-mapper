import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useConfigStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getNodeAggregates, isIpLiteral, serviceToPorts } from "@/lib/access";
import { downloadExcel, type ExportTable } from "@/lib/export";
import type { ParsedConfig } from "@/lib/parser/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "概览 · 防火墙配置审计台" },
      {
        name: "description",
        content:
          "上传防火墙配置文件，查看对象、策略、NAT、中间节点统计与风险概览。",
      },
    ],
  }),
  component: IndexPage,
});

type GlobalSearchResults = {
  query: string;
  nat: ParsedConfig["natRules"];
  intermediaries: ReturnType<typeof getNodeAggregates>;
  services: ParsedConfig["services"];
  serviceGroups: ParsedConfig["serviceGroups"];
};

function IndexPage() {
  const { cfg, xr, audit, loadText, fileName } = useConfigStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [globalQuery, setGlobalQuery] = useState("");

  const onFile = async (f: File) => {
    setLoading(true);
    const text = await f.text();
    loadText(text, f.name);
    setLoading(false);
  };

  const globalResults = useMemo<GlobalSearchResults>(() => {
    const q = globalQuery.trim().toLowerCase();
    if (!cfg || !xr || !q) {
      return {
        query: q,
        nat: [],
        intermediaries: [],
        services: [],
        serviceGroups: [],
      };
    }

    const isIp = isIpLiteral(q);
    const ipNames = new Set<string>(isIp ? xr.ipToNames.get(q) ?? [] : []);
    const matchesText = (text?: string) =>
      !!text && text.toLowerCase().includes(q);
    const matchesServiceValue = (serviceName: string) =>
      matchesText(serviceName) ||
      serviceToPorts(serviceName, cfg).some((p) => p.toLowerCase().includes(q));
    const matchesAddressName = (name?: string) =>
      !!name && (matchesText(name) || ipNames.has(name));

    const nat = cfg.natRules.filter((r) => {
      const addressHit =
        matchesAddressName(r.srcAddr) ||
        matchesAddressName(r.origDstAddr) ||
        matchesAddressName(r.translatedPool) ||
        matchesAddressName(r.translatedSrc) ||
        matchesText(r.id) ||
        matchesText(r.iface);
      const serviceHit =
        matchesServiceValue(r.origDstService ?? "") ||
        matchesText(r.servicePort ?? "");
      return addressHit || serviceHit;
    });

    const intermediaries = getNodeAggregates(cfg).filter((node) => {
      const basicHit =
        matchesText(node.name) || matchesText(node.address ?? "") ||
        node.exposedPorts.some((p) => p.toLowerCase().includes(q));
      const policyHit =
        node.inboundPolicies.some((p) => matchesServiceValue(p.service)) ||
        node.outboundPolicies.some((p) => matchesServiceValue(p.service));
      return basicHit || policyHit;
    });

    const services = cfg.services.filter((s) => {
      const entryHit = s.entries.some(
        (e) =>
          matchesText(e.protocol) ||
          matchesText(e.destPort ?? "") ||
          matchesText(e.sourcePort ?? "") ||
          matchesText(`${e.protocol}/${e.destPort ?? ""}`)
      );
      return (
        matchesText(s.name) ||
        matchesText(s.description ?? "") ||
        entryHit ||
        serviceToPorts(s.name, cfg).some((p) => p.toLowerCase().includes(q))
      );
    });

    const serviceGroups = cfg.serviceGroups.filter((g) => {
      const memberHit = g.members.some((m) =>
        matchesText(m) ||
        serviceToPorts(m, cfg).some((p) => p.toLowerCase().includes(q))
      );
      return (
        matchesText(g.name) ||
        matchesText(g.description ?? "") ||
        memberHit
      );
    });

    return { query: q, nat, intermediaries, services, serviceGroups };
  }, [globalQuery, cfg, xr]);

  const onExportAll = () => {
    if (!cfg) return;

    const nodeRows = getNodeAggregates(cfg).map((n) => [
      n.cat,
      n.name,
      n.address ?? "",
      n.inboundDnat.length,
      n.inboundPolicies.length,
      n.outboundPolicies.length,
      n.lineNo ?? "",
    ]);

    const tables: ExportTable[] = [
      {
        label: "地址对象",
        headers: ["名称", "内容", "描述", "行号"],
        rows: cfg.addresses.map((a) => [
          a.name,
          a.entries.map((e) => `${e.kind} ${e.value}`).join("; "),
          a.description ?? "",
          a.lineNo,
        ]),
      },
      {
        label: "地址组",
        headers: ["名称", "成员", "描述", "行号"],
        rows: cfg.addressGroups.map((g) => [
          g.name,
          g.members.join("; "),
          g.description ?? "",
          g.lineNo,
        ]),
      },
      {
        label: "服务对象",
        headers: ["名称", "内容", "描述", "行号"],
        rows: cfg.services.map((s) => [
          s.name,
          s.entries
            .map((e) =>
              e.destPort ? `${e.protocol}/${e.destPort}` : e.protocol
            )
            .join("; "),
          s.description ?? "",
          s.lineNo,
        ]),
      },
      {
        label: "服务组",
        headers: ["名称", "成员", "描述", "行号"],
        rows: cfg.serviceGroups.map((g) => [
          g.name,
          g.members.join("; "),
          g.description ?? "",
          g.lineNo,
        ]),
      },
      {
        label: "策略",
        headers: [
          "ID",
          "源",
          "目的",
          "服务",
          "期限",
          "动作",
          "行号",
        ],
        rows: cfg.policies.map((p) => [
          p.id,
          p.srcAddr,
          p.dstAddr,
          p.service,
          p.schedule,
          p.action,
          p.lineNo,
        ]),
      },
      {
        label: "NAT 目的规则",
        headers: [
          "ID",
          "接口",
          "源",
          "原目的",
          "原服务",
          "转换目的",
          "服务端口",
          "行号",
        ],
        rows: cfg.natRules
          .filter((r) => r.kind === "destination" || r.kind === "static")
          .map((r) => [
            r.id,
            r.iface,
            r.srcAddr,
            r.origDstAddr,
            r.origDstService,
            r.translatedPool,
            r.servicePort ?? "",
            r.lineNo,
          ]),
      },
      {
        label: "NAT 源规则",
        headers: [
          "ID",
          "接口",
          "源",
          "原目的",
          "转换后源",
          "出接口取址",
          "行号",
        ],
        rows: cfg.natRules
          .filter((r) => r.kind === "source")
          .map((r) => [
            r.id,
            r.iface,
            r.srcAddr,
            r.origDstAddr,
            r.translatedSrc ?? "",
            r.egressInterface ? "是" : "",
            r.lineNo,
          ]),
      },
      {
        label: "NAT 池",
        headers: ["名称", "起始地址", "结束地址", "描述", "行号"],
        rows: cfg.natPools.map((p) => [
          p.name,
          p.addressFrom ?? "",
          p.addressTo ?? "",
          p.description ?? "",
          p.lineNo,
        ]),
      },
      {
        label: "接口",
        headers: ["名称", "IP", "属性", "行号"],
        rows: cfg.interfaces.map((i) => [
          i.name,
          i.ips.join("; "),
          i.attrs.join("; "),
          i.lineNo,
        ]),
      },
      {
        label: "计划",
        headers: ["类型", "名称", "描述", "绝对时间", "周期", "行号"],
        rows: cfg.schedules.map((s) => [
          s.kind,
          s.name,
          s.description ?? "",
          s.absolute ?? "",
          s.periodic ?? "",
          s.lineNo,
        ]),
      },
      {
        label: "中间节点",
        headers: [
          "类别",
          "名称",
          "地址",
          "DNAT 引用",
          "入站策略",
          "出站策略",
          "行号",
        ],
        rows: nodeRows,
      },
      {
        label: "审计提示",
        headers: [
          "等级",
          "类别",
          "标题",
          "详情",
          "关联行号",
          "对象类型",
          "对象名称",
        ],
        rows: audit.map((a) => [
          a.severity,
          a.category,
          a.title,
          a.detail,
          a.refLine ?? "",
          a.refKind ?? "",
          a.refName ?? "",
        ]),
      },
    ];

    downloadExcel("firewall-mapper-all.xlsx", tables);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>上传防火墙配置</CardTitle>
          <CardDescription>
            支持 Topsec 风格 SYSCONFIG.TXT 文本配置。文件在浏览器本地解析，
            <strong> 不会上传到任何服务器</strong>，可放心使用。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div
            className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-secondary/40 p-8 text-center"
            onDragOver={(e) => e.preventDefault()}
            onDrop={async (e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) await onFile(f);
            }}
          >
            <p className="text-sm text-muted-foreground">
              拖拽配置文件到此处，或点击下方按钮选择
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.cfg,.conf,text/plain"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) await onFile(f);
              }}
            />
            <Button
              className="mt-3"
              onClick={() => fileRef.current?.click()}
              disabled={loading}
            >
              {loading ? "解析中…" : "选择文件"}
            </Button>
            {fileName && (
              <p className="mt-3 text-xs text-muted-foreground">
                当前：<span className="font-mono">{fileName}</span>
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {cfg && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>全局搜索</CardTitle>
              <CardDescription>
                输入 IP、服务名或端口号，可同时查看相关 NAT、一体化、服务组和服务对象。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="搜索 IP / 服务 / 端口"
                value={globalQuery}
                onChange={(e) => setGlobalQuery(e.target.value)}
                className="max-w-lg"
              />
              {globalResults.query ? (
                <>
                <div className="grid gap-3 xl:grid-cols-4">
                  <div className="rounded-lg border border-border bg-card p-4">
                    <div className="text-sm font-medium">NAT 规则</div>
                    <div className="mt-2 text-3xl font-semibold">
                      {globalResults.nat.length}
                    </div>
                    <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                      {globalResults.nat.slice(0, 3).map((r) => (
                        <div key={r.id}>
                          #{r.id} {r.srcAddr} → {r.dstAddr} {r.origDstService || r.servicePort || ""}
                        </div>
                      ))}
                      {globalResults.nat.length > 3 && (
                        <div>共 {globalResults.nat.length} 条</div>
                      )}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-4">
                    <div className="text-sm font-medium">一体化节点</div>
                    <div className="mt-2 text-3xl font-semibold">
                      {globalResults.intermediaries.length}
                    </div>
                    <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                      {globalResults.intermediaries.slice(0, 3).map((n) => (
                        <div key={n.name}>
                          {n.name} {n.address ? `· ${n.address}` : ""}
                        </div>
                      ))}
                      {globalResults.intermediaries.length > 3 && (
                        <div>共 {globalResults.intermediaries.length} 条</div>
                      )}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-4">
                    <div className="text-sm font-medium">服务对象</div>
                    <div className="mt-2 text-3xl font-semibold">
                      {globalResults.services.length}
                    </div>
                    <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                      {globalResults.services.slice(0, 3).map((s) => (
                        <div key={s.name}>{s.name}</div>
                      ))}
                      {globalResults.services.length > 3 && (
                        <div>共 {globalResults.services.length} 条</div>
                      )}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-4">
                    <div className="text-sm font-medium">服务组</div>
                    <div className="mt-2 text-3xl font-semibold">
                      {globalResults.serviceGroups.length}
                    </div>
                    <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                      {globalResults.serviceGroups.slice(0, 3).map((g) => (
                        <div key={g.name}>{g.name}</div>
                      ))}
                      {globalResults.serviceGroups.length > 3 && (
                        <div>共 {globalResults.serviceGroups.length} 条</div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Link
                    to="/search"
                    search={globalResults.query ? { q: globalResults.query } : undefined}
                    className="text-sm text-primary hover:underline"
                  >
                    查看全部结果 →
                  </Link>
                </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  在此处输入 IP、服务名或端口号，可快速定位对应的 NAT / 一体化 / 服务组 / 服务对象。
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>导出全部模块</CardTitle>
              <CardDescription>
                在概览页可以一次性导出所有模块为一个包含多个 sheet 的 Excel 文件，原来的模块页面 CSV 导出功能保持不变。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button size="sm" variant="outline" onClick={onExportAll}>
                导出全部模块（Excel）
              </Button>
            </CardContent>
          </Card>

          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">概览</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="地址对象" value={cfg.addresses.length} to="/objects" />
              <Stat label="地址组" value={cfg.addressGroups.length} to="/objects" />
              <Stat label="服务对象" value={cfg.services.length} to="/services" />
              <Stat label="服务组" value={cfg.serviceGroups.length} to="/services" />
              <Stat label="策略" value={cfg.policies.length} to="/policies" />
              <Stat label="NAT 规则" value={cfg.natRules.length} to="/nat" />
              <Stat label="NAT 池" value={cfg.natPools.length} to="/nat" />
              <Stat
                label="中间节点"
                value={cfg.intermediaries.length}
                to="/intermediaries"
              />
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">审计提示</h2>
              <Link
                to="/audit"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                查看全部 →
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <SeverityStat
                label="高风险"
                value={audit.filter((a) => a.severity === "high").length}
                color="bg-destructive/15 text-destructive"
              />
              <SeverityStat
                label="警告"
                value={audit.filter((a) => a.severity === "warn").length}
                color="bg-yellow-500/15 text-yellow-700 dark:text-yellow-400"
              />
              <SeverityStat
                label="提示"
                value={audit.filter((a) => a.severity === "info").length}
                color="bg-secondary text-muted-foreground"
              />
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  to,
}: {
  label: string;
  value: number;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="block rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50"
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-2xl font-semibold">{value}</div>
    </Link>
  );
}

function SeverityStat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className={`rounded-lg p-4 ${color}`}>
      <div className="text-xs">{label}</div>
      <div className="mt-1 font-mono text-2xl font-semibold">{value}</div>
    </div>
  );
}
