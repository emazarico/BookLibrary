import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_DRIVE_FILENAME,
  DRIVE_SCOPES,
  fetchUserEmail,
  findOrCreateDatabaseFile,
  formatGoogleAuthError,
  LEGACY_DRIVE_FILENAME,
} from '../services/googleDriveSync';
import { createEmptyDatabase } from '../services/storage';

describe('Google Drive OAuth scopes and diagnostics', () => {
  afterEach(() => {
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
});
