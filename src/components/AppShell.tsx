import { Link, useLocation } from "@tanstack/react-router";
import { Settings2 } from "lucide-react";
import { useConfigStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useShowLineNumbers, useShowFullPortRange, useShowPolicyZone } from "@/lib/uiPrefs";

const nav = [
  { to: "/", label: "概览" },
  { to: "/search", label: "全局搜索" },
  { to: "/objects", label: "地址对象" },
  { to: "/services", label: "服务对象" },
  { to: "/policies", label: "策略" },
  { to: "/nat", label: "NAT" },
  { to: "/intermediaries", label: "中间节点" },
  { to: "/access-graph", label: "访问关系" },
  { to: "/audit", label: "审计" },
  { to: "/raw", label: "原文" },
] as const;

function DisplaySettings() {
  const [showLineNo, setShowLineNo] = useShowLineNumbers();
  const [showFullPort, setShowFullPort] = useShowFullPortRange();
  const [showPolicyZone, setShowPolicyZone] = useShowPolicyZone();
  const activeCount = (showLineNo ? 1 : 0) + (showFullPort ? 1 : 0);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 gap-1.5 px-2 text-xs text-muted-foreground"
          title="显示选项"
        >
          <Settings2 className="h-3.5 w-3.5" />
          <span>显示</span>
          {activeCount > 0 && (
            <span className="ml-0.5 rounded bg-primary/15 px-1 text-[10px] font-medium text-primary">
              {activeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        <div className="mb-2 text-xs font-medium text-muted-foreground">
          显示选项
        </div>
        <div className="space-y-3">
          <label className="flex cursor-pointer select-none items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm">显示行号</div>
              <div className="text-xs text-muted-foreground">
                仅用于追溯原始配置文本，平时无需打开
              </div>
            </div>
            <Switch
              checked={showLineNo}
              onCheckedChange={setShowLineNo}
              className="mt-0.5"
            />
          </label>
          <label className="flex cursor-pointer select-none items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm">显示全端口范围</div>
              <div className="text-xs text-muted-foreground">
                默认把 1-65535 显示为 any
              </div>
            </div>
            <Switch
              checked={showFullPort}
              onCheckedChange={setShowFullPort}
              className="mt-0.5"
            />
          </label>
          <label className="flex cursor-pointer select-none items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm">显示策略 Zone</div>
              <div className="text-xs text-muted-foreground">
                多数环境为 any→any，默认隐藏
              </div>
            </div>
            <Switch
              checked={showPolicyZone}
              onCheckedChange={setShowPolicyZone}
              className="mt-0.5"
            />
          </label>
        </div>
      </PopoverContent>
    </Popover>
  );
}

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
            <DisplaySettings />
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
