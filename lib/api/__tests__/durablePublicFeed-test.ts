jest.mock('../../../config/firebaseConfig', () => ({ auth: { currentUser: { uid: 'account-a' } }, firestore: {} }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../privateSharedEvents', () => ({ fetchPrivateSharedEventsForCurrentUser: jest.fn() }));
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from '../../../config/firebaseConfig';
import { fetchMinimalEvents } from '../events';
import { normalizeFirestoreEvent } from '../firestoreEvents';
import { fetchPrivateSharedEventsForCurrentUser } from '../privateSharedEvents';
import { beginPublicSnapshotRefresh, readPublicEventSnapshot, savePublicEventSnapshot } from '../../publicEventSnapshot';
import type { FirestoreEvent } from '../../../types/firestore';
const originalFetch=global.fetch;
const raw = (id='public') => ({id,title:id,description:'public description',startDate:'2026-11-16',endDate:'2026-11-16',startTime:'19:00',endTime:'23:00',venue:'Venue',address:'Fixture',latitude:46.2,longitude:-63.1,category:'Other',isEvent:true,metadata:{}} as FirestoreEvent);
const response=(events: FirestoreEvent[],nextPageToken?:string)=>({ok:true,json:async()=>({events,nextPageToken})});
const flush=async()=>{for(let i=0;i<60;i++)await Promise.resolve();};
beforeEach(async()=>{jest.useFakeTimers();jest.setSystemTime(new Date(2026,10,16,12));jest.clearAllMocks();(auth as any).currentUser={uid:'account-a'};await AsyncStorage.clear();(fetchPrivateSharedEventsForCurrentUser as jest.Mock).mockResolvedValue([]);});
afterEach(()=>{global.fetch=originalFetch;jest.useRealTimers();});
const seed=async()=>savePublicEventSnapshot([normalizeFirestoreEvent(raw('old'))],Date.now(),beginPublicSnapshotRefresh());
it('saves the complete public source before private overlays, without account-specific contents',async()=>{
 const publicEvent=normalizeFirestoreEvent(raw());
 (fetchPrivateSharedEventsForCurrentUser as jest.Mock).mockResolvedValue([{...publicEvent,source:'private_shared',description:'private secret',imageUrl:'private-image',sharedEventProvenance:{sharedByCurrentUser:true,privateEventId:'secret-id'}}]);
 global.fetch=jest.fn().mockResolvedValue(response([raw()]));
 const result=await fetchMinimalEvents();await flush();
 expect(result.accountId).toBe('account-a');expect(result.combinedData[0].description).toBe('private secret');
 const disk=await readPublicEventSnapshot();
 expect(disk?.combinedData[0].description).toBe('public description');
 expect(JSON.stringify(disk)).not.toMatch(/private secret|private-image|secret-id|account-a/);
});
it('does not replace the saved copy with a type-filtered result',async()=>{
 await seed();global.fetch=jest.fn().mockResolvedValue(response([raw('type-scoped')]));
 await fetchMinimalEvents({isEvent:true});await flush();
 expect((await readPublicEventSnapshot())?.combinedData[0].title).toBe('old');
});
it('keeps the old snapshot until every page arrives, then replaces it with the full new feed',async()=>{
 await seed();let finish!: (value: ReturnType<typeof response>)=>void;
 global.fetch=jest.fn().mockResolvedValueOnce(response([raw('first-page')],'cursor'))
  .mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));
 const pending=fetchMinimalEvents();await flush();
 expect((await readPublicEventSnapshot())?.combinedData[0].title).toBe('old');
 finish(response([raw('last-page')]));await pending;await flush();
 expect((await readPublicEventSnapshot())?.combinedData.map(e=>e.title)).toEqual(['first-page','last-page']);
});
it.each(['network','malformed','truncated'])('keeps a good snapshot when sync fails (%s)',async mode=>{
 await seed();
 global.fetch=mode==='network'?jest.fn().mockRejectedValue(new Error('offline'))
  :mode==='malformed'?jest.fn().mockResolvedValue({ok:true,json:async()=>({})})
  :jest.fn().mockResolvedValue(response([raw('partial')],'cursor'));
 await expect(fetchMinimalEvents(mode==='truncated'?{maxPages:1}:{})).rejects.toThrow();await flush();
 expect((await readPublicEventSnapshot())?.combinedData[0].title).toBe('old');
});
it('rejects an old private-aware response after switching accounts and does not join the old account request',async()=>{
 let finish!: (items: never[])=>void;
 (fetchPrivateSharedEventsForCurrentUser as jest.Mock).mockReturnValueOnce(new Promise(resolve=>{finish=resolve;})).mockResolvedValueOnce([]);
 global.fetch=jest.fn().mockResolvedValue(response([raw()]));
 const old=fetchMinimalEvents();const rejected=expect(old).rejects.toThrow('Account changed');
 (auth as any).currentUser={uid:'account-b'};
 const current=fetchMinimalEvents();expect(current).not.toBe(old);
 expect((await current).accountId).toBe('account-b');finish([]);await rejected;await flush();
});
