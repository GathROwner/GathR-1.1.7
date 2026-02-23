await schedulePreEventNotification({
  id: eventForScheduling.id,
  title: eventForScheduling.title,
  venue: eventForScheduling.venue,
  address: eventForScheduling.address,
  startDate: eventForScheduling.startDate,
  startTime: eventForScheduling.startTime,
  // purely for better logs in the pre scheduler:
  endDate: eventForScheduling.endDate,
  endTime: eventForScheduling.endTime,
});


export declare function toggleSavedEvent(
  eventId: string | number,
  meta?: Record<string, any>,
  eventForScheduling?: SchedulableEvent | null
): Promise<{ success: boolean; saved: boolean; message: string }>;

export declare function isEventSaved(eventId: string | number): Promise<boolean>;
export declare function clearUserDataCache(): void;

export declare function toggleEventLike(
  eventId: string | number,
  meta?: Record<string, any>
): Promise<{ success: boolean; liked: boolean; count?: number; message?: string }>;

export declare function isEventLiked(eventId: string | number): Promise<boolean>;

export declare function getLikedEvents(): Promise<string[]>;

export declare function incrementEventShare(
  eventId: string | number,
  meta?: Record<string, any>
): Promise<{ success: boolean; count: number; message?: string }>;

export declare function getInterestedEvents(): Promise<string[]>;

export declare function toggleEventInterested(
  eventId: string | number,
  meta?: Record<string, any>
): Promise<{ success: boolean; interested: boolean; count?: number; message?: string }>;

export declare function isEventInterested(eventId: string | number): Promise<boolean>;
