import { useEffect, useState } from "react";
import type { EmailRow } from "@postbox/shared";
import { API, api } from "./lib/api";
import { Sidebar } from "./components/Sidebar";
import { MessageTable } from "./components/MessageTable";
import { Compose } from "./components/Compose";

type User = { name: string; email: string; avatarUrl?: string | null };
export default function App() {
  const [user, setUser] = useState<User | null>(null); const [tab, setTab] = useState<"scheduled" | "sent">("scheduled"); const [compose, setCompose] = useState(false); const [rows, setRows] = useState<EmailRow[]>([]); const [loading, setLoading] = useState(true);
  const load = async () => { try { setLoading(true); setUser(await api<User>("/api/me")); setRows(await api<EmailRow[]>(`/api/messages?status=${tab}`)); } catch { setUser(null); } finally { setLoading(false); } };
  useEffect(() => { if (!compose) load(); }, [tab, compose]);
  if (!user) return <div className="login-shell"><div className="login-card"><h1>Login</h1><a href={`${API}/auth/google`} className="google">G <span>Login with Google</span></a><p>or sign up through email</p><input placeholder="Email ID" disabled /><input placeholder="Password" type="password" disabled /><small>Email/password is intentionally disabled: this assignment requires Google OAuth.</small></div></div>;
  if (compose) return <Compose onBack={() => setCompose(false)} onSaved={() => { setCompose(false); setTab("scheduled"); }} />;
  return <div className="app-shell"><Sidebar active={tab} onChange={setTab} onCompose={() => setCompose(true)} name={user.name} /><main className="inbox"><header className="topbar"><input placeholder="⌕  Search" disabled /><span>{user.email}</span><button onClick={async () => { await api("/auth/logout", { method: "POST" }); setUser(null); }}>Logout</button></header><MessageTable rows={rows} loading={loading} sent={tab === "sent"} /></main></div>;
}
