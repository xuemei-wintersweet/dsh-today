import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { TODAY_DESKTOP_VERSION } from './version.js';
import type {
  TodayCredentialHead,
  TodayCredentialRecord,
  TodayCredentialSlot,
  TodayRegionConfig,
} from './types.js';

const TDK1_MAGIC = 'TDK1';
const V10_MAGIC = 'v10';

/**
 * Redacts JWT tokens and OAuth secrets from diagnostic / error strings.
 */
export function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu, '[redacted-jwt]')
    .replace(/(\b(?:code|token|refresh_token|access_token|refreshCredential)=)[^&\s"]+/giu, '$1[redacted]');
}

export function decryptSafeStorageV10(buf: Buffer, masterKey: Buffer): string {
  const prefix = buf.subarray(0, 3).toString('ascii');
  if (prefix !== V10_MAGIC) {
    throw new Error(`Expected v10 prefix, got: ${buf.subarray(0, 4).toString('hex')}`);
  }
  const iv = buf.subarray(3, 15);
  const authTag = buf.subarray(buf.length - 16);
  const ciphertext = buf.subarray(15, buf.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export function encryptSafeStorageV10(plaintext: string, masterKey: Buffer): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from(V10_MAGIC, 'ascii'), iv, encrypted, authTag]);
}

export function decryptKeyStoreTDK1(buf: Buffer, masterKey: Buffer): string {
  const magic = buf.subarray(0, 4).toString('ascii');
  if (magic !== TDK1_MAGIC) {
    throw new Error(`Expected TDK1 magic, got: ${buf.subarray(0, 4).toString('hex')}`);
  }
  const iv = buf.subarray(4, 16);
  const authTag = buf.subarray(16, 32);
  const ciphertext = buf.subarray(32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, iv);
  decipher.setAAD(Buffer.from(TDK1_MAGIC, 'ascii'));
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export class TodayCredentialStore {
  private cachedRecord: TodayCredentialRecord | null = null;
  private cachedAccessToken: string | null = null;
  private cachedAccessTokenExpiresAt = 0;
  private masterKeyCache: Buffer | null = null;
  private readonly customMasterKey?: Buffer;
  private readonly fetchImpl: typeof fetch;

  constructor(
    public readonly config: TodayRegionConfig,
    options?: { masterKey?: Buffer; fetch?: typeof fetch }
  ) {
    this.customMasterKey = options?.masterKey;
    this.fetchImpl = options?.fetch ?? globalThis.fetch.bind(globalThis);
  }

  public get fetchFn(): typeof fetch {
    return this.fetchImpl;
  }

  public desktopFilesPresent(): {
    head: boolean;
    slotA: boolean;
    slotB: boolean;
    localState: boolean;
  } {
    const dir = this.config.userDataDir;
    return {
      head: fs.existsSync(path.join(dir, 'account-credentials.head')),
      slotA: fs.existsSync(path.join(dir, 'account-credentials.slot-a')),
      slotB: fs.existsSync(path.join(dir, 'account-credentials.slot-b')),
      localState: fs.existsSync(path.join(dir, 'Local State')),
    };
  }

  private getWindowsMasterKey(): Buffer {
    if (this.customMasterKey) {
      return this.customMasterKey;
    }
    if (this.masterKeyCache) {
      return this.masterKeyCache;
    }
    const localStatePath = path.join(this.config.userDataDir, 'Local State');
    if (!fs.existsSync(localStatePath)) {
      throw new Error(`Today Local State not found at ${localStatePath}`);
    }
    const localState = JSON.parse(fs.readFileSync(localStatePath, 'utf8'));
    const encryptedKeyB64: string | undefined = localState?.os_crypt?.encrypted_key;
    if (!encryptedKeyB64) {
      throw new Error('Missing os_crypt.encrypted_key in Today Local State');
    }
    const encryptedKeyBuf = Buffer.from(encryptedKeyB64, 'base64');
    const prefix = encryptedKeyBuf.subarray(0, 5).toString('ascii');
    if (prefix !== 'DPAPI') {
      throw new Error(`Unexpected os_crypt key prefix: ${prefix}`);
    }
    const dpapiPayloadB64 = encryptedKeyBuf.subarray(5).toString('base64');
    const psScript = [
      'Add-Type -AssemblyName System.Security',
      `$bytes = [Convert]::FromBase64String('${dpapiPayloadB64}')`,
      '$unprotected = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)',
      '[Convert]::ToBase64String($unprotected)',
    ].join('; ');

    const outB64 = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', psScript],
      { encoding: 'utf8' }
    ).trim();

    this.masterKeyCache = Buffer.from(outB64, 'base64');
    return this.masterKeyCache;
  }

  private getMacKeychainMasterKey(): Buffer {
    if (this.customMasterKey) {
      return this.customMasterKey;
    }
    if (this.masterKeyCache) {
      return this.masterKeyCache;
    }
    const secretB64 = execFileSync(
      'security',
      ['find-generic-password', '-s', 'ai.today.desktop.account-credentials', '-a', 'credential-key', '-w'],
      { encoding: 'utf8' }
    ).trim();
    this.masterKeyCache = Buffer.from(secretB64, 'base64');
    return this.masterKeyCache;
  }

  public decryptBuffer(buf: Buffer): string {
    if (buf.subarray(0, 4).toString('ascii') === TDK1_MAGIC) {
      return decryptKeyStoreTDK1(buf, this.getMacKeychainMasterKey());
    }
    if (buf.subarray(0, 3).toString('ascii') === V10_MAGIC) {
      return decryptSafeStorageV10(buf, this.getWindowsMasterKey());
    }
    throw new Error(`Unsupported credential cipher header: ${buf.subarray(0, 4).toString('hex')}`);
  }

  public readHead(): TodayCredentialHead {
    const headPath = path.join(this.config.userDataDir, 'account-credentials.head');
    if (!fs.existsSync(headPath)) {
      throw new Error(
        `Today credentials not found in ${this.config.userDataDir}. Please sign in to ${this.config.productName} desktop client first.`
      );
    }
    return JSON.parse(this.decryptBuffer(fs.readFileSync(headPath))) as TodayCredentialHead;
  }

  public loadDiskCredentials(): { head: TodayCredentialHead; slot: TodayCredentialSlot; record: TodayCredentialRecord } {
    const head = this.readHead();
    if (head.state !== 'signed-in') {
      throw new Error(`${this.config.productName} desktop client is currently signed out.`);
    }
    const slotFileName = head.slotIndex === 0 ? 'account-credentials.slot-a' : 'account-credentials.slot-b';
    const slotPath = path.join(this.config.userDataDir, slotFileName);
    const slot = JSON.parse(this.decryptBuffer(fs.readFileSync(slotPath))) as TodayCredentialSlot;
    this.cachedRecord = slot.record;
    this.cachedAccessToken = slot.record.accessToken;
    this.cachedAccessTokenExpiresAt = slot.record.accessTokenExpiresAt ?? Date.now() + 300_000;
    return { head, slot, record: slot.record };
  }

  public async getValidAccessToken(forceRefresh = false): Promise<string> {
    if (!this.cachedRecord) {
      this.loadDiskCredentials();
    }
    const now = Date.now();
    if (!forceRefresh && this.cachedAccessToken && this.cachedAccessTokenExpiresAt - now > 60_000) {
      return this.cachedAccessToken;
    }
    return await this.refreshAccessToken();
  }

  public async refreshAccessToken(): Promise<string> {
    const record = this.cachedRecord ?? this.loadDiskCredentials().record;

    if (record.source === 'better-auth-session') {
      const response = await this.fetchImpl(`${this.config.authBaseUrl}/api/auth/token`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Accept-Language': 'zh-CN,zh;q=0.9',
          'X-App-Version': TODAY_DESKTOP_VERSION,
          'X-Client-Platform': process.platform === 'darwin' ? 'macos' : 'windows',
          'Origin': this.config.webOrigin,
          'Authorization': `Bearer ${record.refreshCredential}`,
        },
      });
      if (!response.ok) {
        const disk = this.loadDiskCredentials();
        if (disk.record.refreshCredential !== record.refreshCredential) {
          return this.refreshAccessToken();
        }
        throw new Error(`Failed to refresh Better-Auth token: HTTP ${response.status}`);
      }
      const rotatedSession = response.headers.get('set-auth-token')?.trim();
      if (rotatedSession) {
        record.refreshCredential = rotatedSession;
      }
      const data = (await response.json()) as { token?: string; expiresIn?: number };
      if (!data.token) {
        throw new Error('Better-Auth token endpoint did not return a token');
      }
      this.cachedAccessToken = data.token;
      this.cachedAccessTokenExpiresAt = Date.now() + (data.expiresIn ?? 540) * 1000;
      return this.cachedAccessToken;
    }

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.config.oauthClientId,
      refresh_token: record.refreshCredential,
      resource: this.config.apiBaseUrl,
    });
    const response = await this.fetchImpl(`${this.config.authBaseUrl}/api/auth/oauth2/token`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-App-Version': TODAY_DESKTOP_VERSION,
        'X-Client-Platform': process.platform === 'darwin' ? 'macos' : 'windows',
      },
      body: body.toString(),
    });
    if (!response.ok) {
      this.loadDiskCredentials();
      if (!this.cachedAccessToken) {
        throw new Error(`Failed to refresh OAuth2 token: HTTP ${response.status}`);
      }
      return this.cachedAccessToken;
    }
    const data = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };
    this.cachedAccessToken = data.access_token;
    if (data.refresh_token) {
      record.refreshCredential = data.refresh_token;
    }
    this.cachedAccessTokenExpiresAt = Date.now() + (data.expires_in ?? 540) * 1000;
    return this.cachedAccessToken;
  }
}
