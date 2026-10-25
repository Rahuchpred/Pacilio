// Minimal AgentMail client (https://docs.agentmail.to) over SpacetimeDB's
// synchronous fetch.
import type { Http } from '../droid/factory';

const BASE_URL = 'https://api.agentmail.to/v0';

export interface AgentMailMessage {
  message_id: string;
  thread_id: string;
  labels: string[];
  from: string;
  timestamp: string;
  text?: string;
  // Just the new text of a reply, without the quoted history
  extracted_text?: string;
}

export class AgentMailError extends Error {}

export class AgentMail {
  constructor(
    private readonly http: Http,
    private readonly apiKey: string
  ) {}

  private request<T>(method: string, path: string, body?: unknown): T {
    const res = this.http.fetch(`${BASE_URL}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = res.text();
    if (res.status < 200 || res.status >= 300) {
      throw new AgentMailError(`AgentMail ${method} ${path.split('?')[0]} → ${res.status}: ${text.slice(0, 300)}`);
    }
    return (text ? JSON.parse(text) : {}) as T;
  }

  listInboxes(): { inbox_id: string; email?: string }[] {
    return this.request<{ inboxes?: { inbox_id: string; email?: string }[] }>('GET', '/inboxes?limit=10').inboxes ?? [];
  }

  createInbox(displayName: string, username: string): { inbox_id: string; email: string } {
    return this.request('POST', '/inboxes', { display_name: displayName, username });
  }

  // `text` is the plain fallback; `html` is what most inboxes show
  send(inboxId: string, to: string, subject: string, text: string, html?: string): { message_id: string; thread_id: string } {
    return this.request('POST', `/inboxes/${encodeURIComponent(inboxId)}/messages/send`, { to: [to], subject, text, html });
  }

  // Answer a message in its thread. Without `to`, AgentMail replies to that
  // message's sender, which is us when the message is our own last email.
  reply(inboxId: string, messageId: string, to: string, text: string, html?: string): { message_id: string; thread_id: string } {
    return this.request(
      'POST',
      `/inboxes/${encodeURIComponent(inboxId)}/messages/${encodeURIComponent(messageId)}/reply`,
      { to: [to], text, html }
    );
  }

  threadMessages(inboxId: string, threadId: string): AgentMailMessage[] {
    const thread = this.request<{ messages?: AgentMailMessage[] }>(
      'GET',
      `/inboxes/${encodeURIComponent(inboxId)}/threads/${encodeURIComponent(threadId)}`
    );
    return thread.messages ?? [];
  }
}
