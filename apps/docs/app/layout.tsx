import { RootProvider } from "fumadocs-ui/provider/next";
import Link from "next/link";
import "./globals.css";

export const metadata = {
  title: { default: "CandidLens Docs", template: "%s — CandidLens Docs" },
  description:
    "CandidLens documentation: open-source resume screening where every score quotes the resume line behind it, with audit trails and adverse-impact reporting.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <RootProvider>
          <header className="sticky top-0 z-40 border-b border-[var(--color-border)] backdrop-blur">
            <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center gap-4 px-4">
              <Link href="/" className="font-semibold tracking-tight">
                Candid<span style={{ color: "#ff6b57" }}>Lens</span>
                <span className="ml-2 text-sm" style={{ color: "var(--color-fg-muted)" }}>
                  Docs
                </span>
              </Link>
              <nav className="ml-auto flex items-center gap-4 text-sm">
                <Link href="/docs" className="hover:opacity-80">
                  Documentation
                </Link>
                <Link href="https://github.com/abhay-yemekar/hirelens" className="hover:opacity-80">
                  GitHub
                </Link>
              </nav>
            </div>
          </header>
          {children}
          <footer
            className="border-t border-[var(--color-border)] py-6 text-center text-xs"
            style={{ color: "var(--color-fg-muted)" }}
          >
            MIT licensed. Not legal advice — verify every AI-generated score before acting on it.
          </footer>
        </RootProvider>
      </body>
    </html>
  );
}
