/**
 * Loopback Host / Origin validation for the local OpenAI shim server.
 * Ensures the shim only responds to local loopback clients (127.0.0.1 / [::1] / localhost).
 */

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

export function hostIsLoopback(hostHeader: string | undefined): boolean {
  if (!hostHeader) {
    return false;
  }
  const trimmed = hostHeader.trim().toLowerCase();
  if (!trimmed) {
    return false;
  }
  let hostPart = trimmed;
  if (trimmed.startsWith('[')) {
    const closeIdx = trimmed.indexOf(']');
    if (closeIdx === -1) return false;
    hostPart = trimmed.slice(0, closeIdx + 1);
  } else {
    const colonIdx = trimmed.lastIndexOf(':');
    if (colonIdx !== -1 && trimmed.indexOf(':') === colonIdx) {
      hostPart = trimmed.slice(0, colonIdx);
    }
  }
  return LOOPBACK_HOSTS.has(hostPart);
}

export function originIsLoopback(originHeader: string | undefined): boolean {
  if (!originHeader) {
    return true;
  }
  try {
    const parsed = new URL(originHeader);
    return LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}
