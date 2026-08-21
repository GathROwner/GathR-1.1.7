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

export type EventActionLinkRole =
  | 'ticket_purchase'
  | 'registration'
  | 'event_info'
  | 'schedule'
  | 'livestream'
  | 'wagering'
  | 'unknown';

export interface EventActionLink {
  url: string;
  role: EventActionLinkRole;
  label: string;
  confidence?: number;
  source?: string;
  evidence?: string;
}

// Firestore does not allow arrays nested directly in arrays, so persisted
// coordinates use named fields and are converted to GeoJSON tuples in the app.
export interface RouteCoordinate {
  longitude: number;
  latitude: number;
}

export interface EventRouteStop {
  id: string;
  label: string;
  coordinates: RouteCoordinate;
  kind: 'start' | 'stop' | 'finish';
  certainty: 'confirmed' | 'approximate';
}

export interface EventRouteSegment {
  id: string;
  streetName?: string;
  coordinates: RouteCoordinate[];
  certainty: 'confirmed' | 'approximate';
  source?: 'official_map' | 'official_streets' | 'connected_stops' | 'manual_review';
}

/**
 * Route display data is deliberately explicit about certainty. Confirmed
 * geometry may render as a solid line; approximate geometry must render as a
 * dashed line and must never be described as an official street-by-street path.
 */
export interface EventRouteData {
  version: 1;
  status: 'verified' | 'partial' | 'approximate';
  sourceUrl?: string;
  sourceLabel?: string;
  verifiedAt?: string;
  confirmedStreets?: string[];
  geometrySource?: string;
  stops?: EventRouteStop[];
  segments?: EventRouteSegment[];
}

/**
 * Main Event interface representing event data from the API
 */
export interface Event {
  id: string | number;
  type: 'event' | 'special';
  category: string;
  familyFriendlyScore?: number | null;
  familyFriendlyLevel?: 'unlikely' | 'possible' | 'likely' | 'high' | null;
  familyFriendlyReasons?: string[];
  familyFriendlyScoringVersion?: string | null;
  title: string;
  description: string;
  venueId?: string | null;
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
  ticketsBuyUrl?: string;
  ticketLink?: string;
  actionLinks?: EventActionLink[];
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
  source?: 'google_sheets' | 'firestore' | 'private_shared';

  // User share provenance. This is intentionally separate from `source` so a
  // public Firestore event can still render normally while showing that the
  // current user also submitted it through sharing.
  sharedEventProvenance?: {
    sharedByCurrentUser: boolean;
    privateEventId?: string;
    ingestId?: string;
    publicCandidateId?: string;
    sourcePlatform?: 'facebook' | 'instagram' | 'web' | 'unknown';
    sourceVisibility?: 'public_verified' | 'restricted_unverified' | 'user_private' | 'unknown';
    routing?: 'private_only' | 'public_candidate' | 'not_public_candidate';
    sourceUrl?: string;
    label?: string;
  };

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

  // Non-venue location metadata for citywide/area events
  locationScope?: 'venue' | 'city' | 'area' | 'route' | 'unknown' | null;
  locationLabel?: string | null;
  locationCity?: string | null;
  locationProvince?: string | null;
  locationPrecision?: 'exact' | 'approximate' | 'city_centroid' | 'none' | null;
  locationReviewStatus?: 'not_needed' | 'needs_review' | 'approved' | 'rejected' | null;
  mapMode?: 'venue' | 'area' | 'route' | 'none' | null;
  routeData?: EventRouteData | null;

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
export type TimeStatus = 'now' | 'today' | 'future' | 'past';

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
  containsCityLevelEvent?: boolean;  // Whether cluster contains a city/area/route experience
  containsRouteEvent?: boolean;      // Whether cluster contains a route-scoped event
}
