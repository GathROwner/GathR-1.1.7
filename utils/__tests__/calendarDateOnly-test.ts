import { Alert } from 'react-native';
import * as Linking from 'expo-linking';
import { addEventToCalendarWithTiming } from '../calendarUtils';
import { dateOnlyActivity } from './fixtures/dateOnlyActivity';
import { createLegacyTimingContract } from '../eventTiming';
import type { Event } from '../../types/events';
import { softInternet } from './fixtures/softInternet';

jest.mock('expo-linking', () => ({ canOpenURL: jest.fn(async () => true), openURL: jest.fn() }));

beforeEach(() => { jest.clearAllMocks(); (Linking.canOpenURL as jest.Mock).mockResolvedValue(true); });
afterEach(() => jest.restoreAllMocks());
it('explains advertised visiting hours without inventing one months-long calendar appointment', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title,_message,buttons)=>buttons?.[0].onPress?.());
  expect(await addEventToCalendarWithTiming(softInternet(),'Confederation Centre Art Gallery')).toBe(false);
  expect(alert.mock.calls[0][0]).toBe('Choose your visiting time');
  expect(alert.mock.calls[0][1]).toContain('closed Mondays');expect(Linking.openURL).not.toHaveBeenCalled();
});
it('does not invent a noon calendar start for a date-only activity', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => buttons?.[0].onPress?.());
  expect(await addEventToCalendarWithTiming(dateOnlyActivity(), 'Example venue')).toBe(false);
  expect(alert).toHaveBeenCalledWith('Time not provided', expect.stringContaining('did not provide a start time'), expect.any(Array), expect.any(Object));
  expect(Linking.openURL).not.toHaveBeenCalled();
});
it('keeps calendar protection for persisted string No flags', async () => {
  const event = { ...dateOnlyActivity(), isRecurring: 'No', isRecurringInstance: 'No' } as unknown as Event;
  const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => buttons?.[0].onPress?.());
  expect(await addEventToCalendarWithTiming(event, 'Example venue')).toBe(false);
  expect(alert.mock.calls[0][0]).toBe('Time not provided');
  expect(Linking.openURL).not.toHaveBeenCalled();
});
it('preserves a confirmed timed calendar event', async () => {
  const event = dateOnlyActivity({ startTime: '7:00:00 PM', endTime: '9:00:00 PM' });
  event.timing = createLegacyTimingContract(event, { endStatus: 'observed' });
  expect(await addEventToCalendarWithTiming(event, 'Example venue')).toBe(true);
  expect(Linking.openURL).toHaveBeenCalledWith(expect.stringContaining('calendar/render'));
});
it('preserves a confirmed timed recurring calendar event with string Yes', async () => {
  const event = { ...dateOnlyActivity({ startTime: '7:00:00 PM', endTime: '9:00:00 PM' }),
    isRecurring: 'Yes', isRecurringInstance: 'Yes' } as unknown as Event;
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
