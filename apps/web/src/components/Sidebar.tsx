type Props = { active: "scheduled" | "sent"; onChange: (tab: "scheduled" | "sent") => void; onCompose: () => void; name?: string };
export function Sidebar({ active, onChange, onCompose, name = "Olivia Brown" }: Props) {
  return <aside className="sidebar">
    <div className="brand">ON<span>G</span></div>
    <div className="profile"><div className="avatar">{name.slice(0, 1)}</div><div><b>{name}</b><small>Signed in</small></div><span>⌄</span></div>
    <button className="compose-small" onClick={onCompose}>Compose</button>
    <p className="section-label">CORE</p>
    <button className={active === "scheduled" ? "nav active" : "nav"} onClick={() => onChange("scheduled")}><span>◷</span> Scheduled</button>
    <button className={active === "sent" ? "nav active" : "nav"} onClick={() => onChange("sent")}><span>➤</span> Sent</button>
  </aside>;
}
