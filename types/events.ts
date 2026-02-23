/**
 * Event-related type definitions for the GathR application
 */

/**
 * Coordinates interface for geographic locations
 */
export interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * Main Event interface representing event data from the API
 */
export interface Event {
  id: string | number;
  type: 'event' | 'special';
  category: string;
  title: string;
  description: string;
  venue: string;
  address: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  ticketPrice: string;
  profileUrl: string;
  imageUrl: string;
  SharedPostThumbnail: string;
  latitude: number;
  longitude: number;
  ticketLinkPosts: string;
  ticketLinkEvents: string;
  relevantImageUrl?: string;
  likes?: number | string;
  shares?: number | string;
  interested?: number | string;  // GathR's internal interested count (calendar adds)
  comments?: number | string;
  topReactionsCount?: number | string;
  usersResponded?: number | string;
  engagementScore?: number;
  priorityScore?: number;

    // For sorting/prioritization
  relevanceScore?: number;

  // Data source tracking (for parallel API sources)
  source?: 'google_sheets' | 'firestore';

  // Additional media (Firestore events may have multiple images)
  mediaUrls?: string[];

  // Event details (from Firestore metadata)
  facebookUrl?: string;
  eventType?: string;
  ageRestriction?: string;

  // Recurrence metadata (materialized instance support)
  isRecurring?: boolean;
  recurringPattern?: string;
  isRecurringInstance?: boolean;
  originalEventId?: string | null;

  // Venue details (from Firestore venue object)
  venueRating?: number;
  venuePhone?: string;
  venueWebsite?: string;
  venueFacebookUrl?: string;
  venueInstagramUrl?: string;
  venueCategories?: string[];
}

/**
 * Time status enum for event and cluster timing
 */
export type TimeStatus = 'now' | 'today' | 'future';

/**
 * Interest level enum for cluster popularity
 */
export type InterestLevel = 'high' | 'medium' | 'low';

/**
 * Venue interface representing a location with grouped events
 */
export interface Venue {
  locationKey: string;
  venue: string;
  address: string;
  latitude: number;
  longitude: number;
  events: Event[];
  relevanceScore?: number;
}

/**
 * Cluster interface representing grouped venues for map display
 * Enhanced with attributes for advanced visualization
 */
export interface Cluster {
  id: string;                        // Stable identifier for cluster tracking
  clusterType: 'single' | 'multi';   // Type of clustering
  venues: Venue[];                   // Contained venues

  // New properties for tree marker visualization
  timeStatus: TimeStatus;            // Timing status (now/today/future)
  interestLevel: InterestLevel;      // Interest/popularity level
  isBroadcasting: boolean;           // Whether to show broadcasting animation
  eventCount: number;                // Number of events (non-specials)
  specialCount: number;              // Number of specials
  categories: string[];              // Unique categories in this cluster
  hasNewContent?: boolean;           // Whether cluster has new events/specials since last interaction
}
