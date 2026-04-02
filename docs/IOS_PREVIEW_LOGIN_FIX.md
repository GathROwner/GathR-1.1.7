# iOS Preview Login Hang Fix

**Date Fixed:** March 2026
**Affected Build:** iOS Preview (EAS Build)
**Not Affected:** Development builds

## Problem Description

On iOS preview builds, users experienced a login hang:

1. Fresh install with existing user credentials
2. Enter email/password and tap "Log In"
3. Button shows spinner indefinitely - app appears frozen
4. Force-closing and reopening the app shows user is logged in
5. Issue did NOT occur in development builds

## Architecture Overview

### Login Flow Components

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   index.tsx     │────▶│  AuthContext.tsx │────▶│   _layout.tsx   │
│  (Login Screen) │     │  (Auth State)    │     │  (Navigation)   │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │                        │                        │
        │ signInWithEmail()      │ onAuthStateChanged()   │ useSegments()
        │                        │ setUser()              │ router.replace()
        ▼                        ▼                        ▼
   Firebase Auth ──────────▶ User State ──────────▶ Route Decision
```

### Key Files

| File | Role |
|------|------|
| `app/index.tsx` | Login screen UI, calls Firebase `signInWithEmailAndPassword()` |
| `contexts/AuthContext.tsx` | Listens to `onAuthStateChanged`, provides `user` and `isLoading` |
| `app/_layout.tsx` | `MainNavigator` component handles route redirects based on auth state |

### Authentication State Flow

1. **User taps "Log In"** → `index.tsx` calls `signInWithEmailAndPassword()`
2. **Firebase authenticates** → Returns `UserCredential`
3. **Firebase fires `onAuthStateChanged`** → `AuthContext` updates `user` state, sets `isLoading = false`
4. **_layout.tsx re-renders** → `MainNavigator` checks segments and auth state
5. **Navigation occurs** → `router.replace('/(tabs)/map')` if user is authenticated

## Root Cause

### The Bug: Expo Router Segments Detection

In `_layout.tsx`, the navigation logic used this condition:

```typescript
// BROKEN - This was always FALSE on the login screen
const onLoginScreen = segments[0] === 'index';
```

**The Problem:** Expo Router's `useSegments()` returns an **empty array `[]`** when on the root route (`app/index.tsx`), NOT `['index']` as expected.

| Route | Expected `segments` | Actual `segments` |
|-------|---------------------|-------------------|
| `app/index.tsx` (root) | `['index']` | `[]` |
| `app/(tabs)/map.tsx` | `['(tabs)', 'map']` | `['(tabs)', 'map']` |
| `app/profile.tsx` | `['profile']` | `['profile']` |

### Why Navigation Failed

```typescript
// With segments = [], this evaluated to:
const onLoginScreen = undefined === 'index';  // FALSE

// So even with an authenticated user, this block never executed:
if (user) {
  if (onLoginScreen) {  // FALSE - never entered
    safeReplace('/(tabs)/map');  // Never called!
  }
}
```

The authenticated user stayed on the login screen, which continued showing its loading spinner because the login handler was waiting for navigation that never happened.

### Why Dev Builds Worked

Development builds have:
- Slower JavaScript execution due to debug overhead
- Different timing characteristics for async operations
- Metro bundler's hot reload mechanisms

This allowed the auth state to settle differently, masking the navigation bug. Preview builds with optimized/minified code exposed the timing-sensitive issue.

## The Fix

### Change in `app/_layout.tsx` (Line 808)

```typescript
// BEFORE (broken)
const onLoginScreen = segments[0] === 'index';

// AFTER (working)
const onLoginScreen = !segments[0] || segments[0] === 'index';
```

This correctly detects the login screen by checking if the first segment is falsy (undefined when array is empty) OR equals `'index'`.

### TypeScript Note

You might think to use `segments.length === 0`, but Expo Router's TypeScript types declare `useSegments()` as returning a tuple that always has at least one element. This causes a type error:

```typescript
// TypeScript Error: "This comparison appears to be unintentional
// because the types '1' and '0' have no overlap"
const onLoginScreen = segments.length === 0;
```

Using `!segments[0]` avoids this by checking if the first element is falsy rather than checking array length.

### Login Handler Change in `app/index.tsx`

The original login handler had:

```typescript
// REMOVED - This caused race condition
const userCredential = await signInWithEmailAndPassword(auth, email, password);
router.replace('/(tabs)/map');  // Don't do this!
```

Now it simply authenticates and lets `_layout.tsx` handle navigation:

```typescript
const userCredential = await signInWithEmailAndPassword(auth, email, password);
// Navigation is handled by _layout.tsx once onAuthStateChanged fires
```

This ensures navigation only happens after the auth state is fully propagated through the React context.

## Debugging Approach

### Challenge: No Console Logs in Preview

Production/preview builds strip `console.log` statements via Babel configuration. To debug:

1. **Used `Alert.alert()` instead of `console.log()`** - These are not stripped
2. **Added alerts at key points:**
   - Login handler start/completion
   - `onAuthStateChanged` callback
   - Navigation decision points in `_layout.tsx`

### Debug Output That Revealed the Issue

```
Opening sequence:
Alert: "Auth state changed - User: [email]"
Alert: "MainNavigator check - segments: [], isLoading: false, user: [object]"
Alert: "Navigation decision - onLoginScreen: false"  // <-- THE BUG
```

This showed `onLoginScreen` was `false` even when clearly on the login screen, because `segments` was `[]`.

### Important: Remove Debug Alerts

After debugging, all `Alert.alert()` calls were removed because:
- They block the main thread
- They interfere with timing-sensitive features (like the daily hotspot)
- They create poor user experience if accidentally left in

## Related: Daily Hotspot Feature

After fixing the login issue, the daily hotspot feature (which highlights the "hottest" cluster on first daily launch) wasn't triggering. This was caused by the blocking `Alert.alert()` calls interfering with its timing triggers. Removing the debug alerts restored normal hotspot behavior.

## Prevention: Key Lessons

1. **Don't assume Expo Router segment values** - Test actual values in all scenarios
2. **Centralize navigation in layout** - Don't navigate from both the action handler AND the layout
3. **Dev/Preview parity** - Always test auth flows in preview builds before release
4. **Debug with non-blocking methods** - Use `Alert.alert()` sparingly, or implement a debug logging service that writes to AsyncStorage

## Files Modified

| File | Change |
|------|--------|
| `app/_layout.tsx:808` | Fixed `onLoginScreen` detection to handle empty segments array |
| `app/index.tsx` | Removed direct `router.replace()` after login, let layout handle it |

## Testing Checklist

After any changes to auth/navigation:

- [ ] Fresh install → Login with existing credentials
- [ ] Fresh install → Sign up new account → Complete interest selection
- [ ] Guest mode → Browse app → Login from profile
- [ ] Logged in → Force close → Reopen (should stay logged in)
- [ ] Logged in → Log out → Should return to login screen
- [ ] All above in both Dev AND Preview builds
