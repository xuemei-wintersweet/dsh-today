export type TodayRegion = 'cn' | 'global';

export interface TodayRegionConfig {
  region: TodayRegion;
  providerId: string;
  displayName: string;
  productName: string;
  apiBaseUrl: string;
  authBaseUrl: string;
  webOrigin: string;
  oauthClientId: string;
  userDataDir: string;
  executableCandidates: string[];
}

export interface TodayCredentialHead {
  formatVersion: number;
  state: 'signed-in' | 'signed-out';
  slotIndex: 0 | 1;
  generation: number;
}

export interface TodayUserSummary {
  id: string;
  displayName?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
}

export interface TodayCredentialRecord {
  schemaVersion: number;
  environment: string;
  source: 'better-auth-session' | 'oauth2';
  accessToken: string;
  accessTokenExpiresAt?: number;
  refreshCredential: string;
  user?: TodayUserSummary;
}

export interface TodayCredentialSlot {
  formatVersion: number;
  generation: number;
  record: TodayCredentialRecord;
}

export interface TodayModelOption {
  id: string;
  disabled: boolean;
  display: {
    title: string;
    subtitle: string;
    description: string;
    availabilityLabel: string;
  };
}

export interface TodayUsageBreakdownItem {
  key: string;
  usedPercent: number;
  display: {
    title: string;
    percentText: string;
  };
  action?: {
    actionType: string;
    deepLink?: string;
  } | null;
}

export interface TodayPricingStatus {
  schemaVersion?: number;
  plan: string;
  subscriptionState: string;
  accessPhase: string;
  accessSource?: string;
  serviceState?: string;
  trialEndsAt: string | null;
  currentPeriodEndAt: string | null;
  entitlementEndsAt?: string | null;
  display: {
    title: string;
    subtitle: string;
    cta?: {
      type: string;
      label: string;
      actionType: string;
    };
  };
  usage: {
    schemaVersion?: number;
    period: 'weekly' | 'monthly';
    resetAt: string | null;
    title: string;
    subtitle?: string;
    progress: number;
    progressText: string;
    breakdown?: {
      schemaVersion?: number;
      dataSource?: string;
      display: {
        title: string;
        totalUsedText: string;
        remainingPercentText: string;
        remainingLabel?: string;
      };
      items: TodayUsageBreakdownItem[];
    };
  };
  modelOptions: {
    schemaVersion?: number;
    display?: {
      title: string;
      description: string;
      tailNote: string;
    };
    selectedOptionId: string;
    options: TodayModelOption[];
  };
}

export interface TodayReasoningEffort {
  id: string;
  name: string;
  description?: string;
}

export interface TodayReasoningConfig {
  efforts: TodayReasoningEffort[];
  defaultEffort?: string;
  levels?: string[];
  defaultLevel?: string;
}

export interface TodayCatalogModel {
  id: string;
  optionId: string;
  name: string;
  multiplier: number;
  freePromo: boolean;
  disabled: boolean;
  subtitle: string;
  contextWindow?: number;
  maxTokens?: number;
  supportsImages?: boolean;
  reasoning?: TodayReasoningConfig;
}

export interface TodayStreamReasoningEvent {
  conversationId: string;
  threadId: string;
  messageId?: string;
  originMessageId?: string;
  delta: string;
}

export interface CanonicalMessagePart {
  messageType: string;
  content?: {
    text?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface CanonicalMessageSnapshot {
  id: string;
  conversationId: string;
  threadId: string;
  cursor: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  state: 'in_progress' | 'completed' | 'interrupted';
  isFinal: boolean;
  createdAt: string;
  updatedAt: string;
  originMessageId?: string;
  originClientMessageId?: string;
  originTriggerType?: string;
  messageBizType?: string;
  bodyType?: string;
  body: {
    parts?: CanonicalMessagePart[];
    [key: string]: unknown;
  };
}

export interface TodayDeviceToolSpec {
  capabilityId: string;
  description: string;
  enabled: boolean;
  executorType: 'device_node';
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  parent?: string;
  riskLevel: 'low' | 'medium' | 'high';
  version: string;
}

export interface TodayConnectorGrant {
  connectorId: string;
  granted: boolean;
}

export interface TodayConnectorSnapshot {
  connectors: TodayConnectorGrant[];
  timestamp: string;
}

export interface TodayNativeInvocationRequest {
  invocationId: string;
  capabilityId: string;
  args: Record<string, unknown>;
  timeoutMs?: number;
}

export type TodayNativeInvocationResult =
  | {
      invocationId: string;
      success: true;
      data?: unknown;
    }
  | {
      invocationId: string;
      success: false;
      error: {
        code: string;
        message: string;
        details?: unknown;
      };
    };

export interface OpenAIChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | Array<{ type: string; text?: string }> | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: OpenAIToolCall[];
}

export interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface OpenAIToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export interface OpenAIChatCompletionRequest {
  model: string;
  messages: OpenAIChatMessage[];
  stream?: boolean;
  tools?: OpenAIToolDefinition[];
  tool_choice?: 'none' | 'auto' | 'required' | { type: 'function'; function: { name: string } };
  temperature?: number;
  max_tokens?: number;
}
