import type { EmailRow } from "@postbox/shared";
export function MessageTable({ rows, loading, sent }: { rows: EmailRow[]; loading: boolean; sent: boolean }) {
  if (loading) return <div className="state">Loading your messages...</div>;
  if (!rows.length) return <div className="state"><strong>No {sent ? "sent" : "scheduled"} emails yet.</strong><br />Your emails will appear here once you schedule a campaign.</div>;
  return <div className="message-list">{rows.map((row) => <article className="message-row" key={row.id}>
    <div className="recipient"><b>To: {row.recipient}</b><span>{new Date(sent ? row.sentAt ?? row.scheduledFor : row.scheduledFor).toLocaleString()}</span></div>
    <div className="subject"><em className={`badge ${row.status.toLowerCase()}`}>{row.status.toLowerCase()}</em><b>{row.subject}</b></div><span className="star">☆</span>
  </article>)}</div>;
}
