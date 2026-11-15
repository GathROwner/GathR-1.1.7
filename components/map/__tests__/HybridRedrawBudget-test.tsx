import React from 'react';
import renderer, {act} from 'react-test-renderer';
import HybridMapAnnotation, {HybridMapHalo} from '../HybridMapAnnotation';
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
// Commit animation updates regularly instead of treating several seconds as
// one giant React batch. Coalesced callbacks are exercised separately below.
const tick = (ms:number) => {
 let remaining=ms;
 while(remaining>0){const step=Math.min(10,remaining);act(()=>jest.advanceTimersByTime(step));remaining-=step;}
};
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

it('finishes both ripple pairs before rotating and captures only the venue change',()=>{
 const cluster=fixture(0);cluster.timeStatus='now';
 cluster.venues.push({...cluster.venues[0],locationKey:'zz-second',venue:'Second',events:[{...cluster.venues[0].events[0],id:'second-event'}]});
 mount([cluster],true);
 const photo=tree.root.findAllByProps({testID:'hybrid-photo-ring'}).at(-1)!;
 act(()=>photo.props.onLayout({nativeEvent:{layout:{y:24,height:42.3}}}));
 frames(); // Complete the snapshot handoff before the first ripple starts.
 const origin=Date.now();
 const advanceTo=(ms:number)=>tick(origin+ms-Date.now());
 const label=()=>tree.root.findAllByProps({testID:'hybrid-cluster-marker'}).at(-1)!.props.accessibilityLabel;
 advanceTo(40);mockRefresh.mockClear();
 expect(tree.root.findAllByType('CircleLayer' as any)).toHaveLength(2);
 for(const ms of [700,1140,1320,1540,2300,2700,2859]){
  advanceTo(ms);expect(label()).toContain('Venue 0,');expect(mockRefresh).not.toHaveBeenCalled();
 }
 advanceTo(2860);expect(label()).toContain('Second,');
 // Both native transitions have already faded to zero during the swap.
 for(const layer of tree.root.findAllByType('CircleLayer' as any))expect(layer.props.style.circleStrokeOpacity).toBe(0);
 advanceTo(2892);expect(mockRefresh).toHaveBeenCalledTimes(1);mockRefresh.mockClear();
 advanceTo(3040);expect(label()).toContain('Second,');expect(mockRefresh).not.toHaveBeenCalled();
 // A normal callout/activity pause cancels the shared clock; resume starts fresh.
 act(()=>tree.update(show([cluster],false,true)));frames();mockRefresh.mockClear();
 act(()=>jest.advanceTimersByTime(6000));expect(label()).toContain('Second,');expect(mockRefresh).not.toHaveBeenCalled();
 act(()=>tree.update(show([cluster],true,false)));const resumed=Date.now();
 tick(2859);expect(label()).toContain('Second,');
 act(()=>jest.advanceTimersByTime(1));expect(Date.now()-resumed).toBe(2860);expect(label()).toContain('Venue 0,');
});

it('keeps native paint targets stable during unrelated renders and disables ripples for reduced motion',()=>{
 const rotation=jest.fn();
 const halo=(reduceMotion=false)=><HybridMapHalo id="fixture" coordinate={[-63.1,46.2]} radius={21.15} translate={[0,0]} timing="today" active reduceMotion={reduceMotion} onVenueRotation={rotation}/>;
 act(()=>{tree=renderer.create(halo());});
 tick(400);
 const layers=tree.root.findAllByType('CircleLayer' as any).map(l=>l.props.style);
 const shape=tree.root.findByType('ShapeSource' as any).props.shape;
 act(()=>tree.update(halo()));
 expect(tree.root.findByType('ShapeSource' as any).props.shape).toBe(shape);
 tree.root.findAllByType('CircleLayer' as any).forEach((l,i)=>expect(l.props.style).toBe(layers[i]));
 expect(layers[1].circleRadiusTransition.delay).toBe(150);
 expect(layers[0].circleRadius).toBeGreaterThan(layers[1].circleRadius);
 act(()=>tree.update(halo(true)));
 expect(tree.root.findAllByType('CircleLayer' as any).map(l=>l.props.style.circleStrokeOpacity)).toEqual([.25,0]);
 act(()=>jest.advanceTimersByTime(10000));expect(rotation).not.toHaveBeenCalled();
});

it('uses fresh hidden native layers for a late photo load and never resumes the expanded paint state',()=>{
 const cluster=fixture(0);cluster.timeStatus='now';cluster.venues[0].events[0].profileUrl='https://fixture.invalid/first.webp';
 mount([cluster],true);
 act(()=>tree.root.findAllByProps({testID:'hybrid-photo-ring'}).at(-1)!.props.onLayout({nativeEvent:{layout:{y:24,height:42.3}}}));frames();
 act(()=>jest.advanceTimersByTime(400));mockRefresh.mockClear();
 for(const l of tree.root.findAllByType('CircleLayer' as any)){expect(l.props.style.circleStrokeOpacity).toBe(0);expect(l.props.style.circleRadius).toBeCloseTo(18.45);}
 const oldIds=tree.root.findAllByType('CircleLayer' as any).map(l=>l.props.id);
 const loaded=tree.root.findAllByProps({testID:'hybrid-venue-photo'}).at(-1)!.props.onLoad;
 act(()=>loaded());
 const reset=tree.root.findAllByType('CircleLayer' as any);
 expect(reset.map(l=>l.props.id)).not.toEqual(oldIds);
 for(const l of reset){expect(l.props.style.circleStrokeOpacity).toBe(0);expect(l.props.style.circleRadius).toBeCloseTo(18.45);expect(l.props.style.circleRadiusTransition.duration).toBe(0);}
 act(()=>jest.advanceTimersByTime(32));expect(mockRefresh).toHaveBeenCalledTimes(1);
 // A load arriving after the native capture requests another capture and
 // keeps both waves hidden until that final capture has settled.
 act(()=>loaded());act(()=>jest.advanceTimersByTime(32));
 for(const l of tree.root.findAllByType('CircleLayer' as any))expect(l.props.style.circleStrokeOpacity).toBe(0);
 act(()=>jest.advanceTimersByTime(64));expect(mockRefresh).toHaveBeenCalledTimes(2);
 const primed=tree.root.findAllByType('CircleLayer' as any);
 expect(primed[0].props.style.circleRadius).toBeCloseTo(18.45);
 expect(primed[0].props.style.circleRadiusTransition.duration).toBe(0);
 act(()=>jest.advanceTimersByTime(40));
 expect(tree.root.findAllByType('CircleLayer' as any)[0].props.style.circleRadiusTransition.duration).toBe(1100);
});

it('ignores photo events from the previous venue and cancels pending capture work on unmount',()=>{
 const cluster=fixture(0);cluster.timeStatus='now';cluster.venues[0].events[0].profileUrl='https://fixture.invalid/first.webp';
 cluster.venues.push({...cluster.venues[0],locationKey:'zz-second',venue:'Second',events:[{...cluster.venues[0].events[0],id:'second-event',profileUrl:'https://fixture.invalid/second.webp'}]});
 mount([cluster],true);
 act(()=>tree.root.findAllByProps({testID:'hybrid-photo-ring'}).at(-1)!.props.onLayout({nativeEvent:{layout:{y:24,height:42.3}}}));frames();
 const previous=tree.root.findAllByProps({testID:'hybrid-venue-photo'}).at(-1)!.props;
 act(()=>previous.onLoad());frames();
 tick(2860);frames();mockRefresh.mockClear();
 const current=tree.root.findAllByProps({testID:'hybrid-venue-photo'}).at(-1)!.props;
 expect(current.source.uri).toBe('https://fixture.invalid/second.webp');
 const ids=tree.root.findAllByType('CircleLayer' as any).map(l=>l.props.id);
 act(()=>{previous.onLoad();previous.onError();});frames();
 expect(mockRefresh).not.toHaveBeenCalled();expect(tree.root.findAllByType('CircleLayer' as any).map(l=>l.props.id)).toEqual(ids);
 act(()=>current.onLoad());act(()=>jest.advanceTimersByTime(16));
 act(()=>tree.unmount());act(()=>jest.advanceTimersByTime(5000));
 expect(mockRefresh).not.toHaveBeenCalled();
});

it('disarms, collapses and re-arms in separate commits even when reset callbacks are coalesced',()=>{
 act(()=>{tree=renderer.create(<HybridMapHalo id="busy-window" coordinate={[-63.1,46.2]} radius={21.15} translate={[0,0]} timing="now" active reduceMotion={false}/>);});
 tick(80);
 const outward=tree.root.findAllByType('CircleLayer' as any)[0].props.style;
 expect(outward.circleRadius).toBeCloseTo(40.59);
 act(()=>jest.advanceTimersByTime(1340));
 act(()=>jest.advanceTimersByTime(120));
 const disarmed=tree.root.findAllByType('CircleLayer' as any)[0].props.style;
 expect(disarmed.circleRadius).toBeCloseTo(40.59);
 expect(disarmed.circleStrokeOpacity).toBe(0);
 expect(disarmed.circleRadiusTransition.duration).toBe(0);
 act(()=>jest.advanceTimersByTime(40));
 const reset=tree.root.findAllByType('CircleLayer' as any)[0].props.style;
 expect(reset).not.toBe(outward);expect(reset.circleRadius).toBeCloseTo(18.45);
 expect(reset.circleRadiusTransition.duration).toBe(0);
 act(()=>jest.advanceTimersByTime(39));
 expect(tree.root.findAllByType('CircleLayer' as any)[0].props.style).toBe(reset);
 act(()=>jest.advanceTimersByTime(1));
 const armed=tree.root.findAllByType('CircleLayer' as any)[0].props.style;
 expect(armed.circleRadius).toBeCloseTo(18.45);expect(armed.circleRadiusTransition.duration).toBe(1100);
 expect(armed.circleStrokeOpacity).toBe(reset.circleStrokeOpacity);
 act(()=>jest.advanceTimersByTime(40));
 expect(tree.root.findAllByType('CircleLayer' as any)[0].props.style.circleRadius).toBeCloseTo(40.59);
});
