import type { ReactNode } from "react";
import "./globals.css";
import { AppNav } from "../components/nav";

export const metadata = {
  title: "OpenOutlier",
  description: "Open-source YouTube outlier research cockpit",
  icons: {
    icon: "/icon.png",
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <AppNav />
          <main className="content">{children}</main>
        </div>
      </body>
    </html>
  );
}
