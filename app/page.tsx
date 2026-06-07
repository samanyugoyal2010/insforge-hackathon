"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import AuthForm from "@/components/AuthForm";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace("/dashboard");
    }
  }, [loading, user, router]);

  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden px-6 py-16">
      {/* ambient gradient */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/4 top-1/4 h-96 w-96 -translate-x-1/2 rounded-full bg-indigo-600/20 blur-3xl" />
        <div className="absolute right-1/4 bottom-1/4 h-96 w-96 translate-x-1/2 rounded-full bg-fuchsia-600/10 blur-3xl" />
      </div>

      <div className="grid w-full max-w-5xl items-center gap-12 md:grid-cols-2">
        <div>
          <p className="mb-3 inline-block rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/60">
            HEIC → walkable 3D gallery
          </p>
          <h1 className="text-4xl font-semibold leading-tight md:text-5xl">
            Turn your room photos into a 3D space you can walk through.
          </h1>
          <p className="mt-4 max-w-md text-white/60">
            Upload HEIC photos, and Roomscape hangs them on the walls of a
            virtual gallery. Build as many rooms as you like — they’re saved to
            your account.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-white/50">
            <li>• Drop multiple HEIC files at once</li>
            <li>• Walk around with WASD + mouse</li>
            <li>• Every room saved to the cloud</li>
          </ul>
        </div>

        <div className="flex justify-center md:justify-end">
          {loading ? (
            <div className="h-72 w-full max-w-sm animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />
          ) : (
            <AuthForm />
          )}
        </div>
      </div>
    </main>
  );
}
