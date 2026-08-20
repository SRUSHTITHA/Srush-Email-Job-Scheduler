export type MessageStatus = "SCHEDULED" | "PROCESSING" | "SENT" | "FAILED";

export interface EmailRow {
  id: string;
  recipient: string;
  subject: string;
  scheduledFor: string;
  sentAt: string | null;
  status: MessageStatus;
}

export interface ScheduleCampaignInput {
  recipients: string[];
  subject: string;
  body: string;
  startAt: string;
  delaySeconds: number;
  hourlyLimit: number;
}
