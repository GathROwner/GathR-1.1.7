 # CLAUDE.md

  This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

  ## Project Overview

  GathR is a React Native mobile application built with Expo SDK 52 that helps users discover and attend local events. The app features location-based event discovery, map integration, user authentication, and social features.

  ## Development Commands

  ```bash
  # Install dependencies
  npm install

  # Start development server
  npm start
  # or
  npx expo start

  # Platform-specific development
  npm run android    # Run on Android
  npm run ios        # Run on iOS
  npm run web        # Run on web

  # Testing and Quality
  npm test           # Run Jest tests with watch mode
  npm run lint       # Run Expo linting

  # Project Management
  npm run reset-project  # Reset to blank project structure

  Architecture Overview

  Core Structure

  - Expo Router: File-based routing system using app/ directory
  - TypeScript: Strict TypeScript configuration with custom path aliases (@/*)
  - State Management: Zustand stores in store/ directory
  - Authentication: Firebase Auth with React Context in contexts/AuthContext.tsx
  - Navigation: React Navigation with tab-based structure

  Key Directories

  - app/: Main application screens using Expo Router
    - (tabs)/: Tab-based navigation screens
    - _layout.tsx: Root layout component
    - index.tsx: Home/landing screen
    - profile.tsx: User profile management
    - interest-selection.tsx: User onboarding
  - components/: Reusable UI components
    - map/: Map-related components (Mapbox integration)
    - common/: Shared components
    - ui/: Basic UI elements
    - ads/: Advertisement components
  - store/: Zustand state management
    - mapStore.ts: Map state and event data
    - guestLimitationStore.ts: Guest user limitations
    - userPrefsStore.ts: User preferences
  - contexts/: React Context providers
    - AuthContext.tsx: Firebase authentication state
  - services/: External service integrations
    - userService.js: User data management

  Technology Stack

  Core Technologies:
  - Expo SDK 52 (with Classic Architecture - New Architecture disabled)
  - React Native 0.76.7
  - TypeScript 5.3.3
  - React Navigation 7.x

  Key Integrations:
  - Firebase (Analytics, Authentication)
  - Mapbox Maps (@rnmapbox/maps)
  - Google Mobile Ads
  - AsyncStorage for local persistence
  - Expo Location, Calendar, Image Picker
  - Zustand for state management

  Maps & Location:
  - Uses Mapbox SDK with download token configuration
  - Location permissions for event discovery
  - Calendar integration for event scheduling

  Build & Platform Configuration:
  - iOS: Uses static frameworks, modular headers enabled
  - Android: Kotlin 1.9.25, custom permissions for location/calendar
  - Uses EAS Build with project ID: 87fd0c8f-0007-49fb-a057-2f4e81afe1db

  State Management Patterns

  The app uses Zustand for client state with these key stores:
  - Map store manages event data, filters, and map state
  - Guest limitation store handles feature restrictions for non-authenticated users
  - User preferences store manages app settings and user choices

  Authentication Flow

  Firebase Authentication integrated with React Context provides:
  - Guest mode with limited features
  - User registration and login
  - Profile management
  - Feature gating based on authentication status

  Important Notes

  - New Architecture: Explicitly disabled for Mapbox compatibility
  - Mapbox Version: Uses specific version 10.16.2 for compatibility
  - Permissions: Requires location, calendar, and camera permissions
  - Firebase: Uses both web SDK (11.4.0) and React Native Firebase for native features
  - Ads Integration: Google Mobile Ads with SKAdNetwork configuration for iOS
  - Haptic Feedback: Uses expo-haptics for tactile user feedback on cluster interactions

  ## User Experience Features

  ### Map Cluster Interactions
  The map screen implements sophisticated click handling and visual feedback for event clusters:
  - **Click Prevention**: Multi-layered guards prevent rapid-fire taps from causing flickering
  - **Initialization State**: 500ms delay after clusters render before accepting taps (prevents queued inputs)
  - **Visual Feedback**: Opacity changes (40% = not ready, 60% = processing, 100% = normal)
  - **Haptic Feedback**: Light haptic tap on cluster press for immediate tactile response
  - **Touch Blocking**: Transparent overlay during initialization captures/discards premature taps
  - **Processing State**: Ref-based synchronous guards prevent duplicate simultaneous clicks

  ### Daily Hotspot Feature
  Automatically highlights the "hottest" cluster on first app launch each day:
  - **Trigger Timing**: 300ms delay after clusters load (optimal for smooth positioning)
  - **Auto-dismiss**: 7-second tooltip duration (balances readability and responsiveness)
  - **Camera Animation**: Smooth zoom to hotspot coordinates with bounce easing
  - **User Override**: Tapping any cluster dismisses hotspot without zoom-back
  - **Analytics**: Tracks hotspot shown, dismissed, and cluster tapped events

  For detailed technical documentation on map interactions, see [docs/MAP_CLUSTER_INTERACTION.md](docs/MAP_CLUSTER_INTERACTION.md).

  ## AI Note: Production Logging

  - Follow [docs/PRODUCTION_LOGGING_POLICY.md](docs/PRODUCTION_LOGGING_POLICY.md).
  - Production builds strip debug `console.*` calls via Babel.
  - Avoid adding high-frequency logs in map/camera loops unless strictly needed.
