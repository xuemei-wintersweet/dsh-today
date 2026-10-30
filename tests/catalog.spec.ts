import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveCatalogFromPricing,
  isFreePromoOption,
  parseMultiplierFromSubtitle,
  resolveModelOptionId,
} from '../src/catalog.js';
import type { TodayPricingStatus } from '../src/types.js';

describe('catalog & model option resolution', () => {
  it('parses credit multiplier from Chinese and English subtitles', () => {
    assert.equal(parseMultiplierFromSubtitle('消耗倍数：1×'), 1);
    assert.equal(parseMultiplierFromSubtitle('消耗倍数：4×'), 4);
    assert.equal(parseMultiplierFromSubtitle('Multiplier: 2.5x'), 2.5);
    assert.equal(parseMultiplierFromSubtitle('限时免费'), 1);
  });

  it('detects free promo options accurately', () => {
    assert.equal(
      isFreePromoOption({
        id: 'model.minimax-m31-flash',
        disabled: false,
        display: {
          title: 'MiniMax M3.1 Flash · 限时免费',
          subtitle: '消耗倍数：1×',
          description: '',
          availabilityLabel: '',
        },
      }),
      true
    );
    assert.equal(
      isFreePromoOption({
        id: 'model.glm-5.3',
        disabled: false,
        display: {
          title: 'GLM 5.3',
          subtitle: '消耗倍数：4×',
          description: '',
          availabilityLabel: '',
        },
      }),
      false
    );
  });

  it('resolves model aliases to canonical Today optionIds', () => {
    assert.equal(resolveModelOptionId('deepseek-v4.1-flash'), 'model.deepseek-v4.1-flash');
    assert.equal(resolveModelOptionId('minimax-m3.1-flash'), 'model.minimax-m31-flash');
    assert.equal(resolveModelOptionId('glm-5.3'), 'model.glm-5.3');
    assert.equal(resolveModelOptionId('fast'), 'mode.fast');
    assert.equal(resolveModelOptionId('model.custom-id'), 'model.custom-id');
  });

  it('derives catalog models from live pricing status payload', () => {
    const mockStatus: TodayPricingStatus = {
      plan: 'pro',
      subscriptionState: 'none',
      accessPhase: 'normal',
      trialEndsAt: null,
      currentPeriodEndAt: '2026-11-27T11:00:24.345Z',
      display: { title: 'Pro', subtitle: '2027.01.27到期' },
      usage: {
        period: 'monthly',
        resetAt: '2026-11-27T11:00:24.345Z',
        title: '用量',
        progress: 4,
        progressText: '剩余 96%',
      },
      modelOptions: {
        selectedOptionId: 'model.deepseek-v4.1-flash',
        options: [
          {
            id: 'model.deepseek-v4.1-flash',
            disabled: false,
            display: {
              title: 'DeepSeek V4.1 Flash',
              subtitle: '消耗倍数：1×',
              description: '',
              availabilityLabel: '',
            },
          },
          {
            id: 'model.minimax-m31-flash',
            disabled: false,
            display: {
              title: 'MiniMax M3.1 Flash · 限时免费',
              subtitle: '消耗倍数：1×',
              description: '',
              availabilityLabel: '',
            },
          },
        ],
      },
    };
    const catalog = deriveCatalogFromPricing(mockStatus);
    assert.equal(catalog.length, 2);
    assert.equal(catalog[0].id, 'model.deepseek-v4.1-flash');
    assert.equal(catalog[1].freePromo, true);
  });
});
