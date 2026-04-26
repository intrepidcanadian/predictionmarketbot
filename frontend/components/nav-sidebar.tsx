"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowRightLeft,
  BarChart3,
  BookOpen,
  CheckSquare,
  ClipboardList,
  Moon,
  Network,
  ScrollText,
  Settings2,
  Sun,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/markets",      label: "Markets",      icon: TrendingUp },
  { href: "/arb",          label: "Arb Scanner",  icon: ArrowRightLeft },
  { href: "/rules",        label: "Rules",        icon: BookOpen },
  { href: "/audit",        label: "Audit",        icon: ScrollText },
  { href: "/approvals",    label: "Approvals",    icon: CheckSquare },
  { href: "/positions",    label: "Positions",    icon: BarChart3 },
  { href: "/signals",      label: "Signals",      icon: Settings2 },
  { href: "/architecture", label: "Architecture", icon: Network },
];

export function NavSidebar() {
  const pathname = usePathname();
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("dark-mode") === "true";
    setDark(stored);
    document.documentElement.classList.toggle("dark", stored);
  }, []);

  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("dark-mode", String(next));
  };

  return (
    <aside className="flex h-full w-56 flex-col border-r bg-sidebar px-3 py-4 shrink-0">
      <div className="mb-6 flex items-center gap-2 px-2">
        <div className="size-6 rounded-md bg-foreground text-background grid place-items-center text-[11px] font-bold shrink-0">
          PB
        </div>
        <span className="font-semibold text-sm tracking-tight">Polymarket Bot</span>
      </div>

      <nav className="flex flex-col gap-0.5">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto px-2 space-y-2">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
          executor running
        </div>
        <button
          onClick={toggleDark}
          className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          {dark ? <Sun className="size-3.5 shrink-0" /> : <Moon className="size-3.5 shrink-0" />}
          {dark ? "Light mode" : "Dark mode"}
        </button>
      </div>
    </aside>
  );
}
