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
  reasoningEffort?: 'low' | 'medium' | 'high';
  model?: string;
  disabledToolIds?: string[];
}

export interface ContentBlock {
  type: string;
  id?: string;
  // text
  text?: string;
  // thinking (readable only for some providers; OpenAI puts a summary on the message)
  thinking?: string;
  // tool_use
  name?: string;
  input?: Record<string, unknown>;
  scriptExecution?: { outerToolUseId?: string };
  // tool_result
  toolUseId?: string;
  content?: string | { type: string; text?: string }[];
  isError?: boolean;
}

export interface Message {
  id: string;
  seq: number;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: ContentBlock[];
  createdAt: number;
  openaiReasoningSummary?: string;
  hiddenFromUserViews?: boolean;
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

  // Put a text file on the computer at destPath (relative to the home folder):
  // ask for an upload slot, POST the file to it, then place it. ASCII content
  // only, so the declared size matches the bytes sent.
  uploadTextFile(computerId: string, sessionId: string, destPath: string, content: string): void {
    const name = encodeURIComponent(destPath.split('/').pop() ?? destPath);
    const slot = this.request<{ transferId: string; uploadUrl: string; uploadFormFields: Record<string, string> }>(
      'POST',
      `/computers/${computerId}/files/${name}/create-upload`,
      { sizeBytes: content.length, contentType: 'text/plain' }
    );
    const boundary = 'settle-upload-7d1f4c';
    const part = (field: string, value: string) =>
      `--${boundary}\r\nContent-Disposition: form-data; name="${field}"\r\n\r\n${value}\r\n`;
    const body =
      Object.entries(slot.uploadFormFields).map(([k, v]) => part(k, v)).join('') +
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\n` +
      `Content-Type: text/plain\r\n\r\n${content}\r\n--${boundary}--\r\n`;
    const res = this.http.fetch(slot.uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body,
    });
    if (res.status < 200 || res.status >= 300) {
      throw new FactoryError(res.status, 'file upload', res.text());
    }
    this.request('POST', `/computers/${computerId}/files/${name}/complete-upload`, {
      transferId: slot.transferId,
      sessionId,
      destPath,
    });
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

// Keep big diffs and command output from bloating rows.
const MAX_FIELD_CHARS = 4000;

function truncate(s: string): string {
  return s.length > MAX_FIELD_CHARS
    ? `${s.slice(0, MAX_FIELD_CHARS)}… [${s.length - MAX_FIELD_CHARS} more chars]`
    : s;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}

// One-line description for a tool card, e.g. the command or file it touched.
function describeTool(name: string, input: Record<string, unknown> = {}): string {
  const explicit =
    str(input.summary) ??
    str(input.command) ??
    str(input.file_path) ??
    str(input.directory_path) ??
    str(input.pattern);
  if (explicit) return explicit;

  switch (name) {
    case 'ApplyPatch': {
      // "*** Add File: /path" → "Add File /path"
      const ops = [...(str(input.input) ?? '').matchAll(/^\*\*\* (\w+ File): (.+)$/gm)];
      return ops.map(([, op, path]) => `${op} ${path}`).join(', ');
    }
    case 'Glob':
      return Array.isArray(input.patterns) ? input.patterns.join(', ') : '';
    case 'TodoWrite':
      return 'Updated plan';
    case 'Script':
      return 'Ran tools in parallel';
    default:
      return '';
  }
}

// Shell failures come back as text with isError unset.
const FAILURE_PATTERN = /Command failed \(exit code: [1-9]|exited with code [1-9]|tool call failed/i;

function resultText(content: ContentBlock['content']): string {
  if (typeof content === 'string') return content;
  return (content ?? []).map(part => part.text ?? '').join('\n');
}

// A new row for the feed: chat text, a reasoning summary, or a tool call.
export interface StepEvent {
  type: 'step';
  seq: number;
  role: string;
  kind: 'text' | 'thinking' | 'tool';
  text: string;
  toolUseId?: string;
  toolName?: string;
  input?: string;
  riskLevel?: string;
  // Set when the tool ran inside a parallel Script call
  parentToolUseId?: string;
  // Present on TodoWrite calls: the agent's current plan
  todos?: unknown[];
}

// The outcome of an earlier tool call, matched by toolUseId.
export interface ResultEvent {
  type: 'result';
  seq: number;
  toolUseId: string;
  result: string;
  isError: boolean;
}

export type AgentEvent = StepEvent | ResultEvent;

export function toEvents(messages: Message[]): AgentEvent[] {
  const events: AgentEvent[] = [];
  for (const m of messages) {
    if (m.hiddenFromUserViews) continue;
    for (const block of m.content) {
      if (isSystemReminder(block)) continue;

      if (block.type === 'text' && block.text) {
        events.push({ type: 'step', seq: m.seq, role: m.role, kind: 'text', text: block.text });
      } else if (block.type === 'thinking') {
        const text = block.thinking || m.openaiReasoningSummary;
        if (text) {
          events.push({ type: 'step', seq: m.seq, role: m.role, kind: 'thinking', text });
        }
      } else if (block.type === 'tool_use' && block.name && block.id) {
        const input = block.input ?? {};
        events.push({
          type: 'step',
          seq: m.seq,
          role: m.role,
          kind: 'tool',
          text: describeTool(block.name, input),
          toolUseId: block.id,
          toolName: block.name,
          input: truncate(JSON.stringify(input)),
          riskLevel: str(input.riskLevel),
          parentToolUseId: block.scriptExecution?.outerToolUseId,
          todos: block.name === 'TodoWrite' && Array.isArray(input.todos) ? input.todos : undefined,
        });
      } else if (block.type === 'tool_result' && block.toolUseId) {
        const text = resultText(block.content);
        events.push({
          type: 'result',
          seq: m.seq,
          toolUseId: block.toolUseId,
          result: truncate(text),
          isError: block.isError ?? FAILURE_PATTERN.test(text),
        });
      }
    }
  }
  return events;
}

// The agent's reply for the turn, if the newest message is assistant text.
export function finalReply(messages: Message[]): string | undefined {
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'assistant') return undefined;
  const text = last.content.find(b => b.type === 'text' && b.text)?.text;
  return text ?? undefined;
}
