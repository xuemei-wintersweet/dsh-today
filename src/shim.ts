import http from 'node:http';
import crypto from 'node:crypto';
import { hostIsLoopback, originIsLoopback } from './loopback.js';
import { deriveCatalogFromPricing } from './catalog.js';
import { TodayDshAdapter, type DshHarnessMessage } from './dsh-adapter.js';
import type { TodayUpstreamClient } from './api-client.js';
import type { OpenAIChatCompletionRequest, OpenAIToolCall } from './types.js';

export interface TodayShimOptions {
  api: TodayUpstreamClient;
  requireBearerSecret?: boolean;
  responseTimeoutMs?: number;
  enableNativeDeviceTools?: boolean;
}

function openAiMessagesToHarnessMessages(
  messages: OpenAIChatCompletionRequest['messages']
): { system?: string; harnessMessages: DshHarnessMessage[] } {
  const systemParts: string[] = [];
  const harnessMessages: DshHarnessMessage[] = [];

  for (const m of messages ?? []) {
    const text =
      typeof m.content === 'string'
        ? m.content
        : Array.isArray(m.content)
          ? m.content.map((p) => p.text ?? '').join('')
          : '';

    if (m.role === 'system') {
      if (text.trim()) systemParts.push(text.trim());
      continue;
    }

    if (m.role === 'tool') {
      harnessMessages.push({
        role: 'tool',
        toolCallId: m.tool_call_id ?? 'tool',
        content: text,
      });
      continue;
    }

    if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
      harnessMessages.push({
        role: 'assistant',
        content: [
          ...(text ? [{ type: 'text', text }] : []),
          ...m.tool_calls.map((tc) => ({
            type: 'tool-call',
            id: tc.id,
            name: tc.function.name,
            arguments: tc.function.arguments,
          })),
        ],
      });
      continue;
    }

    harnessMessages.push({
      role: m.role,
      content: text,
    });
  }

  return {
    ...(systemParts.length > 0 ? { system: systemParts.join('\n\n') } : {}),
    harnessMessages,
  };
}

export class TodayOpenAIShimServer {
  private server: http.Server | null = null;
  private readonly adapter: TodayDshAdapter;
  private readonly secret: string = crypto.randomBytes(24).toString('hex');
  private readonly requireBearerSecret: boolean;
  public port = 0;

  constructor(options: TodayShimOptions) {
    this.api = options.api;
    this.requireBearerSecret = options.requireBearerSecret ?? false;
    this.adapter = new TodayDshAdapter(options.api, {
      responseTimeoutMs: options.responseTimeoutMs ?? 120_000,
      enableNativeDeviceTools: options.enableNativeDeviceTools ?? true,
    });
  }

  public readonly api: TodayUpstreamClient;

  public token(): string {
    return this.secret;
  }

  public baseUrl(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  private checkBearer(authHeader: string | undefined): boolean {
    if (!this.requireBearerSecret) {
      return true;
    }
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return false;
    }
    const provided = Buffer.from(authHeader.slice(7).trim(), 'utf8');
    const expected = Buffer.from(this.secret, 'utf8');
    if (provided.length !== expected.length) {
      return false;
    }
    return crypto.timingSafeEqual(provided, expected);
  }

  public async start(listenPort = 0): Promise<number> {
    if (this.server) {
      return this.port;
    }
    this.server = http.createServer(async (req, res) => {
      try {
        if (!hostIsLoopback(req.headers.host) || !originIsLoopback(req.headers.origin)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'Loopback access only' } }));
          return;
        }
        if (!this.checkBearer(req.headers.authorization)) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'Invalid shim bearer token' } }));
          return;
        }

        const urlPath = (req.url ?? '/').split('?')[0];
        if (req.method === 'GET' && urlPath === '/v1/models') {
          await this.handleModels(res);
          return;
        }
        if (req.method === 'GET' && urlPath === '/v1/today/status') {
          const status = await this.api.getPricingStatus();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(status));
          return;
        }
        if (req.method === 'POST' && urlPath === '/v1/chat/completions') {
          await this.handleChatCompletions(req, res);
          return;
        }
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: `Route not found: ${req.method} ${urlPath}` } }));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
        }
        res.end(JSON.stringify({ error: { message } }));
      }
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(listenPort, '127.0.0.1', () => {
        const addr = this.server!.address();
        if (addr && typeof addr === 'object') {
          this.port = addr.port;
        }
        resolve();
      });
    });

    return this.port;
  }

  private async handleModels(res: http.ServerResponse): Promise<void> {
    const status = await this.api.getPricingStatus();
    const catalog = deriveCatalogFromPricing(status);
    const models = catalog.map((item) => ({
      id: item.id,
      object: 'model',
      created: Math.floor(Date.now() / 1000),
      owned_by: `today-${this.api.config.region}`,
      description: `${item.name} (${item.subtitle})`,
      metadata: {
        optionId: item.optionId,
        multiplier: item.multiplier,
        freePromo: item.freePromo,
      },
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ object: 'list', data: models }));
  }

  private async handleChatCompletions(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.from(chunk));
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as OpenAIChatCompletionRequest;
    const { system, harnessMessages } = openAiMessagesToHarnessMessages(body.messages);
    const completionId = `chatcmpl-${crypto.randomUUID()}`;
    const created = Math.floor(Date.now() / 1000);

    const abortController = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) {
        abortController.abort();
      }
    });

    const streamIter = this.adapter.stream({
      provider: this.api.config.providerId,
      model: body.model,
      messages: harnessMessages,
      system,
      tools: body.tools,
      toolChoice: body.tool_choice,
      signal: abortController.signal,
    });

    if (body.stream) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      });

      let sentRole = false;
      let toolCallIdx = 0;

      for await (const chunk of streamIter) {
        if (chunk.type === 'text-delta') {
          const payload = {
            id: completionId,
            object: 'chat.completion.chunk',
            created,
            model: body.model,
            choices: [
              {
                index: 0,
                delta: {
                  ...(sentRole ? {} : { role: 'assistant' }),
                  content: chunk.text,
                },
                finish_reason: null,
              },
            ],
          };
          sentRole = true;
          res.write(`data: ${JSON.stringify(payload)}\n\n`);
        } else if (chunk.type === 'block-end' && chunk.block.type === 'tool-call') {
          const payload = {
            id: completionId,
            object: 'chat.completion.chunk',
            created,
            model: body.model,
            choices: [
              {
                index: 0,
                delta: {
                  ...(sentRole ? {} : { role: 'assistant' }),
                  tool_calls: [
                    {
                      index: toolCallIdx++,
                      id: chunk.block.id,
                      type: 'function',
                      function: {
                        name: chunk.block.name,
                        arguments: chunk.block.arguments,
                      },
                    },
                  ],
                },
                finish_reason: null,
              },
            ],
          };
          sentRole = true;
          res.write(`data: ${JSON.stringify(payload)}\n\n`);
        } else if (chunk.type === 'finish') {
          if (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted') {
            const errPayload = {
              error: {
                message: chunk.reason.failure.message,
                code: chunk.reason.failure.code,
              },
            };
            res.write(`data: ${JSON.stringify(errPayload)}\n\n`);
          } else {
            const finishReason =
              chunk.reason.kind === 'tool-calls'
                ? 'tool_calls'
                : chunk.reason.kind === 'max-tokens'
                  ? 'length'
                  : 'stop';
            res.write(
              `data: ${JSON.stringify({
                id: completionId,
                object: 'chat.completion.chunk',
                created,
                model: body.model,
                choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
              })}\n\n`
            );
          }
          res.write('data: [DONE]\n\n');
          res.end();
          return;
        }
      }
      if (!res.writableEnded) {
        res.write('data: [DONE]\n\n');
        res.end();
      }
      return;
    }

    // Non-streaming JSON response
    let fullText = '';
    const toolCalls: OpenAIToolCall[] = [];
    let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    for await (const chunk of streamIter) {
      if (chunk.type === 'text-delta') {
        fullText += chunk.text;
      } else if (chunk.type === 'block-end' && chunk.block.type === 'tool-call') {
        toolCalls.push({
          id: chunk.block.id,
          type: 'function',
          function: {
            name: chunk.block.name,
            arguments: chunk.block.arguments,
          },
        });
      } else if (chunk.type === 'usage') {
        usage = {
          prompt_tokens: chunk.usage.inputTokens,
          completion_tokens: chunk.usage.outputTokens,
          total_tokens: chunk.usage.totalTokens,
        };
      } else if (chunk.type === 'finish') {
        if (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted') {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              error: {
                message: chunk.reason.failure.message,
                code: chunk.reason.failure.code,
              },
            })
          );
          return;
        }
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        id: completionId,
        object: 'chat.completion',
        created,
        model: body.model,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: toolCalls.length > 0 ? fullText || null : fullText,
              ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
            },
            finish_reason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
          },
        ],
        usage,
      })
    );
  }

  public async stop(): Promise<void> {
    this.adapter.close();
    if (this.server) {
      await new Promise<void>((resolve) => this.server!.close(() => resolve()));
      this.server = null;
    }
  }
}

export async function createTodayShim(
  options: TodayShimOptions & { port?: number }
): Promise<TodayOpenAIShimServer> {
  const shim = new TodayOpenAIShimServer(options);
  await shim.start(options.port ?? 0);
  return shim;
}
