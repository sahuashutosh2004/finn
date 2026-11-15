"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { buildAlerts, type AlertInput } from "@/lib/alerts";
import { useSettings } from "@/lib/settings";
import { unseenCount, useTriage } from "@/lib/triageStore";

type Tab = { href: string; label: string; badge?: number };

export default function AppHeader({ alertInput }: { alertInput: AlertInput | null }) {
  const pathname = usePathname();
  const settings = useSettings();
  const triage = useTriage();
  const alertCount = alertInput ? unseenCount(buildAlerts(alertInput, settings).map((a) => a.key), triage) : 0;
  const TABS: Tab[] = [
    { href: "/", label: "Brief" },
    { href: "/alerts", label: "Alerts", badge: alertCount },
    { href: "/company", label: "Company" },
  ];

  return (
    <header className="sticky top-0 z-30 -mx-4 border-b border-divider bg-bg/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <div className="flex h-12 items-center justify-between">
        <Link href="/" className="text-[20px] font-bold tracking-[-0.03em]">
          FINN
        </Link>
        <Link
          href="/company?focus=1"
          aria-label="Search companies"
          className="-mr-2.5 flex size-11 items-center justify-center text-fg transition-opacity duration-150 active:opacity-60"
        >
          <Search size={20} strokeWidth={2} aria-hidden />
        </Link>
      </div>
      <nav aria-label="Sections">
        <ul className="flex gap-6">
          {TABS.map(({ href, label, badge }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex h-10 items-center gap-1.5 text-[15px] transition-colors duration-150 active:opacity-60 ${
                    active ? "font-semibold text-fg" : "font-medium text-muted"
                  }`}
                >
                  {label}
                  {badge ? (
                    <span aria-label={`${badge} new alerts`} className="flex h-4 min-w-4 items-center justify-center rounded-full bg-down px-1 text-[10px] font-semibold leading-none text-white">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  ) : null}
                  {active ? <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent" /> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
