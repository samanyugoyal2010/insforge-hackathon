import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy · Node0",
  description: "Node0 privacy policy.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#070709] font-sans text-zinc-100">
      <div className="mx-auto max-w-3xl px-4 pt-[calc(3.5rem+env(safe-area-inset-top)+2rem)] pb-16 sm:px-6 md:pb-20">
      <Link
        href="/"
        className="text-sm text-zinc-500 transition-colors hover:text-zinc-200"
      >
        ← Home
      </Link>
      <div className="mt-8 rounded-2xl border border-white/[0.06] bg-zinc-950/40 p-6 backdrop-blur-md sm:p-7">
        <h1 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">
          Privacy Policy
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-500">
          Node0 is a demo dashboard. This policy describes how the demo stores
          data and how you can expect it to behave.
        </p>

        <section className="mt-6 space-y-5">
          <div>
            <h2 className="font-heading text-base font-semibold text-zinc-100">
              1. Scope
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-500">
              This privacy policy applies to the Node0 demo interface and any
              related pages (including the AR demo page).
            </p>
          </div>

          <div>
            <h2 className="font-heading text-base font-semibold text-zinc-100">
              2. Data stored by the demo
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-500">
              The demo stores workspace state in your browser’s
              <code className="mx-1 rounded bg-white/[0.06] px-1 py-0.5 text-[11px] text-zinc-300">
                sessionStorage
              </code>
              so you can continue iterating during the current browser session.
              This includes:
            </p>
            <ul className="mt-2 list-inside list-disc space-y-2 text-sm leading-relaxed text-zinc-500">
              <li>Mock authentication state for UI gating</li>
              <li>Project list and per-project chat messages (demo)</li>
              <li>Draft BOM content and CAD/PCB parameters (demo)</li>
            </ul>
          </div>

          <div>
            <h2 className="font-heading text-base font-semibold text-zinc-100">
              3. Data processing in the demo
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-500">
              This demo does not send your prompt to a remote AI service. Instead,
              it uses local logic to generate a simulated BOM and update demo
              panel defaults.
            </p>
          </div>

          <div>
            <h2 className="font-heading text-base font-semibold text-zinc-100">
              4. QR codes and external services
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-500">
              The AR preview uses a third-party QR code generator to render the
              code. The QR payload is the link to your local AR demo page.
            </p>
          </div>

          <div>
            <h2 className="font-heading text-base font-semibold text-zinc-100">
              5. Your controls
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-500">
              You can reset the demo workspace from the dashboard settings. You can
              also clear your browser’s session data.
            </p>
          </div>
        </section>

        <p className="mt-8 text-xs leading-relaxed text-zinc-600">
          This is demo policy text and not legal advice. Replace before launching
          to real users in production.
        </p>
      </div>
      </div>
    </main>
  );
}
