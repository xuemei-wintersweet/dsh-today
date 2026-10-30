import type {
  TodayCatalogModel,
  TodayModelOption,
  TodayPricingStatus,
  TodayReasoningConfig,
} from './types.js';

const TODAY_REASONING_CONFIG: TodayReasoningConfig = {
  efforts: [
    { id: 'low', name: 'Low' },
    { id: 'medium', name: 'Medium' },
    { id: 'high', name: 'High' },
  ],
  defaultEffort: 'medium',
  levels: ['low', 'medium', 'high'],
  defaultLevel: 'medium',
};

export const FALLBACK_TODAY_MODELS: readonly TodayCatalogModel[] = [
  {
    id: 'model.deepseek-v4.1-flash',
    optionId: 'model.deepseek-v4.1-flash',
    name: 'DeepSeek V4.1 Flash',
    multiplier: 1,
    freePromo: false,
    disabled: false,
    subtitle: '消耗倍数：1×',
    contextWindow: 1_000_000,
    maxTokens: 32_768,
    supportsImages: true,
    reasoning: TODAY_REASONING_CONFIG,
  },
  {
    id: 'model.minimax-m31-flash',
    optionId: 'model.minimax-m31-flash',
    name: 'MiniMax M3.1 Flash · 限时免费',
    multiplier: 1,
    freePromo: true,
    disabled: false,
    subtitle: '消耗倍数：1×',
    contextWindow: 1_000_000,
    maxTokens: 32_768,
    supportsImages: true,
    reasoning: TODAY_REASONING_CONFIG,
  },
  {
    id: 'model.glm-5.3',
    optionId: 'model.glm-5.3',
    name: 'GLM 5.3',
    multiplier: 4,
    freePromo: false,
    disabled: false,
    subtitle: '消耗倍数：4×',
    contextWindow: 1_000_000,
    maxTokens: 32_768,
    supportsImages: true,
    reasoning: TODAY_REASONING_CONFIG,
  },
  {
    id: 'mode.fast',
    optionId: 'mode.fast',
    name: 'Today Fast Mode',
    multiplier: 1,
    freePromo: false,
    disabled: false,
    subtitle: '快速模式',
    contextWindow: 200_000,
    maxTokens: 16_384,
    supportsImages: true,
  },
  {
    id: 'mode.balanced',
    optionId: 'mode.balanced',
    name: 'Today Balanced Mode',
    multiplier: 1,
    freePromo: false,
    disabled: false,
    subtitle: '均衡模式',
    contextWindow: 200_000,
    maxTokens: 16_384,
    supportsImages: true,
  },
  {
    id: 'mode.power',
    optionId: 'mode.power',
    name: 'Today Power Mode',
    multiplier: 4,
    freePromo: false,
    disabled: false,
    subtitle: '强力模式',
    contextWindow: 200_000,
    maxTokens: 16_384,
    supportsImages: true,
  },
];

const MODEL_ALIAS_MAP: Readonly<Record<string, string>> = {
  'deepseek-v4.1-flash': 'model.deepseek-v4.1-flash',
  'model.deepseek-v4.1-flash': 'model.deepseek-v4.1-flash',
  'minimax-m3.1-flash': 'model.minimax-m31-flash',
  'minimax-m31-flash': 'model.minimax-m31-flash',
  'model.minimax-m31-flash': 'model.minimax-m31-flash',
  'glm-5.3': 'model.glm-5.3',
  'model.glm-5.3': 'model.glm-5.3',
  'fast': 'mode.fast',
  'mode.fast': 'mode.fast',
  'balanced': 'mode.balanced',
  'mode.balanced': 'mode.balanced',
  'power': 'mode.power',
  'mode.power': 'mode.power',
};

export function parseMultiplierFromSubtitle(subtitle: string): number {
  const match = /(\d+(?:\.\d+)?)\s*[x×]/iu.exec(subtitle);
  if (!match) {
    return 1;
  }
  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function isFreePromoOption(opt: TodayModelOption): boolean {
  const combined = `${opt.display.title} ${opt.display.subtitle} ${opt.display.availabilityLabel}`;
  return /免费|free|0\s*[x×]/iu.test(combined);
}

export function deriveCatalogFromPricing(status: TodayPricingStatus): TodayCatalogModel[] {
  const options = status.modelOptions?.options ?? [];
  if (options.length === 0) {
    return [...FALLBACK_TODAY_MODELS];
  }
  return options.map((opt) => {
    const def = FALLBACK_TODAY_MODELS.find((f) => f.id === opt.id || f.optionId === opt.id);
    return {
      id: opt.id,
      optionId: opt.id,
      name: opt.display.title,
      multiplier: parseMultiplierFromSubtitle(opt.display.subtitle),
      freePromo: isFreePromoOption(opt),
      disabled: Boolean(opt.disabled),
      subtitle: opt.display.subtitle,
      contextWindow: def?.contextWindow ?? 1_000_000,
      maxTokens: def?.maxTokens ?? 32_768,
      supportsImages: def?.supportsImages ?? true,
      ...(def?.reasoning ? { reasoning: def.reasoning } : {}),
    };
  });
}

export function resolveModelOptionId(requestedModel: string | undefined): string | undefined {
  if (!requestedModel) {
    return undefined;
  }
  const trimmed = requestedModel.trim();
  if (!trimmed) {
    return undefined;
  }
  const mapped = MODEL_ALIAS_MAP[trimmed.toLowerCase()];
  if (mapped) {
    return mapped;
  }
  if (trimmed.startsWith('model.') || trimmed.startsWith('mode.')) {
    return trimmed;
  }
  return undefined;
}
