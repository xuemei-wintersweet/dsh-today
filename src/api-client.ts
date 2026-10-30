import crypto from 'node:crypto';
import { TODAY_DESKTOP_VERSION } from './version.js';
import type { TodayCredentialStore } from './credentials.js';
import type {
  CanonicalMessagePart,
  CanonicalMessageSnapshot,
  TodayDeviceToolSpec,
  TodayPricingStatus,
  TodayRegionConfig,
} from './types.js';

export function getConnectorClientPlatform(): 'macos' | 'windows' | 'linux' {
  if (process.platform === 'darwin') return 'macos';
  if (process.platform === 'win32') return 'windows';
  return 'linux';
}

export function getConnectorClientType(): 'macos-connector' | 'windows-connector' | 'linux-connector' {
  if (process.platform === 'darwin') return 'macos-connector';
  if (process.platform === 'win32') return 'windows-connector';
  return 'linux-connector';
}

const CANNED_GATEWAY_ERROR_PATTERNS: readonly RegExp[] = [
  /^抱歉，暂时无法完成这次请求，请稍后重试[。.]?$/u,
  /^抱歉，服务暂时不可用，请稍后重试[。.]?$/u,
  /^Sorry,\s*I\s*(?:cannot|can't|couldn't)\s*complete\s*this\s*request\s*right\s*now\.\s*Please\s*try\s*again\s*later\.?$/iu,
];

export function isUpstreamGatewayFallbackReply(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 160) {
    return false;
  }
  return CANNED_GATEWAY_ERROR_PATTERNS.some((re) => re.test(trimmed));
}

function renderQaCardBodyToMarkdown(rawBody: unknown): string {
  if (!rawBody || typeof rawBody !== 'object') {
    return '';
  }
  const body = rawBody as Record<string, unknown>;
  const lines: string[] = [];

  // 1. Legacy single/multi select: { prompt, options: [{ id, label }], others_field }
  if (typeof body.prompt === 'string' && Array.isArray(body.options)) {
    lines.push(body.prompt.trim());
    for (const opt of body.options) {
      if (opt && typeof opt === 'object') {
        const o = opt as Record<string, unknown>;
        const label = typeof o.label === 'string' ? o.label.trim() : '';
        const desc = typeof o.description === 'string' && o.description.trim() ? ` — ${o.description.trim()}` : '';
        if (label) {
          lines.push(`- ${label}${desc}`);
        }
      }
    }
    return lines.filter(Boolean).join('\n');
  }

  // 2. Multi-page card: { pages: [{ prompt, options, fields }] }
  if (Array.isArray(body.pages)) {
    for (let i = 0; i < body.pages.length; i += 1) {
      const page = body.pages[i];
      if (!page || typeof page !== 'object') continue;
      const p = page as Record<string, unknown>;
      const prompt = typeof p.prompt === 'string' ? p.prompt.trim() : '';
      if (prompt) {
        lines.push(body.pages.length > 1 ? `${i + 1}. **${prompt}**` : `**${prompt}**`);
      }
      if (Array.isArray(p.options)) {
        for (const opt of p.options) {
          if (opt && typeof opt === 'object') {
            const label = typeof (opt as Record<string, unknown>).label === 'string'
              ? String((opt as Record<string, unknown>).label).trim()
              : '';
            if (label) {
              lines.push(`   - ${label}`);
            }
          }
        }
      }
      if (Array.isArray(p.fields)) {
        for (const fld of p.fields) {
          if (fld && typeof fld === 'object') {
            const f = fld as Record<string, unknown>;
            const label = typeof f.label === 'string' ? f.label.trim() : '';
            const def = typeof f.default === 'string' ? ` (默认: ${f.default})` : '';
            if (label) {
              lines.push(`   - ${label}${def}`);
            }
          }
        }
      }
    }
    return lines.filter(Boolean).join('\n');
  }

  // 3. Cardflow single: { entry_card_id, cards: [{ card_id, prompt, options }] }
  if (Array.isArray(body.cards) && body.cards.length > 0) {
    const entryId = typeof body.entry_card_id === 'string' ? body.entry_card_id : '';
    const orderedCards = entryId
      ? [
          ...body.cards.filter((c) => c && typeof c === 'object' && (c as Record<string, unknown>).card_id === entryId),
          ...body.cards.filter((c) => c && typeof c === 'object' && (c as Record<string, unknown>).card_id !== entryId),
        ]
      : body.cards;

    for (let i = 0; i < orderedCards.length; i += 1) {
      const card = orderedCards[i];
      if (!card || typeof card !== 'object') continue;
      const c = card as Record<string, unknown>;
      const prompt = typeof c.prompt === 'string' ? c.prompt.trim() : '';
      if (prompt) {
        lines.push(orderedCards.length > 1 ? `${i + 1}. **${prompt}**` : `**${prompt}**`);
      }
      if (Array.isArray(c.options)) {
        for (const opt of c.options) {
          if (opt && typeof opt === 'object') {
            const o = opt as Record<string, unknown>;
            const label = typeof o.label === 'string' ? o.label.trim() : '';
            const desc =
              typeof o.description === 'string' && o.description.trim()
                ? ` — ${o.description.trim()}`
                : '';
            if (label) {
              lines.push(`   - ${label}${desc}`);
            }
          }
        }
      }
    }
    return lines.filter(Boolean).join('\n');
  }

  return '';
}

function renderMessagePartToText(part: CanonicalMessagePart): string {
  const msgType = String(part.messageType ?? (part as Record<string, unknown>).type ?? '');
  const content =
    part.content && typeof part.content === 'object'
      ? (part.content as Record<string, unknown>)
      : (part as Record<string, unknown>);

  if (msgType === 'text') {
    if (typeof content.text === 'string') return content.text;
    if (typeof (part as Record<string, unknown>).text === 'string') {
      return String((part as Record<string, unknown>).text);
    }
    return '';
  }

  // Proprietary Today QA interactive cards -> convert cleanly to readable Markdown!
  if (
    msgType === 'qa_single_select' ||
    msgType === 'qa_multi_select' ||
    msgType === 'qa_multi_page' ||
    msgType === 'qa_cardflow_single' ||
    msgType === 'qa_connector_auth'
  ) {
    const innerContent =
      content.content && typeof content.content === 'object'
        ? (content.content as Record<string, unknown>)
        : content;
    const cardBody = innerContent.body ?? content.body ?? content;
    return renderQaCardBodyToMarkdown(cardBody);
  }

  if (msgType === 'brief_card') {
    const title = typeof content.title === 'string' ? content.title.trim() : '';
    const desc = typeof content.description === 'string' ? content.description.trim() : '';
    return [title ? `**${title}**` : '', desc].filter(Boolean).join('\n');
  }

  if (typeof content.text === 'string' && content.text.trim()) {
    return content.text;
  }

  return '';
}

export class TodayUpstreamClient {
  private activeModelOptionId: string | null = null;
  private lastSyncedToolCatalogHash: string | null = null;
  private readonly fetchImpl: typeof fetch;

  constructor(
    public readonly config: TodayRegionConfig,
    public readonly credentials: TodayCredentialStore,
    options?: { fetch?: typeof fetch }
  ) {
    this.fetchImpl = options?.fetch ?? globalThis.fetch.bind(globalThis);
  }

  public async buildHeaders(extra: Record<string, string> = {}): Promise<Record<string, string>> {
    const token = await this.credentials.getValidAccessToken();
    return {
      'Accept': 'application/json',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'Content-Type': 'application/json',
      'X-App-Version': TODAY_DESKTOP_VERSION,
      'X-Client-Platform': process.platform === 'darwin' ? 'mac-client' : 'windows-client',
      'Origin': this.config.webOrigin,
      'Authorization': `Bearer ${token}`,
      ...extra,
    };
  }

  private async fetchWithAuth(
    url: string,
    initBuilder: (headers: Record<string, string>) => RequestInit,
    extraHeaders: Record<string, string> = {},
    signal?: AbortSignal
  ): Promise<Response> {
    const headers = await this.buildHeaders(extraHeaders);
    const resp = await this.fetchImpl(url, { ...initBuilder(headers), ...(signal ? { signal } : {}) });
    if (resp.status !== 401) {
      return resp;
    }
    await this.credentials.getValidAccessToken(true);
    const retryHeaders = await this.buildHeaders(extraHeaders);
    return this.fetchImpl(url, { ...initBuilder(retryHeaders), ...(signal ? { signal } : {}) });
  }

  public async getPricingStatus(signal?: AbortSignal): Promise<TodayPricingStatus> {
    const resp = await this.fetchWithAuth(
      `${this.config.apiBaseUrl}/v1/pricing/status`,
      (headers) => ({ method: 'GET', headers }),
      {},
      signal
    );
    if (!resp.ok) {
      throw new Error(`GET /v1/pricing/status failed: HTTP ${resp.status}`);
    }
    const json = (await resp.json()) as { data?: { status?: TodayPricingStatus } };
    const status = json?.data?.status;
    if (!status) {
      throw new Error('Malformed /v1/pricing/status response');
    }
    this.activeModelOptionId = status.modelOptions?.selectedOptionId ?? null;
    return status;
  }

  public async selectModelOption(optionId: string, signal?: AbortSignal): Promise<void> {
    if (this.activeModelOptionId === optionId) {
      return;
    }
    const resp = await this.fetchWithAuth(
      `${this.config.apiBaseUrl}/v1/pricing/model-option`,
      (headers) => ({
        method: 'PUT',
        headers,
        body: JSON.stringify({ optionId }),
      }),
      {},
      signal
    );
    if (!resp.ok) {
      throw new Error(`PUT /v1/pricing/model-option (${optionId}) failed: HTTP ${resp.status}`);
    }
    this.activeModelOptionId = optionId;
  }

  public async getLlmModels(signal?: AbortSignal): Promise<string[]> {
    const resp = await this.fetchWithAuth(
      `${this.config.apiBaseUrl}/v1/llm/models`,
      (headers) => ({ method: 'GET', headers }),
      {},
      signal
    );
    if (!resp.ok) {
      throw new Error(`GET /v1/llm/models failed: HTTP ${resp.status}`);
    }
    const data = (await resp.json()) as { models?: Array<{ modelId: string }> };
    return (data.models ?? []).map((m) => m.modelId);
  }

  public async createV3Conversation(signal?: AbortSignal): Promise<string> {
    const idempotencyKey = crypto.randomUUID();
    const resp = await this.fetchWithAuth(
      `${this.config.apiBaseUrl}/v3/conversations`,
      (headers) => ({ method: 'POST', headers }),
      { 'Idempotency-Key': idempotencyKey },
      signal
    );
    if (!resp.ok) {
      throw new Error(`POST /v3/conversations failed: HTTP ${resp.status}`);
    }
    const json = (await resp.json()) as {
      data?: { conversation?: { conversationId?: string } };
    };
    const conversationId = json?.data?.conversation?.conversationId;
    if (!conversationId) {
      throw new Error('POST /v3/conversations did not return conversationId');
    }
    return conversationId;
  }

  public async sendV3Message(
    params: {
      conversationId?: string;
      text: string;
      clientMessageId?: string;
    },
    signal?: AbortSignal
  ): Promise<{
    messageId: string;
    conversationId: string;
    threadId: string;
    sequence: number;
    clientMessageId: string;
  }> {
    const clientMessageId = params.clientMessageId ?? crypto.randomUUID();
    const bodyStr = JSON.stringify({
      ...(params.conversationId ? { conversationId: params.conversationId } : {}),
      clientMessageId,
      bodyType: 'text',
      body: { text: params.text },
    });
    const resp = await this.fetchWithAuth(
      `${this.config.apiBaseUrl}/v3/messages`,
      (headers) => ({
        method: 'POST',
        headers,
        body: bodyStr,
      }),
      {},
      signal
    );
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`POST /v3/messages failed: HTTP ${resp.status} ${errText}`);
    }
    const json = (await resp.json()) as {
      data?: {
        message?: {
          messageId: string;
          conversationId: string;
          threadId: string;
          sequence: number;
        };
      };
    };
    const msg = json?.data?.message;
    if (!msg) {
      throw new Error('Malformed POST /v3/messages response');
    }
    return { ...msg, clientMessageId };
  }

  public invalidateDeviceToolSyncCache(): void {
    this.lastSyncedToolCatalogHash = null;
  }

  /**
   * Read the durable tail of a V3 conversation. Used as a REST fallback when the
   * WebSocket `chat.message_ready.v2` push is delayed or routed to another
   * connection of the same account.
   */
  public async listV3Messages(
    conversationId: string,
    limit = 20,
    signal?: AbortSignal
  ): Promise<CanonicalMessageSnapshot[]> {
    const resp = await this.fetchWithAuth(
      `${this.config.apiBaseUrl}/v3/conversations/${encodeURIComponent(conversationId)}/messages?limit=${limit}`,
      (headers) => ({ method: 'GET', headers }),
      {},
      signal
    );
    if (!resp.ok) {
      throw new Error(`GET /v3/conversations/${conversationId}/messages failed: HTTP ${resp.status}`);
    }
    const json = (await resp.json()) as { data?: { items?: CanonicalMessageSnapshot[] } };
    return Array.isArray(json?.data?.items) ? json.data.items : [];
  }

  public async syncDeviceTools(
    deviceId: string,
    tools: TodayDeviceToolSpec[],
    signal?: AbortSignal
  ): Promise<void> {
    const hashPayload = JSON.stringify({
      deviceId,
      tools: tools.map((t) => ({
        capabilityId: t.capabilityId,
        description: t.description,
        enabled: t.enabled,
        inputSchema: t.inputSchema,
      })),
    });
    const catalogHash = crypto.createHash('sha256').update(hashPayload).digest('hex');
    if (this.lastSyncedToolCatalogHash === catalogHash) {
      return;
    }

    const bodyStr = JSON.stringify({
      tools,
      connectorSnapshot: {
        connectors: [],
        timestamp: new Date().toISOString(),
      },
    });

    const resp = await this.fetchWithAuth(
      `${this.config.apiBaseUrl}/registry/devices/${encodeURIComponent(deviceId)}/tools`,
      (headers) => ({
        method: 'PUT',
        headers,
        body: bodyStr,
      }),
      {
        'X-Client-Platform': getConnectorClientPlatform(),
        'X-Device-Id': deviceId,
      },
      signal
    );
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`PUT /registry/devices/${deviceId}/tools failed: HTTP ${resp.status} ${errText}`);
    }
    this.lastSyncedToolCatalogHash = catalogHash;
  }

  public static extractTextFromCanonicalMessage(message: CanonicalMessageSnapshot): string {
    const rawBody = message.body as Record<string, unknown> | undefined;
    // Support both canonical WebSocket snapshot (`body.parts`) and REST history (`body.content.parts`)
    const parts = Array.isArray(rawBody?.parts)
      ? (rawBody.parts as CanonicalMessagePart[])
      : rawBody?.content &&
          typeof rawBody.content === 'object' &&
          Array.isArray((rawBody.content as Record<string, unknown>).parts)
        ? ((rawBody.content as Record<string, unknown>).parts as CanonicalMessagePart[])
        : [];

    const texts: string[] = [];
    for (const part of parts) {
      const rendered = renderMessagePartToText(part);
      if (rendered) {
        texts.push(rendered);
      }
    }
    return texts.join('\n\n');
  }
}
