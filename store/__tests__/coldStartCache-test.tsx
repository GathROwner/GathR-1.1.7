/** Actual store and persisted-query provider; controlled I/O, no network or native map. */
jest.mock('../../config/firebaseConfig', () => ({ auth: {}, firestore: {}, app: {} }));
jest.mock('firebase/firestore', () => ({ collection: jest.fn(), getDocs: jest.fn(), query: jest.fn(), where: jest.fn() }));
jest.mock('expo-location', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('supercluster', () => ({ __esModule: true, default: class {
  points: unknown[] = []; load(points: unknown[]) { this.points = points; return this; }
  getClusters() { return this.points; } getLeaves() { return this.points; }
} }));
jest.mock('../../lib/api/events', () => ({ ...jest.requireActual('../../lib/api/events'), fetchMinimalEvents: jest.fn() }));
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { QueryClient, dehydrate } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useMapStore } from '../mapStore';
import { useStartupEventCache } from '../../hooks/useStartupEventCache';
import { fetchMinimalEvents } from '../../lib/api/events';
import { EVENTS_MINIMAL } from '../../lib/queryKeys';
import { DEFAULT_FILTER_CRITERIA, TimeFilterType } from '../../types/filter';
import { resetViewportRequestCoordinator, reserveViewportRequestId } from '../../utils/viewportRequestCoordinator';
import { createLegacyTimingContract } from '../../utils/eventTiming';
import type { Event } from '../../types/events';

const initial = useMapStore.getState();
const globals = global as typeof global & { __RQ_CLIENT?: QueryClient };
const oldClient = globals.__RQ_CLIENT;
const firstBox = {west:-64,south:46,east:-63,north:47};
const secondBox = {west:-80,south:43,east:-79,north:45};
const fixture = (id='saved', extra: Partial<Event> = {}): Event => {
 const event = {id,type:'event',title:id,description:'',category:'Live Music',venue:id,address:'Fixture',latitude:46.23,longitude:-63.12,startDate:'2026-11-15',endDate:'2026-11-15',startTime:'19:00',endTime:'23:00',...extra} as Event;
 return {...event,timing:createLegacyTimingContract(event)};
};
const result = (events: Event[]) => ({combinedData:events,fetchedAt:Date.now(),sources:{}});
const deferred = <T,>() => {
 let resolve!: (v:T)=>void, reject!: (e:Error)=>void;
 const promise = new Promise<T>((yes,no)=>{resolve=yes;reject=no;});
 return {promise,resolve,reject};
};
const tick = async () => {for(let i=0;i<8;i++) await Promise.resolve();};
let client: QueryClient | undefined;
let tree: renderer.ReactTestRenderer | undefined;
beforeEach(()=>{
 jest.useFakeTimers();jest.setSystemTime(new Date(2026,10,15,12));jest.clearAllMocks();
 resetViewportRequestCoordinator();delete globals.__RQ_CLIENT;
 useMapStore.setState({...initial,allEvents:[],events:[],viewportEvents:[],outsideViewportEvents:[],onScreenEvents:[],filteredEvents:[],clusters:[],friendEvents:[],isLoading:false,lastFetchedAt:null,viewportBbox:null,hasInitialViewportSettled:false,
 filterCriteria:{...DEFAULT_FILTER_CRITERIA,eventFilters:{timeFilter:TimeFilterType.TODAY},specialFilters:{timeFilter:TimeFilterType.TODAY}}});
});
afterEach(async()=>{
 if(tree){await act(async()=>{tree?.unmount();});tree=undefined;}
 client?.clear();client=undefined;globals.__RQ_CLIENT=oldClient;resetViewportRequestCoordinator();useMapStore.setState(initial);jest.useRealTimers();
});
const pendingRequest = (bbox=firstBox) => {
 const network=deferred<ReturnType<typeof result>>();
 (fetchMinimalEvents as jest.Mock).mockReturnValueOnce(network.promise);
 const pending=useMapStore.getState().fetchViewportEvents(bbox,{source:'startup_test'});
 return {network,pending};
};
it('projects restored saved events before the initial network request completes, without a recovery timer',async()=>{
 const {network,pending}=pendingRequest();let finished=false;void pending.then(()=>{finished=true;});
 useMapStore.getState().setAllEvents([fixture()],{projectViewport:'cache'});
 expect(useMapStore.getState().viewportEvents.map(e=>e.id)).toEqual(['saved']);
 expect(useMapStore.getState().clusters).toHaveLength(1);expect(finished).toBe(false);
 expect(useMapStore.getState().lastFetchedAt).toBeNull();
 network.resolve(result([fixture('fresh')]));await pending;
 expect(useMapStore.getState().viewportEvents.map(e=>e.id)).toEqual(['fresh']);
});
it('uses an already populated cache synchronously without a viewport network fetch',async()=>{
 useMapStore.getState().setAllEvents([fixture()]);
 const pending=useMapStore.getState().fetchViewportEvents(firstBox);
 expect(useMapStore.getState().clusters).toHaveLength(1);await pending;
 expect(fetchMinimalEvents).not.toHaveBeenCalled();
});
it('loads the first viewport normally when there is no saved cache',async()=>{
 const {network,pending}=pendingRequest();expect(useMapStore.getState().clusters).toHaveLength(0);
 network.resolve(result([fixture('fresh')]));await pending;
 expect(useMapStore.getState().clusters).toHaveLength(1);expect(useMapStore.getState().hasInitialViewportSettled).toBe(true);
});
it('does not treat expired saved items as a completed empty startup response',async()=>{
 const {network,pending}=pendingRequest();
 useMapStore.getState().setAllEvents([fixture('expired',{startDate:'2026-11-14',endDate:'2026-11-14'})],{projectViewport:'cache'});
 expect(useMapStore.getState().allEvents).toHaveLength(0);expect(useMapStore.getState().hasInitialViewportSettled).toBe(false);
 network.resolve(result([fixture()]));await pending;expect(useMapStore.getState().clusters).toHaveLength(1);
});
it('clears saved markers when the authoritative refresh is empty, without another fetch',async()=>{
 const {network,pending}=pendingRequest();
 useMapStore.getState().setAllEvents([fixture()],{projectViewport:'cache'});
 useMapStore.getState().setAllEvents([],{projectViewport:'refresh'});
 expect(useMapStore.getState().clusters).toHaveLength(0);
 network.resolve(result([]));await pending;
 expect(useMapStore.getState().viewportEvents).toHaveLength(0);expect(fetchMinimalEvents).toHaveBeenCalledTimes(1);
});
it('projects restoration into the latest requested camera view and rejects an older network response',async()=>{
 const {network,pending}=pendingRequest();
 const saved=[fixture(),fixture('second',{latitude:44,longitude:-79.5})];
 useMapStore.getState().setAllEvents(saved,{projectViewport:'cache'});
 await useMapStore.getState().fetchViewportEvents(secondBox);
 network.resolve(result([fixture('old-response')]));await pending;
 expect(useMapStore.getState().viewportBbox).toEqual(secondBox);
 expect(useMapStore.getState().viewportEvents.map(e=>e.id)).toEqual(['second']);
 expect(useMapStore.getState().allEvents.map(e=>e.id)).toEqual(['saved','second']);
 useMapStore.getState().setAllEvents(saved,{projectViewport:'refresh'});
 expect(useMapStore.getState().viewportBbox).toEqual(secondBox);
});
it('keeps the current request valid when a replacement is only reserved, not started',async()=>{
 const {network,pending}=pendingRequest();reserveViewportRequestId();
 useMapStore.getState().setAllEvents([fixture()],{projectViewport:'cache'});
 network.resolve(result([fixture('fresh')]));await pending;
 expect(useMapStore.getState().viewportEvents[0].id).toBe('fresh');
});
it('uses the current filters and current private friend projection for the handoff',async()=>{
 const {network,pending}=pendingRequest();
 const special=fixture('special',{type:'special'}),friend=fixture('friend',{source:'friend_event' as Event['source']});
 useMapStore.setState({friendEvents:[friend],showFriendEvents:false,filterCriteria:{...useMapStore.getState().filterCriteria,showEvents:false,showSpecials:true}});
 useMapStore.getState().setAllEvents([fixture(),special],{projectViewport:'cache'});
 expect(useMapStore.getState().filteredEvents.map(e=>e.id)).toEqual(['special']);
 expect(useMapStore.getState().allEvents.map(e=>e.id)).not.toContain('friend');
 network.resolve(result([fixture(),special]));await pending;
});
it('keeps restored markers visible if the background network refresh fails',async()=>{
 const {network,pending}=pendingRequest();
 useMapStore.getState().setAllEvents([fixture()],{projectViewport:'cache'});
 network.reject(new Error('controlled offline response'));await pending;
 expect(useMapStore.getState().clusters).toHaveLength(1);expect(useMapStore.getState().isLoading).toBe(false);
});
it('keeps usable store markers visible during a refresh even when the query entry is missing',async()=>{
 const saved=fixture();useMapStore.getState().setAllEvents([saved]);await useMapStore.getState().fetchViewportEvents(firstBox);
 useMapStore.setState({lastFetchedAt:Date.now()-4*60*1000});
 const network=deferred<ReturnType<typeof result>>();(fetchMinimalEvents as jest.Mock).mockReturnValueOnce(network.promise);
 await useMapStore.getState().prefetchIfStale(180000);
 expect(useMapStore.getState().isLoading).toBe(false);expect(useMapStore.getState().clusters).toHaveLength(1);
 network.resolve(result([fixture('fresh')]));await tick();
 expect(useMapStore.getState().viewportEvents[0].id).toBe('fresh');
});

const makeClient=()=>new QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity}}});
it.each([true,false])('actual provider exposes restored cache before a pending boot refresh (saved cache fresh=%s)',async fresh=>{
 client=makeClient();globals.__RQ_CLIENT=client;
 const savedClient=makeClient();savedClient.setQueryData(EVENTS_MINIMAL,result([fixture()]),{updatedAt:Date.now()-(fresh?1000:4*60*1000)});
 const restore=deferred<any>();const network=deferred<ReturnType<typeof result>>();
 (fetchMinimalEvents as jest.Mock).mockReturnValue(network.promise);
 const pending=useMapStore.getState().fetchViewportEvents(firstBox);
 const fetcher=()=>fetchMinimalEvents();
 function Probe(){useStartupEventCache(fetcher,useMapStore.getState().setAllEvents);return null;}
 await act(async()=>{tree=renderer.create(<PersistQueryClientProvider client={client!} persistOptions={{persister:{restoreClient:()=>restore.promise,persistClient:async()=>{},removeClient:async()=>{}},maxAge:12*60*60*1000}}><Probe/></PersistQueryClientProvider>);await tick();});
 expect(useMapStore.getState().clusters).toHaveLength(0);
 await act(async()=>{restore.resolve({timestamp:Date.now(),buster:'',clientState:dehydrate(savedClient)});await tick();});
 expect(useMapStore.getState().viewportEvents.map(e=>e.id)).toEqual(['saved']);
 // Change views while the original boot refresh is still running. Its later
 // QueryClient success must update this view, even after the old request loses ownership.
 await useMapStore.getState().fetchViewportEvents(secondBox);
 await act(async()=>{network.resolve(result([fixture('fresh-second',{latitude:44,longitude:-79.5})]));await pending;await tick();});
 expect(fetchMinimalEvents).toHaveBeenCalledTimes(1);
 expect(useMapStore.getState().viewportBbox).toEqual(secondBox);
 expect(useMapStore.getState().viewportEvents.map(e=>e.id)).toEqual(['fresh-second']);savedClient.clear();
});
it('actual provider with no persisted data fetches once after restoration completes',async()=>{
 client=makeClient();globals.__RQ_CLIENT=client;
 const restore=deferred<any>(),network=deferred<ReturnType<typeof result>>();const fetcher=jest.fn(()=>network.promise);
 function Probe(){useStartupEventCache(fetcher,useMapStore.getState().setAllEvents);return null;}
 await act(async()=>{tree=renderer.create(<PersistQueryClientProvider client={client!} persistOptions={{persister:{restoreClient:()=>restore.promise,persistClient:async()=>{},removeClient:async()=>{}}}}><Probe/></PersistQueryClientProvider>);await tick();});
 expect(fetcher).not.toHaveBeenCalled();
 await act(async()=>{restore.resolve(undefined);await tick();});expect(fetcher).toHaveBeenCalledTimes(1);
 await act(async()=>{network.resolve(result([fixture()]));await tick();});expect(useMapStore.getState().allEvents).toHaveLength(1);
});
it('publishes an actual query refresh with zero results and ignores unrelated queries',async()=>{
 client=makeClient();globals.__RQ_CLIENT=client;
 client.setQueryData(EVENTS_MINIMAL,result([fixture()]),{updatedAt:Date.now()-4*60*1000});
 useMapStore.getState().setAllEvents([fixture()]);await useMapStore.getState().fetchViewportEvents(firstBox);
 const network=deferred<ReturnType<typeof result>>(),restore=deferred<any>();const fetcher=()=>network.promise;
 function Probe(){useStartupEventCache(fetcher,useMapStore.getState().setAllEvents);return null;}
 await act(async()=>{tree=renderer.create(<PersistQueryClientProvider client={client!} persistOptions={{persister:{restoreClient:()=>restore.promise,persistClient:async()=>{},removeClient:async()=>{}}}}><Probe/></PersistQueryClientProvider>);restore.resolve(undefined);await tick();});
 expect(client.getQueryCache().find({queryKey:EVENTS_MINIMAL})!.getObserversCount()).toBe(0);
 await act(async()=>{client!.setQueryData(['unrelated-feed'],result([fixture('other')]));await tick();});
 expect(useMapStore.getState().viewportEvents[0].id).toBe('saved');
 await act(async()=>{network.resolve(result([]));await tick();});
 expect(useMapStore.getState().viewportEvents).toHaveLength(0);expect(useMapStore.getState().clusters).toHaveLength(0);
});
it('stops publishing boot refresh results after its host unmounts',async()=>{
 client=makeClient();globals.__RQ_CLIENT=client;
 client.setQueryData(EVENTS_MINIMAL,result([fixture()]),{updatedAt:Date.now()-4*60*1000});
 const network=deferred<ReturnType<typeof result>>(),restore=deferred<any>();const fetcher=()=>network.promise;
 function Probe(){useStartupEventCache(fetcher,useMapStore.getState().setAllEvents);return null;}
 await act(async()=>{tree=renderer.create(<PersistQueryClientProvider client={client!} persistOptions={{persister:{restoreClient:()=>restore.promise,persistClient:async()=>{},removeClient:async()=>{}}}}><Probe/></PersistQueryClientProvider>);restore.resolve(undefined);await tick();});
 expect(useMapStore.getState().allEvents[0].id).toBe('saved');
 await act(async()=>{tree!.unmount();tree=undefined;});
 await act(async()=>{network.resolve(result([fixture('late')]));await tick();});
 expect(useMapStore.getState().allEvents[0].id).toBe('saved');
});
