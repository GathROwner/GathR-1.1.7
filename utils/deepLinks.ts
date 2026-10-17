import * as Linking from 'expo-linking';

export interface DeepLinkParams {
  eventId: string | null;
  type: 'event' | 'special' | null;
}

export function isGenericAppLink(url: string): boolean {
  try {
    const parsed = Linking.parse(url);
    const hostname = String(parsed.hostname ?? '').toLowerCase();
    const pathParts = String(parsed.path ?? '').split('/').filter(Boolean);
    return hostname === 'www.gathrapp.ca' && pathParts[0] === 'app';
  } catch {
    return false;
  }
}

export function linkedFriendHandle(url: string): string | null {
  try {
    const parsed = Linking.parse(url);
    const handle = String(parsed.queryParams?.friend || '').trim().replace(/^@+/, '').toLowerCase();
    return /^[a-z0-9_]{3,24}$/.test(handle) ? handle : null;
  } catch {
    return null;
  }
}

export function parseDeepLink(url: string): DeepLinkParams {
  try {
    const parsed = Linking.parse(url);
    const hostnameType = String(parsed.hostname || '').toLowerCase();
    if (hostnameType === 'event' || hostnameType === 'special') {
      const eventId = String(parsed.path || '').split('/').filter(Boolean)[0]
        || String(parsed.queryParams?.id || '');
      if (eventId) return { eventId, type: hostnameType };
    }
    if (parsed.path) {
      const pathParts = parsed.path.split('/').filter(Boolean);
      if (pathParts.length >= 2) {
        const [type, eventId] = pathParts;
        if ((type === 'event' || type === 'special') && eventId) return { eventId, type };
      }
      if (pathParts.length >= 1) {
        const type = pathParts[0];
        if (type === 'event' || type === 'special') {
          const eventId = pathParts[1] || parsed.queryParams?.id as string;
          if (eventId) return { eventId, type };
        }
      }
    }
    if (parsed.queryParams?.eventId) {
      return {
        eventId: String(parsed.queryParams.eventId),
        type: (parsed.queryParams.type as 'event' | 'special') || 'event',
      };
    }
    return { eventId: null, type: null };
  } catch {
    return { eventId: null, type: null };
  }
}
