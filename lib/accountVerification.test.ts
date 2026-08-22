import AsyncStorage from '@react-native-async-storage/async-storage';
import { reload } from 'firebase/auth';
import { auth } from '../config/firebaseConfig';
import { requestCurrentUserVerificationEmail } from './accountVerification';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

jest.mock('firebase/auth', () => ({
  reload: jest.fn(),
}));

jest.mock('../config/firebaseConfig', () => ({
  auth: { currentUser: null },
}));

const mockedStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
const mockedReload = reload as jest.MockedFunction<typeof reload>;
const mutableAuth = auth as typeof auth & { currentUser: any };
const mockedFetch = jest.fn();

describe('account verification email', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mutableAuth.currentUser = null;
    mockedStorage.getItem.mockResolvedValue(null);
    mockedStorage.setItem.mockResolvedValue(undefined);
    mockedReload.mockResolvedValue(undefined);
    global.fetch = mockedFetch as typeof fetch;
    mockedFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'sent' }),
    });
  });

  test('requires a signed-in user', async () => {
    await expect(requestCurrentUserVerificationEmail()).resolves.toEqual({
      status: 'unavailable',
      message: 'Sign in again to verify this account.',
    });
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  test('sends one verification email and records the cooldown', async () => {
    mutableAuth.currentUser = {
      uid: 'legacy-user',
      email: 'legacy@example.com',
      emailVerified: false,
      getIdToken: jest.fn().mockResolvedValue('firebase-id-token'),
    };

    await expect(requestCurrentUserVerificationEmail(10_000)).resolves.toEqual({ status: 'sent' });
    expect(mockedFetch).toHaveBeenCalledWith(
      'https://northamerica-northeast2-gathr-m1.cloudfunctions.net/sendBrandedEmailVerification',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer firebase-id-token',
          'Content-Type': 'application/json',
        },
        body: '{}',
      }
    );
    expect(mockedStorage.setItem).toHaveBeenCalledWith(
      '@gathr/verification-email-sent-at/legacy-user',
      '10000'
    );
  });

  test('treats the server rate limit as a recently sent email', async () => {
    mutableAuth.currentUser = {
      uid: 'legacy-user',
      email: 'legacy@example.com',
      emailVerified: false,
      getIdToken: jest.fn().mockResolvedValue('firebase-id-token'),
    };
    mockedFetch.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: 'too_many_requests' }),
    });

    await expect(requestCurrentUserVerificationEmail(10_000)).resolves.toEqual({
      status: 'recently_sent',
    });
    expect(mockedStorage.setItem).not.toHaveBeenCalled();
  });

  test('does not resend during the cooldown', async () => {
    mutableAuth.currentUser = {
      uid: 'legacy-user',
      email: 'legacy@example.com',
      emailVerified: false,
      getIdToken: jest.fn().mockResolvedValue('firebase-id-token'),
    };
    mockedStorage.getItem.mockResolvedValue('5000');

    await expect(requestCurrentUserVerificationEmail(10_000)).resolves.toEqual({
      status: 'recently_sent',
    });
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  test('recognizes an account verified since the last app refresh', async () => {
    mutableAuth.currentUser = {
      uid: 'legacy-user',
      email: 'legacy@example.com',
      emailVerified: false,
      getIdToken: jest.fn().mockResolvedValue('firebase-id-token'),
    };
    mockedReload.mockImplementation(async (user: any) => {
      user.emailVerified = true;
    });

    await expect(requestCurrentUserVerificationEmail()).resolves.toEqual({
      status: 'already_verified',
    });
    expect(mockedFetch).not.toHaveBeenCalled();
  });
});
