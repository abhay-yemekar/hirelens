import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="hl-site flex min-h-screen flex-col">
      <SiteNav />
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  );
}
