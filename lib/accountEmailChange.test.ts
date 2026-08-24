import { auth } from '../config/firebaseConfig';
import { requestCurrentUserEmailChange } from './accountEmailChange';

jest.mock('../config/firebaseConfig', () => ({
  auth: { currentUser: null },
}));

const mutableAuth = auth as typeof auth & { currentUser: any };
const mockedFetch = jest.fn();

describe('verified account email change request', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mutableAuth.currentUser = null;
    global.fetch = mockedFetch as typeof fetch;
  });

  test('requires a signed-in user and validates the proposed address locally', async () => {
    await expect(requestCurrentUserEmailChange('new@example.com')).resolves.toEqual({
      status: 'unavailable',
      message: 'Sign in again to change your email.',
    });

    mutableAuth.currentUser = { getIdToken: jest.fn() };
    await expect(requestCurrentUserEmailChange('not-an-email')).resolves.toEqual({ status: 'invalid_email' });
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  test('requests a branded verification link using a fresh ID token', async () => {
    mutableAuth.currentUser = { getIdToken: jest.fn().mockResolvedValue('fresh-id-token') };
    mockedFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'sent', pendingEmail: 'new@example.com' }),
    });

    await expect(requestCurrentUserEmailChange(' New@Example.com ')).resolves.toEqual({
      status: 'sent',
      pendingEmail: 'new@example.com',
    });
    expect(mutableAuth.currentUser.getIdToken).toHaveBeenCalledWith(true);
    expect(mockedFetch).toHaveBeenCalledWith(
      'https://northamerica-northeast2-gathr-m1.cloudfunctions.net/sendBrandedEmailVerification',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ newEmail: 'new@example.com' }),
      })
    );
  });

  test.each([
    [401, 'requires_recent_login', 'requires_recent_login'],
    [409, 'email_already_in_use', 'email_already_in_use'],
    [409, 'email_unchanged', 'email_unchanged'],
    [429, 'too_many_requests', 'rate_limited'],
  ])('maps server status %s and error %s', async (status, error, expectedStatus) => {
    mutableAuth.currentUser = { getIdToken: jest.fn().mockResolvedValue('fresh-id-token') };
    mockedFetch.mockResolvedValue({
      ok: false,
      status,
      json: async () => ({ error }),
    });

    await expect(requestCurrentUserEmailChange('new@example.com')).resolves.toEqual({
      status: expectedStatus,
    });
  });
});
