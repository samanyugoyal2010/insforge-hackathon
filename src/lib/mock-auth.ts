export const MOCK_AUTH_KEY = "node0_mock_auth";

export type MockAuthProvider = "google" | "github";

export type MockAuth = {
  provider: MockAuthProvider;
  at: number;
};

export function readMockAuth(): MockAuth | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(MOCK_AUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MockAuth;
    if (parsed.provider !== "google" && parsed.provider !== "github")
      return null;
    if (typeof parsed.at !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Same-tab listeners (e.g. homepage workspace) can subscribe via useSyncExternalStore. */
export function notifyMockAuthChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("node0-mock-auth"));
}

export function writeMockAuth(provider: MockAuthProvider) {
  if (typeof window === "undefined") return;
  const payload: MockAuth = { provider, at: Date.now() };
  sessionStorage.setItem(MOCK_AUTH_KEY, JSON.stringify(payload));
  notifyMockAuthChanged();
}

export function clearMockAuth() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(MOCK_AUTH_KEY);
  notifyMockAuthChanged();
}
