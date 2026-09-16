import Link from "next/link";
import { Logo } from "@/components/brand";

const COLUMNS: Array<{ title: string; links: Array<{ label: string; href: string }> }> = [
  {
    title: "Product",
    links: [
      { label: "Live demo", href: "/demo" },
      { label: "Features", href: "/#features" },
      { label: "How it works", href: "/#how-it-works" },
      { label: "Accuracy", href: "/evaluation" },
      { label: "Self-hosting", href: "/docs/self-hosting" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Documentation", href: "/docs" },
      { label: "Quickstart", href: "/docs/quickstart" },
      { label: "API reference", href: "/api-reference" },
      { label: "Troubleshooting", href: "/troubleshooting" },
      { label: "Roadmap", href: "/roadmap" },
    ],
  },
  {
    title: "Project",
    links: [
      { label: "GitHub", href: "https://github.com/abhay-yemekar/hirelens" },
      { label: "Contributing", href: "/contributing" },
      { label: "Code of Conduct", href: "/code-of-conduct" },
      { label: "Security", href: "/security" },
      { label: "Contact", href: "/contact" },
    ],
  },
];

const LEGAL = [
  { label: "Privacy", href: "/privacy" },
  { label: "Cookies", href: "/cookies" },
  { label: "Terms", href: "/terms" },
];

export function SiteFooter() {
  return (
    <footer
      className="border-t"
      style={{ borderColor: "var(--hl-border)", background: "var(--hl-ink-2)" }}
    >
      <div className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-10 px-4 py-14 md:grid-cols-4">
        <div className="col-span-2 md:col-span-1">
          <span className="text-[var(--hl-cream)]">
            <Logo />
          </span>
          <p className="mt-4 max-w-xs text-sm leading-6" style={{ color: "var(--hl-mist)" }}>
            Glass-box AI resume screening. Every score backed by evidence you can verify.
          </p>
          <a
            href="https://github.com/abhay-yemekar/hirelens"
            title="github.com/abhay-yemekar/hirelens"
            className="mt-4 inline-block"
          >
            <img
              src="https://img.shields.io/github/stars/abhay-yemekar/hirelens?style=flat&labelColor=0d1226&color=ff6b57"
              alt="GitHub stars for abhay-yemekar/hirelens"
              width={110}
              height={20}
            />
          </a>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <h3
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: "var(--hl-muted)" }}
            >
              {col.title}
            </h3>
            <ul className="mt-4 flex flex-col gap-2.5 text-sm">
              {col.links.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="transition-colors hover:text-[var(--hl-cream)]"
                    style={{ color: "var(--hl-mist)" }}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t" style={{ borderColor: "var(--hl-border)" }}>
        <div
          className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs sm:flex-row"
          style={{ color: "var(--hl-muted)" }}
        >
          <p>
            © {new Date().getFullYear()} HireLens · MIT · Built by{" "}
            <a
              href="https://www.linkedin.com/in/abhayyemekar/"
              className="transition-colors hover:text-[var(--hl-cream)]"
              style={{ color: "var(--hl-mist)" }}
            >
              Abhay Yemekar
            </a>
          </p>
          <div className="flex items-center gap-5">
            {LEGAL.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="transition-colors hover:text-[var(--hl-cream)]"
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
