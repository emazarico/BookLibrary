import { describe, expect, it } from 'vitest';
import { hashPin, sha256Hex, sha256Pure, verifyPin } from '../utils/crypto';

describe('crypto & PIN hashing', () => {
  it('matches NIST SHA-256 test vectors', async () => {
    const vectors: Array<[string, string]> = [
      ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
      ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
      [
        'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
        '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
      ],
    ];

    for (const [input, expected] of vectors) {
      expect(sha256Pure(input)).toBe(expected);
      expect(await sha256Hex(input)).toBe(expected);
    }
  });

  it('produces identical pure-JS and WebCrypto SHA-256 hashes for Unicode', async () => {
    const sample = 'omnilibrary-v4:profile-1:📚1234';
    expect(sha256Pure(sample)).toBe(await sha256Hex(sample));
  });

  it('salts PINs per profileId and verifies accurately', async () => {
    const hashA = await hashPin('profile-alex', '1234');
    const hashB = await hashPin('profile-maya', '1234');

    expect(hashA).not.toBe(hashB);
    expect(await verifyPin('profile-alex', '1234', hashA)).toBe(true);
    expect(await verifyPin('profile-alex', '9999', hashA)).toBe(false);
    expect(await verifyPin('profile-maya', '1234', hashA)).toBe(false);
  });
});
