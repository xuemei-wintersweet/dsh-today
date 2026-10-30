import type {
  OpenAIToolCall,
  OpenAIToolDefinition,
  TodayDeviceToolSpec,
  TodayNativeInvocationRequest,
} from './types.js';

export const DSH_TOOL_PREFIX = 'dsh__';

/**
 * Recursively sanitize a JSON Schema object so all nested `properties`, `items`,
 * `required`, `enum`, `anyOf`, `oneOf`, `allOf`, and `additionalProperties` survive
 * intact while stripping non-JSON values (`undefined`, functions, symbols).
 */
export function sanitizeJsonSchema(
  schema: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return { type: 'object', properties: {} };
  }
  const cloned = cleanJsonValue(schema);
  if (!cloned || typeof cloned !== 'object' || Array.isArray(cloned)) {
    return { type: 'object', properties: {} };
  }
  const record = cloned as Record<string, unknown>;
  if (!record.type && !record.anyOf && !record.oneOf && !record.allOf) {
    record.type = 'object';
  }
  if (record.type === 'object' && !record.properties) {
    record.properties = {};
  }
  return record;
}

function cleanJsonValue(value: unknown, depth = 0): unknown {
  if (depth > 16) {
    return undefined;
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (Array.isArray(value)) {
    const arr: unknown[] = [];
    for (const item of value) {
      const cleaned = cleanJsonValue(item, depth + 1);
      if (cleaned !== undefined) {
        arr.push(cleaned);
      }
    }
    return arr;
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      const cleaned = cleanJsonValue(v, depth + 1);
      if (cleaned !== undefined) {
        out[k] = cleaned;
      }
    }
    return out;
  }
  return undefined;
}

export function toDshCapabilityId(toolName: string): string {
  const trimmed = toolName.trim();
  if (trimmed.startsWith(DSH_TOOL_PREFIX)) {
    return trimmed;
  }
  const safe = trimmed.replace(/[^A-Za-z0-9_.-]/g, '_');
  return `${DSH_TOOL_PREFIX}${safe}`;
}

export function fromDshCapabilityId(
  capabilityId: string,
  reverseMap?: ReadonlyMap<string, string>
): string {
  const mapped = reverseMap?.get(capabilityId);
  if (mapped) {
    return mapped;
  }
  if (capabilityId.startsWith(DSH_TOOL_PREFIX)) {
    return capabilityId.slice(DSH_TOOL_PREFIX.length);
  }
  return capabilityId;
}

export interface ProjectedDeviceToolCatalog {
  specs: TodayDeviceToolSpec[];
  capabilityToToolName: Map<string, string>;
  toolNameToCapability: Map<string, string>;
}

export function buildDeviceToolCatalog(
  tools?: OpenAIToolDefinition[],
  toolChoice?: 'none' | 'auto' | 'required' | { type: 'function'; function: { name: string } }
): ProjectedDeviceToolCatalog {
  const specs: TodayDeviceToolSpec[] = [];
  const capabilityToToolName = new Map<string, string>();
  const toolNameToCapability = new Map<string, string>();

  if (!tools || tools.length === 0 || toolChoice === 'none') {
    return { specs, capabilityToToolName, toolNameToCapability };
  }

  const pinnedName =
    typeof toolChoice === 'object' && toolChoice !== null && toolChoice.type === 'function'
      ? toolChoice.function.name
      : undefined;

  for (const t of tools) {
    if (t.type !== 'function' || !t.function?.name) continue;
    const rawName = t.function.name.trim();
    if (!rawName) continue;
    if (pinnedName && rawName !== pinnedName) continue;

    const capabilityId = toDshCapabilityId(rawName);
    capabilityToToolName.set(capabilityId, rawName);
    toolNameToCapability.set(rawName, capabilityId);

    const rawDesc = (t.function.description ?? '').trim();
    const description = rawDesc
      ? `[DSH Local Host Tool: ${rawName}] ${rawDesc}`.slice(0, 1000)
      : `[DSH Local Host Tool] Execute ${rawName} on the caller's DSH workspace`;

    specs.push({
      capabilityId,
      description,
      enabled: true,
      executorType: 'device_node',
      inputSchema: sanitizeJsonSchema(t.function.parameters),
      outputSchema: { type: 'object' },
      riskLevel: 'low',
      version: '1.0.0',
    });
  }

  return { specs, capabilityToToolName, toolNameToCapability };
}

export function openAIToolsToDeviceToolSpecs(
  tools?: OpenAIToolDefinition[]
): TodayDeviceToolSpec[] {
  return buildDeviceToolCatalog(tools, 'auto').specs;
}

export const NATIVE_INVOCATION_CALL_PREFIX = 'tinv_';

export function makeNativeInvocationToolCallId(invocationId: string): string {
  return invocationId.startsWith(NATIVE_INVOCATION_CALL_PREFIX)
    ? invocationId
    : `${NATIVE_INVOCATION_CALL_PREFIX}${invocationId}`;
}

export function parseNativeInvocationToolCallId(toolCallId: string | undefined): string | null {
  if (!toolCallId) return null;
  if (toolCallId.startsWith(NATIVE_INVOCATION_CALL_PREFIX)) {
    const raw = toolCallId.slice(NATIVE_INVOCATION_CALL_PREFIX.length).trim();
    return raw || null;
  }
  return null;
}

export function invocationRequestToOpenAIToolCall(
  frame: TodayNativeInvocationRequest,
  reverseMap?: ReadonlyMap<string, string>
): OpenAIToolCall {
  const restoredName = fromDshCapabilityId(frame.capabilityId, reverseMap);
  return {
    id: makeNativeInvocationToolCallId(frame.invocationId),
    type: 'function',
    function: {
      name: restoredName,
      arguments: JSON.stringify(frame.args ?? {}),
    },
  };
}
