"use client";

import { useState } from "react";
import { insforge } from "@/lib/insforge";
import { useAuth } from "@/lib/auth-context";

export default function AuthForm() {
  const { refresh } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await insforge.auth.signUp({
          email,
          password,
          name: name || email.split("@")[0],
        });
        if (error) throw new Error(error.message);
        if (data?.requireEmailVerification) {
          setError(
            "Check your email to verify your account, then sign in."
          );
          setMode("signin");
          return;
        }
      } else {
        const { error } = await insforge.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw new Error(error.message);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur">
      <h2 className="text-xl font-semibold mb-1">
        {mode === "signin" ? "Welcome back" : "Create your account"}
      </h2>
      <p className="text-sm text-white/50 mb-6">
        {mode === "signin"
          ? "Sign in to your saved rooms."
          : "Start building 3D rooms from your photos."}
      </p>

      <form onSubmit={handleSubmit} className="space-y-3">
        {mode === "signup" && (
          <input
            type="text"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-indigo-400/60"
          />
        )}
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-indigo-400/60"
        />
        <input
          type="password"
          required
          minLength={6}
          placeholder="Password (min 6 chars)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-indigo-400/60"
        />

        {error && (
          <p className="text-sm text-amber-400/90 bg-amber-400/10 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 px-3 py-2.5 text-sm font-medium transition-colors"
        >
          {busy
            ? "Please wait…"
            : mode === "signin"
              ? "Sign in"
              : "Create account"}
        </button>
      </form>

      <button
        onClick={() => {
          setMode(mode === "signin" ? "signup" : "signin");
          setError(null);
        }}
        className="mt-4 w-full text-center text-sm text-white/50 hover:text-white/80"
      >
        {mode === "signin"
          ? "No account? Sign up"
          : "Already have an account? Sign in"}
      </button>
    </div>
  );
}
