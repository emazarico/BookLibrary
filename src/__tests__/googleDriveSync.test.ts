import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_DRIVE_FILENAME,
  DRIVE_SCOPES,
  fetchUserEmail,
  findOrCreateDatabaseFile,
  formatGoogleAuthError,
  LEGACY_DRIVE_FILENAME,
  requestDriveAccessToken,
} from '../services/googleDriveSync';
import {
  clearCachedDriveToken,
  createEmptyDatabase,
  loadCachedDriveToken,
  saveCachedDriveToken,
  STORAGE_KEYS,
} from '../services/storage';

function installMockLocalStorage(): Map<string, string> {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
  });
  return store;
}

describe('Google Drive OAuth scopes, token cache, and diagnostics', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('uses valid googleapis.com/auth/ scopes including drive.file and userinfo.email', () => {
    const scopes = DRIVE_SCOPES.trim().split(/\s+/);
    expect(scopes).toContain('https://www.googleapis.com/auth/drive.file');
    expect(scopes).toContain('https://www.googleapis.com/auth/userinfo.email');
    for (const scope of scopes) {
      expect(scope.startsWith('https://www.googleapis.com/auth/')).toBe(true);
      expect(scope).not.toContain('/oauth2/userinfo.email');
    }
  });

  it('formats invalid_scope, access_denied, and origin_mismatch auth errors clearly', () => {
    expect(formatGoogleAuthError('invalid_scope')).toContain('Invalid OAuth scope');
    expect(formatGoogleAuthError('access_denied')).toContain('Test users');
    expect(formatGoogleAuthError('origin_mismatch')).toContain('Authorized JavaScript origins');
  });

  it('falls back to Drive about user metadata if userinfo endpoint fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ user: { emailAddress: 'family@example.com' } }),
      });

    vi.stubGlobal('fetch', fetchMock);

    const email = await fetchUserEmail('fake-access-token');
    expect(email).toBe('family@example.com');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain('/drive/v3/about?fields=user(emailAddress)');
  });

  it('falls back to finding omnilibrary-v4-db.json when booklibrary-db.json does not exist yet on Drive', async () => {
    const legacyDb = { ...createEmptyDatabase(), dbId: 'db-legacy' };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ files: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ files: [{ id: 'legacy-drive-id' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(legacyDb),
      });

    vi.stubGlobal('fetch', fetchMock);

    const result = await findOrCreateDatabaseFile(
      'fake-access-token',
      null,
      DEFAULT_DRIVE_FILENAME,
      createEmptyDatabase(),
    );

    expect(result.fileId).toBe('legacy-drive-id');
    expect(result.created).toBe(false);
    expect(result.remoteDb?.dbId).toBe('db-legacy');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[0][0])).toContain(encodeURIComponent(DEFAULT_DRIVE_FILENAME));
    expect(String(fetchMock.mock.calls[1][0])).toContain(encodeURIComponent(LEGACY_DRIVE_FILENAME));
  });

  it('caches Drive access token within TTL and clears stale or mismatched entries', () => {
    const lsStore = installMockLocalStorage();
    const clientA = '12345.apps.googleusercontent.com';
    const clientB = '99999.apps.googleusercontent.com';

    const now = 1_700_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    saveCachedDriveToken('tok-abc', 3600, clientA, 'family@example.com');
    expect(lsStore.has(STORAGE_KEYS.DRIVE_TOKEN)).toBe(true);

    const valid = loadCachedDriveToken(clientA, now + 10 * 60_000);
    expect(valid).toMatchObject({
      accessToken: 'tok-abc',
      clientId: clientA,
      userEmail: 'family@example.com',
    });

    // Different client ID -> ignored & cleared
    expect(loadCachedDriveToken(clientB, now + 1000)).toBeNull();
    expect(lsStore.has(STORAGE_KEYS.DRIVE_TOKEN)).toBe(false);

    // Within 60s expiry buffer or expired -> ignored & cleared
    saveCachedDriveToken('tok-def', 3600, clientA);
    expect(loadCachedDriveToken(clientA, now + 3541 * 1000)).toBeNull();
    expect(lsStore.has(STORAGE_KEYS.DRIVE_TOKEN)).toBe(false);

    saveCachedDriveToken('tok-ghi', 3600, clientA);
    clearCachedDriveToken();
    expect(loadCachedDriveToken(clientA, now)).toBeNull();
  });

  it('passes email hint on reconnect but omits it when switching accounts', async () => {
    const initMock = vi.fn();
    const requestMock = vi.fn();

    initMock.mockImplementation((cfg: { callback: (r: { access_token: string; expires_in: number }) => void }) => {
      requestMock.mockImplementationOnce(() => {
        cfg.callback({ access_token: 'new-tok', expires_in: 3600 });
      });
      return { requestAccessToken: requestMock };
    });

    vi.stubGlobal('window', {
      google: {
        accounts: {
          oauth2: {
            initTokenClient: initMock,
          },
        },
      },
    });

    const clientId = '12345.apps.googleusercontent.com';
    const res1 = await requestDriveAccessToken(clientId, '', 'family@example.com');
    expect(res1).toEqual({ accessToken: 'new-tok', expiresIn: 3600 });
    expect(initMock.mock.calls[0][0].hint).toBe('family@example.com');
    expect(requestMock.mock.calls[0][0]).toEqual({ prompt: '', hint: 'family@example.com' });

    const res2 = await requestDriveAccessToken(clientId, 'select_account', 'family@example.com');
    expect(res2).toEqual({ accessToken: 'new-tok', expiresIn: 3600 });
    expect(initMock.mock.calls[1][0].hint).toBeUndefined();
    expect(requestMock.mock.calls[1][0]).toEqual({ prompt: 'select_account' });
  });
});
