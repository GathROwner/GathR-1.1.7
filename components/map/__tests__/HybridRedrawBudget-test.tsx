import React from 'react';
import renderer, {act} from 'react-test-renderer';
import HybridMapAnnotation from '../HybridMapAnnotation';
import {useClusterInteractionStore} from '../../../store/clusterInteractionStore';
import type {Cluster} from '../../../types/events';
const mockRefresh=jest.fn();
const mockBuild=jest.fn();
jest.mock('@react-native-async-storage/async-storage',()=>jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@expo/vector-icons/MaterialIcons',()=> 'MaterialIcons');
jest.mock('react-native-svg',()=>({__esModule:true,default:'Svg',SvgXml:'SvgXml',Circle:'Circle',Line:'Line'}));
jest.mock('@rnmapbox/maps',()=>{
 const React=jest.requireActual<typeof import('react')>('react');
 return {__esModule:true,default:{PointAnnotation:React.forwardRef(function Annotation(p:any,ref:any){React.useImperativeHandle(ref,()=>({refresh:()=>mockRefresh(p.id)}));return React.createElement('PointAnnotation',p,p.children);}),ShapeSource:'ShapeSource',CircleLayer:'CircleLayer',SymbolLayer:'SymbolLayer'}};
});
jest.mock('../../../utils/hybridClusterPresentation',()=>{
 const actual=jest.requireActual('../../../utils/hybridClusterPresentation');
 return {...actual,buildHybridVenues:(...args:any[])=>{mockBuild(args[0].id);return actual.buildHybridVenues(...args);}};
});
const fixture=(i:number)=>({id:'cluster-'+i,clusterType:'single',timeStatus:'future',interestLevel:'medium',eventCount:1,specialCount:0,venues:[{locationKey:'venue-'+i,venue:'Venue '+i,events:[{id:'event-'+i,type:'event',category:'Music',profileUrl:''}]}]}) as unknown as Cluster;

const frames = () => act(() => jest.advanceTimersByTime(64));
let tree: renderer.ReactTestRenderer;
beforeEach(() => {
 jest.useFakeTimers();
 jest.spyOn(global,'requestAnimationFrame').mockImplementation(cb=>setTimeout(()=>cb(0),16) as unknown as number);
 jest.spyOn(global,'cancelAnimationFrame').mockImplementation(id=>clearTimeout(id));
 mockRefresh.mockClear(); mockBuild.mockClear();
});
afterEach(() => { if(tree)act(()=>tree.unmount()); jest.restoreAllMocks(); jest.useRealTimers(); });
const show = (clusters: Cluster[], active = false, disabled = false) => <>{clusters.map(c=><HybridMapAnnotation key={c.id} id={c.id} cluster={c} coordinate={[-63.1,46.2]} isSelected={false} isReady isProcessing={false} disabled={disabled} isActive={active} reduceMotionEnabled={false} compact={false} dockX={0} dockY={0} measurementDockX={0} measurementDockY={0} record={()=>{}} categoryIcon={()=>'audiotrack'} onPress={()=>{}} onBackgroundPress={()=>{}} />)}</>;
const mount = (clusters: Cluster[], active = false) => {
 useClusterInteractionStore.setState({interactions:new Map(clusters.flatMap(c=>c.venues.map(v=>[v.locationKey,{clusterId:v.locationKey,lastInteractionTime:0,eventIds:[]} ] as const)))});
 act(()=>{tree=renderer.create(show(clusters,active));}); frames(); mockRefresh.mockClear(); mockBuild.mockClear();
};
it('refreshes only the affected marker when one venue clears new content among 32 markers',()=>{
 const clusters=Array.from({length:32},(_,i)=>fixture(i));mount(clusters);
 act(()=>useClusterInteractionStore.getState().recordInteraction('venue-0',['event-0']));frames();
 expect(mockBuild.mock.calls.map(c=>c[0])).toEqual(['cluster-0']);
 expect(mockRefresh.mock.calls.map(c=>c[0])).toEqual(['cluster-0']);
 // Repeating the same engagement changes only a timestamp, not visible pixels.
 mockRefresh.mockClear();mockBuild.mockClear();
 act(()=>useClusterInteractionStore.getState().recordInteraction('venue-0',['event-0']));frames();
 expect(mockRefresh).not.toHaveBeenCalled();
 mockBuild.mockClear();
 act(()=>useClusterInteractionStore.getState().recordInteraction('unrelated',['another-event']));frames();
 expect(mockBuild).not.toHaveBeenCalled();expect(mockRefresh).not.toHaveBeenCalled();
});
it('does not capture all markers when input is gated or identical cluster objects arrive',()=>{
 const clusters=Array.from({length:32},(_,i)=>fixture(i));mount(clusters);
 act(()=>tree.update(show(clusters,false,true)));frames();expect(mockRefresh).not.toHaveBeenCalled();
 act(()=>tree.update(show(clusters.map(c=>({...c})),false,true)));frames();expect(mockRefresh).not.toHaveBeenCalled();
});
it('defers a hidden venue new-content change until that venue rotates into view',()=>{
 const cluster=fixture(0);cluster.venues.push({...cluster.venues[0],locationKey:'zz-second',venue:'Second',events:[{...cluster.venues[0].events[0],id:'second-event'}]});
 mount([cluster],true);
 act(()=>useClusterInteractionStore.getState().recordInteraction('zz-second',['second-event']));frames();
 expect(mockBuild).toHaveBeenCalledTimes(1);expect(mockRefresh).not.toHaveBeenCalled();
 act(()=>jest.advanceTimersByTime(3000));frames();expect(mockRefresh).toHaveBeenCalledTimes(1);
 const graphics=tree.root.findAllByProps({testID:'hybrid-venue-summary'}).at(-1)!;
 expect(graphics.findAllByType('SvgXml' as any)[0].props.xml).not.toContain('#EF5A59');
});
it('pauses captures while callout activity disables animations and resumes the three-second cadence',()=>{
 const clusters=Array.from({length:32},(_,i)=>{const c=fixture(i);c.venues.push({...c.venues[0],locationKey:'second-'+i,venue:'Second '+i});return c;});
 mount(clusters,true);
 act(()=>jest.advanceTimersByTime(1000));
 act(()=>tree.update(show(clusters,false,true)));frames();mockRefresh.mockClear();
 act(()=>jest.advanceTimersByTime(9000));frames();expect(mockRefresh).not.toHaveBeenCalled();
 act(()=>tree.update(show(clusters,true,false)));frames();expect(mockRefresh).not.toHaveBeenCalled();
 act(()=>jest.advanceTimersByTime(2900));expect(mockRefresh).not.toHaveBeenCalled();
 act(()=>jest.advanceTimersByTime(100));frames();expect(mockRefresh).toHaveBeenCalledTimes(32);
});
