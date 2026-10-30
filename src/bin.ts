#!/usr/bin/env node
import { TODAY_CONNECT_VERSION } from './version.js';
import {
  detectInstalledRegion,
  findInstalledExecutable,
  getRegionConfig,
} from './config.js';
import { TodayCredentialStore, safeMessage } from './credentials.js';
import { TodayUpstreamClient } from './api-client.js';
import { createTodayShim } from './shim.js';
import type { TodayRegion } from './types.js';

const REGIONS: readonly TodayRegion[] = ['cn', 'global'];

function printHelp(): void {
  console.log(
    [
      'Usage: dsh-today <doctor|status|models|serve|ask> [options]',
      '',
      'Commands:',
      '  doctor               Secret-free sign-in and environment diagnostics across CN & Global',
      '  status               Live plan, remaining quota breakdown, and selectable model options',
      '  models               List all upstream LLM model IDs registered on Today Cloud',
      '  serve [port]         Start local 127.0.0.1 OpenAI-compatible proxy (default port: 18421)',
      '  ask <prompt...>      Send a one-shot chat completion via local Today OpenAI Shim',
      '',
      'Options:',
      '  --json               Emit structured JSON output (doctor / status / models)',
      '  --region <cn|global> Force region instead of auto-detecting',
      '  --model <optionId>   Specify model option for `ask` (e.g. model.minimax-m31-flash)',
    ].join('\n')
  );
}

async function runDoctor(jsonOutput: boolean): Promise<number> {
  const regionReports = await Promise.all(
    REGIONS.map(async (region) => {
      const cfg = getRegionConfig(region);
      const store = new TodayCredentialStore(cfg);
      const files = store.desktopFilesPresent();
      const executable = findInstalledExecutable(region) ?? null;

      let state: 'signed-in' | 'signed-out' | 'missing' | 'error' = 'missing';
      let slotIndex: number | null = null;
      let generation: number | null = null;
      let authSource: string | null = null;
      let hasUser = false;
      let errorDetail: string | null = null;

      if (files.head) {
        try {
          const loaded = store.loadDiskCredentials();
          state = loaded.head.state;
          slotIndex = loaded.head.slotIndex;
          generation = loaded.head.generation;
          authSource = loaded.record.source;
          hasUser = Boolean(loaded.record.user?.id);
        } catch (err) {
          state = 'error';
          errorDetail = safeMessage(err);
        }
      }

      return {
        region,
        productName: cfg.productName,
        apiBaseUrl: cfg.apiBaseUrl,
        userDataDir: cfg.userDataDir,
        executable,
        files,
        state,
        slotIndex,
        generation,
        authSource,
        hasUser,
        ...(errorDetail ? { error: errorDetail } : {}),
      };
    })
  );

  const report = {
    schemaVersion: 1,
    package: 'dsh-today',
    version: TODAY_CONNECT_VERSION,
    node: process.version,
    platform: process.platform,
    regions: regionReports,
  };

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
    return 0;
  }

  console.log(`dsh-today v${TODAY_CONNECT_VERSION} (node ${process.version}, ${process.platform})`);
  for (const r of regionReports) {
    console.log(`\n[${r.region.toUpperCase()}] ${r.productName} (${r.apiBaseUrl})`);
    console.log(`  UserData Dir:  ${r.userDataDir}`);
    console.log(`  Executable:    ${r.executable ?? '(not found)'}`);
    console.log(
      `  Files Present: head=${r.files.head}, slotA=${r.files.slotA}, slotB=${r.files.slotB}, localState=${r.files.localState}`
    );
    console.log(`  Auth State:    ${r.state}${r.authSource ? ` (source=${r.authSource}, slot=${r.slotIndex}, gen=${r.generation})` : ''}`);
    if (r.error) {
      console.log(`  Error:         ${r.error}`);
    }
  }
  return 0;
}

async function runStatus(preferredRegion: TodayRegion | undefined, jsonOutput: boolean): Promise<number> {
  const cfg = detectInstalledRegion(preferredRegion);
  const store = new TodayCredentialStore(cfg);
  const api = new TodayUpstreamClient(cfg, store);
  const status = await api.getPricingStatus();

  if (jsonOutput) {
    console.log(
      JSON.stringify(
        {
          region: cfg.region,
          apiBaseUrl: cfg.apiBaseUrl,
          status,
        },
        null,
        2
      )
    );
    return 0;
  }

  console.log(`Region:         ${cfg.displayName} (${cfg.apiBaseUrl})`);
  console.log(`Plan:           ${status.display.title} — ${status.display.subtitle}`);
  console.log(`Usage:          ${status.usage.progressText} (Used: ${status.usage.progress}%, Period: ${status.usage.period})`);
  if (status.usage.breakdown?.items) {
    const breakdownStr = status.usage.breakdown.items
      .map((item) => `${item.display.title}: ${item.display.percentText}`)
      .join(' | ');
    console.log(`Breakdown:      ${breakdownStr}`);
  }
  console.log(`Active Model:   ${status.modelOptions.selectedOptionId}`);
  console.log('\nSelectable Model Options:');
  for (const opt of status.modelOptions.options) {
    const marker = opt.id === status.modelOptions.selectedOptionId ? '*' : ' ';
    console.log(` ${marker} ${opt.id.padEnd(28)} ${opt.display.title} (${opt.display.subtitle})`);
  }
  return 0;
}

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  const jsonOutput = rawArgs.includes('--json');

  let preferredRegion: TodayRegion | undefined;
  const regionIdx = rawArgs.indexOf('--region');
  if (regionIdx !== -1 && rawArgs[regionIdx + 1]) {
    const val = rawArgs[regionIdx + 1].toLowerCase();
    if (val === 'cn' || val === 'global') {
      preferredRegion = val;
    }
  }

  let requestedModel: string | undefined;
  const modelIdx = rawArgs.indexOf('--model');
  if (modelIdx !== -1 && rawArgs[modelIdx + 1]) {
    requestedModel = rawArgs[modelIdx + 1];
  }

  const positional: string[] = [];
  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === '--json') continue;
    if (arg === '--region' || arg === '--model') {
      i += 1;
      continue;
    }
    positional.push(arg);
  }

  const [cmd = 'status', ...rest] = positional;

  if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
    printHelp();
    return;
  }

  if (cmd === 'doctor') {
    process.exitCode = await runDoctor(jsonOutput);
    return;
  }

  if (cmd === 'status') {
    process.exitCode = await runStatus(preferredRegion, jsonOutput);
    return;
  }

  const cfg = detectInstalledRegion(preferredRegion);
  const store = new TodayCredentialStore(cfg);
  const api = new TodayUpstreamClient(cfg, store);

  if (cmd === 'models') {
    const models = await api.getLlmModels();
    if (jsonOutput) {
      console.log(JSON.stringify({ region: cfg.region, count: models.length, models }, null, 2));
      return;
    }
    console.log(`Today Cloud Registered LLM Models (${models.length}):`);
    for (const m of models) {
      console.log(`  - ${m}`);
    }
    return;
  }

  if (cmd === 'serve') {
    const portArg = rest[0] ? Number.parseInt(rest[0], 10) : 18421;
    const shim = await createTodayShim({
      api,
      requireBearerSecret: false,
      port: Number.isFinite(portArg) ? portArg : 18421,
    });
    console.log(`[dsh-today] OpenAI-compatible Shim listening on ${shim.baseUrl()}/v1`);
    console.log(`  Region:          ${cfg.displayName} (${cfg.apiBaseUrl})`);
    console.log(`  Models Endpoint: ${shim.baseUrl()}/v1/models`);
    console.log(`  Chat Endpoint:   ${shim.baseUrl()}/v1/chat/completions`);
    console.log(`  Quota Endpoint:  ${shim.baseUrl()}/v1/today/status`);
    return;
  }

  if (cmd === 'ask') {
    const prompt = rest.join(' ').trim() || '你好，请用一句话介绍你自己。';
    const shim = await createTodayShim({ api, requireBearerSecret: true, port: 0 });
    try {
      const resp = await fetch(`${shim.baseUrl()}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${shim.token()}`,
        },
        body: JSON.stringify({
          model: requestedModel ?? 'model.deepseek-v4.1-flash',
          messages: [{ role: 'user', content: prompt }],
          stream: false,
        }),
      });
      const data = await resp.json();
      if (jsonOutput) {
        console.log(JSON.stringify(data, null, 2));
      } else {
        const reply = (data as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message?.content;
        console.log(reply ?? JSON.stringify(data, null, 2));
      }
    } finally {
      await shim.stop();
    }
    return;
  }

  printHelp();
}

main().catch((err) => {
  console.error(`Error: ${safeMessage(err)}`);
  process.exit(1);
});
