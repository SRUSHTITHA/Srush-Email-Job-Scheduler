export type MessageStatus = "SCHEDULED" | "PROCESSING" | "SENT" | "FAILED";

export interface EmailRow {
  id: string;
  recipient: string;
  subject: string;
  scheduledFor: string;
  sentAt: string | null;
  status: MessageStatus;
}
