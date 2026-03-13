# Map Cluster Interaction System

## Overview

This document describes the cluster interaction system on the GathR map, including click handling, visual feedback, and the daily hotspot feature.

## Problem Statement

The original implementation had several UX issues:
1. **Rapid-fire clicks**: Users could tap clusters multiple times during initial load, causing callouts to flicker open/closed
2. **Delayed responsiveness**: Clusters appeared visually but weren't immediately interactive due to heavy rendering
3. **Click queuing**: Taps during initialization were queued and processed later, interfering with animations
4. **No visual feedback**: Users didn't know if their tap was registered, leading to repeated tapping
5. **Hotspot interference**: Daily hotspot animation timing wasn't optimized

## Architecture

### Core Components

1. **Cluster Click Handler** ([app/(tabs)/map.tsx](app/(tabs)/map.tsx):1380-1710)
   - `handleMarkerPress`: Main handler for cluster taps
   - Click prevention guards using refs
   - Haptic feedback integration
   - Processing state management

2. **Cluster Ready System** ([app/(tabs)/map.tsx](app/(tabs)/map.tsx):1371-1389)
   - `clustersReady` state: Tracks when clusters are fully interactive
   - 500ms delay after initial render to prevent queued taps
   - Touch-blocking overlay during initialization

3. **TreeMarker Component** ([app/(tabs)/map.tsx](app/(tabs)/map.tsx):534-680)
   - Visual representation of event clusters
   - Processing and ready state indicators
   - Opacity-based visual feedback

4. **Daily Hotspot** ([hooks/useHotspotHighlight.ts](hooks/useHotspotHighlight.ts))
   - Auto-zoom to "hottest" cluster on first app launch of the day
   - 300ms trigger delay after clusters load
   - 7-second auto-dismiss tooltip

## Implementation Details

### Click Prevention System

#### 1. Re-entry Guard
```typescript
const clusterProcessingRef = useRef<string | null>(null);
const clusterProcessingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
```

Prevents multiple simultaneous cluster clicks:
- Synchronous ref check (no re-render delay)
- Blocks all cluster taps while processing one
- Safety timeout (1000ms) prevents deadlock
- Cleanup in finally block ensures proper reset

#### 2. Camera Animation Guard
```typescript
if (ignoreProgrammaticCameraRef.current) {
  console.log('[map] Cluster tap blocked: camera animating');
  return;
}
```

Blocks user input during programmatic camera movements (hotspot zoom, venue selection).

#### 3. Processing State
```typescript
const [processingClusterId, setProcessingClusterId] = useState<string | null>(null);
```

Provides visual feedback by:
- Disabling all cluster TouchableOpacity components
- Reducing opacity of the processing cluster to 60%
- Preventing new taps until processing completes

### Cluster Ready System

#### Purpose
Prevents tap queuing during initial heavy render operations that would otherwise delay/queue user input.

#### Implementation
```typescript
useEffect(() => {
  if (!isLoading && clusters.length > 0 && !clustersReady) {
    const timer = setTimeout(() => {
      console.log('[map] Clusters ready for interaction');
      setClustersReady(true);
    }, 500);
    return () => clearTimeout(timer);
  }
}, [isLoading, clusters.length, clustersReady]);
```

#### Visual Feedback During Initialization
1. **Dimmed Clusters**: 40% opacity on all TreeMarker components
2. **Loading Message**: "Loading Data..." overlay in center of screen
3. **Touch Blocking**: Transparent overlay with `pointerEvents="box-only"` captures and discards all touches

```typescript
{!isLoading && !clustersReady && (
  <View
    style={styles.clustersNotReadyOverlay}
    pointerEvents="box-only"
    onStartShouldSetResponder={() => true}
    onResponderRelease={() => {
      console.log('[map] Touch blocked: clusters not ready yet');
    }}
  >
    <View style={styles.clustersLoadingMessage}>
      <Text style={styles.clustersLoadingText}>Loading Data...</Text>
    </View>
  </View>
)}
```

### Haptic Feedback

Immediate tactile confirmation when cluster is tapped:
```typescript
Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {
  // Silently fail if haptics not available
});
```

Provides instant feedback before any visual changes occur.

### TouchableOpacity Configuration

Enhanced touch responsiveness:
```typescript
<TouchableOpacity
  onPress={() => handleMarkerPress(cluster)}
  disabled={!clustersReady || processingClusterId !== null}
  activeOpacity={0.7}
  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
>
```

- `disabled`: Blocks interaction when clusters not ready or during processing
- `activeOpacity`: Immediate visual feedback on press
- `hitSlop`: Enlarged tap target for better mobile UX

### Daily Hotspot Feature

The daily hotspot feature automatically highlights the "hottest" cluster (highest priority events) once per day when the app is opened.

#### Foreground-Only Trigger System

**Design Goal**: Only trigger hotspot on app launch/foreground, never on mid-session settings changes.

**Implementation**: Uses React Native's `AppState` API with a ref-based evaluation window:

```typescript
const canEvaluateTriggerRef = useRef(false);

useEffect(() => {
  const subscription = AppState.addEventListener('change', (nextAppState) => {
    if (nextAppState === 'active') {
      canEvaluateTriggerRef.current = true; // Enable evaluation window
    } else if (nextAppState === 'background' || nextAppState === 'inactive') {
      canEvaluateTriggerRef.current = false; // Close evaluation window
    }
  });

  // Initial mount counts as foreground
  canEvaluateTriggerRef.current = true;
  return () => subscription.remove();
}, []);
```

**Critical Implementation Detail**: Setting change detection happens **inside `useMemo`** (synchronous) rather than in a separate `useEffect` (asynchronous):

```typescript
const shouldShowHotspot = useMemo(() => {
  // FIRST: Check if setting just changed - blocks immediately
  if (prevShowDailyHotspotRef.current !== showDailyHotspot) {
    canEvaluateTriggerRef.current = false; // Reset evaluation flag
    prevShowDailyHotspotRef.current = showDailyHotspot;
    return false; // Block synchronously during render
  }

  // THEN: Check evaluation window
  if (!canEvaluateTriggerRef.current) {
    return false; // Not in foreground evaluation window
  }

  // ... other checks
}, [showDailyHotspot, clusters, /* other deps */]);
```

**Why This Matters**:
- `useMemo` runs synchronously during render
- `useEffect` runs asynchronously after render
- If we used `useEffect` to detect the setting change, the `useMemo` would evaluate first and return `true`, then the effect would run too late
- By detecting the change inside `useMemo`, we block synchronously before the hotspot can trigger

**User Flow**:
1. User opens app with hotspot disabled → No trigger ✓
2. User enables hotspot in profile settings → `canEvaluateTriggerRef` reset to `false` → No trigger ✓
3. User closes profile modal → Still no trigger ✓
4. User closes and reopens app → AppState 'active' fires → `canEvaluateTriggerRef` set to `true` → Hotspot triggers ✓

#### Trigger Timing
Optimized delay after clusters load:
```typescript
useEffect(() => {
  if (shouldShowHotspot && clusters.length > 0) {
    const timer = setTimeout(() => {
      triggerHotspot();
    }, 300); // 300ms optimal delay
    return () => clearTimeout(timer);
  }
}, [shouldShowHotspot, clusters.length, triggerHotspot]);
```

**Why 300ms?**
- Too short (0-100ms): Clusters haven't fully separated/positioned
- Too long (>500ms): Animation feels delayed/disconnected
- 300ms: Perfect balance for smooth transition

#### Auto-dismiss Duration
```typescript
dismissTimeoutRef.current = setTimeout(() => {
  dismiss();
}, 7000); // 7 seconds
```

Balances readability with responsiveness - users have time to read tooltip but it doesn't overstay.

## Visual Feedback States

### TreeMarker Opacity States
```typescript
opacity: !isReady ? 0.4 : isProcessing ? 0.6 : 1
```

1. **Not Ready** (40%): During initialization (0-500ms after clusters appear)
2. **Processing** (60%): Specific cluster being tapped/processed
3. **Normal** (100%): Ready for interaction

### Broadcasting Effect (NOW Clusters)
Pulsing rings for clusters with events happening now:
```typescript
const opacity = anim.interpolate({
  inputRange: [0, 0.3, 1],
  outputRange: [0, 0.4, 0], // Start invisible to avoid dark circle artifact
  extrapolate: 'clamp'
});
```

Rings fade in from 0% to 40% then fade out, creating a smooth pulse without visible center artifact.

## Console Logging

### Cluster Interaction Logs
- `[map] Cluster tap blocked: already processing ${id}` - Re-entry guard triggered
- `[map] Cluster tap blocked: camera animating` - Camera animation guard triggered
- `[map] Touch blocked: clusters not ready yet` - Touch overlay captured tap during init
- `[map] Cluster processing started: ${id}` - Processing began
- `[map] Cluster processing completed: ${id}` - Processing finished
- `[map] Cluster processing auto-cleared (timeout)` - Safety timeout triggered
- `[map] Clusters ready for interaction` - Initialization complete

### Hotspot Debug Logs
- `[Hotspot] Hook mounted - AppState: active` - Hook initialized with foreground state
- `[Hotspot] App foregrounded - allowing hotspot evaluation` - App came to foreground
- `[Hotspot] App backgrounded - resetting evaluation flag` - App went to background
- `[Hotspot] ⚠️ Setting changed during evaluation - resetting evaluation flag` - User toggled setting mid-session
- `[Hotspot] ❌ Blocked: not in evaluation window (app not foregrounded)` - Not in foreground evaluation window
- `[Hotspot] ❌ Blocked: user disabled hotspot` - User has hotspot disabled in settings
- `[Hotspot] ❌ Blocked: already shown today` - Once-per-day logic blocking
- `[Hotspot] ❌ Blocked: tutorial active` - Tutorial is running
- `[Hotspot] ❌ Blocked: no clusters loaded` - Waiting for cluster data
- `[Hotspot] ❌ Blocked: already triggered this session` - Already triggered once this session
- `[Hotspot] ✅ All checks passed - hotspot should trigger` - All conditions met, triggering
- `[Hotspot] ⚠️ DEBUG: Ignoring date check (DEBUG_IGNORE_DATE = true)` - Debug mode bypassing once-per-day
- `[Hotspot] Evaluation flag reset - hotspot will not trigger again until next app foreground` - Post-trigger cleanup

## Testing Checklist

### Manual Testing - Cluster Interactions
- [ ] **Rapid tap test**: Tap cluster 3-4 times rapidly → Callout opens once, additional taps ignored
- [ ] **Initial load test**: Tap clusters immediately after they appear → Dimmed with "Loading Data..." message
- [ ] **Normal single tap**: Tap ready cluster once → Opens smoothly in 500-700ms
- [ ] **Processing visual**: Tapped cluster dims to 60%, others disabled
- [ ] **Haptic feedback**: Feel light tap vibration on cluster press (device-dependent)

### Manual Testing - Hotspot Feature
- [ ] **App launch trigger**: Close and reopen app → Hotspot triggers after clusters load (300ms delay)
- [ ] **Settings change blocking**: Open app with hotspot disabled → Go to settings → Enable hotspot → Hotspot does NOT trigger
- [ ] **Next launch trigger**: After enabling in settings → Close app → Reopen → Hotspot triggers
- [ ] **Once per day**: See hotspot → Close and reopen app same day → Does NOT trigger again (unless DEBUG_IGNORE_DATE is true)
- [ ] **Background reset**: App runs hotspot → Background app → Foreground again → Does NOT trigger again same session
- [ ] **Tooltip interaction**: Tap tooltip → Opens cluster callout without zooming back
- [ ] **Auto-dismiss**: Wait 7 seconds → Tooltip disappears and camera zooms back
- [ ] **Don't show again**: Tap "Don't show this again" → Setting disabled → Never shows again

### Edge Cases - Cluster Interactions
- [ ] Error during processing → Guard clears in finally block
- [ ] User taps during camera zoom → Blocked via `ignoreProgrammaticCameraRef`
- [ ] Guest limitation triggered → Guard clears properly
- [ ] Multiple different clusters tapped rapidly → Only first processes

### Edge Cases - Hotspot Feature
- [ ] Hotspot animating while user taps cluster → Taps blocked during animation
- [ ] User toggles setting on/off rapidly → Flag resets properly each time
- [ ] Tutorial active when app opens → Hotspot blocked until tutorial completes
- [ ] App backgrounded during hotspot animation → Animation continues, flag resets on background

## Performance Considerations

- **Refs over State**: Click guards use refs for synchronous checks (no re-render delays)
- **Minimal Re-renders**: Processing state only updates when needed
- **Safety Timeouts**: Prevent deadlocks but don't impact normal operation
- **Overlay Pattern**: `pointerEvents="box-only"` efficiently blocks touches without JavaScript overhead

## Configuration Values

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Cluster ready delay | 500ms | Allows React to complete heavy initial render |
| Safety timeout | 1000ms | Prevents deadlock if processing fails |
| Hotspot trigger delay | 300ms | Optimal balance for smooth cluster positioning |
| Hotspot auto-dismiss | 7000ms | Readable but not intrusive |
| Processing opacity | 60% | Clear visual feedback without being too dim |
| Not ready opacity | 40% | Strong indicator that clusters aren't interactive |
| Active opacity | 70% | Immediate press feedback |
| Hit slop | 10px | Enlarged tap target for better mobile UX |

## Future Enhancements

Potential improvements:
- [ ] Configurable cluster ready delay based on device performance
- [ ] A/B test different hotspot timings
- [ ] Analytics tracking for blocked tap attempts
- [ ] Visual ripple effect on cluster tap
- [ ] Accessibility improvements (VoiceOver/TalkBack support)

## Related Files

- [app/(tabs)/map.tsx](app/(tabs)/map.tsx) - Main map component with cluster rendering
- [hooks/useHotspotHighlight.ts](hooks/useHotspotHighlight.ts) - Daily hotspot feature
- [store/mapStore.ts](store/mapStore.ts) - Map state management
- [store/clusterInteractionStore.ts](store/clusterInteractionStore.ts) - Cluster selection state
- [components/map/TreeMarker.tsx](components/map/TreeMarker.tsx) - Cluster visual component
