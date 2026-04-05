"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/discover", label: "Browse" },
  { href: "/tracked-channels", label: "Tracked Channels" },
  { href: "/collections", label: "Collections" },
  { href: "/settings", label: "Connections" },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <aside className="nav">
      <div className="brand">
        <div>
          <div style={{ fontWeight: 700 }}>OpenOutlier</div>
          <div className="subtle" style={{ fontSize: 13 }}>Find and save outliers</div>
        </div>
      </div>

      <nav className="nav-links">
        {links.map((link) => (
          <Link key={link.href} className={`nav-link ${pathname.startsWith(link.href) ? "active" : ""}`} href={link.href}>
            {link.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
