import Link from "next/link";

export function SiteNavbar() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/[0.08] bg-[#070709]/95 pt-[env(safe-area-inset-top)]">
      <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6 md:h-16 md:px-8">
        <Link href="/" className="text-lg font-bold text-white tracking-tight">
          VirtualStage
        </Link>
        <Link
          href="/capture"
          className="rounded-full border border-white/15 bg-white/[0.06] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/[0.12]"
        >
          Create Tour
        </Link>
      </nav>
    </header>
  );
}
