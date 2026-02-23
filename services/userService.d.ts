export interface SchedulableEvent {
  id: string | number;
  title: string;
  venue: string;
  address: string;
  startDate: string;
  startTime: string;
  endDate?: string;
  endTime?: string;
}

export type ServiceResultBase = {
  success: boolean;
  message?: string;
};

export declare function getUserInterests(): Promise<string[]>;
export declare function getUserFavorites(): Promise<string[]>;
export declare function getSavedEvents(): Promise<string[]>;
export declare function getLikedEvents(): Promise<string[]>;
export declare function getInterestedEvents(): Promise<string[]>;
export declare function getFavoriteVenues(): Promise<string[]>;

export declare function toggleSavedEvent(
  eventId: string | number,
  meta?: Record<string, any>,
  eventForScheduling?: SchedulableEvent | null
): Promise<ServiceResultBase & { saved?: boolean }>;

export declare function isEventSaved(eventId: string | number): Promise<boolean>;

export declare function toggleEventLike(
  eventId: string | number,
  meta?: Record<string, any>
): Promise<ServiceResultBase & { liked?: boolean; count?: number }>;

export declare function incrementEventShare(
  eventId: string | number,
  meta?: Record<string, any>
): Promise<ServiceResultBase & { count: number }>;

export declare function isEventLiked(eventId: string | number): Promise<boolean>;

export declare function toggleEventInterested(
  eventId: string | number,
  meta?: Record<string, any>
): Promise<ServiceResultBase & { interested?: boolean; count?: number }>;

export declare function isEventInterested(eventId: string | number): Promise<boolean>;

export declare function toggleFavoriteVenue(
  locationKey: string,
  meta?: Record<string, any>
): Promise<ServiceResultBase & { favorited?: boolean }>;

export declare function isVenueFavorite(locationKey: string): Promise<boolean>;

export declare function clearUserDataCache(): void;
