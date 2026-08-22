import AsyncStorage from '@react-native-async-storage/async-storage';
import { reload, sendEmailVerification } from 'firebase/auth';
import { auth } from '../config/firebaseConfig';
import { requestCurrentUserVerificationEmail } from './accountVerification';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

jest.mock('firebase/auth', () => ({
  reload: jest.fn(),
  sendEmailVerification: jest.fn(),
}));

jest.mock('../config/firebaseConfig', () => ({
  auth: { currentUser: null },
}));

const mockedStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
const mockedReload = reload as jest.MockedFunction<typeof reload>;
const mockedSendEmailVerification = sendEmailVerification as jest.MockedFunction<typeof sendEmailVerification>;
const mutableAuth = auth as typeof auth & { currentUser: any };

describe('account verification email', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mutableAuth.currentUser = null;
    mockedStorage.getItem.mockResolvedValue(null);
    mockedStorage.setItem.mockResolvedValue(undefined);
    mockedReload.mockResolvedValue(undefined);
    mockedSendEmailVerification.mockResolvedValue(undefined);
  });

  test('requires a signed-in user', async () => {
    await expect(requestCurrentUserVerificationEmail()).resolves.toEqual({
      status: 'unavailable',
      message: 'Sign in again to verify this account.',
    });
    expect(mockedSendEmailVerification).not.toHaveBeenCalled();
  });

  test('sends one verification email and records the cooldown', async () => {
    mutableAuth.currentUser = {
      uid: 'legacy-user',
      email: 'legacy@example.com',
      emailVerified: false,
    };

    await expect(requestCurrentUserVerificationEmail(10_000)).resolves.toEqual({ status: 'sent' });
    expect(mockedSendEmailVerification).toHaveBeenCalledWith(mutableAuth.currentUser, {
      url: 'https://www.gathrapp.ca/app?source=email-verification',
      handleCodeInApp: false,
    });
    expect(mockedStorage.setItem).toHaveBeenCalledWith(
      '@gathr/verification-email-sent-at/legacy-user',
      '10000'
    );
  });

  test('does not resend during the cooldown', async () => {
    mutableAuth.currentUser = {
      uid: 'legacy-user',
      email: 'legacy@example.com',
      emailVerified: false,
    };
    mockedStorage.getItem.mockResolvedValue('5000');

    await expect(requestCurrentUserVerificationEmail(10_000)).resolves.toEqual({
      status: 'recently_sent',
    });
    expect(mockedSendEmailVerification).not.toHaveBeenCalled();
  });

  test('recognizes an account verified since the last app refresh', async () => {
    mutableAuth.currentUser = {
      uid: 'legacy-user',
      email: 'legacy@example.com',
      emailVerified: false,
    };
    mockedReload.mockImplementation(async (user: any) => {
      user.emailVerified = true;
    });

    await expect(requestCurrentUserVerificationEmail()).resolves.toEqual({
      status: 'already_verified',
    });
    expect(mockedSendEmailVerification).not.toHaveBeenCalled();
  });
});
