"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowRightLeft,
  BarChart3,
  BookOpen,
  CheckSquare,
  ClipboardList,
  Network,
  ScrollText,
  Settings2,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/markets", label: "Markets", icon: TrendingUp },
  { href: "/arb", label: "Arb Scanner", icon: ArrowRightLeft },
  { href: "/rules", label: "Rules", icon: BookOpen },
  { href: "/audit", label: "Audit", icon: ScrollText },
  { href: "/approvals", label: "Approvals", icon: CheckSquare },
  { href: "/positions", label: "Positions", icon: BarChart3 },
  { href: "/signals", label: "Signals", icon: Settings2 },
  { href: "/architecture", label: "Architecture", icon: Network },
];

export function NavSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-56 flex-col border-r bg-card px-3 py-4">
      <div className="mb-6 flex items-center gap-2 px-2">
        <ClipboardList className="h-5 w-5 text-primary" />
        <span className="font-semibold text-sm tracking-tight">Polymarket Bot</span>
      </div>
      <nav className="flex flex-col gap-1">
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
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
