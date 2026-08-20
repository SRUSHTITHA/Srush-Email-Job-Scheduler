type Props = { active: "scheduled" | "sent"; onChange: (tab: "scheduled" | "sent") => void; onCompose: () => void; name?: string; email?: string; avatarUrl?: string | null };
export function Sidebar({ active, onChange, onCompose, name = "Olivia Brown", email, avatarUrl }: Props) {
  return <aside className="sidebar">
    <div className="profile"><div className="avatar">{avatarUrl ? <img src={avatarUrl} alt="" /> : name.slice(0, 1)}</div><div><b>{name}</b><small>{email ?? "Signed in"}</small></div><span>⌄</span></div>
    <button className="compose-small" onClick={onCompose}>Compose</button>
    <button className={active === "scheduled" ? "nav active" : "nav"} onClick={() => onChange("scheduled")}><span>◷</span> Scheduled</button>
    <button className={active === "sent" ? "nav active" : "nav"} onClick={() => onChange("sent")}><span>➤</span> Sent</button>
  </aside>;
}
