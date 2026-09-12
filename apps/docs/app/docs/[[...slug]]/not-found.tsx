import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-start gap-4 py-20">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-[var(--color-fg-muted)]">
        This documentation page does not exist. It may have moved.
      </p>
      <Link href="/docs" className="font-medium underline">
        Back to the documentation index
      </Link>
    </div>
  );
}
