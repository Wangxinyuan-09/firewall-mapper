import { Link, useLocation } from "@tanstack/react-router";
import { useConfigStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useShowLineNumbers } from "@/lib/uiPrefs";

const nav = [
  { to: "/", label: "概览" },
  { to: "/objects", label: "地址对象" },
  { to: "/services", label: "服务对象" },
  { to: "/policies", label: "策略" },
  { to: "/nat", label: "NAT" },
  { to: "/intermediaries", label: "中间节点" },
  { to: "/access-graph", label: "访问关系" },
  { to: "/audit", label: "审计" },
  { to: "/raw", label: "原文" },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const { cfg, fileName, clear } = useConfigStore();
  const loc = useLocation();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-3 px-4 py-3">
          <Link to="/" className="font-semibold tracking-tight">
            防火墙配置审计台
          </Link>
          <nav className="flex flex-1 flex-wrap gap-1">
            {nav.map((n) => {
              const active = loc.pathname === n.to;
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={cn(
                    "rounded px-2.5 py-1 text-sm transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  )}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {cfg ? (
              <>
                <span className="rounded bg-secondary px-2 py-1 font-mono">
                  {fileName ?? "config"} · {cfg.meta.totalLines} 行
                </span>
                <Button size="sm" variant="ghost" onClick={clear}>
                  清除
                </Button>
              </>
            ) : (
              <span>未加载配置</span>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-4 py-6">{children}</main>
    </div>
  );
}
