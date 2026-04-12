import { Suspense } from "react";

import { AdvanceOrdersClient } from "./advance-orders-client";

function Fallback() {
  return (
    <div
      className="min-h-screen bg-[#09090b]"
      aria-busy
      aria-label="Loading"
    />
  );
}

export default function AdvanceOrdersPage() {
  return (
    <Suspense fallback={<Fallback />}>
      <AdvanceOrdersClient />
    </Suspense>
  );
}
