jest.mock('../../config/firebaseConfig', () => ({ auth: { currentUser: null } }));
jest.mock('firebase/auth', () => ({ onAuthStateChanged: jest.fn() }));
jest.mock('../../store/userPrefsStore', () => ({ startUserPrefsListener: jest.fn(), stopUserPrefsListener: jest.fn() }));
jest.mock('../../store/socialStore', () => ({ startSocialListeners: jest.fn(), stopSocialListeners: jest.fn() }));
jest.mock('../../store/mapStore', () => ({ useMapStore: { getState: () => ({ setAllEvents: mockClearMap }) } }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { onAuthStateChanged } from 'firebase/auth';
import { AuthProvider } from '../AuthContext';
import { EVENTS_MINIMAL } from '../../lib/queryKeys';
import { beginPublicSnapshotRefresh, readPublicEventSnapshot, savePublicEventSnapshot } from '../../lib/publicEventSnapshot';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Event } from '../../types/events';
const mockClearMap=jest.fn();
let change: (user: any)=>void;
let client: QueryClient;
let tree: renderer.ReactTestRenderer;
beforeEach(async()=>{
 jest.clearAllMocks();await AsyncStorage.clear();
 client=new QueryClient({defaultOptions:{queries:{gcTime:Infinity}}});
 (onAuthStateChanged as jest.Mock).mockImplementation((_auth,listener)=>{change=listener;return jest.fn();});
 await act(async()=>{tree=renderer.create(<QueryClientProvider client={client}><AuthProvider><></></AuthProvider></QueryClientProvider>);});
});
afterEach(async()=>{await act(async()=>tree.unmount());client.clear();});
it('retains the matching in-memory feed but clears it and its map projection on a direct account switch',async()=>{
 client.setQueryData(EVENTS_MINIMAL,{accountId:'a',combinedData:[{id:'private-a'}]});
 await act(async()=>change({uid:'a'}));expect(client.getQueryData(EVENTS_MINIMAL)).toBeDefined();
 client.setQueryData(['account-detail'],{private:true});
 await act(async()=>change({uid:'b'}));
 expect(client.getQueryData(EVENTS_MINIMAL)).toBeUndefined();
 expect(client.getQueryData(['account-detail'])).toBeUndefined();
 expect(mockClearMap).toHaveBeenCalledWith([],{projectViewport:'refresh'});
});
it('discards a legacy mixed feed that has no account identity',async()=>{
 client.setQueryData(EVENTS_MINIMAL,{combinedData:[{id:'unknown-owner'}]});
 await act(async()=>change({uid:'a'}));
 expect(client.getQueryData(EVENTS_MINIMAL)).toBeUndefined();
});
it('clears mixed queries on sign-out without deleting the separate public snapshot',async()=>{
 const publicEvent={id:'public',source:'firestore',type:'event',startDate:'2099-11-16',endDate:'2099-11-16'} as Event;
 await savePublicEventSnapshot([publicEvent],Date.now(),beginPublicSnapshotRefresh());
 await act(async()=>change({uid:'a'}));
 client.setQueryData(EVENTS_MINIMAL,{accountId:'a',combinedData:[{id:'private-a'}]});
 await act(async()=>change(null));
 expect(client.getQueryData(EVENTS_MINIMAL)).toBeUndefined();
 expect((await readPublicEventSnapshot())?.combinedData.map(e=>e.id)).toEqual(['public']);
});
