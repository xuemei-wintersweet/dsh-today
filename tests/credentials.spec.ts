import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  decryptSafeStorageV10,
  encryptSafeStorageV10,
  safeMessage,
} from '../src/credentials.js';

describe('credentials & encryption', () => {
  it('encrypts and decrypts Chromium v10 AES-256-GCM buffers symmetrically', () => {
    const masterKey = crypto.randomBytes(32);
    const payload = JSON.stringify({
      formatVersion: 1,
      state: 'signed-in',
      slotIndex: 0,
      generation: 4,
    });
    const encrypted = encryptSafeStorageV10(payload, masterKey);
    assert.equal(encrypted.subarray(0, 3).toString('ascii'), 'v10');

    const decrypted = decryptSafeStorageV10(encrypted, masterKey);
    assert.equal(decrypted, payload);
  });

  it('redacts JWT tokens and query secrets in safeMessage', () => {
    const fakeJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    const rawErr = new Error(`Failed with token=${fakeJwt} and refresh_token=secret123`);
    const redacted = safeMessage(rawErr);
    assert.ok(!redacted.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'));
    assert.ok(!redacted.includes('secret123'));
    assert.ok(redacted.includes('[redacted]'));
  });
});
