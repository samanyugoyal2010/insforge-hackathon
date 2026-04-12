import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service · Node0",
  description: "Node0 terms of service.",
};

export default function TermsPage() {
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
          Terms of Service
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-500">
          Node0 is a demo interface for hardware-oriented “build in seconds”
          workflows. This page describes how the demo behaves and what you agree
          to when using it.
        </p>

        <section className="mt-6 space-y-5">
          <div>
            <h2 className="font-heading text-base font-semibold text-zinc-100">
              1. Acceptance of these terms
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-500">
              By using this demo, you agree to follow these Terms of Service. If
              you do not agree, do not use the service.
            </p>
          </div>

          <div>
            <h2 className="font-heading text-base font-semibold text-zinc-100">
              2. What this demo does
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-500">
              The dashboard runs entirely in your browser and uses in-memory and
              <code className="mx-1 rounded bg-white/[0.06] px-1 py-0.5 text-[11px] text-zinc-300">
                sessionStorage
              </code>
              data to simulate workspace state. There is no real backend
              processing in this demo.
            </p>
          </div>

          <div>
            <h2 className="font-heading text-base font-semibold text-zinc-100">
              3. Acceptable use
            </h2>
            <ul className="mt-2 list-inside list-disc space-y-2 text-sm leading-relaxed text-zinc-500">
              <li>Don’t attempt to disrupt or misuse the demo interface.</li>
              <li>
                Don’t enter sensitive personal information you wouldn’t want
                stored locally in your browser session.
              </li>
              <li>
                Don’t rely on outputs as final engineering advice; always verify
                results before making real hardware decisions.
              </li>
            </ul>
          </div>

          <div>
            <h2 className="font-heading text-base font-semibold text-zinc-100">
              4. Intellectual property
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-500">
              The demo UI and any provided template content are owned by their
              respective authors. You retain ownership of content you type in the
              prompt.
            </p>
          </div>

          <div>
            <h2 className="font-heading text-base font-semibold text-zinc-100">
              5. Disclaimers
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-500">
              The demo is provided “as is” and “as available.” Outputs are
              illustrative and may be incomplete, inaccurate, or outdated.
              Hardware risks are your responsibility.
            </p>
          </div>

          <div>
            <h2 className="font-heading text-base font-semibold text-zinc-100">
              6. Limitation of liability
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-500">
              To the maximum extent permitted by law, Node0 and its contributors
              are not liable for any indirect, incidental, special, or
              consequential damages arising from your use of the demo.
            </p>
          </div>

          <div>
            <h2 className="font-heading text-base font-semibold text-zinc-100">
              7. Changes to these terms
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-500">
              We may update these Terms of Service from time to time. Continued
              use of the demo after changes means you accept the updated terms.
            </p>
          </div>
        </section>

        <p className="mt-8 text-xs leading-relaxed text-zinc-600">
          This is a demo legal template and is not legal advice. Replace with
          counsel-approved language before shipping to real users.
        </p>
      </div>
      </div>
    </main>
  );
}
