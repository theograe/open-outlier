"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/discover", label: "Discover" },
  { href: "/projects", label: "Projects" },
  { href: "/boards", label: "Boards" },
  { href: "/ideas", label: "Ideas" },
  { href: "/settings", label: "Settings" },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <aside className="nav">
      <div className="brand">
        <div>
          <div style={{ fontWeight: 700 }}>OpenOutlier</div>
          <div className="subtle" style={{ fontSize: 13 }}>Agent-first research</div>
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
