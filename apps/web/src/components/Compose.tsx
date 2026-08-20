import { useMemo, useState } from "react";
import { api } from "../lib/api";
type Props = { onBack: () => void; onSaved: () => void };
const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
export function Compose({ onBack, onSaved }: Props) {
  const [subject, setSubject] = useState(""); const [body, setBody] = useState(""); const [rawRecipients, setRawRecipients] = useState("");
  const [delaySeconds, setDelaySeconds] = useState(2); const [hourlyLimit, setHourlyLimit] = useState(100); const [startAt, setStartAt] = useState(""); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  const recipients = useMemo(() => [...new Set(rawRecipients.match(emailPattern) ?? [])], [rawRecipients]);
  async function upload(file: File) { setRawRecipients((await file.text())); }
  async function submit() { try { setSaving(true); setError(""); await api("/api/campaigns", { method: "POST", body: JSON.stringify({ recipients, subject, body, delaySeconds, hourlyLimit, startAt: new Date(startAt).toISOString() }) }); onSaved(); } catch (e) { setError(e instanceof Error ? e.message : "Could not schedule campaign"); } finally { setSaving(false); } }
  return <main className="compose-page"><header className="compose-header"><button onClick={onBack}>←</button><h1>Compose New Email</h1><div className="spacer" /><button className="send" onClick={submit} disabled={saving}>{saving ? "Scheduling..." : "Send Later"}</button></header>
    <section className="form">
      <label>From <span className="from-pill">your Ethereal sender</span></label>
      <label>To <textarea aria-label="Recipients" value={rawRecipients} onChange={(e) => setRawRecipients(e.target.value)} placeholder="recipient@example.com, another@example.com" rows={2} /><span className="upload"><input type="file" accept=".csv,.txt" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />Upload List</span><small>{recipients.length} email address{recipients.length === 1 ? "" : "es"} detected</small></label>
      <label>Subject <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" /></label>
      <div className="settings"><label>Start time <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} /></label><label>Delay between 2 emails <input type="number" min="2" value={delaySeconds} onChange={(e) => setDelaySeconds(Number(e.target.value))} /></label><label>Hourly Limit <input type="number" min="1" value={hourlyLimit} onChange={(e) => setHourlyLimit(Number(e.target.value))} /></label></div>
      <label>Message <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Type your reply..." rows={12} /></label>
      {error && <p className="error">{error}</p>}
    </section>
  </main>;
}
