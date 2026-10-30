import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildConversationPrompt,
  buildIncrementalTurnPrompt,
  compactSchemaParameters,
  createStreamingContentFilter,
  createStreamingToolFilter,
  extractReasoning,
  extractUnreadTargetFilePath,
  FULLWIDTH_BAR,
  isIncompleteWorkReport,
  recoverToolCalls,
  synthesizeToolCallReasoning,
  AGENT_FULL_COMPLETION_INSTRUCTION,
  INCREMENTAL_CONTINUATION_DIRECTIVE,
} from '../src/dsml-recovery.js';
import type { OpenAIToolDefinition } from '../src/types.js';

const SAMPLE_TOOLS: OpenAIToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a file from disk',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ask_user_question',
      description: 'Ask user structured multiple-choice questions',
      parameters: {
        type: 'object',
        properties: {
          questions: {
            type: 'array',
            minItems: 1,
            maxItems: 4,
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'Unique question identifier' },
                header: { type: 'string' },
                question: { type: 'string' },
                options: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      label: { type: 'string' },
                      description: { type: 'string' },
                    },
                    required: ['label'],
                  },
                },
              },
              required: ['id', 'header', 'question', 'options'],
            },
          },
        },
        required: ['questions'],
      },
    },
  },
];

describe('Lossless Schema, Full System Prompt & 4-Gate Tool Call Recovery', () => {
  it('preserves recursive nested array items, properties, and required fields for ask_user_question', () => {
    const compacted = compactSchemaParameters(SAMPLE_TOOLS[1].function.parameters);
    const questionsProp = (compacted.properties as Record<string, Record<string, unknown>>).questions;
    assert.equal(questionsProp.type, 'array');
    assert.equal(questionsProp.minItems, 1);

    const itemSchema = questionsProp.items as Record<string, unknown>;
    assert.equal(itemSchema.type, 'object');
    assert.deepEqual(itemSchema.required, ['id', 'header', 'question', 'options']);

    const itemProps = itemSchema.properties as Record<string, Record<string, unknown>>;
    assert.equal(itemProps.id.type, 'string');
    assert.equal(itemProps.options.type, 'array');

    const optionItem = itemProps.options.items as Record<string, unknown>;
    assert.deepEqual(optionItem.required, ['label']);
  });

  it('preserves full 12,000+ character DSH system prompts without 1800-char truncation', () => {
    const longSystem = `START_MARKER_${'S'.repeat(12_000)}_END_MARKER`;
    const prompt = buildConversationPrompt(
      [
        { role: 'system', content: longSystem },
        { role: 'user', content: 'Hello' },
      ],
      SAMPLE_TOOLS,
      'auto'
    );
    assert.ok(prompt.includes('START_MARKER_'));
    assert.ok(prompt.includes('_END_MARKER'));
    assert.ok(prompt.length > 12_000);
  });

  it('recovers valid <tool_call> and <dsh_tool_call> JSON including dsh__ prefixed names', () => {
    const raw = `Let me check that file.\n<dsh_tool_call>\n{"name": "dsh__read_file", "arguments": {"path": "README.md"}}\n</dsh_tool_call>`;
    const { cleanText, toolCalls } = recoverToolCalls(raw, SAMPLE_TOOLS, 'auto');
    assert.equal(cleanText, 'Let me check that file.');
    assert.equal(toolCalls.length, 1);
    assert.equal(toolCalls[0].function.name, 'read_file');
    assert.deepEqual(JSON.parse(toolCalls[0].function.arguments), { path: 'README.md' });
  });

  it('recovers DeepSeek full-width bar DSML function_calls blocks', () => {
    const b = FULLWIDTH_BAR;
    const raw = [
      'Checking...',
      `<${b}DSML${b}function_calls>`,
      `<${b}DSML${b}invoke name="read_file">`,
      `<${b}DSML${b}parameter name="path" string="true">package.json</${b}DSML${b}parameter>`,
      `</${b}DSML${b}invoke>`,
      `</${b}DSML${b}function_calls>`,
    ].join('\n');

    const { cleanText, toolCalls } = recoverToolCalls(raw, SAMPLE_TOOLS, 'auto');
    assert.equal(cleanText, 'Checking...');
    assert.equal(toolCalls.length, 1);
    assert.equal(toolCalls[0].function.name, 'read_file');
    assert.deepEqual(JSON.parse(toolCalls[0].function.arguments), { path: 'package.json' });
  });

  it('streams visible text immediately while holding back split <dsh_tool_call> markup', () => {
    const filter = createStreamingToolFilter(true);
    const out1 = filter.push('先读取一下配置文件。');
    const out2 = filter.push('\n<dsh_');
    const out3 = filter.push('tool_call>\n{"name":"read_file","arguments":{"path":"a.ts"}}\n</dsh_tool_call>');
    assert.equal(out1, '先读取一下配置文件。\n'.slice(0, 10));
    assert.equal(out1 + out2 + out3, '先读取一下配置文件。\n');
    assert.ok(filter.peekHeld().startsWith('<dsh_tool_call>'));
  });

  it('enforces Gate 2 (undeclared tool name is rolled back as verbatim text)', () => {
    const raw = `<tool_call>{"name": "undeclared_tool", "arguments": {"path": "a.txt"}}</tool_call>`;
    const { cleanText, toolCalls } = recoverToolCalls(raw, SAMPLE_TOOLS, 'auto');
    assert.equal(toolCalls.length, 0);
    assert.equal(cleanText, raw);
  });

  it('enforces Gate 3 (no recovery when tool_choice is none)', () => {
    const raw = `<tool_call>{"name": "read_file", "arguments": {"path": "a.txt"}}</tool_call>`;
    const { cleanText, toolCalls } = recoverToolCalls(raw, SAMPLE_TOOLS, 'none');
    assert.equal(toolCalls.length, 0);
    assert.equal(cleanText, raw);
  });

  it('enforces Gate 4 (missing required parameter rolls back as verbatim text)', () => {
    const raw = `<tool_call>{"name": "read_file", "arguments": {}}</tool_call>`;
    const { cleanText, toolCalls } = recoverToolCalls(raw, SAMPLE_TOOLS, 'auto');
    assert.equal(toolCalls.length, 0);
    assert.equal(cleanText, raw);
  });

  it('extracts <think>...</think> reasoning blocks cleanly and strips tags from cleanContent', () => {
    const raw = `<think>
用户想要了解量子计算的基础。
首先应该简要解释量子比特与叠加态。
</think>量子计算是一种基于量子力学原理的全新计算模型。`;

    const { reasoning, cleanContent } = extractReasoning(raw);
    assert.ok(reasoning.includes('用户想要了解量子计算的基础。'));
    assert.ok(reasoning.includes('首先应该简要解释量子比特与叠加态。'));
    assert.equal(cleanContent, '量子计算是一种基于量子力学原理的全新计算模型。');

    const recovered = recoverToolCalls(raw, SAMPLE_TOOLS, 'auto');
    assert.equal(recovered.reasoning, reasoning);
    assert.equal(recovered.cleanText, '量子计算是一种基于量子力学原理的全新计算模型。');
    assert.equal(recovered.toolCalls.length, 0);
  });

  it('streams reasoning deltas inside <think> and text deltas outside seamlessly via createStreamingContentFilter', () => {
    const filter = createStreamingContentFilter(true);
    const deltas = [
      '前置说明\n<th',
      'ink>\n正在规划步骤...\n步骤1: 查看文件',
      '\n</think>\n这是最终',
      '回答内容。',
    ];

    const emitted: Array<{ type: string; text: string }> = [];
    for (const d of deltas) {
      emitted.push(...filter.push(d));
    }
    emitted.push(...filter.flush());

    const reasoning = emitted
      .filter((e) => e.type === 'reasoning')
      .map((e) => e.text)
      .join('');
    const text = emitted
      .filter((e) => e.type === 'text')
      .map((e) => e.text)
      .join('');

    assert.ok(reasoning.includes('正在规划步骤'));
    assert.ok(reasoning.includes('步骤1: 查看文件'));
    assert.ok(!reasoning.includes('<think>'));
    assert.ok(!reasoning.includes('</think>'));

    assert.ok(text.includes('前置说明'));
    assert.ok(text.includes('这是最终回答内容。'));
    assert.ok(!text.includes('<think>'));
    assert.ok(!text.includes('</think>'));
  });

  it('injects full completion & anti-laziness directives into conversation and incremental prompts', () => {
    const convPrompt = buildConversationPrompt(
      [
        { role: 'system', content: 'You are DSH' },
        { role: 'user', content: 'Write a Kanban board' },
      ],
      SAMPLE_TOOLS,
      'auto'
    );
    assert.ok(convPrompt.includes('Full Implementation & Zero Laziness'));
    assert.ok(convPrompt.includes('100% COMPLETE IMPLEMENTATION'));
    assert.ok(convPrompt.includes('FULL SOVEREIGN LOCAL AUTHORITY'));
    assert.ok(convPrompt.includes('AUTONOMOUS ARTIFACT INGESTION'));
    assert.ok(convPrompt.includes('DEFAULT ONE-SHOT END-TO-END EXECUTION'));
    assert.ok(convPrompt.includes('NEVER omit code'));

    const incPrompt = buildIncrementalTurnPrompt(
      [{ role: 'user', content: 'Fix the buttons' }],
      SAMPLE_TOOLS,
      'auto'
    );
    assert.ok(incPrompt.includes('Continuous Full Autonomous Delivery'));
    assert.ok(incPrompt.includes('Deliver 100% complete results without stopping prematurely'));
  });

  it('normalizes common parameter aliases so file_path maps to path in XML tool calls', () => {
    const xml = '<dsh_tool_call>\n{"name": "read_file", "arguments": {"file_path": "/var/log/dsh.log"}}\n</dsh_tool_call>';
    const recovered = recoverToolCalls(xml, SAMPLE_TOOLS, 'auto');
    assert.equal(recovered.toolCalls.length, 1);
    assert.equal(recovered.toolCalls[0].function.name, 'read_file');
    const args = JSON.parse(recovered.toolCalls[0].function.arguments);
    assert.equal(args.path, '/var/log/dsh.log');
    assert.equal(recovered.cleanText.trim(), '');
  });

  it('detects incomplete work reports, permission excuse reports, and extracts unread file paths', () => {
    const incompleteSamples = [
      '核心界面已经搭建完毕。接线还没写完，我如实告诉你当前进展：目前还不能运行。请问是否需要我继续完成接线？',
      '这次补完之后，文件仍然不能运行，还缺最后一段。请确认后我再写。',
      '工作还没写完，cad.html 目前处于半成品状态，篇幅限制只写了核心部分，剩余请自行实现。',
      '未完全实现，后续由你自行补充事件监听。',
      '代码量较大先写骨架，需要我继续写吗？',
      // Real screenshot case from test machine
      `这次没能把分析交付出来，先跟你说实话。
我已经把 禅院直哉.docx 打开并解包成功：文档内部结构很干净，只有基本的 document.xml、styles、fontTable 和主题，没有图片、批注、修订记录这些额外内容。提取出来的正文一共 2227 个字符、111 段，属于一份很短的提纲，不是长文。
但真正要命的不是我解不开这个文件，而是拉回来的文本在最后一步没能进到我的上下文中，所以我手里只有“体积”，没有“内容”。在没读到字的情况下我要是硬写一份大纲分析，那全是编的，这种事我不干。
现在这份纯文本已经落在工作区里了：
C:\\Users\\MockUser\\Documents\\deepseek-harness\\default-workspace\\chanyuan-raw.txt
你可以直接用记事本打开看一眼，确认里面就是你要分析的那份大纲正文。
接下来最快的两条路，你选一条告诉我：
一是你回一句“继续分析”，我重新把这份 txt 读进来，直接按结构、人物弧线、节奏、冲突密度、卷次分配这些维度给你一份完整拆解。
二是你把正文粘贴到对话里，我立刻开始，连读文件的时间都省了。`,
      '解包成功，但拉回来的文本没进到上下文中，手里只有体积没有内容。你选一条告诉我怎么做。',
      '在没读到字的情况下我不干，回一句继续分析我再读。',
    ];
    for (const sample of incompleteSamples) {
      assert.equal(isIncompleteWorkReport(sample), true, `Should detect as incomplete: ${sample.slice(0, 40)}...`);
    }

    // Verify unread target file extraction from test machine
    const realScreenshotText = `现在这份纯文本已经落在工作区里了：\nC:\\Users\\MockUser\\Documents\\deepseek-harness\\default-workspace\\chanyuan-raw.txt\n你可以直接用记事本打开看一眼`;
    const extractedWin = extractUnreadTargetFilePath(realScreenshotText);
    assert.equal(extractedWin, 'C:\\Users\\MockUser\\Documents\\deepseek-harness\\default-workspace\\chanyuan-raw.txt');

    const quotedText = '数据已生成在 `extracted/report.json`，请确认是否继续。';
    const extractedQuoted = extractUnreadTargetFilePath(quotedText);
    assert.equal(extractedQuoted, 'extracted/report.json');

    const completeSamples = [
      '所有功能已全部实现并写入 disk。应用已经可以正常运行。',
      '文件已编写完毕，请查看成果展示。',
      '根据设计规范，全量代码已持久化到 index.html。',
      '本次修复已完成，单元测试 100% 通过。',
      '这是禅院直哉大纲的完整拆解分析报告：第一部分结构剖析...',
    ];
    for (const sample of completeSamples) {
      assert.equal(isIncompleteWorkReport(sample), false, `Should NOT detect as incomplete: ${sample}`);
    }
  });

  it('synthesizes high-value context-aware CoT reasoning for various tools', () => {
    const readReasoning = synthesizeToolCallReasoning('read_file', '{"path":"src/index.ts"}');
    assert.ok(readReasoning.includes('read_file'));
    assert.ok(readReasoning.includes('src/index.ts'));

    const writeReasoning = synthesizeToolCallReasoning('write_file', '{"path":"dist/app.js","content":"..."}');
    assert.ok(writeReasoning.includes('write_file'));
    assert.ok(writeReasoning.includes('dist/app.js'));

    const editReasoning = synthesizeToolCallReasoning('edit', '{"file_path":"src/app.ts"}');
    assert.ok(editReasoning.includes('edit'));
    assert.ok(editReasoning.includes('src/app.ts'));

    const cmdReasoning = synthesizeToolCallReasoning('pwsh', '{"command":"npm test"}');
    assert.ok(cmdReasoning.includes('npm test'));

    const grillReasoning = synthesizeToolCallReasoning('grill_start', '{}');
    assert.ok(grillReasoning.includes('grill_start'));
  });
});
