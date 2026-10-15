import { Alert } from 'react-native';
import * as Linking from 'expo-linking';
import { addEventToCalendarWithTiming } from '../calendarUtils';
import { dateOnlyActivity } from './fixtures/dateOnlyActivity';
import { createLegacyTimingContract } from '../eventTiming';

jest.mock('expo-linking', () => ({ canOpenURL: jest.fn(async () => true), openURL: jest.fn() }));

beforeEach(() => { jest.clearAllMocks(); (Linking.canOpenURL as jest.Mock).mockResolvedValue(true); });
afterEach(() => jest.restoreAllMocks());
it('does not invent a noon calendar start for a date-only activity', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => buttons?.[0].onPress?.());
  expect(await addEventToCalendarWithTiming(dateOnlyActivity(), 'Example venue')).toBe(false);
  expect(alert).toHaveBeenCalledWith('Time not provided', expect.stringContaining('did not provide a start time'), expect.any(Array), expect.any(Object));
  expect(Linking.openURL).not.toHaveBeenCalled();
});
it('preserves a confirmed timed calendar event', async () => {
  const event = dateOnlyActivity({ startTime: '7:00:00 PM', endTime: '9:00:00 PM' });
  event.timing = createLegacyTimingContract(event, { endStatus: 'observed' });
  expect(await addEventToCalendarWithTiming(event, 'Example venue')).toBe(true);
  expect(Linking.openURL).toHaveBeenCalledWith(expect.stringContaining('calendar/render'));
});
it('opens only the original source when the user explicitly chooses it', async () => {
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => buttons?.find(button => button.text === 'View original post')?.onPress?.());
  const event = dateOnlyActivity({ facebookUrl: 'https://example.com/synthetic-activity' });
  expect(await addEventToCalendarWithTiming(event, 'Example venue')).toBe(false);
  expect(Linking.openURL).toHaveBeenCalledTimes(1);
  expect(Linking.openURL).toHaveBeenCalledWith(event.facebookUrl);
});
