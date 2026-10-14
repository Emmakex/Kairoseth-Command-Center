import { describe, expect, it } from 'vitest';
import {
  decryptIntegrationSecret,
  encryptIntegrationSecret,
} from '../src/integration-secret-store';

const key = 'ab'.repeat(32);
const scope = { kind: 'workspace' as const, workspaceId: 'workspace-a' };

describe('integration secret encryption', () => {
  it('encrypts without retaining plaintext and decrypts with the same workspace/ref AAD', () => {
    const plaintext = 'github_pat_test_12345678901234567890';
    const encrypted = encryptIntegrationSecret(key, scope, 'sec-1', plaintext);

    expect(encrypted.algorithm).toBe('aes-256-gcm');
    expect(encrypted.ciphertext).not.toContain(plaintext);
    expect(JSON.stringify(encrypted)).not.toContain(plaintext);
    expect(decryptIntegrationSecret(key, scope, 'sec-1', encrypted)).toBe(plaintext);
  });

  it('rejects ciphertext rebound to another workspace or secret reference', () => {
    const encrypted = encryptIntegrationSecret(
      key,
      scope,
      'sec-1',
      'github_pat_test_12345678901234567890',
    );

    expect(() =>
      decryptIntegrationSecret(
        key,
        { kind: 'workspace', workspaceId: 'workspace-b' },
        'sec-1',
        encrypted,
      ),
    ).toThrow();
    expect(() => decryptIntegrationSecret(key, scope, 'sec-2', encrypted)).toThrow();
  });
});
