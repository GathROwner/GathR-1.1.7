export type SharedEventFeedbackTone = 'success' | 'warning' | 'error';

export type SharedEventFeedbackKind =
  | 'shared_event_complete'
  | 'shared_event_venue_needed'
  | 'shared_event_failed';

export function sharedEventFeedbackKind(params: {
  tone: SharedEventFeedbackTone;
  persistent?: boolean;
}): SharedEventFeedbackKind {
  if (params.persistent) return 'shared_event_venue_needed';
  if (params.tone === 'error') return 'shared_event_failed';
  return 'shared_event_complete';
}

export function shouldSendSharedEventSystemNotification(appState: string | null): boolean {
  return appState !== 'active';
}

export function shouldShowSharedEventInAppBanner(pathname: string): boolean {
  return pathname !== '/shared-event';
}
