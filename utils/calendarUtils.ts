import * as Linking from 'expo-linking';
import { Platform, Alert } from 'react-native';
import type { Event } from '../types/events';
import { combineDateAndTime } from './dateUtils';
import { getCalendarEndDecision, getEventTiming } from './eventTiming';

interface CalendarEvent {
  title: string;
  startDate: Date;
  endDate: Date;
  location?: string;
  notes?: string;
}

/**
 * Add an event to the device calendar using web-based calendar services
 * @param {CalendarEvent} event - Event details to add to calendar
 */
export const addToCalendar = async (event: CalendarEvent): Promise<void> => {
  try {
    // Format dates for URL (YYYYMMDDTHHMMSSZ format)
    const formatForUrl = (date: Date) => {
      return date.toISOString().replace(/-|:|\.\d+/g, '');
    };
    
    const startISO = formatForUrl(event.startDate);
    const endISO = formatForUrl(event.endDate);
    
    // Create Google Calendar URL (works on both platforms)
    const url = `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(event.title)}&dates=${startISO}/${endISO}&details=${encodeURIComponent(event.notes || '')}&location=${encodeURIComponent(event.location || '')}&sf=true&output=xml`;
    
    const canOpen = await Linking.canOpenURL(url);
    
    if (canOpen) {
      await Linking.openURL(url);
    } else {
      // Fallback to platform-specific calendar apps
      let fallbackUrl;
      
      if (Platform.OS === 'ios') {
        fallbackUrl = `calshow:${event.startDate.getTime()}`;
      } else {
        // Android
        fallbackUrl = `content://com.android.calendar/time/${event.startDate.getTime()}`;
      }
      
      const canOpenFallback = await Linking.canOpenURL(fallbackUrl);
      
      if (canOpenFallback) {
        await Linking.openURL(fallbackUrl);
      } else {
        Alert.alert(
          "Calendar Unavailable",
          "We couldn't access your calendar. Please add this event manually."
        );
      }
    }
  } catch (error) {
    console.error('Error adding event to calendar:', error);
    Alert.alert(
      "Calendar Error",
      "There was a problem adding this event to your calendar. Please try again later."
    );
  }
};

const ask = (title: string, message: string, buttons: { text: string; value: string; style?: 'cancel' | 'destructive' | 'default' }[]) =>
  new Promise<string>((resolve) => {
    Alert.alert(
      title,
      message,
      buttons.map((button) => ({
        text: button.text,
        style: button.style,
        onPress: () => resolve(button.value),
      })),
      { cancelable: true, onDismiss: () => resolve('cancel') }
    );
  });

const chooseDurationMinutes = async (): Promise<number | null> => {
  const first = await ask(
    'Choose an end time',
    'The organizer did not provide an end. How long should this calendar entry be?',
    [
      { text: '45 minutes', value: '45' },
      { text: '1 hour', value: '60' },
      { text: 'More options', value: 'more' },
    ]
  );
  if (first === '45' || first === '60') return Number(first);
  if (first !== 'more') return null;
  const second = await ask('Choose a duration', 'You can change this later in your calendar.', [
    { text: '2 hours', value: '120' },
    { text: '3 hours', value: '180' },
    { text: 'Cancel', value: 'cancel', style: 'cancel' },
  ]);
  return second === '120' || second === '180' ? Number(second) : null;
};

export const addEventToCalendarWithTiming = async (
  event: Pick<
    Event,
    | 'title'
    | 'description'
    | 'startDate'
    | 'startTime'
    | 'endDate'
    | 'endTime'
    | 'timing'
    | 'facebookUrl'
    | 'sharedEventProvenance'
  >,
  location: string
): Promise<boolean> => {
  const startDate = combineDateAndTime(event.startDate, event.startTime);
  const decision = getCalendarEndDecision(event);
  let endDate: Date;
  let notes = event.description || '';

  if (decision.kind === 'confirmed') {
    endDate = combineDateAndTime(decision.endDate, decision.endTime);
  } else if (decision.kind === 'estimated') {
    const choice = await ask(
      'Estimated end time',
      `${decision.endTime} is a GathR estimate, not an organizer-provided ending.`,
      [
        { text: 'Cancel', value: 'cancel', style: 'cancel' },
        { text: 'Choose duration', value: 'choose' },
        { text: 'Use estimate', value: 'estimate' },
      ]
    );
    if (choice === 'cancel') return false;
    if (choice === 'choose') {
      const duration = await chooseDurationMinutes();
      if (duration === null) return false;
      endDate = new Date(startDate.getTime() + duration * 60000);
      notes = `${notes}\n\nCalendar end selected by you in GathR.`.trim();
    } else {
      endDate = combineDateAndTime(decision.endDate, decision.endTime);
      notes = `${notes}\n\nEnd time estimated by GathR.`.trim();
    }
  } else {
    const duration = await chooseDurationMinutes();
    if (duration === null) return false;
    endDate = new Date(startDate.getTime() + duration * 60000);
    notes = `${notes}\n\nThe organizer did not provide an end time. Calendar end selected by you in GathR.`.trim();
  }

  const timing = getEventTiming(event);
  const sourceUrl =
    timing.schedule.end.sourceUrl ||
    timing.schedule.start.sourceUrl ||
    event.facebookUrl ||
    event.sharedEventProvenance?.sourceUrl;
  if (sourceUrl) notes = `${notes}\n\nOfficial source: ${sourceUrl}`.trim();

  await addToCalendar({ title: event.title, startDate, endDate, location, notes });
  return true;
};
