# Native Ad Lifecycle Bug Diagnosis

**Date:** 2026-03-15
**Context:** Compact SDK ad blank state on first callout open

---

## Symptom Pattern Summary

- First-time auto-open of default tab in callout shows blank/invisible ad
- Space reserved (container exists)
- Sometimes brief flash of dark shell or media starting, then disappears
- Manual tab switch away and back fixes it completely
- Once fixed via manual revisit, usually stays fixed
- Only affects compact callout context, not full-size list contexts
- Warm-up mounting didn't fully fix it

---

## Most Likely Root Cause

**Native view hierarchy attachment timing during callout's layout settling phase.**

The smoking gun is: "manual tab switch fixes it completely and permanently." This tells me the SDK card itself is fine, the ad data is fine, but the *initial mount timing* is wrong.

When the callout auto-opens with its default tab, you're mounting `NativeAdView`/`NativeMediaView` while:
- The callout container is still settling its layout (possibly mid-animation)
- React Native hasn't completed the native view hierarchy commit for the new overlay
- The parent views haven't reported their final dimensions yet

`NativeMediaView` in particular is notoriously sensitive to mounting into unstable view hierarchies. The brief flash you see is likely the ad starting to initialize, then the native view detecting an invalid layout state and hiding/unmounting itself.

The manual tab revisit works because by then, the callout has been open for seconds—fully settled, dimensions committed, native hierarchy stable.

---

## Smallest Validating Experiment

Add this to your compact SDK card component:

```typescript
const [layoutSettled, setLayoutSettled] = useState(false);

useEffect(() => {
  if (isVisible) {
    // Reset on visibility change
    setLayoutSettled(false);

    // Wait for parent layout to settle
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(() => setLayoutSettled(true), 50);
      });
    });
  }
}, [isVisible]);

// Only mount NativeAdView when BOTH visible AND settled
{isVisible && layoutSettled && <CompactSdkAdCard ad={ad} />}
```

**What this tests**: Whether double-RAF + small delay (ensuring native layout commit) fixes the first-load blank state.

---

## Recommended Strategy

**Mount SDK ad only after layout stability signal**, not just visibility.

Specifically:
- Don't pre-mount hidden (NativeAdView doesn't like being hidden)
- Don't mount immediately when tab becomes visible
- Instead: `isVisible && hasParentLayout && <SdkAd />`

The `hasParentLayout` signal should come from:
1. `onLayout` callback on the callout's content container, OR
2. Double-RAF + small timeout as shown above (simpler)

This is different from previous "delayed mount after open"—you need to delay until *the native view hierarchy is stable*, not just until time has passed.

---

## Why This Matches Your Symptoms

| Symptom | Explanation |
|---------|-------------|
| Full-size list ads work | FlatList has stable layout |
| Manual tab revisit works | Hierarchy long-settled by then |
| Brief flash then blank | Ad tries to init in unstable hierarchy, gives up |
| Warm-up didn't fully fix | Warm-up happened in different hierarchy |
| Space reserved but content blank | Container mounted, native ad view bailed |

---

## Next Steps

1. Run the validating experiment above
2. If it works, the fix is confirmed: gate SDK card mount on layout stability
3. If it doesn't work, the issue is elsewhere (remount key, media surface attachment)
