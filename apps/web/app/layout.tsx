import type { Metadata } from "next";
import { normalizeOrigin } from "../src/lib/site-url";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "HireLens — See why, not just who",
    template: "%s",
  },
  description: "RAG + LLM powered resume screening with auditable evidence.",
  metadataBase: new URL(normalizeOrigin(process.env["NEXT_PUBLIC_SITE_URL"])),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
