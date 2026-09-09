import type { JSX, ReactNode } from "react";

export const metadata = {
  title: "HireLens",
  description:
    "Open-source, glass-box hiring intelligence. Rank candidates with evidence you can defend.",
};

export default function RootLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
