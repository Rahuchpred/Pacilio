// Minimal client for Factory's hosted Droid API (https://api.factory.ai).
// Droid runs on a Factory cloud computer; we drive it over plain REST so it
// works from SpacetimeDB procedures, which only have a synchronous fetch.

const BASE_URL = 'https://api.factory.ai/api/v0';

// The subset of `ctx.http` we use, so this file has no SpacetimeDB dependency.
export interface Http {
  fetch(
    url: string,
    init?: { method?: string; headers?: Record<string, string>; body?: string }
  ): { status: number; text(): string };
}

export type SessionStatus = 'idle' | 'pending' | 'running';
export type AutonomyLevel = 'off' | 'low' | 'medium' | 'high';

export interface SessionSettings {
  autonomyLevel?: AutonomyLevel;
  model?: string;
  disabledToolIds?: string[];
}

export interface ContentBlock {
  type: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
}

export interface Message {
  id: string;
  seq: number;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: ContentBlock[];
  createdAt: number;
}

export class FactoryError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    body: string
  ) {
    super(`Factory ${path} → ${status}: ${body.slice(0, 300)}`);
  }
}

export class FactoryClient {
  constructor(
    private readonly http: Http,
    private readonly apiKey: string
  ) {}

  private request<T>(method: string, path: string, body?: unknown): T {
    const res = this.http.fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = res.text();
    if (res.status < 200 || res.status >= 300) {
      throw new FactoryError(res.status, path, text);
    }
    return (text ? JSON.parse(text) : {}) as T;
  }

  // Computers sleep when idle while still reporting `active`; resume is a
  // no-op on a live daemon, so call it before starting work.
  wakeComputer(computerId: string): void {
    this.request('POST', `/computers/${computerId}/restart`, {});
  }

  createSession(computerId: string, settings: SessionSettings): string {
    const res = this.request<{ sessionId: string }>('POST', '/sessions', {
      computerId,
      sessionSettings: settings,
    });
    return res.sessionId;
  }

  // Returns immediately. If the agent is mid-turn the message is queued and
  // read after the current turn; call `interrupt` first to redirect it now.
  sendMessage(sessionId: string, text: string): void {
    this.request('POST', `/sessions/${sessionId}/messages`, { text });
  }

  interrupt(sessionId: string): void {
    this.request('POST', `/sessions/${sessionId}/interrupt`, {});
  }

  getSessionStatus(sessionId: string): SessionStatus {
    return this.request<{ status: SessionStatus }>('GET', `/sessions/${sessionId}`)
      .status;
  }

  // Oldest first (the API returns newest first).
  recentMessages(sessionId: string, limit = 50): Message[] {
    const res = this.request<{ messages: Message[] }>(
      'GET',
      `/sessions/${sessionId}/messages?limit=${limit}`
    );
    return res.messages.slice().reverse();
  }

  // Time-limited URL for a file the agent wrote in its workspace.
  downloadUrl(computerId: string, sessionId: string, filePath: string): string {
    const name = encodeURIComponent(filePath.split('/').pop() ?? filePath);
    const res = this.request<{ downloadUrl: string }>(
      'POST',
      `/computers/${computerId}/files/${name}/create-download`,
      { sessionId, filePath }
    );
    return res.downloadUrl;
  }
}

// ─── Message helpers ────────────────────────────────────────────────────────

// Droid injects its own context as user messages wrapped in <system-reminder>.
function isSystemReminder(block: ContentBlock): boolean {
  return block.type === 'text' && !!block.text?.startsWith('<system-reminder>');
}

export interface AgentStep {
  seq: number;
  role: string;
  kind: 'text' | 'tool';
  summary: string;
}

// Human-readable steps for a progress feed: assistant/user text and tool calls.
export function toSteps(messages: Message[]): AgentStep[] {
  const steps: AgentStep[] = [];
  for (const m of messages) {
    for (const block of m.content) {
      if (isSystemReminder(block)) continue;
      if (block.type === 'text' && block.text) {
        steps.push({ seq: m.seq, role: m.role, kind: 'text', summary: block.text });
      } else if (block.type === 'tool_use' && block.name) {
        const summary =
          typeof block.input?.summary === 'string' ? block.input.summary : '';
        steps.push({
          seq: m.seq,
          role: m.role,
          kind: 'tool',
          summary: summary ? `${block.name}: ${summary}` : block.name,
        });
      }
    }
  }
  return steps;
}

// The agent's reply for the turn, if the newest message is assistant text.
export function finalReply(messages: Message[]): string | undefined {
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'assistant') return undefined;
  const text = last.content.find(b => b.type === 'text' && b.text)?.text;
  return text ?? undefined;
}
