import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hostIsLoopback, originIsLoopback } from '../src/loopback.js';

describe('loopback Host and Origin security gates', () => {
  it('accepts loopback Host headers with and without port', () => {
    assert.equal(hostIsLoopback('127.0.0.1:18421'), true);
    assert.equal(hostIsLoopback('localhost:18421'), true);
    assert.equal(hostIsLoopback('[::1]:18421'), true);
    assert.equal(hostIsLoopback('127.0.0.1'), true);
  });

  it('rejects non-loopback Host headers', () => {
    assert.equal(hostIsLoopback('192.168.1.10:18421'), false);
    assert.equal(hostIsLoopback('evil.example.com'), false);
    assert.equal(hostIsLoopback(undefined), false);
  });

  it('validates Origin header when present', () => {
    assert.equal(originIsLoopback(undefined), true);
    assert.equal(originIsLoopback('http://127.0.0.1:3000'), true);
    assert.equal(originIsLoopback('http://localhost:8080'), true);
    assert.equal(originIsLoopback('https://evil.example.com'), false);
  });
});
