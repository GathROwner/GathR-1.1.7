/**
 * Centralized Date and Time Utilities for GathR Application
 * This file contains all date and time related functions used throughout the application
 * to ensure consistent time handling across all components.
 */

import {
  format,
  parseISO,
  parse,
  isValid,
  isWithinInterval,
  isSameDay
} from 'date-fns';
import type { TimeStatus } from '../types/events';
import {
  getEventScheduleState,
  getEventTimeRangeText,
  getEventTimeStatusFromTiming,
  isEventConfirmedNow,
} from './eventTiming';

// ===============================================================
// NEW: TEMPORAL DISTANCE SYSTEM FOR PRIORITY CALCULATIONS
// ===============================================================

// Temporal distance penalty bands for FUTURE events
export const TEMPORAL_DISTANCE_BANDS = [
  { maxDays: 1, multiplier: 1.0 },     // Tomorrow: no penalty
  { maxDays: 3, multiplier: 0.9 },     // 2-3 days: 10% penalty  
  { maxDays: 7, multiplier: 0.8 },     // 4-7 days: 20% penalty
  { maxDays: 14, multiplier: 0.7 },    // 1-2 weeks: 30% penalty
  { maxDays: 30, multiplier: 0.6 },    // 2-4 weeks: 40% penalty
  { maxDays: Infinity, multiplier: 0.5 } // >1 month: 50% penalty
];

export interface EventDisplayDateRange {
  startDate?: string | null;
  endDate?: string | null;
  isRecurring?: boolean | null;
  recurrenceUntilDate?: string | null;
}

/**
 * Returns the date that should appear in an "Until" label.
 * A recurring series uses its explicit recurrence boundary. A non-recurring
 * event only gets an "Until" label when it actually spans multiple dates.
 */
export const getEventDisplayUntilDate = (
  event: EventDisplayDateRange
): string | undefined => {
  const startDate = String(event.startDate || '').trim();
  const recurrenceUntilDate = String(event.recurrenceUntilDate || '').trim();
  if (event.isRecurring && recurrenceUntilDate && recurrenceUntilDate !== startDate) {
    return recurrenceUntilDate;
  }

  const endDate = String(event.endDate || '').trim();
  if (endDate && endDate !== startDate) return endDate;
  return undefined;
};

/**
 * Get user's timezone for consistent timezone handling
 * @returns {string} User's timezone identifier
 */
export const getUserTimezone = (): string => {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
};

/**
 * Get current date/time in user's timezone
 * @returns {Date} Current date in user's local timezone
 */
export const getNowInUserTimezone = (): Date => {
  return new Date(); // Always uses device timezone
};

/**
 * Calculate days from now using timezone-aware date comparison
 * This fixes the timezone bug by using date-only comparison in user's local timezone
 * @param {string} eventDate - Event date in YYYY-MM-DD format
 * @returns {number} Number of days from now (0 = today, 1 = tomorrow, etc.)
 */
export const getDaysFromNow = (eventDate: string): number => {
  const now = getNowInUserTimezone();
  const event = parseISO(eventDate);
  
  // Use date-only comparison to avoid time-of-day issues
  const nowDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const eventDateOnly = new Date(event.getFullYear(), event.getMonth(), event.getDate());
  
  const diffTime = eventDateOnly.getTime() - nowDateOnly.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  
  return Math.max(0, diffDays); // Never negative
};

/**
 * Get temporal multiplier for priority calculation (only applies to FUTURE events)
 * @param {string} eventDate - Event date in YYYY-MM-DD format  
 * @param {string} timeStatus - Time status ('now', 'today', 'future')
 * @returns {number} Temporal multiplier (1.0 = no penalty, 0.5 = 50% penalty)
 */
export const getTemporalMultiplier = (eventDate: string, timeStatus: string): number => {
  // Only apply temporal penalty to FUTURE events
  if (timeStatus !== 'future') return 1.0;
  
  const daysFromNow = getDaysFromNow(eventDate);
  
  for (const band of TEMPORAL_DISTANCE_BANDS) {
    if (daysFromNow <= band.maxDays) {
      return band.multiplier;
    }
  }
  
  return 0.5; // Default fallback
};

// ===============================================================
// EXISTING FUNCTIONS (keeping all your original functions)
// ===============================================================

/**
 * Format time string by removing unnecessary parts
 * @param {string} time - Time string (e.g., "7:00:00 PM" or "9:30 AM")
 * @returns {string} Formatted time string
 */
export const formatTime = (time: string): string => {
  if (!time) return '';

  const normalized = time.trim();
  const twentyFourHour = normalized.match(/^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
  if (twentyFourHour) {
    const hour24 = Number(twentyFourHour[1]);
    const minute = twentyFourHour[2];
    const period = hour24 >= 12 ? 'PM' : 'AM';
    const hour12 = hour24 % 12 || 12;
    return formatTime(`${hour12}:${minute}:00 ${period}`);
  }
  
  // Handle time format with seconds
  return normalized
    .replace(/:\d{2} (AM|PM)$/i, ' $1') // First remove seconds if present
    .replace(':00 PM', 'pm')
    .replace(':00 AM', 'am')
    .replace(':30 PM', ':30pm')
    .replace(':30 AM', ':30am');
};

/**
 * Combine date string and time string into a Date object
 * Handles multiple time formats with robust error handling
 * 
 * @param {string} dateStr - Date string in 'YYYY-MM-DD' format
 * @param {string} timeStr - Time string (handles various formats)
 * @returns {Date} Combined Date object
 */
export const combineDateAndTime = (dateStr: string, timeStr: string): Date => {
  try {
    if (!dateStr) {
      throw new Error('Date string is required');
    }
    
    if (!timeStr) {
      // If no time provided, use noon as default
      const dateObj = parseISO(dateStr);
      dateObj.setHours(12, 0, 0, 0);
      return dateObj;
    }
    
    // First try parsing with seconds format (e.g., "7:30:00 PM")
    try {
      return parse(
        `${dateStr} ${timeStr}`,
        'yyyy-MM-dd h:mm:ss a',
        new Date()
      );
    } catch (e) {
      // Then try without seconds (e.g., "7:30 PM")
      try {
        return parse(
          `${dateStr} ${timeStr}`,
          'yyyy-MM-dd h:mm a',
          new Date()
        );
      } catch (e2) {
        // Fallback to regex parsing as last resort
        const timeParts = timeStr.match(/(\d+):(\d+)(?::(\d+))?\s*(AM|PM|am|pm)/i);
        if (timeParts) {
          let hours = parseInt(timeParts[1]);
          const minutes = parseInt(timeParts[2]);
          const seconds = timeParts[3] ? parseInt(timeParts[3]) : 0;
          const ampm = timeParts[4].toUpperCase();
          
          if (ampm === 'PM' && hours < 12) hours += 12;
          if (ampm === 'AM' && hours === 12) hours = 0;
          
          const date = parseISO(dateStr);
          date.setHours(hours, minutes, seconds);
          return date;
        }
        throw new Error(`Could not parse time: ${timeStr}`);
      }
    }
  } catch (error) {
    console.error(`Error combining date and time: ${error}`);
    // Return current date as last resort fallback
    return new Date();
  }
};

/**
 * Check if a date is today using normalized date comparison
 * (more reliable than date-fns isToday for consistent timezone handling)
 * 
 * @param {Date|string} date - Date to check
 * @returns {boolean} True if date is today
 */
export const isToday = (date: Date | string): boolean => {
  try {
    const now = getNowInUserTimezone();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const compareDate = typeof date === 'string' ? parseISO(date) : date;
    const compareDateOnly = new Date(
      compareDate.getFullYear(),
      compareDate.getMonth(),
      compareDate.getDate()
    );
    
    return compareDateOnly.getTime() === today.getTime();
  } catch (error) {
    console.warn(`Error in isToday check: ${error}`);
    return false;
  }
};

/**
 * Check if a date is tomorrow using normalized date comparison
 * (more reliable than date-fns isTomorrow for consistent timezone handling)
 * 
 * @param {Date|string} date - Date to check
 * @returns {boolean} True if date is tomorrow
 */
export const isTomorrow = (date: Date | string): boolean => {
  try {
    const now = getNowInUserTimezone();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const compareDate = typeof date === 'string' ? parseISO(date) : date;
    const compareDateOnly = new Date(
      compareDate.getFullYear(),
      compareDate.getMonth(),
      compareDate.getDate()
    );
    
    return compareDateOnly.getTime() === tomorrow.getTime();
  } catch (error) {
    console.warn(`Error in isTomorrow check: ${error}`);
    return false;
  }
};

/**
 * Format event date and time with human-readable labels for today/tomorrow
 * 
 * @param {string} date - ISO date string (YYYY-MM-DD)
 * @param {string} time - Time string
 * @param {Object} event - Optional event object for additional context
 * @returns {string} Formatted date and time
 */
export const formatEventDateTime = (date: string, time: string, event?: any): string => {
  try {
    if (!date) return '';
    
    // If event is provided and we can check if it's happening now
    if (event && isEventConfirmedNow(event)) {
      return 'HAPPENING NOW';
    }
    
    // Parse date with reliable method
    const eventDate = parseISO(date);
    
    // Use our enhanced isToday and isTomorrow functions
    if (isToday(eventDate)) {
      return `Today at ${formatTime(time)}`;
    } else if (isTomorrow(eventDate)) {
      return `Tomorrow at ${formatTime(time)}`;
    } else {
      return `${format(eventDate, 'EEE, MMM d')} at ${formatTime(time)}`;
    }
  } catch (error) {
    console.error(`Error formatting event date/time: ${error}`);
    return `${date} ${formatTime(time)}`;
  }
};

/**
 * Get date string in a consistent format for grouping
 * @param {string} date - ISO date string
 * @returns {string} Date string in yyyy-MM-dd format
 */
export const getDateKey = (date: string): string => {
  if (!date) return '';
  return format(parseISO(date), 'yyyy-MM-dd');
};

/**
 * Format a date with full day, month, and date
 * @param {string|Date} date - ISO date string or Date object
 * @returns {string} Formatted date (e.g., "Monday, January 15")
 */
export const formatFullDate = (date: string | Date): string => {
  if (!date) return '';
  
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return format(dateObj, 'EEEE, MMMM d');
};

/**
 * Check if an event is a multi-day event
 * @param {string} startDate - Start date (ISO string)
 * @param {string} endDate - End date (ISO string)
 * @returns {boolean} Whether the event spans multiple days
 */
export const isMultiDayEvent = (startDate: string, endDate?: string): boolean => {
  if (!endDate || endDate === startDate) return false;
  
  try {
    const start = parseISO(startDate);
    const end = parseISO(endDate);
    
    // Compare date components only
    const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    
    return endDay.getTime() > startDay.getTime();
  } catch (error) {
    console.warn(`Error checking multi-day event: ${error}`);
    return false;
  }
};

// Formats tried in order by parseDateTime; 12h before 24h so "7:00 PM"
// never half-matches a 24h pattern.
const DATE_TIME_FORMATS = [
  'yyyy-MM-dd h:mm:ss a', // 12h with seconds - the backend format ("7:00:00 PM")
  'yyyy-MM-dd h:mm a',    // 12h without seconds ("7:00 PM")
  'yyyy-MM-dd H:mm:ss',   // 24h with seconds ("19:00:00")
  'yyyy-MM-dd H:mm',      // 24h ("19:00")
];

/**
 * Parse a date-time string with multiple fallback approaches
 * @param {string} dateStr - Date string (YYYY-MM-DD)
 * @param {string} timeStr - Time string
 * @returns {Date|null} Parsed date, or null (never an Invalid Date) if parsing fails
 */
const parseDateTime = (dateStr: string, timeStr: string): Date | null => {
  if (!dateStr) return null;

  // If no time, use noon
  if (!timeStr) {
    const date = parseISO(dateStr);
    if (!isValid(date)) return null;
    date.setHours(12, 0, 0, 0);
    return date;
  }

  // date-fns parse() signals a format mismatch by returning an Invalid Date
  // rather than throwing, so each result must be isValid-checked to fall
  // through to the next format.
  for (const formatStr of DATE_TIME_FORMATS) {
    const parsed = parse(`${dateStr} ${timeStr}`, formatStr, new Date());
    if (isValid(parsed)) return parsed;
  }

  // Fallback: manual regex parsing for looser 12h strings
  const timeParts = timeStr.match(/(\d+):(\d+)(?::(\d+))?\s*(AM|PM|am|pm)/i);
  if (timeParts) {
    const date = parseISO(dateStr);
    if (isValid(date)) {
      let hours = parseInt(timeParts[1]);
      const minutes = parseInt(timeParts[2]);
      const ampm = timeParts[4].toUpperCase();

      if (ampm === 'PM' && hours < 12) hours += 12;
      if (ampm === 'AM' && hours === 12) hours = 0;

      date.setHours(hours, minutes, 0, 0);
      return date;
    }
  }

  // Last resort: just use the date at noon
  console.error(`Failed to parse datetime: ${dateStr} ${timeStr}`);
  const date = parseISO(dateStr);
  if (!isValid(date)) return null;
  date.setHours(12, 0, 0, 0);
  return date;
};

/**
 * Enhanced version of isEventNow with improved multi-day event handling
 * @param {string} startDate - Start date (ISO string)
 * @param {string} startTime - Start time string
 * @param {string} endDate - End date (ISO string)
 * @param {string} endTime - End time string
 * @returns {boolean} Whether the event is currently happening
 */
export const isEventNow = (
  startDate: string,
  startTime: string,
  endDate?: string,
  endTime?: string
): boolean => {
  return isEventConfirmedNow({ startDate, startTime, endDate: endDate || startDate, endTime: endTime || '' });
};

/**
 * One provenance-aware time sentence for cards, callouts, and lightboxes.
 * Qualification belongs in EventTimingBadge; this line keeps the date and
 * useful clock fact compact.
 */
export const formatEventTimingSummary = (event: {
  startDate: string;
  startTime: string;
  endDate?: string;
  endTime?: string;
  timing?: import('../types/events').EventTiming | null;
}): string => {
  const normalized = {
    ...event,
    endDate: event.endDate || event.startDate,
    endTime: event.endTime || '',
  };
  const base = formatEventDateTime(event.startDate, event.startTime, normalized);
  const range = getEventTimeRangeText(normalized);
  if (!base) return range;
  if (base === 'HAPPENING NOW') return `${base} • ${range}`;

  const formattedStart = formatTime(event.startTime);
  const suffix = formattedStart ? ` at ${formattedStart}` : '';
  const dateLabel = suffix && base.endsWith(suffix) ? base.slice(0, -suffix.length) : base;
  return range ? `${dateLabel} • ${range}` : base;
};

export const isEventNowWithTiming = (event: {
  startDate: string;
  startTime: string;
  endDate?: string;
  endTime?: string;
  timing?: import('../types/events').EventTiming | null;
}): boolean => isEventConfirmedNow({
  ...event,
  endDate: event.endDate || event.startDate,
  endTime: event.endTime || '',
});

/**
 * Check if an event is happening today
 * @param {Object} event - Event object with date properties
 * @returns {boolean} Whether the event is happening today
 */
export const isEventHappeningToday = (event: {
  startDate: string;
  startTime: string;
  endDate?: string;
  endTime?: string;
  timing?: import('../types/events').EventTiming | null;
}): boolean => {
  return getEventScheduleState({
    ...event,
    endDate: event.endDate || event.startDate,
    endTime: event.endTime || '',
  }).todayEligible;
};

/**
 * Determine the time status of an event
 * @param {Object} event - Event object with date properties
 * @returns {string} Time status: 'now', 'today', 'future', or 'past'
 */
export const getEventTimeStatus = (event: {
  startDate: string;
  startTime: string;
  endDate?: string;
  endTime?: string;
  timing?: import('../types/events').EventTiming | null;
}): TimeStatus => {
  return getEventTimeStatusFromTiming({
    ...event,
    endDate: event.endDate || event.startDate,
    endTime: event.endTime || '',
  });
};

/**
 * Sort events by honest time status (confirmed now → expected now → started
 * with unknown end → later today → muted today → future)
 * and then by start time within each group
 * @param {Array} events - Array of event objects
 * @returns {Array} Sorted array of events
 */
export const sortEventsByTimeStatus = <T extends {
  startDate: string;
  startTime: string;
  endDate?: string;
  endTime?: string;
  timing?: import('../types/events').EventTiming | null;
}>(events: T[]): T[] => {
  const now = new Date();
  const timingRank = (event: T): number => {
    const state = getEventScheduleState({
      ...event,
      endDate: event.endDate || event.startDate,
      endTime: event.endTime || '',
    }, now);
    if (state.nowEligibility === 'confirmed') return 0;
    if (state.nowEligibility === 'expected') return 1;
    if (state.code === 'started_unknown_end') return 2;
    if (state.todayEligible && !state.muted) return 3;
    if (state.todayEligible && state.muted) return 4;
    if (state.code !== 'confirmed_ended') return 5;
    return 6;
  };

  return [...events].sort((a, b) => {
    const rankDifference = timingRank(a) - timingRank(b);
    if (rankDifference !== 0) return rankDifference;
    
    // Priority 3: Start time (earliest first)
    try {
      const aDateTime = parseDateTime(a.startDate, a.startTime);
      const bDateTime = parseDateTime(b.startDate, b.startTime);
      
      if (aDateTime && bDateTime) {
        return aDateTime.getTime() - bDateTime.getTime();
      }
      
      return 0; // Default if parsing fails
    } catch (error) {
      console.warn('Error comparing event times:', error);
      return 0;
    }
  });
};

/**
 * Get relative time description (e.g., "Starting in 10 minutes", "Ends in 30 minutes")
 * @param {string} startDate - Start date (ISO string)
 * @param {string} startTime - Start time string
 * @param {string} endDate - End date (ISO string)
 * @param {string} endTime - End time string
 * @returns {string} Relative time description
 */
export const getRelativeTimeDescription = (
  startDate: string,
  startTime: string,
  endDate?: string,
  endTime?: string
): string => {
  if (!startDate || !startTime) return '';
  
  try {
    const now = getNowInUserTimezone();
    
    // Apply fallbacks internally 
    const effectiveEndDate = endDate || startDate;
    const effectiveEndTime = endTime || '';
    
    // Parse start and end times
    const startDateTime = parseDateTime(startDate, startTime);
    if (!startDateTime) return '';
    
    let endDateTime: Date | null = null;
    
    if (effectiveEndDate && effectiveEndTime) {
      endDateTime = parseDateTime(effectiveEndDate, effectiveEndTime);
    } else if (!effectiveEndDate && effectiveEndTime) {
      // End time without end date - use start date
      endDateTime = parseDateTime(startDate, effectiveEndTime);
    }
    
    // Handle case where end time is earlier than start time (wraps to next day)
    if (endDateTime && endDateTime < startDateTime && !endDate) {
      endDateTime.setDate(endDateTime.getDate() + 1);
    }
    
    // Calculate time differences
    const minutesToStart = Math.floor((startDateTime.getTime() - now.getTime()) / 60000);
    const minutesToEnd = endDateTime
      ? Math.floor((endDateTime.getTime() - now.getTime()) / 60000)
      : null;
    
    if (minutesToStart > 0) {
      if (minutesToStart < 60) {
        return `Starting in ${minutesToStart} minute${minutesToStart === 1 ? '' : 's'}`;
      } else {
        const hours = Math.floor(minutesToStart / 60);
        return `Starting in ${hours} hour${hours === 1 ? '' : 's'}`;
      }
    } else if (minutesToEnd !== null && minutesToEnd > 0) {
      if (minutesToEnd < 60) {
        return `Ending in ${minutesToEnd} minute${minutesToEnd === 1 ? '' : 's'}`;
      } else {
        const hours = Math.floor(minutesToEnd / 60);
        return `Ending in ${hours} hour${hours === 1 ? '' : 's'}`;
      }
    } else if (minutesToEnd !== null && minutesToEnd <= 0) {
      return 'Event ended';
    } else {
      return `Started at ${formatTime(startTime)} · End time not provided`;
    }
  } catch (error) {
    console.error(`Error in getRelativeTimeDescription: ${error}`);
    return '';
  }
};

/**
 * Debug utility to log event time status calculation
 */
export const debugEventTimeStatus = (
  event: {
    title: string;
    type?: string;
    startDate: string;
    startTime: string;
    endDate?: string;
    endTime?: string;
  }
) => {
  const now = getNowInUserTimezone();
  
  //console.log(`[DEBUG TIME] Event: "${event.title}" (${event.type || 'unknown type'})`);
  //console.log(`[DEBUG TIME] Current time: ${now.toLocaleString()}`);
  //console.log(`[DEBUG TIME] Start: ${event.startDate} ${event.startTime}`);
  //console.log(`[DEBUG TIME] End: ${event.endDate || event.startDate} ${event.endTime || '(none)'}`);
  //console.log(`[DEBUG TIME] Is multi-day: ${isMultiDayEvent(event.startDate, event.endDate)}`);
  
  const effectiveEndDate = event.endDate || event.startDate;
  const effectiveEndTime = event.endTime || '';
  
  // Parse start and end times
  const startDateTime = parseDateTime(event.startDate, event.startTime);
  const endDateTime = effectiveEndTime ? parseDateTime(effectiveEndDate, effectiveEndTime) : null;
  
  if (startDateTime) {
    console.log(`[DEBUG TIME] Start parsed: ${startDateTime.toLocaleString()}`);
  } else {
    console.log(`[DEBUG TIME] Failed to parse start date/time`);
  }
  
  if (endDateTime) {
    console.log(`[DEBUG TIME] End parsed: ${endDateTime.toLocaleString()}`);
  } else {
    console.log(`[DEBUG TIME] Failed to parse/determine end date/time`);
  }
  
  if (startDateTime && endDateTime) {
    const isNow = now >= startDateTime && now <= endDateTime;
    console.log(`[DEBUG TIME] Is happening now: ${isNow}`);
    
    if (!isNow) {
      if (now < startDateTime) {
        const minutes = Math.floor((startDateTime.getTime() - now.getTime()) / 60000);
        console.log(`[DEBUG TIME] Event starts in ${minutes} minutes (${Math.floor(minutes/60)} hours)`);
      } else {
        const minutes = Math.floor((now.getTime() - endDateTime.getTime()) / 60000);
        console.log(`[DEBUG TIME] Event ended ${minutes} minutes ago (${Math.floor(minutes/60)} hours)`);
      }
    }
  }
  
  // Comprehensive status checks
  console.log(`[DEBUG TIME] Final time status checks:`);
  console.log(`[DEBUG TIME] isEventNow: ${isEventNow(event.startDate, event.startTime, event.endDate, event.endTime)}`);
  console.log(`[DEBUG TIME] isEventHappeningToday: ${isEventHappeningToday(event)}`);
  console.log(`[DEBUG TIME] getEventTimeStatus: ${getEventTimeStatus(event)}`);
  console.log(`[DEBUG TIME] getDaysFromNow: ${getDaysFromNow(event.startDate)}`);
};

/**
 * Re-export necessary functions from date-fns for consistency
 */
export {
  format,
  parseISO,
  isWithinInterval,
  isSameDay
};
