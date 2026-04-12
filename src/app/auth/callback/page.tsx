import { Suspense } from "react";

import { AuthCallbackClient } from "./auth-callback-client";

function CallbackFallback() {
  return (
    <div
      className="min-h-screen bg-[#06060a]"
      aria-busy
      aria-label="Signing in"
    />
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<CallbackFallback />}>
      <AuthCallbackClient />
    </Suspense>
  );
}
