export type OfferService = 'food' | 'bar';
export interface AvailabilitySegment {open: string; close: string; endDayOffset: 0 | 1}
export interface AvailabilityRule {
  state: 'open' | 'closed' | 'unknown';
  segments: AvailabilitySegment[];
  sourceId: string;
  reason?: string;
}
export interface OfferHoursSource {
  id: string;
  provider: 'google_places' | 'official';
  kind: 'current_dated' | 'regular_weekly';
  url: string;
  capturedAt: string;
  expiresAt: string;
  validFrom: string;
  validThrough: string;
  venueId: string;
  placeId: string;
  returnedPlaceId: string;
  canonicalAddress: string;
  returnedAddress: string;
  businessStatus: 'OPERATIONAL';
  service: OfferService;
  types: string[];
}
export interface MultiDayOfferAvailability {
  version: 1;
  kind: 'offer_availability';
  venueId: string;
  placeId: string;
  service: OfferService;
  startDate: string;
  endDate: string;
  timeZone: string;
  generatedAt: string;
  expiresAt: string;
  revision: string;
  sourceOffer: {id: string; url: string; evidence: string; generationId: string};
  hoursSources: OfferHoursSource[];
  dateRules: Record<string, AvailabilityRule>;
  /** Typical service hours only: never proof of a specific future/holiday day. */
  usualWeek: Partial<Record<string, AvailabilityRule>>;
}
export interface AvailabilityBinding {
  venueId: string;
  placeId: string;
  startDate: string;
  endDate: string;
  sourceOfferId: string;
  generationId: string;
}
export interface AvailabilityView {
  state: 'scheduled' | 'closed' | 'unknown' | 'outside';
  intervals: {open: number; close: number; serviceDate: string; sourceId: string}[];
  usualIntervals: AvailabilitySegment[];
  certainty: 'estimated' | 'unknown';
  nowEligibility: 'none';
  withinEstimatedWindow: boolean;
  reason: string;
}

