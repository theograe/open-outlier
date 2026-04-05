"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/discover", label: "Browse" },
  { href: "/tracked-channels", label: "Tracked Channels" },
  { href: "/collections", label: "Collections" },
  { href: "/settings", label: "Settings" },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <aside className="nav">
      <div className="brand">
        <Image
          src="/openoutlier-logo.png"
          alt="OpenOutlier"
          width={172}
          height={172}
          className="brand-image"
          priority
        />
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
