/**
 * Centralized Date and Time Utilities for GathR Application
 * This file contains all date and time related functions used throughout the application
 * to ensure consistent time handling across all components.
 */

import { 
  format, 
  isToday as dateFnsIsToday, 
  isTomorrow as dateFnsIsTomorrow, 
  parseISO, 
  parse,
  isWithinInterval,
  isSameDay
} from 'date-fns';

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
  
  // Handle time format with seconds
  return time
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
    if (event && isEventNow(event.startDate, event.startTime, event.endDate, event.endTime)) {
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

/**
 * Parse a date-time string with multiple fallback approaches
 * @param {string} dateStr - Date string (YYYY-MM-DD)
 * @param {string} timeStr - Time string 
 * @returns {Date|null} Parsed date or null if parsing fails
 */
const parseDateTime = (dateStr: string, timeStr: string): Date | null => {
  if (!dateStr) return null;
  
  // If no time, use noon
  if (!timeStr) {
    const date = parseISO(dateStr);
    date.setHours(12, 0, 0, 0);
    return date;
  }
  
  // Strategy 1: Try with seconds format
  try {
    return parse(`${dateStr} ${timeStr}`, 'yyyy-MM-dd h:mm:ss a', new Date());
  } catch (e) {
    // Strategy 2: Try without seconds
    try {
      return parse(`${dateStr} ${timeStr}`, 'yyyy-MM-dd h:mm a', new Date());
    } catch (e2) {
      // Strategy 3: Manual regex parsing
      try {
        const timeParts = timeStr.match(/(\d+):(\d+)(?::(\d+))?\s*(AM|PM|am|pm)/i);
        if (timeParts) {
          const date = parseISO(dateStr);
          let hours = parseInt(timeParts[1]);
          const minutes = parseInt(timeParts[2]);
          const ampm = timeParts[4].toUpperCase();
          
          if (ampm === 'PM' && hours < 12) hours += 12;
          if (ampm === 'AM' && hours === 12) hours = 0;
          
          date.setHours(hours, minutes, 0, 0);
          return date;
        }
      } catch (e3) {
        // All parsing strategies failed
        console.error(`Failed to parse datetime: ${dateStr} ${timeStr}`);
      }
    }
  }
  
  // Last resort: just use the date at noon
  try {
    const date = parseISO(dateStr);
    date.setHours(12, 0, 0, 0);
    return date;
  } catch (e) {
    return null;
  }
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
  try {
    if (!startDate) return false;
    
    const now = getNowInUserTimezone();
    
    // Always apply fallbacks internally to ensure consistency
    const effectiveEndDate = endDate || startDate;
    const effectiveEndTime = endTime || '11:59 PM';
    
    // MULTI-DAY EVENT HANDLING
    // If this is a multi-day event (different start and end dates)
    // For multi-day events, check if TODAY is within the date range AND
    // if the current TIME is within the daily time window
    if (effectiveEndDate !== startDate) {
      // Step 1: Check if today falls within the date range
      const todayStr = format(now, 'yyyy-MM-dd');
      const startDateObj = parseISO(startDate);
      const endDateObj = parseISO(effectiveEndDate);
      const todayDateObj = parseISO(todayStr);

      // Normalize to date-only comparison (strip time components)
      const startDateOnly = new Date(startDateObj.getFullYear(), startDateObj.getMonth(), startDateObj.getDate());
      const endDateOnly = new Date(endDateObj.getFullYear(), endDateObj.getMonth(), endDateObj.getDate());
      const todayDateOnly = new Date(todayDateObj.getFullYear(), todayDateObj.getMonth(), todayDateObj.getDate());

      // If today is outside the date range, event is not happening now
      if (todayDateOnly < startDateOnly || todayDateOnly > endDateOnly) {
        return false;
      }

      // Step 2: Check if current time is within the daily time window
      // Use today's date with the event's start/end times
      const todayStartDateTime = parseDateTime(todayStr, startTime);
      const todayEndDateTime = parseDateTime(todayStr, effectiveEndTime);

      if (!todayStartDateTime || !todayEndDateTime) {
        return false;
      }

      // Handle time window crossing midnight (e.g., 10pm - 2am)
      if (todayEndDateTime < todayStartDateTime) {
        todayEndDateTime.setDate(todayEndDateTime.getDate() + 1);
      }

      return isWithinInterval(now, { start: todayStartDateTime, end: todayEndDateTime });
    }
    
    // SINGLE-DAY EVENT HANDLING
    
    // Parse start date/time
    const startDateTime = parseDateTime(startDate, startTime);
    if (!startDateTime) {
      console.warn(`Failed to parse start date/time: ${startDate} ${startTime}`);
      return false;
    }
    
    // Determine end time with appropriate fallbacks
    let endDateTime;
    
    if (effectiveEndTime) {
      // Use provided end time
      endDateTime = parseDateTime(startDate, effectiveEndTime);
    } else {
      // Default to 2 hours after start time if no end time provided
      endDateTime = new Date(startDateTime);
      endDateTime.setHours(endDateTime.getHours() + 2);
    }
    
    if (!endDateTime) {
      console.warn(`Failed to determine end date/time from: ${startDate} ${effectiveEndTime || "(+2hrs)"}`);
      return false;
    }
    
    // Handle case where end time is earlier than start time (wraps to next day)
    if (endDateTime < startDateTime) {
      endDateTime.setDate(endDateTime.getDate() + 1);
    }
    
    // Check if current time is within the event's timespan
    return isWithinInterval(now, { start: startDateTime, end: endDateTime });
    
  } catch (error) {
    console.error('Error in isEventNow:', error, {
      startDate, startTime, endDate, endTime
    });
    return false;
  }
};

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
}): boolean => {
  try {
    // First, check if it's happening right now
    if (isEventNow(event.startDate, event.startTime, event.endDate, event.endTime)) {
      return true;
    }
    
    const now = getNowInUserTimezone();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // For multi-day events
    if (event.endDate && event.endDate !== event.startDate) {
      const startDate = parseISO(event.startDate);
      const endDate = parseISO(event.endDate);
      
      // Check if it starts today
      const isStartToday = isToday(startDate);
      
      // Or if it started in the past and is still ongoing
      const isOngoing = startDate < today && endDate >= today;
      
      if (isStartToday || isOngoing) {
        return true;
      }
    }
    
    // For regular single-day events, check if startDate is today
    const eventDate = parseISO(event.startDate);
    const eventDay = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
    
    return eventDay.getTime() === today.getTime();
  } catch (error) {
    console.warn(`Error checking if event is happening today: ${error}`);
    return false;
  }
};

/**
 * Determine the time status of an event
 * @param {Object} event - Event object with date properties
 * @returns {string} Time status: 'now', 'today', or 'future'
 */
export const getEventTimeStatus = (event: {
  startDate: string;
  startTime: string;
  endDate?: string;
  endTime?: string;
}): 'now' | 'today' | 'future' => {
  try {
    if (isEventNow(event.startDate, event.startTime, event.endDate, event.endTime)) {
      return 'now';
    }
    
    if (isEventHappeningToday(event)) {
      return 'today';
    }
    
    return 'future';
  } catch (error) {
    console.warn(`Error determining event time status: ${error}`);
    return 'future';
  }
};

/**
 * Sort events by time status (now → today → future)
 * and then by start time within each group
 * @param {Array} events - Array of event objects
 * @returns {Array} Sorted array of events
 */
export const sortEventsByTimeStatus = <T extends {
  startDate: string;
  startTime: string;
  endDate?: string;
  endTime?: string;
}>(events: T[]): T[] => {
  return [...events].sort((a, b) => {
    // Priority 1: Happening now
    const aIsNow = isEventNow(a.startDate, a.startTime, a.endDate, a.endTime);
    const bIsNow = isEventNow(b.startDate, b.startTime, b.endDate, b.endTime);
    if (aIsNow && !bIsNow) return -1;
    if (!aIsNow && bIsNow) return 1;
    
    // Priority 2: Happening today
    const aIsToday = isEventHappeningToday(a);
    const bIsToday = isEventHappeningToday(b);
    if (aIsToday && !bIsToday) return -1;
    if (!aIsToday && bIsToday) return 1;
    
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
    
    let endDateTime;
    
    if (effectiveEndDate && effectiveEndTime) {
      endDateTime = parseDateTime(effectiveEndDate, effectiveEndTime);
    } else if (effectiveEndDate && !effectiveEndTime) {
      // End date without end time - use end of day
      endDateTime = parseISO(effectiveEndDate);
      endDateTime.setHours(23, 59, 59);
    } else if (!effectiveEndDate && effectiveEndTime) {
      // End time without end date - use start date
      endDateTime = parseDateTime(startDate, effectiveEndTime);
    } else {
      // No end date or time - default to 2 hours after start
      endDateTime = new Date(startDateTime);
      endDateTime.setHours(endDateTime.getHours() + 2);
    }
    
    if (!endDateTime) return '';
    
    // Handle case where end time is earlier than start time (wraps to next day)
    if (endDateTime < startDateTime && !endDate) {
      endDateTime.setDate(endDateTime.getDate() + 1);
    }
    
    // Calculate time differences
    const minutesToStart = Math.floor((startDateTime.getTime() - now.getTime()) / 60000);
    const minutesToEnd = Math.floor((endDateTime.getTime() - now.getTime()) / 60000);
    
    if (minutesToStart > 0) {
      if (minutesToStart < 60) {
        return `Starting in ${minutesToStart} minute${minutesToStart === 1 ? '' : 's'}`;
      } else {
        const hours = Math.floor(minutesToStart / 60);
        return `Starting in ${hours} hour${hours === 1 ? '' : 's'}`;
      }
    } else if (minutesToEnd > 0) {
      if (minutesToEnd < 60) {
        return `Ending in ${minutesToEnd} minute${minutesToEnd === 1 ? '' : 's'}`;
      } else {
        const hours = Math.floor(minutesToEnd / 60);
        return `Ending in ${hours} hour${hours === 1 ? '' : 's'}`;
      }
    } else if (minutesToEnd <= 0) {
      return 'Event ended';
    }
    
    return '';
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
  
  // Apply fallbacks
  const effectiveEndDate = event.endDate || event.startDate;
  const effectiveEndTime = event.endTime || '11:59 PM';
  
  // Parse start and end times
  const startDateTime = parseDateTime(event.startDate, event.startTime);
  const endDateTime = parseDateTime(effectiveEndDate, effectiveEndTime);
  
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