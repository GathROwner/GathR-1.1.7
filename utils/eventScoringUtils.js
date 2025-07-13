// utils/eventScoringUtils.js
import { getUserInterests, getUserFavorites } from '../services/userService';
import { calculateDistance } from '../utils/locationUtils';
import { getEventTimeStatus } from '../utils/dateUtils';
import { BASE_SCORES, DISTANCE_BANDS, ENGAGEMENT_TIERS, calculateEngagementTier } from './priorityUtils';

// Main scoring function that incorporates all priority factors
export async function calculateEventRelevanceScore(event, userLocation) {
  // Get user data
  const userInterests = await getUserInterests();
  const userFavorites = await getUserFavorites();
  
  // Get event time status
  const timeStatus = getEventTimeStatus(event);
  
  // Determine if event matches user interests
  const matchesInterests = userInterests.some(interest => 
    interest.toLowerCase() === event.category.toLowerCase()
  );
  
  // Determine if event is saved
  const isSaved = userFavorites.includes(event.id.toString());
  
  // Calculate base score based on time status and interest match
  const baseScore = getBaseScore(timeStatus, matchesInterests);
  
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
  
  // Return full set of calculated values for sorting
  return {
    isSaved,
    timeStatus,
    baseScore,
    proximityMultiplier,
    engagementTierPoints,
    compositeScore,
    matchesInterests,
    distance // Include actual distance for tie-breaking
  };
}

// Helper function to get base score
function getBaseScore(timeStatus, matchesInterests) {
  const scoreCategory = matchesInterests ? 'INTEREST_MATCH' : 'NON_INTEREST';
  return BASE_SCORES[scoreCategory][timeStatus];
}

// Function to sort events according to the algorithm
export function sortEventsByRelevance(events, scoredEventsMap) {
  // First, separate saved and unsaved events
  const savedEvents = [];
  const unsavedEvents = [];
  
  events.forEach(event => {
    const scoreData = scoredEventsMap.get(event.id.toString());
    if (!scoreData) return; // Skip if no score data
    
    if (scoreData.isSaved) {
      savedEvents.push({ event, scoreData });
    } else {
      unsavedEvents.push({ event, scoreData });
    }
  });
  
  // Group saved events by time category
  const savedNowEvents = savedEvents.filter(item => item.scoreData.timeStatus === 'now');
  const savedTodayEvents = savedEvents.filter(item => item.scoreData.timeStatus === 'today');
  const savedFutureEvents = savedEvents.filter(item => item.scoreData.timeStatus === 'future');
  
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
  
  // Sort unsaved events purely by composite score with secondary sort by distance
  unsavedEvents.sort((a, b) => {
    // Primary sort by composite score
    if (b.scoreData.compositeScore !== a.scoreData.compositeScore) {
      return b.scoreData.compositeScore - a.scoreData.compositeScore;
    }
    // Secondary sort by distance when scores are tied
    return a.scoreData.distance - b.scoreData.distance;
  });
  
  // Combine all groups in the correct order
  const sortedEvents = [
    ...savedNowEvents.map(item => item.event),
    ...savedTodayEvents.map(item => item.event),
    ...savedFutureEvents.map(item => item.event),
    ...unsavedEvents.map(item => item.event)
  ];
  
  return sortedEvents;
}