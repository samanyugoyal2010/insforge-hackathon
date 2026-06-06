import Link from "next/link";
import { SiteNavbar } from "@/components/site-navbar";

export default function HomePage() {
  return (
    <>
      <SiteNavbar />
      <main className="min-h-screen bg-black text-white flex flex-col">
        {/* Hero */}
        <section className="flex-1 flex flex-col items-center justify-center text-center px-6 pt-24 pb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-white/60 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            iPhone-powered virtual tours
          </div>

          <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-none mb-6">
            Turn your iPhone<br />
            <span className="text-white/40">into a Matterport</span>
          </h1>

          <p className="max-w-xl text-lg text-white/50 mb-10">
            Walk through any property, upload your photos, and share an
            immersive 360° virtual tour in minutes — no hardware required.
            Let buyers virtually stage rooms with furniture before they visit.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 items-center">
            <Link
              href="/capture"
              className="rounded-full bg-white text-black font-semibold px-8 py-3.5 text-base hover:bg-white/90 transition-colors active:scale-95"
            >
              Create a Tour — Free ✨
            </Link>
            <Link
              href="#how"
              className="rounded-full border border-white/15 text-white/70 hover:text-white px-8 py-3.5 text-base transition-colors"
            >
              See how it works
            </Link>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="py-20 px-6 border-t border-white/[0.06]">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-16">How it works</h2>
            <div className="grid sm:grid-cols-3 gap-8">
              {[
                {
                  step: "01",
                  icon: "📸",
                  title: "Walk & shoot",
                  desc: "Open VirtualStage on your iPhone, add each room, and take a panorama photo from the center. Takes about 5 minutes per property.",
                },
                {
                  step: "02",
                  icon: "🌐",
                  title: "Instant 360° tour",
                  desc: "Photos are stitched into a navigable sphere you can look around in. Click glowing rings to move between rooms.",
                },
                {
                  step: "03",
                  icon: "🛋️",
                  title: "Stage & share",
                  desc: "Drop in virtual furniture — sofas, beds, plants — to help buyers visualize the space. Share a link and they explore it in any browser.",
                },
              ].map((item) => (
                <div key={item.step} className="flex flex-col gap-3">
                  <div className="text-4xl">{item.icon}</div>
                  <div className="text-xs text-white/30 font-mono">{item.step}</div>
                  <h3 className="text-lg font-semibold">{item.title}</h3>
                  <p className="text-white/50 text-sm leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA bottom */}
        <section className="py-16 px-6 border-t border-white/[0.06] text-center">
          <h2 className="text-2xl font-bold mb-4">Ready to list smarter?</h2>
          <p className="text-white/50 mb-8">No account needed. Your first tour is free.</p>
          <Link
            href="/capture"
            className="inline-block rounded-full bg-white text-black font-semibold px-8 py-3.5 hover:bg-white/90 transition-colors"
          >
            Create your first tour →
          </Link>
        </section>

        <footer className="py-8 px-6 border-t border-white/[0.06] text-center text-white/20 text-xs">
          © 2026 VirtualStage · Built for real estate agents who move fast
        </footer>
      </main>
    </>
  );
}
