// Replace calendarUtils.ts with this implementation
import * as Linking from 'expo-linking';
import { Platform, Alert } from 'react-native';

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