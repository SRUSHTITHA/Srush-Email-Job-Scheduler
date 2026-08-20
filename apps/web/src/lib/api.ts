const API = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, { credentials: "include", headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }, ...init });
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.message ?? "Request failed"); }
  return response.status === 204 ? undefined as T : response.json();
}
export { API };
