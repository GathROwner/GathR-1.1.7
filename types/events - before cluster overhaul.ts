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
}

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
}

/**
 * Cluster interface representing grouped venues for map display
 * Enhanced with a stable identifier for better tracking across zoom levels
 */
export interface Cluster {
  id: string;           // Stable identifier for cluster tracking
  clusterType: 'single' | 'multi';
  venues: Venue[];
}