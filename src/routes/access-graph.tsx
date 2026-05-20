import { createFileRoute } from "@tanstack/react-router";
import { useConfigStore } from "@/lib/store";
import type { NatRule, PolicyRule } from "@/lib/parser/types";
import { EmptyConfig } from "@/components/EmptyConfig";
import { Badge, LineLink } from "@/components/DataTable";
import { useShowLineNumbers } from "@/lib/uiPrefs";
import { useMemo, useState } from "react";
import type { ParsedConfig } from "@/lib/parser/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowRight } from "lucide-react";

export const Route = createFileRoute("/access-graph")({
  head: () => ({
    meta: [
      { title: "访问关系 · 防火墙配置审计台" },
      {
        name: "description",
        content: "选择源和目的，查看匹配的策略链与经过的 NAT/中间节点。",
      },
    ],
  }),
  component: AccessGraphPage,
});

/**
 * 把名称（地址对象 / 地址组 / "any" / 字面 IP）展开成「等价名称集合」。
 * 用于策略匹配：策略中的 srcAddr 写法可能是组名，而用户选的是组里的对象。
 */
function expandAddressNames(name: string, cfg: ParsedConfig): Set<string> {
  const out = new Set<string>([name]);
  if (name === "any") return out;
  const stack = [name];
  const seenGroup = new Set<string>();
  while (stack.length) {
    const cur = stack.pop()!;
    // 找包含 cur 的地址组
    cfg.addressGroups.forEach((g) => {
      if (seenGroup.has(g.name)) return;
      if (g.members.includes(cur)) {
        seenGroup.add(g.name);
        out.add(g.name);
        stack.push(g.name);
      }
    });
  }
  return out;
}



function classifyDst(name: string): string | undefined {
  const lower = name.toLowerCase();
  if (lower.includes("waf")) return "WAF";
  if (name.includes("堡垒")) return "堡垒机";
  if (
    name.includes("数据库网关") ||
    name.includes("api网关") ||
    lower.includes("api-") ||
    lower.includes("gateway")
  )
    return "网关";
  if (name.includes("代理") || lower.includes("proxy")) return "代理";
  return undefined;
}

function AccessGraphPage() {
  const { cfg } = useConfigStore();
  const [src, setSrc] = useState<string>("any");
  const [dst, setDst] = useState<string>("any");
  const [showLineNo] = useShowLineNumbers();


  const allNames = useMemo(() => {
    if (!cfg) return [] as string[];
    const s = new Set<string>(["any"]);
    cfg.addresses.forEach((a) => s.add(a.name));
    cfg.addressGroups.forEach((g) => s.add(g.name));
    return [...s].sort();
  }, [cfg]);

  const matched = useMemo(() => {
    if (!cfg) return { policies: [] as PolicyRule[], nats: [] as NatRule[] };
    const srcSet = expandAddressNames(src, cfg);
    const dstSet = expandAddressNames(dst, cfg);
    const policies = cfg.policies.filter(
      (p) =>
        (src === "any" || p.srcAddr === "any" || srcSet.has(p.srcAddr)) &&
        (dst === "any" || p.dstAddr === "any" || dstSet.has(p.dstAddr))
    );
    const nats = cfg.natRules.filter(
      (n) =>
        (src === "any" || n.srcAddr === "any" || srcSet.has(n.srcAddr)) &&
        (dst === "any" ||
          n.origDstAddr === "any" ||
          dstSet.has(n.origDstAddr) ||
          dstSet.has(n.translatedPool))
    );
    return { policies, nats };
  }, [cfg, src, dst]);

  if (!cfg) return <EmptyConfig />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">访问关系</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          选源和目的，按对象名匹配策略与 NAT。地址组会自动向上展开。
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">源</label>
          <Select value={src} onValueChange={setSrc}>
            <SelectTrigger className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-80">
              {allNames.map((n) => (
                <SelectItem key={n} value={n}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <ArrowRight className="mb-2 h-5 w-5 text-muted-foreground" />
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">目的</label>
          <Select value={dst} onValueChange={setDst}>
            <SelectTrigger className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-80">
              {allNames.map((n) => (
                <SelectItem key={n} value={n}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto text-xs text-muted-foreground">
          匹配 {matched.policies.length} 条策略 / {matched.nats.length} 条 NAT
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">链路示意</h2>
        <div className="overflow-x-auto rounded-lg border border-border bg-card p-6">
          {matched.policies.length === 0 && matched.nats.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              未匹配到任何策略或 NAT。
            </p>
          ) : (
            <ChainView
              src={src}
              dst={dst}
              policies={matched.policies}
              nats={matched.nats}
            />
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">
          匹配的策略（{matched.policies.length}）
        </h2>
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">动作</th>
                <th className="px-3 py-2 text-left">源</th>
                <th className="px-3 py-2 text-left">目的</th>
                <th className="px-3 py-2 text-left">服务</th>
                <th className="px-3 py-2 text-left">调度</th>
                <th className="px-3 py-2 text-left">行号</th>
              </tr>
            </thead>
            <tbody>
              {matched.policies.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-3 py-1.5 font-mono">{p.id}</td>
                  <td className="px-3 py-1.5">
                    <Badge tone={p.action === "permit" ? "ok" : "danger"}>
                      {p.action}
                    </Badge>
                  </td>
                  <td className="px-3 py-1.5 font-mono text-xs">{p.srcAddr}</td>
                  <td className="px-3 py-1.5 font-mono text-xs">{p.dstAddr}</td>
                  <td className="px-3 py-1.5 font-mono text-xs">{p.service}</td>
                  <td className="px-3 py-1.5 text-xs">{p.schedule}</td>
                  <td className="px-3 py-1.5">
                    <LineLink line={p.lineNo} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">
          匹配的 NAT（{matched.nats.length}）
        </h2>
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">源</th>
                <th className="px-3 py-2 text-left">原目的/端口</th>
                <th className="px-3 py-2 text-left">→ 转换为</th>
                <th className="px-3 py-2 text-left">描述</th>
                <th className="px-3 py-2 text-left">行号</th>
              </tr>
            </thead>
            <tbody>
              {matched.nats.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-1.5 font-mono">{r.id}</td>
                  <td className="px-3 py-1.5 font-mono text-xs">{r.srcAddr}</td>
                  <td className="px-3 py-1.5 font-mono text-xs">
                    {r.origDstAddr} · {r.origDstService}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-xs">
                    {r.translatedPool}
                    {r.servicePort ? `:${r.servicePort}` : ""}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">
                    {r.description ?? "—"}
                  </td>
                  <td className="px-3 py-1.5">
                    <LineLink line={r.lineNo} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ChainView({
  src,
  dst,
  policies,
  nats,
}: {
  src: string;
  dst: string;
  policies: PolicyRule[];
  nats: NatRule[];
}) {
  // 中间节点：从 NAT 的 translatedPool 与策略的 dstAddr 中识别
  const inter = new Set<string>();
  nats.forEach((n) => {
    const c = classifyDst(n.translatedPool);
    if (c) inter.add(`${c}: ${n.translatedPool}`);
  });
  policies.forEach((p) => {
    const c = classifyDst(p.dstAddr);
    if (c) inter.add(`${c}: ${p.dstAddr}`);
  });

  return (
    <div className="flex flex-wrap items-center gap-3">
      <ChainNode label="源" name={src} tone="src" />
      {[...inter].map((it) => (
        <span key={it} className="flex items-center gap-3">
          <ArrowRight className="h-5 w-5 text-muted-foreground" />
          <ChainNode label="中间节点" name={it} tone="mid" />
        </span>
      ))}
      <ArrowRight className="h-5 w-5 text-muted-foreground" />
      <ChainNode label="目的" name={dst} tone="dst" />
      <div className="ml-4 text-xs text-muted-foreground">
        {policies.length} 条策略 · {nats.length} 条 NAT
      </div>
    </div>
  );
}

function ChainNode({
  label,
  name,
  tone,
}: {
  label: string;
  name: string;
  tone: "src" | "mid" | "dst";
}) {
  const cls =
    tone === "src"
      ? "border-emerald-500/50 bg-emerald-500/10"
      : tone === "dst"
        ? "border-blue-500/50 bg-blue-500/10"
        : "border-amber-500/50 bg-amber-500/10";
  return (
    <div className={`rounded-lg border px-3 py-2 ${cls}`}>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="font-mono text-sm">{name}</div>
    </div>
  );
}
