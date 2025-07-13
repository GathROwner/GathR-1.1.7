// utils/priorityUtils.js
import { getEventTimeStatus } from '../utils/dateUtils';


// Time category base scores
export const BASE_SCORES = {
  INTEREST_MATCH: {
    now: 700,
    today: 400,
    future: 200
  },
  NON_INTEREST: {
    now: 500,
    today: 200,
    future: 150
  }
};

// Distance bands for proximity multiplier
export const DISTANCE_BANDS = [
  { maxDistance: 500, multiplier: 1.0 },    // Immediate: <500m
  { maxDistance: 2000, multiplier: 0.9 },   // Walking: 500-2000m
  { maxDistance: 5000, multiplier: 0.8 },   // Local: 2000-5000m
  { maxDistance: 10000, multiplier: 0.7 },  // Nearby: 5000-10000m
  { maxDistance: Infinity, multiplier: 0.5 } // Distant: >10000m
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

// Calculate event priority with the new algorithm
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
  
  // Calculate engagement tier score
  const engagementTierPoints = calculateEngagementTier(event);
  
  // Calculate composite score
  const compositeScore = (baseScore * proximityMultiplier) + engagementTierPoints;
  
  return {
    isSaved,
    timeStatus,
    baseScore,
    proximityMultiplier,
    engagementTierPoints,
    compositeScore,
    matchesInterest,
    distance  // Include actual distance for tie-breaking
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
  savedNowEvents.sort((a, b) => {
    // Primary sort by composite score
    if (b.scoreData.compositeScore !== a.scoreData.compositeScore) {
      return b.scoreData.compositeScore - a.scoreData.compositeScore;
    }
    // Secondary sort by distance when scores are tied
    return a.scoreData.distance - b.scoreData.distance;
  });
  
  savedTodayEvents.sort((a, b) => {
    // Primary sort by composite score
    if (b.scoreData.compositeScore !== a.scoreData.compositeScore) {
      return b.scoreData.compositeScore - a.scoreData.compositeScore;
    }
    // Secondary sort by distance when scores are tied
    return a.scoreData.distance - b.scoreData.distance;
  });
  
  savedFutureEvents.sort((a, b) => {
    // Primary sort by composite score
    if (b.scoreData.compositeScore !== a.scoreData.compositeScore) {
      return b.scoreData.compositeScore - a.scoreData.compositeScore;
    }
    // Secondary sort by distance when scores are tied
    return a.scoreData.distance - b.scoreData.distance;
  });
  
  unsavedEvents.sort((a, b) => {
    // Primary sort by composite score
    if (b.scoreData.compositeScore !== a.scoreData.compositeScore) {
      return b.scoreData.compositeScore - a.scoreData.compositeScore;
    }
    // Secondary sort by distance when scores are tied
    return a.scoreData.distance - b.scoreData.distance;
  });
  
  // Combine all groups in the correct order
  return [
    ...savedNowEvents.map(item => item.event),
    ...savedTodayEvents.map(item => item.event),
    ...savedFutureEvents.map(item => item.event),
    ...unsavedEvents.map(item => item.event)
  ];
}