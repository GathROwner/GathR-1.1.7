type CalloutVenueCandidate = {
  locationKey: string;
};

/**
 * Places an explicitly requested venue first. When there is no valid explicit
 * request, the callout's existing relevance result remains authoritative.
 */
export const prioritizeCalloutVenues = <T extends CalloutVenueCandidate>(
  venues: T[],
  fallbackVenueIndex: number,
  preferredVenueLocationKey?: string | null,
): T[] => {
  if (venues.length <= 1) return venues;

  const preferredVenueIndex = preferredVenueLocationKey
    ? venues.findIndex((venue) => venue.locationKey === preferredVenueLocationKey)
    : -1;
  const venueIndex = preferredVenueIndex >= 0
    ? preferredVenueIndex
    : fallbackVenueIndex;

  if (venueIndex <= 0 || venueIndex >= venues.length) return venues;

  const reordered = [...venues];
  const [venue] = reordered.splice(venueIndex, 1);
  reordered.unshift(venue);
  return reordered;
};
