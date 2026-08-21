import { useRef, useState } from "react";
import { api } from "../lib/api";
type Props = { onBack: () => void; onSaved: () => void; email: string };
const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

function defaultStartAt() {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  date.setSeconds(0, 0);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function minimumStartAt() {
  const date = new Date();
  date.setSeconds(0, 0);
  date.setMinutes(date.getMinutes() + 1);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function Compose({ onBack, onSaved, email }: Props) {
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [subject, setSubject] = useState(""); 
  const [body, setBody] = useState(""); 
  const [rawRecipients, setRawRecipients] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [delaySeconds, setDelaySeconds] = useState(2); 
  const [hourlyLimit, setHourlyLimit] = useState(100); 
  const [startAt, setStartAt] = useState(defaultStartAt());
  const [pendingStartAt, setPendingStartAt] = useState(startAt);
  const [attachment, setAttachment] = useState<{ name: string; type: string; data: string } | null>(null);
  const [error, setError] = useState(""); 
  const [saving, setSaving] = useState(false);
  const [showSendLaterMenu, setShowSendLaterMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadListRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  
  const recipients = [...new Set((rawRecipients.match(emailPattern) ?? []).map((email) => email.toLowerCase()))];
  
  async function uploadList(file: File) {
    setRawRecipients((await file.text()));
  }

  function attachFile(file: File) {
    if (file.size > 1_500_000) {
      setError("Attachments must be smaller than 1.5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAttachment({ name: file.name, type: file.type || "application/octet-stream", data: String(reader.result).split(",")[1] ?? "" });
    reader.readAsDataURL(file);
  }
  
  async function submit() { 
    if (recipients.length === 0) {
      setError("Add at least one valid recipient email address.");
      return;
    }
    if (new Date(startAt).getTime() <= Date.now()) {
      setError("Choose a future time to send the campaign.");
      return;
    }
    try { 
      setSaving(true); 
      setError(""); 
      const campaignPayload = {
        recipients,
        subject: subject.trim(),
        body: body.trim(),
        attachment,
        delaySeconds: Number(delaySeconds),
        hourlyLimit: Number(hourlyLimit),
        startAt: new Date(startAt).toISOString(),
      };

      await api("/api/campaigns", {
        method: "POST",
        headers: {
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(campaignPayload),
      }); 
      onSaved(); 
    } catch (e) { 
      setError(e instanceof Error ? e.message : "Could not schedule campaign"); 
    } finally { 
      setSaving(false); 
    } 
  }

  const removeRecipient = (email: string) => {
    setRawRecipients(rawRecipients.replace(email, "").replace(/,\s*,/, ",").trim());
  };

  const setScheduledTime = (value: string) => {
    setStartAt(value);
    setPendingStartAt(value);
    setShowSendLaterMenu(false);
  };

  const applyScheduledTime = () => {
    if (new Date(pendingStartAt).getTime() <= Date.now()) {
      setError("Choose a future time to send the campaign.");
      return;
    }
    setScheduledTime(pendingStartAt);
  };

  const selectedTimeLabel = new Date(startAt).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return <main className="compose-page">
    <header className="compose-header">
      <button onClick={onBack} aria-label="Back to inbox" title="Back to inbox">←</button>
      <h1>Compose New Email</h1>
      <div className="spacer" />
      <div className="send-later-wrapper">
        <button className="send-later-btn" onClick={() => setShowSendLaterMenu(!showSendLaterMenu)}>
          <span aria-hidden="true">◷</span> {selectedTimeLabel}
        </button>
        {showSendLaterMenu && (
          <div className="send-later-menu">
            <label className="schedule-picker">
              Send at
              <input
              type="datetime-local"
              min={minimumStartAt()}
              value={pendingStartAt}
              onChange={(e) => setPendingStartAt(e.target.value)}
              />
            </label>
            <button type="button" className="set-time-button" onClick={applyScheduledTime}>Set</button>
            <button className="time-option" onClick={() => setScheduledTime(defaultStartAt())}>Next available hour</button>
            <button className="time-option" onClick={() => { const now = new Date(); now.setMinutes(now.getMinutes() + 5, 0, 0); setScheduledTime(new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16)); }}>Today, in 5 minutes</button>
            <button className="time-option" onClick={() => { const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(9, 0, 0, 0); setScheduledTime(new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000).toISOString().slice(0, 16)); }}>Tomorrow, 9:00 AM</button>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={saving}
        style={{
          appearance: "none",
          border: "1px solid #111",
          borderRadius: "8px",
          background: "#111",
          color: "#fff",
          padding: "10px 18px",
          minHeight: "40px",
          fontSize: "14px",
          fontWeight: 600,
          cursor: saving ? "not-allowed" : "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          whiteSpace: "nowrap",
          opacity: saving ? 0.55 : 1,
        }}
      >
        {saving ? "Scheduling..." : "Schedule"}
      </button>
    </header>
    
    <section className="form">
      <label>From 
        <div className="from-value">{email}</div>
      </label>
      
      <label><div className="recipient-label-header">
        <span className="field-heading">To <span className="required-field">Required</span></span>
        <div className="recipient-actions">
          <button type="button" className="upload-button" onClick={() => uploadListRef.current?.click()}>Upload List</button>
          <input ref={uploadListRef} className="hidden-file-input" type="file" accept=".csv,.txt" onChange={(e) => { if (e.target.files?.[0]) uploadList(e.target.files[0]); e.target.value = ""; }} />
        </div>
      </div>
        <div className="recipients-field">
          {recipients.map((email) => (
            <span key={email} className="recipient-pill">
              {email}
              <button 
                type="button"
                className="remove-recipient"
                onClick={() => removeRecipient(email)}
              >×</button>
            </span>
          ))}
          <input 
            type="text"
            placeholder="recipient@example.com"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData("text");
              setRawRecipients((prev) => prev + (prev ? ", " : "") + pasted);
              setInputValue("");
              e.preventDefault();
            }}
            onKeyPress={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                const trimmedValue = inputValue.trim();
                if (trimmedValue) {
                  setRawRecipients((prev) => prev + (prev ? ", " : "") + trimmedValue);
                  setInputValue("");
                }
                e.preventDefault();
              }
            }}
            onBlur={() => {
              const trimmedValue = inputValue.trim();
              if (trimmedValue) {
                setRawRecipients((prev) => prev + (prev ? ", " : "") + trimmedValue);
                setInputValue("");
              }
            }}
          />
        </div>
        <small>{recipients.length} email address{recipients.length === 1 ? "" : "es"} detected</small>
      </label>
      
      <label>Subject 
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />
      </label>
      
      <div className="settings-row">
        <label>Delay between 2 emails 
          <input type="number" min="2" value={delaySeconds} onChange={(e) => setDelaySeconds(Number(e.target.value))} />
        </label>
        <label>Hourly Limit 
          <input type="number" min="1" value={hourlyLimit} onChange={(e) => setHourlyLimit(Number(e.target.value))} />
        </label>
      </div>
      
      <div className="message-field">
        <div className="message-label-row">
          <span className="field-label">Message</span>
          <button type="button" className="attach-button" onClick={() => fileInputRef.current?.click()} title="Attach a file">📎 Attach file</button>
        </div>
        <div className="composer">
          <div className="composer-placeholder" hidden={Boolean(body)}>Write your message...</div>
          <div className="composer-editor" ref={editorRef} contentEditable role="textbox" aria-label="Message" onInput={(e) => setBody(e.currentTarget.innerText)} />
        </div>
        <input ref={fileInputRef} className="hidden-file-input" type="file" onChange={(e) => e.target.files?.[0] && attachFile(e.target.files[0])} />
        {attachment && <div className="attachment-chip"><span>📎</span>{attachment.name}<button type="button" onClick={() => setAttachment(null)} aria-label="Remove attachment">×</button></div>}
      </div>
      
      {error && <p className="error">{error}</p>}
    </section>
  </main>;
}
