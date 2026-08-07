import type { Event } from '../types/events';
import { isValidImageUrl } from './imageUtils';

type LightboxImageEvent = Pick<Event, 'imageUrl' | 'SharedPostThumbnail'>;

export const getLightboxImageUrl = (event: LightboxImageEvent): string =>
  [event.imageUrl, event.SharedPostThumbnail].find(isValidImageUrl) || '';
