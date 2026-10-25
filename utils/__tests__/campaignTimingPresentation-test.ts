import { getContinuousCampaignRange, getRemainingCampaignDateText } from '../campaignTimingPresentation';
import { getEventScheduleState, createLegacyTimingContract } from '../eventTiming';
import { TimeFilterType } from '../../types/filter';
import { continuousDonationCampaign } from './fixtures/continuousDonationCampaign';
import { softInternet } from './fixtures/softInternet';
import { continuousCocktailPromotion } from './fixtures/continuousCocktailPromotion';

const now = new Date('2026-10-25T01:00:00Z'); // Oct24 in campaign timezone
it.each([false, true])('shows only source-bounded remaining dates for cocktail promotion %s, preserving schedule and eligibility', slaymaker => {
  const event = continuousCocktailPromotion(slaymaker), before = JSON.stringify(event);
  const today = new Date('2026-10-25T11:41:00Z'), state = getEventScheduleState(event, today);
  expect(getRemainingCampaignDateText(event, undefined, today)).toBe('Oct 25–Oct 31');
  expect(getRemainingCampaignDateText(event, { timeFilter: TimeFilterType.TOMORROW }, today)).toBe('Oct 26–Oct 31');
  expect(getRemainingCampaignDateText(event, { timeFilter: TimeFilterType.UPCOMING,
    upcomingDate: { kind: 'next7' } }, today)).toBe('Oct 26–Oct 31');
  expect(getRemainingCampaignDateText(event, { timeFilter: TimeFilterType.UPCOMING,
    upcomingDate: { kind: 'weekend' } }, today)).toBe('Oct 31');
  expect(getRemainingCampaignDateText(event, { timeFilter: TimeFilterType.UPCOMING,
    upcomingDate: { kind: 'custom', startDate: '2026-10-29', endDate: '2026-10-29' } }, today)).toBe('Oct 29–Oct 31');
  expect(getRemainingCampaignDateText(event, undefined, new Date('2026-10-25T02:59:00Z'))).toBe('Oct 24–Oct 31');
  expect(getRemainingCampaignDateText(event, undefined, new Date('2026-10-25T03:00:00Z'))).toBe('Oct 25–Oct 31');
  expect(getRemainingCampaignDateText(event, undefined, new Date('2026-10-31T20:00:00Z'))).toBe('Oct 31');
  expect(getRemainingCampaignDateText(event, undefined, new Date('2026-11-01T04:00:00Z'))).toBe('Oct 1–Oct 31');
  expect(JSON.stringify(event)).toBe(before);
  expect(getEventScheduleState(event, today)).toEqual(state);
});
it('keeps cocktail sessions, unsupported dates, recurrence and known finishes on their ordinary timing path', () => {
  const base = continuousCocktailPromotion(true);
  for (const event of [
    continuousCocktailPromotion(true, { description: base.description + ' Daily from 11:30AM to 9PM.' }),
    continuousCocktailPromotion(true, { description: base.description + ' 17:00–23:00.' }),
    continuousCocktailPromotion(true, { description: base.description + ' 22:00–02:00.' }),
    continuousCocktailPromotion(true, { title: 'Cocktail competition launch party' }),
    continuousCocktailPromotion(true, { description: 'Cocktail competition entry. October 2-30.' }),
    continuousCocktailPromotion(true, { description: 'Cocktail competition entry.' }),
    continuousCocktailPromotion(true, { isRecurring: true }),
    continuousCocktailPromotion(true, { isRecurringInstance: true }),
    continuousCocktailPromotion(true, { recurringPattern: 'weekly_saturday' }),
    continuousCocktailPromotion(true, { type: 'event' }),
    continuousCocktailPromotion(true, { startDate: '2026-10-24', endDate: '2026-10-25', startTime: '22:00', endTime: '02:00' }),
    continuousCocktailPromotion(true, { timing: createLegacyTimingContract(base, { endStatus: 'observed' }) }),
  ]) expect(getRemainingCampaignDateText(event, undefined, now)).toBeNull();
});
it('shows the selected-day remaining campaign window without inventing a daily clock or changing the source/eligibility', () => {
  const event = continuousDonationCampaign(), before = JSON.stringify(event), state = getEventScheduleState(event, now);
  expect(getContinuousCampaignRange(event)).toEqual({ startDate: '2026-10-13', endDate: '2026-10-31' });
  expect(getRemainingCampaignDateText(event, { timeFilter: TimeFilterType.TODAY }, now)).toBe('Oct 24–Oct 31');
  expect(getRemainingCampaignDateText(event, { timeFilter: TimeFilterType.TOMORROW }, now)).toBe('Oct 25–Oct 31');
  expect(getRemainingCampaignDateText(event, { timeFilter: TimeFilterType.UPCOMING,
    upcomingDate: { kind: 'custom', startDate: '2026-10-28', endDate: '2026-10-28' } }, now)).toBe('Oct 28–Oct 31');
  expect(getRemainingCampaignDateText(event, { timeFilter: TimeFilterType.UPCOMING,
    upcomingDate: { kind: 'custom', startDate: '2026-10-26', endDate: '2026-10-29' } }, now)).toBe('Oct 26–Oct 31');
  expect(JSON.stringify(event)).toBe(before);
  expect(getEventScheduleState(event, now)).toEqual(state);
  expect(state.nowEligibility).toBe('none');
  expect(event.startTime).toBe('08:00'); expect(event.description).toContain('October 13-31');
});
it.each([
  ['2026-10-10', 'Oct 13–Oct 31'], ['2026-11-01', 'Oct 13–Oct 31'], ['2026-10-31', 'Oct 31'],
])('keeps campaign bounds for a selected %s', (date, text) => {
  expect(getRemainingCampaignDateText(continuousDonationCampaign(), { timeFilter: TimeFilterType.UPCOMING,
    upcomingDate: { kind: 'custom', startDate: date, endDate: date } }, now)).toBe(text);
});
it('retains ordinary timing for explicit daily collection sessions despite campaign and drop-off wording', () => {
  const event = continuousDonationCampaign();
  event.description += ' Daily collection sessions run from 8AM to noon.';
  expect(getContinuousCampaignRange(event)).toBeNull();
  expect(getRemainingCampaignDateText(event, { timeFilter: TimeFilterType.TODAY }, now)).toBeNull();
  expect(event.startTime).toBe('08:00');
});
it('does not reinterpret ordinary overnight events, recurring sessions, unsupported campaigns or advertised visiting hours', () => {
  const base = continuousDonationCampaign();
  for (const event of [
    continuousDonationCampaign({ title: 'Concert', description: 'An overnight show.' }),
    continuousDonationCampaign({ title: 'Campaign launch party', description: 'Join our launch party at 8PM.' }),
    continuousDonationCampaign({ description: 'No donations are accepted at this location.' }),
    continuousDonationCampaign({ description: base.description + ' Daily collection sessions run from 8AM to noon.' }),
    continuousDonationCampaign({ description: base.description + ' Collection sessions are available by appointment.' }),
    continuousDonationCampaign({ description: base.description + ' The drop-off depot opens at 8AM.' }),
    continuousDonationCampaign({ isRecurring: true }), continuousDonationCampaign({ isRecurringInstance: true }),
    continuousDonationCampaign({ recurringPattern: 'weekly_sunday' }),
    continuousDonationCampaign({ startDate: '2026-10-24', endDate: '2026-10-25', startTime: '22:00', endTime: '02:00' }),
    continuousDonationCampaign({ timing: createLegacyTimingContract(base, { endStatus: 'observed' }) }),
    { ...softInternet(), title: 'Gallery donation campaign', description: 'Donations are accepted at the gallery.' },
  ]) expect(getRemainingCampaignDateText(event, undefined, now)).toBeNull();
});
