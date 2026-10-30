import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  pickFinalAssistantFromHistory,
  projectHarnessMessages,
  projectHarnessTools,
  TodayDshAdapter,
  type DshStreamChunk,
} from '../src/dsh-adapter.js';
import { TodayUpstreamClient } from '../src/api-client.js';
import type { TodaySocketStream } from '../src/socket-client.js';
import type { CanonicalMessageSnapshot, TodayNativeInvocationResult } from '../src/types.js';

class MockSocketStream extends EventEmitter {
  public serverDeviceId = 'd_mock_bridge_1';
  public isConnected = true;
  public completedInvocations: TodayNativeInvocationResult[] = [];
  public pendingIds = new Set<string>();

  public async ensureConnected(): Promise<void> {}
  public hasPendingInvocation(id: string): boolean {
    return this.pendingIds.has(id);
  }
  public completeInvocation(result: TodayNativeInvocationResult): boolean {
    if (!this.pendingIds.has(result.invocationId)) return false;
    this.pendingIds.delete(result.invocationId);
    this.completedInvocations.push(result);
    queueMicrotask(() => this.emit('mock_invocation_completed', result));
    return true;
  }
  public close(): void {
    this.pendingIds.clear();
  }
}

describe('DSH Harness projection, QA Card decoding, Dual-Engine Tools & Streaming', () => {
  it('projects V4 role:tool and pre-V4 user+tool-result messages into OpenAI tool messages', () => {
    const projected = projectHarnessMessages(
      [
        { role: 'user', content: 'Check weather' },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              id: 'call_1',
              name: 'get_weather',
              arguments: '{"city":"Shanghai"}',
            },
          ],
        },
        {
          role: 'tool',
          toolCallId: 'call_1',
          content: [{ type: 'text', text: '{"temp":22}' }],
        },
      ],
      'You are a helpful assistant'
    );

    assert.equal(projected.length, 4);
    assert.equal(projected[0].role, 'system');
    assert.equal(projected[1].role, 'user');
    assert.equal(projected[2].role, 'assistant');
    assert.equal(projected[2].tool_calls?.[0].function.name, 'get_weather');
    assert.equal(projected[3].role, 'tool');
    assert.equal(projected[3].tool_call_id, 'call_1');
    assert.equal(projected[3].content, '{"temp":22}');
  });

  it('projects flat harness tools into OpenAI function tools', () => {
    const tools = projectHarnessTools([
      {
        name: 'get_weather',
        description: 'Get weather by city',
        parameters: { type: 'object', properties: { city: { type: 'string' } } },
      },
    ]);
    assert.equal(tools.length, 1);
    assert.equal(tools[0].type, 'function');
    assert.equal(tools[0].function.name, 'get_weather');
  });

  it('renders proprietary Today QA cards into clean Markdown instead of dropping them', () => {
    const snapshot: CanonicalMessageSnapshot = {
      id: 'msg_aw_card_1',
      conversationId: 'conv_1',
      threadId: 'th_1',
      cursor: 'c1',
      role: 'assistant',
      state: 'completed',
      isFinal: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      body: {
        parts: [
          {
            messageType: 'text',
            content: { text: '需要向你确认几个关键问题：' },
          },
          {
            messageType: 'qa_cardflow_single',
            content: {
              card_id: 'card_1',
              body: {
                entry_card_id: 'node_1',
                cards: [
                  {
                    card_id: 'node_1',
                    parent_card_id: null,
                    prompt: '1. 请选择目标框架？',
                    options: [
                      { id: 'opt_1', label: 'React + Vite', description: '轻量现代前端方案' },
                      { id: 'opt_2', label: 'Next.js', description: '全栈 SSR 方案' },
                    ],
                  },
                ],
              },
            },
          },
        ],
      },
    };

    const text = TodayUpstreamClient.extractTextFromCanonicalMessage(snapshot);
    assert.ok(text.includes('需要向你确认几个关键问题：'));
    assert.ok(text.includes('1. 请选择目标框架？'));
    assert.ok(text.includes('React + Vite — 轻量现代前端方案'));
    assert.ok(text.includes('Next.js — 全栈 SSR 方案'));
  });

  it('completes a native DeviceInvoke tool loop over WebSocket without creating a second conversation', async () => {
    const mockSocket = new MockSocketStream();
    let createdConvs = 0;
    let sentMessages = 0;
    let syncedSpecsCount = 0;

    const fakeApi = {
      config: { region: 'cn', providerId: 'today' },
      selectModelOption: async () => {},
      syncDeviceTools: async (_devId: string, specs: unknown[]) => {
        syncedSpecsCount = specs.length;
      },
      createV3Conversation: async () => {
        createdConvs += 1;
        return 'conv_native_1';
      },
      sendV3Message: async () => {
        sentMessages += 1;
        queueMicrotask(() => {
          mockSocket.pendingIds.add('inv_999');
          mockSocket.emit('invocation_request', {
            invocationId: 'inv_999',
            capabilityId: 'dsh__read',
            args: { file_path: 'package.json' },
            timeoutMs: 120_000,
          });
        });
        return {
          messageId: 'msg_u1',
          conversationId: 'conv_native_1',
          threadId: 'thread_1',
          sequence: 1,
          clientMessageId: 'cm_1',
        };
      },
    } as unknown as TodayUpstreamClient;

    mockSocket.on('mock_invocation_completed', () => {
      mockSocket.emit('token', {
        conversationId: 'conv_native_1',
        threadId: 'thread_1',
        delta: '包名为 ',
      });
      mockSocket.emit('token', {
        conversationId: 'conv_native_1',
        threadId: 'thread_1',
        delta: 'dsh-today。',
      });
      mockSocket.emit('completed', {
        conversationId: 'conv_native_1',
        threadId: 'thread_1',
        fullText: '包名为 dsh-today。',
      });
    });

    const adapter = new TodayDshAdapter(fakeApi, {
      socketStream: mockSocket as unknown as TodaySocketStream,
    });

    const step1Chunks: DshStreamChunk[] = [];
    for await (const ch of adapter.stream({
      provider: 'today',
      model: 'model.deepseek-v4.1-flash',
      sessionId: 'sess_test_1',
      messages: [{ role: 'user', content: 'Read package.json' }],
      tools: [
        {
          name: 'read',
          description: 'Read local file',
          parameters: { type: 'object', properties: { file_path: { type: 'string' } }, required: ['file_path'] },
        },
      ],
    })) {
      step1Chunks.push(ch);
    }

    assert.equal(syncedSpecsCount, 1);
    assert.equal(createdConvs, 1);
    assert.equal(sentMessages, 1);

    const toolEnd = step1Chunks.find((c) => c.type === 'block-end' && c.block.type === 'tool-call');
    assert.ok(toolEnd && toolEnd.type === 'block-end' && toolEnd.block.type === 'tool-call');
    assert.equal(toolEnd.block.name, 'read');
    assert.equal(toolEnd.block.id, 'tinv_inv_999');

    // Step 2: DSH returns tool output -> adapter resumes via WebSocket `invocation.result` with 0 HTTP sends!
    const step2Chunks: DshStreamChunk[] = [];
    for await (const ch of adapter.stream({
      provider: 'today',
      model: 'model.deepseek-v4.1-flash',
      sessionId: 'sess_test_1',
      messages: [
        { role: 'user', content: 'Read package.json' },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              id: 'tinv_inv_999',
              name: 'read',
              arguments: '{"file_path":"package.json"}',
            },
          ],
        },
        {
          role: 'tool',
          toolCallId: 'tinv_inv_999',
          content: '{"name":"dsh-today"}',
        },
      ],
      tools: [
        {
          name: 'read',
          description: 'Read local file',
          parameters: { type: 'object', properties: { file_path: { type: 'string' } }, required: ['file_path'] },
        },
      ],
    })) {
      step2Chunks.push(ch);
    }

    assert.equal(createdConvs, 1);
    assert.equal(sentMessages, 1); // Resumed directly on socket!
    assert.equal(mockSocket.completedInvocations.length, 1);

    const deltas = step2Chunks
      .filter((c): c is Extract<DshStreamChunk, { type: 'text-delta' }> => c.type === 'text-delta')
      .map((c) => c.text);
    assert.deepEqual(deltas, ['包名为 ', 'dsh-today。']);

    const usageChunk = step2Chunks.find(
      (c): c is Extract<DshStreamChunk, { type: 'usage' }> => c.type === 'usage'
    );
    assert.ok(usageChunk, 'Step 2 must emit usage chunk');
    assert.ok(
      typeof usageChunk.usage.cacheReadTokens === 'number' && usageChunk.usage.cacheReadTokens > 0,
      'Incremental continuation must report cacheReadTokens > 0'
    );
    assert.equal(
      usageChunk.usage.totalTokens,
      usageChunk.usage.inputTokens + usageChunk.usage.outputTokens + (usageChunk.usage.cacheReadTokens ?? 0),
      'totalTokens must match sum of input, output, and cacheReadTokens'
    );
  });

  it('converts canned upstream gateway error text into a retryable SERVER error finish', async () => {
    const mockSocket = new MockSocketStream();
    const fakeApi = {
      config: { region: 'cn', providerId: 'today' },
      selectModelOption: async () => {},
      syncDeviceTools: async () => {},
      createV3Conversation: async () => 'conv_err_1',
      sendV3Message: async () => {
        queueMicrotask(() => {
          mockSocket.emit('completed', {
            conversationId: 'conv_err_1',
            threadId: 'th_err_1',
            fullText: '抱歉，暂时无法完成这次请求，请稍后重试。',
          });
        });
        return {
          messageId: 'm1',
          conversationId: 'conv_err_1',
          threadId: 'th_err_1',
          sequence: 1,
          clientMessageId: 'cm1',
        };
      },
    } as unknown as TodayUpstreamClient;

    const adapter = new TodayDshAdapter(fakeApi, {
      socketStream: mockSocket as unknown as TodaySocketStream,
    });

    const chunks: DshStreamChunk[] = [];
    for await (const ch of adapter.stream({
      provider: 'today',
      model: 'model.deepseek-v4.1-flash',
      messages: [{ role: 'user', content: 'Hi' }],
    })) {
      chunks.push(ch);
    }

    const finish = chunks.find((c) => c.type === 'finish');
    assert.ok(finish && finish.type === 'finish');
    assert.equal(finish.reason.kind, 'error');
    if (finish.reason.kind === 'error') {
      assert.equal(finish.reason.failure.code, 'SERVER');
    }
  });

  it('picks only the undelivered final assistant reply of the active turn from REST history', () => {
    const base = { conversationId: 'c1', cursor: 'x', state: 'completed', isFinal: true, createdAt: '', updatedAt: '' } as const;
    const items = [
      { ...base, id: 'u1', role: 'user', threadId: 't1', originMessageId: 'u1', body: { content: { parts: [{ type: 'text', text: 'hi' }] } } },
      { ...base, id: 'msg_logical_1', role: 'tool', threadId: 't1', originMessageId: 'u1', bodyType: 'today.agent-work.tool-activity.v1', body: {} },
      { ...base, id: 'msg_aw_old', role: 'assistant', threadId: 't0', originMessageId: 'u0', body: { content: { parts: [{ type: 'text', text: 'old' }] } } },
      { ...base, id: 'msg_aw_new', role: 'assistant', threadId: 't1', originMessageId: 'u1', body: { content: { parts: [{ type: 'text', text: '最终回答' }] } } },
    ] as unknown as CanonicalMessageSnapshot[];

    const hit = pickFinalAssistantFromHistory(items, { threadId: 't1', originMessageId: 'u1' }, new Set());
    assert.deepEqual(hit, { id: 'msg_aw_new', text: '最终回答' });
    assert.equal(pickFinalAssistantFromHistory(items, { threadId: 't1', originMessageId: 'u1' }, new Set(['msg_aw_new'])), null);
    assert.equal(pickFinalAssistantFromHistory(items, { threadId: 't9', originMessageId: 'u9' }, new Set()), null);
  });

  it('completes the turn through the REST fallback poller when the WebSocket push never arrives', async () => {
    const mockSocket = new MockSocketStream();
    const finalItem = {
      id: 'msg_aw_rest_1',
      conversationId: 'conv_rest_1',
      threadId: 'th_rest_1',
      originMessageId: 'mu_rest_1',
      cursor: 'c',
      role: 'assistant',
      state: 'completed',
      createdAt: '',
      updatedAt: '',
      body: { content: { parts: [{ type: 'text', text: '这是通过 REST 兜底拿到的完整回答。' }] } },
    };
    const fakeApi = {
      config: { region: 'cn', providerId: 'today' },
      selectModelOption: async () => {},
      syncDeviceTools: async () => {},
      createV3Conversation: async () => 'conv_rest_1',
      sendV3Message: async () => ({
        messageId: 'mu_rest_1',
        conversationId: 'conv_rest_1',
        threadId: 'th_rest_1',
        sequence: 1,
        clientMessageId: 'cm',
      }),
      listV3Messages: async () => [finalItem],
    } as unknown as TodayUpstreamClient;

    const adapter = new TodayDshAdapter(fakeApi, {
      socketStream: mockSocket as unknown as TodaySocketStream,
      responseTimeoutMs: 20_000,
    });

    const chunks: DshStreamChunk[] = [];
    for await (const ch of adapter.stream({
      provider: 'today',
      model: 'model.deepseek-v4.1-flash',
      sessionId: 'sess_rest_1',
      messages: [{ role: 'user', content: 'Hi' }],
    })) {
      chunks.push(ch);
    }

    const finish = chunks.find((c) => c.type === 'finish');
    assert.ok(finish && finish.type === 'finish');
    assert.equal(finish.reason.kind, 'stop');
    const text = chunks
      .filter((c): c is Extract<DshStreamChunk, { type: 'text-delta' }> => c.type === 'text-delta')
      .map((c) => c.text)
      .join('');
    assert.equal(text, '这是通过 REST 兜底拿到的完整回答。');
  });

  it('advertises 1,000,000 token context window, multimodal image inputs, and reasoning tiers', async () => {
    const fakeApi = {
      config: { region: 'cn', providerId: 'today' },
      getPricingStatus: async () => ({}),
    } as unknown as TodayUpstreamClient;
    const adapter = new TodayDshAdapter(fakeApi);

    const models = await adapter.listModels('today');
    const ds = models.find((m) => m.id === 'model.deepseek-v4.1-flash');
    assert.ok(ds, 'DeepSeek V4.1 Flash should be in catalog');
    assert.equal(ds.context?.contextWindow, 1_000_000);
    assert.deepEqual(ds.inputModalities, ['text', 'image']);
    assert.ok((ds as { reasoning?: { efforts?: Array<{ id: string }> } }).reasoning?.efforts?.some((e) => e.id === 'medium'));
    const resolved = await adapter.resolveModel('today', 'deepseek-v4.1-flash');
    assert.equal(resolved.context?.contextWindow, 1_000_000);
    assert.deepEqual(resolved.inputModalities, ['text', 'image']);
    assert.equal((resolved as { reasoning?: { defaultEffort?: string } }).reasoning?.defaultEffort, 'medium');
  });

  it('projects multimodal image blocks in user messages into markdown images', () => {
    const projected = projectHarnessMessages([
      {
        role: 'user',
        content: [
          { type: 'text', text: '请分析这张报错截图：' },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
            },
          },
        ],
      },
    ]);

    assert.equal(projected.length, 1);
    assert.equal(projected[0].role, 'user');
    const content = String(projected[0].content);
    assert.ok(content.includes('请分析这张报错截图：'));
    assert.ok(content.includes('![image](data:image/png;base64,iVBORw0KGgo'));
  });

  it('streams reasoning blocks via WebSocket presentation before emitting text blocks', async () => {
    const mockSocket = new MockSocketStream();
    const fakeApi = {
      config: { region: 'cn', providerId: 'today' },
      selectModelOption: async () => {},
      createV3Conversation: async () => 'conv_reasoning_1',
      sendV3Message: async () => ({
        messageId: 'mu_reason_1',
        conversationId: 'conv_reasoning_1',
        threadId: 'th_reason_1',
        sequence: 1,
        clientMessageId: 'cm',
      }),
      listV3Messages: async () => [],
    } as unknown as TodayUpstreamClient;

    const adapter = new TodayDshAdapter(fakeApi, {
      socketStream: mockSocket as unknown as TodaySocketStream,
      responseTimeoutMs: 10_000,
    });

    // Start stream in background
    const chunksPromise = (async () => {
      const acc: DshStreamChunk[] = [];
      for await (const ch of adapter.stream({
        provider: 'today',
        model: 'model.deepseek-v4.1-flash',
        sessionId: 'sess_reason_1',
        messages: [{ role: 'user', content: 'Explain recursion' }],
      })) {
        acc.push(ch);
      }
      return acc;
    })();

    // Emit live WebSocket reasoning and text events
    await new Promise((r) => setTimeout(r, 20));
    mockSocket.emit('reasoning', {
      conversationId: 'conv_reasoning_1',
      threadId: 'th_reason_1',
      messageId: 'msg_aw_1',
      originMessageId: 'mu_reason_1',
      delta: '递归包含基准情形与递归情形...',
    });

    await new Promise((r) => setTimeout(r, 20));
    mockSocket.emit('token', {
      conversationId: 'conv_reasoning_1',
      threadId: 'th_reason_1',
      messageId: 'msg_aw_1',
      originMessageId: 'mu_reason_1',
      delta: '递归的基本概念如下：',
    });

    await new Promise((r) => setTimeout(r, 20));
    mockSocket.emit('completed', {
      conversationId: 'conv_reasoning_1',
      threadId: 'th_reason_1',
      messageId: 'msg_aw_1',
      originMessageId: 'mu_reason_1',
      fullText: '递归的基本概念如下：',
    });

    const chunks = await chunksPromise;

    // Check reasoning block
    const reasoningStart = chunks.find((c) => c.type === 'block-start' && c.blockType === 'reasoning');
    assert.ok(reasoningStart, 'Should emit block-start for reasoning');

    const reasoningDelta = chunks.find((c) => c.type === 'reasoning-delta');
    assert.ok(reasoningDelta && reasoningDelta.type === 'reasoning-delta');
    assert.equal(reasoningDelta.text, '递归包含基准情形与递归情形...');

    const reasoningEnd = chunks.find((c) => c.type === 'block-end' && c.block.type === 'reasoning');
    assert.ok(reasoningEnd, 'Should close reasoning block before text');

    // Check text block
    const textStart = chunks.find((c) => c.type === 'block-start' && c.blockType === 'text');
    assert.ok(textStart, 'Should emit block-start for text');

    const textDelta = chunks.find((c) => c.type === 'text-delta');
    assert.ok(textDelta && textDelta.type === 'text-delta');
    assert.equal(textDelta.text, '递归的基本概念如下：');

    // Verify block order: reasoning start -> reasoning delta -> reasoning end -> text start -> text delta -> text end
    const rStartIdx = chunks.indexOf(reasoningStart!);
    const rEndIdx = chunks.indexOf(reasoningEnd!);
    const tStartIdx = chunks.indexOf(textStart!);
    assert.ok(rStartIdx < rEndIdx, 'Reasoning start must precede reasoning end');
    assert.ok(rEndIdx < tStartIdx, 'Reasoning end must precede text start');
  });

  it('extracts <think>...</think> in REST fallback and emits clean reasoning block followed by text', async () => {
    const mockSocket = new MockSocketStream();
    const finalItem = {
      id: 'msg_aw_think_1',
      conversationId: 'conv_think_1',
      threadId: 'th_think_1',
      originMessageId: 'mu_think_1',
      cursor: 'c',
      role: 'assistant',
      state: 'completed',
      createdAt: '',
      updatedAt: '',
      body: {
        content: {
          parts: [
            {
              type: 'text',
              text: '<think>\n先思考一下解题思路...\n</think>这是最终答案：42。',
            },
          ],
        },
      },
    };
    const fakeApi = {
      config: { region: 'cn', providerId: 'today' },
      selectModelOption: async () => {},
      createV3Conversation: async () => 'conv_think_1',
      sendV3Message: async () => ({
        messageId: 'mu_think_1',
        conversationId: 'conv_think_1',
        threadId: 'th_think_1',
        sequence: 1,
        clientMessageId: 'cm',
      }),
      listV3Messages: async () => [finalItem],
    } as unknown as TodayUpstreamClient;

    const adapter = new TodayDshAdapter(fakeApi, {
      socketStream: mockSocket as unknown as TodaySocketStream,
      responseTimeoutMs: 20_000,
    });

    const chunks: DshStreamChunk[] = [];
    for await (const ch of adapter.stream({
      provider: 'today',
      model: 'model.deepseek-v4.1-flash',
      sessionId: 'sess_think_1',
      messages: [{ role: 'user', content: 'What is the answer?' }],
    })) {
      chunks.push(ch);
    }

    const reasoningDelta = chunks.find((c) => c.type === 'reasoning-delta');
    assert.ok(reasoningDelta && reasoningDelta.type === 'reasoning-delta');
    assert.ok(reasoningDelta.text.includes('先思考一下解题思路...'));

    const textDeltas = chunks
      .filter((c): c is Extract<DshStreamChunk, { type: 'text-delta' }> => c.type === 'text-delta')
      .map((c) => c.text)
      .join('');
    assert.equal(textDeltas, '这是最终答案：42。');
    assert.ok(!textDeltas.includes('<think>'));
    assert.ok(!textDeltas.includes('</think>'));
  });

  it('auto-pumps incomplete progress reports into host tool calls within the same turn', async () => {
    const mockSocket = new MockSocketStream();
    let sendCount = 0;
    const sentTexts: string[] = [];

    const fakeApi = {
      config: { region: 'cn', providerId: 'today' },
      selectModelOption: async () => {},
      createV3Conversation: async () => 'conv_autopump_1',
      sendV3Message: async (payload: { conversationId: string; text: string }) => {
        sendCount += 1;
        sentTexts.push(payload.text);
        if (sendCount === 1) {
          setTimeout(() => {
            mockSocket.emit('completed', {
              conversationId: 'conv_autopump_1',
              threadId: 'th_autopump_1',
              fullText:
                '核心界面搭建完毕。接线还没写完，我如实告诉你当前进展：目前还不能运行。请问是否需要我继续完成接线？',
            });
          }, 10);
          return {
            messageId: 'mu_pump_1',
            conversationId: 'conv_autopump_1',
            threadId: 'th_autopump_1',
            sequence: 1,
            clientMessageId: 'cm1',
          };
        } else {
          setTimeout(() => {
            mockSocket.emit('completed', {
              conversationId: 'conv_autopump_1',
              threadId: 'th_autopump_2',
              fullText:
                '<dsh_tool_call>\n{"name": "write", "arguments": {"file_path": "index.html", "content": "<html>100% complete</html>"}}\n</dsh_tool_call>',
            });
          }, 10);
          return {
            messageId: 'mu_pump_2',
            conversationId: 'conv_autopump_1',
            threadId: 'th_autopump_2',
            sequence: 2,
            clientMessageId: 'cm2',
          };
        }
      },
    } as unknown as TodayUpstreamClient;

    const adapter = new TodayDshAdapter(fakeApi, {
      socketStream: mockSocket as unknown as TodaySocketStream,
      enableNativeDeviceTools: false, // test Engine 2 XML protocol
    });

    const chunks: DshStreamChunk[] = [];
    for await (const ch of adapter.stream({
      provider: 'today',
      model: 'model.deepseek-v4.1-flash',
      sessionId: 'sess_autopump_1',
      messages: [{ role: 'user', content: 'Build a complete kanban board' }],
      tools: [
        {
          name: 'write',
          description: 'Write file to disk',
          parameters: {
            type: 'object',
            properties: { file_path: { type: 'string' }, content: { type: 'string' } },
            required: ['file_path', 'content'],
          },
        },
      ],
    })) {
      chunks.push(ch);
    }

    // Must have automatically sent 2 messages (turn 1 + auto-pump continuation)
    assert.equal(sendCount, 2, 'Must trigger auto-pump continuation message to upstream');
    assert.ok(
      sentTexts[1].includes('[Auto-Pump Notice]'),
      'Auto-pump prompt must include Auto-Pump directive'
    );

    // Must have emitted reasoning explaining auto-continuation
    const autoPumpReasoning = chunks.find(
      (c) => c.type === 'reasoning-delta' && c.text.includes('Today 自动续推')
    );
    assert.ok(autoPumpReasoning, 'Must emit auto-pump reasoning explanation chunk');

    // Must have synthesized CoT reasoning for the tool call
    const toolReasoning = chunks.find(
      (c) => c.type === 'reasoning-delta' && c.text.includes('write')
    );
    assert.ok(toolReasoning, 'Must synthesize CoT reasoning block before tool call');

    // Must have emitted tool-call block for `write`
    const toolEnd = chunks.find((c) => c.type === 'block-end' && c.block.type === 'tool-call');
    assert.ok(toolEnd && toolEnd.type === 'block-end' && toolEnd.block.type === 'tool-call');
    assert.equal(toolEnd.block.name, 'write');

    // Must have finished with kind: 'tool-calls' so DSH host executes the tool!
    const finish = chunks.find((c) => c.type === 'finish');
    assert.ok(finish && finish.type === 'finish');
    assert.equal(finish.reason.kind, 'tool-calls');
  });
});
