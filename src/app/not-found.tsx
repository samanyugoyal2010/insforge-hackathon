import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Not found · Node0",
  description: "This page does not exist.",
};

export default function NotFound() {
  return (
    <main className="min-h-screen bg-[#070709] font-sans text-zinc-100">
      <div className="mx-auto max-w-3xl px-4 pt-[calc(3.5rem+env(safe-area-inset-top)+2rem)] pb-16 sm:px-6 md:pb-20">
        <Link
          href="/"
          className="text-sm text-zinc-500 transition-colors hover:text-zinc-200"
        >
          ← Home
        </Link>

        <div className="mt-10">
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-zinc-50 md:text-3xl">
            Page not found
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-zinc-500">
            Check the link, or head back and continue from there.
          </p>
        </div>
      </div>
    </main>
  );
}
