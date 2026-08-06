import { Event, EventActionLink, EventActionLinkRole } from '../types/events';
import { normalizeTicketUrl } from './ticketUrls';

const NON_TICKET_ROLES: EventActionLinkRole[] = [
  'schedule',
  'event_info',
  'livestream',
  'wagering',
];

const DEFAULT_LABELS: Partial<Record<EventActionLinkRole, string>> = {
  schedule: 'View Schedule',
  event_info: 'Event Info',
  livestream: 'Watch Online',
  wagering: 'Wager Online',
};

export const getPrimaryNonTicketAction = (
  event: Pick<Event, 'actionLinks'>
): EventActionLink | null => {
  const links = Array.isArray(event.actionLinks) ? event.actionLinks : [];

  for (const role of NON_TICKET_ROLES) {
    const match = links.find((entry) => entry?.role === role);
    const url = normalizeTicketUrl(match?.url);
    if (!match || !url) continue;

    return {
      ...match,
      url,
      label: match.label?.trim() || DEFAULT_LABELS[role] || 'Learn More',
    };
  }

  return null;
};

