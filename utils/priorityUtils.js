// utils/priorityUtils.js
import { getEventTimeStatus } from '../utils/dateUtils';

// Time category base scores - UPDATED to allow one-tier jumps but prevent two-tier jumps
export const BASE_SCORES = {
  INTEREST_MATCH: {
    now: 600,     // Perfect NOW: 600 + 50 = 650
    today: 570,   // Perfect TODAY: 570 + 50 = 620 (can beat poor NOW: 550)
    future: 200   // Perfect FUTURE: 200 + 50 = 250 (can beat poor TODAY: 220)
  },
  NON_INTEREST: {
    now: 550,     // Poor NOW: 550 + 0 = 550
    today: 220,   // Poor TODAY: 220 + 0 = 220
    future: 150   // Poor FUTURE: 150 + 0 = 150 (with temporal penalty: 105)
  }
};

// Distance bands for proximity multiplier
export const DISTANCE_BANDS = [
  { maxDistance: 500, multiplier: 1.0 },    // Immediate: <500m
  { maxDistance: 2000, multiplier: 0.9 },   // Walking: 500-2000m
  { maxDistance: 5000, multiplier: 0.8 },   // Local: 2000-5000m
  { maxDistance: 10000, multiplier: 0.7 },  // Nearby: 5000-10000m
  { maxDistance: 25000, multiplier: 0.4 },  // Regional: 10-25km
  { maxDistance: 50000, multiplier: 0.2 },  // Far: 25-50km  
  { maxDistance: 100000, multiplier: 0.1 }, // Very far: 50-100km
  { maxDistance: Infinity, multiplier: 0.05 } // Extremely far: >100km
];

// NEW: Temporal distance penalty bands for FUTURE events
export const TEMPORAL_DISTANCE_BANDS = [
  { maxDays: 1, multiplier: 1.0 },     // Tomorrow: no penalty
  { maxDays: 3, multiplier: 0.9 },     // 2-3 days: 10% penalty  
  { maxDays: 7, multiplier: 0.8 },     // 4-7 days: 20% penalty
  { maxDays: 14, multiplier: 0.7 },    // 1-2 weeks: 30% penalty
  { maxDays: 30, multiplier: 0.6 },    // 2-4 weeks: 40% penalty
  { maxDays: Infinity, multiplier: 0.5 } // >1 month: 50% penalty
];

// Engagement tier definitions
export const ENGAGEMENT_TIERS = {
  VIRAL: 50,     // Highly viral content
  POPULAR: 40,   // Very popular content
  ACTIVE: 30,    // Active engagement
  GROWING: 20,   // Growing engagement
  STANDARD: 10,  // Standard engagement
  NEW: 0         // New or minimal engagement
};

// Favorite venue bonus - applied when event is from a user's favorite venue
export const FAVORITE_VENUE_BONUS = 100;

// NEW: Function to calculate days from now
function getDaysFromNow(eventDate) {
  const now = new Date();
  const event = new Date(eventDate);
  
  // Use date-only comparison to avoid time-of-day issues
  const nowDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const eventDateOnly = new Date(event.getFullYear(), event.getMonth(), event.getDate());
  
  const diffTime = eventDateOnly.getTime() - nowDateOnly.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  
  return Math.max(0, diffDays); // Never negative
}

// NEW: Function to get temporal multiplier (only applies to FUTURE events)
function getTemporalMultiplier(eventDate, timeStatus) {
  // Only apply temporal penalty to FUTURE events
  if (timeStatus !== 'future') return 1.0;
  
  const daysFromNow = getDaysFromNow(eventDate);
  
  for (const band of TEMPORAL_DISTANCE_BANDS) {
    if (daysFromNow <= band.maxDays) {
      return band.multiplier;
    }
  }
  
  return 0.5; // Default fallback
}

// Calculate event priority with the enhanced algorithm
export function calculateEventPriority(event, userInterests, userFavorites, userLocation) {
  // Determine saved status
  const isSaved = userFavorites.includes(event.id.toString());
  
  // Determine time status (now, today, future)
  const timeStatus = getEventTimeStatus(event);
  
  // Check for interest match
  const matchesInterest = userInterests.some(interest => 
    interest.toLowerCase() === event.category.toLowerCase()
  );
  
  // Calculate base score
  const scoreCategory = matchesInterest ? 'INTEREST_MATCH' : 'NON_INTEREST';
  const baseScore = BASE_SCORES[scoreCategory][timeStatus];
  
  // Calculate proximity multiplier and actual distance for tie-breaking
  let proximityMultiplier = 1.0; // Default if no location available
  let distance = Infinity; // Default distance if location not available
  
  if (userLocation) {
    distance = calculateDistance(
      userLocation.coords.latitude,
      userLocation.coords.longitude,
      event.latitude,
      event.longitude
    );
    
    // Find the appropriate distance band
    for (const band of DISTANCE_BANDS) {
      if (distance <= band.maxDistance) {
        proximityMultiplier = band.multiplier;
        break;
      }
    }
  }
  
  // NEW: Calculate temporal multiplier
  const temporalMultiplier = getTemporalMultiplier(event.startDate, timeStatus);
  
  // Calculate engagement tier score
  const engagementTierPoints = calculateEngagementTier(event);
  
  // Calculate composite score with temporal penalty
  const compositeScore = (baseScore * proximityMultiplier * temporalMultiplier) + engagementTierPoints;
  
  return {
    isSaved,
    timeStatus,
    baseScore,
    proximityMultiplier,
    temporalMultiplier, // NEW: Include temporal multiplier in return
    engagementTierPoints,
    compositeScore,
    matchesInterest,
    distance,  // Include actual distance for tie-breaking
    daysFromNow: getDaysFromNow(event.startDate) // NEW: Include days from now for debugging
  };
}

// Function to convert raw engagement metrics to tiered points
export function calculateEngagementTier(event) {
  // Safely parse engagement metrics
  const likes = parseInt(String(event.likes || '0'), 10) || 0;
  const shares = parseInt(String(event.shares || '0'), 10) || 0;
  const comments = parseInt(String(event.comments || '0'), 10) || 0;
  const topReactions = parseInt(String(event.topReactionsCount || '0'), 10) || 0;
  const usersResponded = parseInt(String(event.usersResponded || '0'), 10) || 0;
  
  // Calculate total engagement
  const totalEngagement = likes + shares + comments + topReactions + usersResponded;
  
  // Assign tier based on engagement thresholds
  if (totalEngagement >= 500) {
    return ENGAGEMENT_TIERS.VIRAL;
  } else if (totalEngagement >= 200) {
    return ENGAGEMENT_TIERS.POPULAR;
  } else if (totalEngagement >= 100) {
    return ENGAGEMENT_TIERS.ACTIVE;
  } else if (totalEngagement >= 50) {
    return ENGAGEMENT_TIERS.GROWING;
  } else if (totalEngagement >= 10) {
    return ENGAGEMENT_TIERS.STANDARD;
  } else {
    return ENGAGEMENT_TIERS.NEW;
  }
}

// Create a sorting function that implements the two-layer approach
export function sortEventsByPriority(events, userInterests, userFavorites, userLocation) {
  // Calculate scores for all events
  const eventsWithScores = events.map(event => {
    const scoreData = calculateEventPriority(event, userInterests, userFavorites, userLocation);
    return { event, scoreData };
  });
  
  // Group saved events by time category
  const savedNowEvents = eventsWithScores.filter(item => 
    item.scoreData.isSaved && item.scoreData.timeStatus === 'now'
  );
  
  const savedTodayEvents = eventsWithScores.filter(item => 
    item.scoreData.isSaved && item.scoreData.timeStatus === 'today'
  );
  
  const savedFutureEvents = eventsWithScores.filter(item => 
    item.scoreData.isSaved && item.scoreData.timeStatus === 'future'
  );
  
  // Unsaved events
  const unsavedEvents = eventsWithScores.filter(item => !item.scoreData.isSaved);
  
  // Sort each group by composite score WITH SECONDARY SORT BY DISTANCE when scores are tied
  const sortGroup = (group) => {
    return group.sort((a, b) => {
      // Primary sort by composite score
      if (b.scoreData.compositeScore !== a.scoreData.compositeScore) {
        return b.scoreData.compositeScore - a.scoreData.compositeScore;
      }
      // Secondary sort by distance when scores are tied
      return a.scoreData.distance - b.scoreData.distance;
    });
  };
  
  sortGroup(savedNowEvents);
  sortGroup(savedTodayEvents);
  sortGroup(savedFutureEvents);
  sortGroup(unsavedEvents);
  
  // Combine all groups in the correct order
  return [
    ...savedNowEvents.map(item => item.event),
    ...savedTodayEvents.map(item => item.event),
    ...savedFutureEvents.map(item => item.event),
    ...unsavedEvents.map(item => item.event)
  ];
}

/**
 * Creates a locationKey from an event object.
 * This MUST match the pattern used in mapStore.ts createLocationKey for venue grouping.
 * @param {Object} event - Event object with venue, address, latitude, longitude
 * @returns {string} The locationKey for the event's venue
 */
export function createLocationKeyFromEvent(event) {
  const venueName = (event.venue || '').toLowerCase().trim().replace(/\s+/g, ' ');

  if (!event.address || event.address.trim() === '') {
    return `${venueName}_${event.latitude.toFixed(5)},${event.longitude.toFixed(5)}`;
  }

  const addressParts = event.address.split(',');
  const street = (addressParts[0] || '').trim().replace(/\s+/g, ' ');

  // Extract only the first word of city (matches mapStore.ts logic)
  let city = '';
  if (addressParts.length > 1) {
    city = addressParts[1].trim().split(/\s+/)[0] || '';
  }

  // Apply toLowerCase to entire string (matches mapStore.ts logic)
  return `${venueName}_${street}_${city}`.toLowerCase().replace(/\s+/g, ' ');
}