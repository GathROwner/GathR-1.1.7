/**
 * Firestore API response types for the GathR application
 * These types match the structure returned by the Firestore events endpoint
 */

/**
 * Firestore timestamp structure
 */
export interface FirestoreTimestamp {
  _seconds: number;
  _nanoseconds: number;
}

/**
 * Venue coordinates from Firestore
 */
export interface FirestoreCoordinates {
  latitude: number;
  longitude: number;
}

/**
 * Venue information nested in Firestore events
 */
export interface FirestoreVenueInfo {
  id: string;
  name: string;
  address: string;
  city?: string;
  category?: string;
  website?: string;
  coordinates?: FirestoreCoordinates | null;
  profileImage?: string;
}

/**
 * Event metadata from Firestore
 */
export interface FirestoreEventMetadata {
  icon?: string;
  image?: string;
  address?: string;
  establishment?: string;
  venueName?: string;
  // Legacy location for recurrence fields (backend now returns these top-level)
  isRecurring?: boolean;
  recurringPattern?: string;
  recurrenceUntilDate?: string;
  isRecurringInstance?: boolean;
  originalEventId?: string | null;
  isFoodSpecial?: boolean;
  matchType?: string;
  matchScore?: number;
  likes?: number;
  shares?: number;
  comments?: number;
  topReactionsCount?: number;
  usersResponded?: string;
  createdAt?: FirestoreTimestamp;
  importedAt?: FirestoreTimestamp;
  updatedAt?: FirestoreTimestamp;
  // Additional fields from single-event endpoint
  mediaUrls?: string[];
  facebookUrl?: string;
  cleanedFacebookUrl?: string;
  sourceUrl?: string;
  eventType?: string;
  ageRestriction?: string;
  familyFriendlyScore?: number | null;
  familyFriendlyLevel?: 'unlikely' | 'possible' | 'likely' | 'high' | null;
  familyFriendlyReasons?: string[];
  familyFriendlyScoringVersion?: string | null;
  fullDescription?: string;
  ticketLinkPosts?: string;
  ticketLinkEvents?: string;
  ticketsBuyUrl?: string;
  ticketLink?: string;
  actionLinks?: import('./events').EventActionLink[];
  sharedEventCandidateId?: string;
  sharedEventPrivateEventId?: string;
  sharedEventIngestId?: string;
  sharedEventOwnerUid?: string;
  sharedEventSource?: string;
  sharedEventSourcePlatform?: string;
  sharedEventSourceVisibility?: string;
  sharedEventRouting?: string;
  locationScope?: 'venue' | 'city' | 'area' | 'province' | 'route' | 'unknown' | null;
  locationLabel?: string | null;
  locationCity?: string | null;
  locationProvince?: string | null;
  locationPrecision?: 'exact' | 'approximate' | 'city_centroid' | 'none' | null;
  locationReviewStatus?: 'not_needed' | 'needs_review' | 'approved' | 'rejected' | null;
  mapMode?: 'venue' | 'area' | 'route' | 'none' | null;
  routeData?: import('./events').EventRouteData | null;
  areaData?: import('./events').EventAreaData | null;
  timing?: import('./events').EventTiming | null;
  timingContractVersion?: number;
  timeFlags?: unknown;
  timeResolution?: unknown;
}

/**
 * Full venue details (from single-event endpoint /api/v2/firestore/events/{id})
 */
export interface FirestoreVenue {
  id: string;
  pagename?: string;
  pagenameSlug?: string;
  address: string;
  latitude: number;
  longitude: number;
  profileImage?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  phone?: string;
  website?: string;
  categories?: string[];
  category1?: string;
  rating?: number;
  placeId?: string;
  operatingHoursJson?: string;
  operatingHoursParsed?: object;
  placeDetailsParsed?: {
    rating?: number;
    user_ratings_total?: number;
    formatted_address?: string;
    international_phone_number?: string;
    website?: string;
  };
  createdAt?: FirestoreTimestamp;
  updatedAt?: FirestoreTimestamp;
}

/**
 * Single event from Firestore API
 */
export interface FirestoreEvent {
  id: string;
  title: string;
  description: string;
  startDate: string;        // YYYY-MM-DD format
  startTime: string;        // 24-hour format "HH:MM"
  endDate?: string;
  endTime?: string;
  venueId: string | null;
  venue?: string | FirestoreVenue | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  locationScope?: 'venue' | 'city' | 'area' | 'province' | 'route' | 'unknown' | null;
  locationLabel?: string | null;
  locationCity?: string | null;
  locationProvince?: string | null;
  locationPrecision?: 'exact' | 'approximate' | 'city_centroid' | 'none' | null;
  locationReviewStatus?: 'not_needed' | 'needs_review' | 'approved' | 'rejected' | null;
  mapMode?: 'venue' | 'area' | 'route' | 'none' | null;
  routeData?: import('./events').EventRouteData | null;
  areaData?: import('./events').EventAreaData | null;
  timing?: import('./events').EventTiming | null;
  timingContractVersion?: number;
  timeFlags?: unknown;
  timeResolution?: unknown;
  category: string | null;  // Can be null
  familyFriendlyScore?: number | null;
  familyFriendlyLevel?: 'unlikely' | 'possible' | 'likely' | 'high' | null;
  familyFriendlyReasons?: string[];
  familyFriendlyScoringVersion?: string | null;
  isEvent: boolean | null;  // Can be null - default to true
  // Top-level recurrence fields (materialized recurring instances)
  isRecurring?: boolean;
  recurringPattern?: string;
  recurrenceUntilDate?: string;
  isRecurringInstance?: boolean;
  originalEventId?: string | null;
  price?: string | null;
  ticketLinkPosts?: string;
  ticketLinkEvents?: string;
  ticketsBuyUrl?: string;
  ticketLink?: string;
  actionLinks?: import('./events').EventActionLink[];
  fullDescription?: string;
  profileUrl?: string;
  imageUrl?: string;
  relevantImageUrl?: string;
  SharedPostThumbnail?: string | null;
  sourceUrl?: string;
  sharedEventCandidateId?: string;
  sharedEventPrivateEventId?: string;
  sharedEventIngestId?: string;
  sharedEventOwnerUid?: string;
  sharedEventSource?: string;
  sharedEventSourcePlatform?: string;
  sharedEventSourceVisibility?: string;
  sharedEventRouting?: string;
  metadata: FirestoreEventMetadata;
  venueInfo?: FirestoreVenueInfo | null;
}

/**
 * Response from Firestore events endpoint
 */
export interface FirestoreEventsResponse {
  events: FirestoreEvent[];
  nextPageToken?: string;
  pageLimit?: number;
}
