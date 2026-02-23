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
  coordinates: FirestoreCoordinates;
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
  eventType?: string;
  ageRestriction?: string;
  fullDescription?: string;
  ticketLinkPosts?: string;
  ticketLinkEvents?: string;
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
  venueId: string;
  category: string | null;  // Can be null
  isEvent: boolean | null;  // Can be null - default to true
  // Top-level recurrence fields (materialized recurring instances)
  isRecurring?: boolean;
  recurringPattern?: string;
  isRecurringInstance?: boolean;
  originalEventId?: string | null;
  price?: string | null;
  ticketLinkPosts?: string;
  ticketLinkEvents?: string;
  fullDescription?: string;
  metadata: FirestoreEventMetadata;
  venueInfo: FirestoreVenueInfo;
  // Full venue object (only present in single-event endpoint response)
  venue?: FirestoreVenue;
}

/**
 * Response from Firestore events endpoint
 */
export interface FirestoreEventsResponse {
  events: FirestoreEvent[];
  nextPageToken?: string;
  pageLimit?: number;
}
