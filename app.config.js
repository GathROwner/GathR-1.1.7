// app.config.js
module.exports = ({ config }) => ({
  ...config,

  name: "GathR",
  slug: "gathr",
  version: "1.1.7",
  orientation: "portrait",
  scheme: "gathr",
  userInterfaceStyle: "automatic",

  icon: "./assets/icon.png",
  splash: {
    image: "./assets/splash.png",
    resizeMode: "contain",
    backgroundColor: "#80c3f7"
  },

  updates: {
    fallbackToCacheTimeout: 0
  },

  assetBundlePatterns: ["**/*"],

  ios: {
    // rnmapbox/maps 10.3.0 dropped old-architecture support on iOS.
    // Keep Android on legacy architecture for now, but allow iOS to build.
    newArchEnabled: true,
    supportsTablet: true,
    bundleIdentifier: "com.craigb.gathr",
    buildNumber: "1",
    googleServicesFile: "GoogleService-Info.plist",
    // Deep linking: Universal Links for iOS
    associatedDomains: [
      "applinks:link.gathrapp.ca"
    ],
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSLocationWhenInUseUsageDescription:
        "GathR needs your location to show nearby events on the map",
      NSCalendarsUsageDescription:
        "GathR needs access to your calendar to add events you're interested in attending",
      GADApplicationIdentifier: "ca-app-pub-9606287073864764~2166199571",

      // SKAdNetwork identifiers for Google AdMob (essential identifiers only)
      // Reduced from 96 to 25 - only Google's primary + DSP partners needed
      SKAdNetworkItems: [
        // Google's primary identifier (REQUIRED)
        { SKAdNetworkIdentifier: "cstr6suwn9.skadnetwork" },
        // Google DSP partners for better fill rates
        { SKAdNetworkIdentifier: "4fzdc2evr5.skadnetwork" },
        { SKAdNetworkIdentifier: "2fnua5tdw4.skadnetwork" },
        { SKAdNetworkIdentifier: "ydx93a7ass.skadnetwork" },
        { SKAdNetworkIdentifier: "p78axxw29g.skadnetwork" },
        { SKAdNetworkIdentifier: "v72qych5uu.skadnetwork" },
        { SKAdNetworkIdentifier: "ludvb6z3bs.skadnetwork" },
        { SKAdNetworkIdentifier: "cp8zw746q7.skadnetwork" },
        { SKAdNetworkIdentifier: "c6k4g5qg8m.skadnetwork" },
        { SKAdNetworkIdentifier: "s39g8k73mm.skadnetwork" },
        { SKAdNetworkIdentifier: "wg4vff78zm.skadnetwork" },
        { SKAdNetworkIdentifier: "f38h382jlk.skadnetwork" },
        { SKAdNetworkIdentifier: "mlmmfzh3r3.skadnetwork" },
        { SKAdNetworkIdentifier: "t38b2kh725.skadnetwork" },
        { SKAdNetworkIdentifier: "7ug5zh24hu.skadnetwork" },
        { SKAdNetworkIdentifier: "v9wttpbfk9.skadnetwork" },
        { SKAdNetworkIdentifier: "n38lu8286q.skadnetwork" },
        { SKAdNetworkIdentifier: "kbd757ywx3.skadnetwork" },
        { SKAdNetworkIdentifier: "9t245vhmpl.skadnetwork" },
        { SKAdNetworkIdentifier: "22mmun2rn5.skadnetwork" },
        { SKAdNetworkIdentifier: "44jx6755aq.skadnetwork" },
        { SKAdNetworkIdentifier: "4468km3ulz.skadnetwork" },
        { SKAdNetworkIdentifier: "2u9pt9hc89.skadnetwork" },
        { SKAdNetworkIdentifier: "klf5c3l5u5.skadnetwork" },
        { SKAdNetworkIdentifier: "3rd42ekr43.skadnetwork" },
      ],

      NSUserTrackingUsageDescription:
        "This allows us to provide personalized ads and improve your experience by analyzing app usage patterns and demographics. You can always change this in Settings."
    }
  },

  android: {
    newArchEnabled: true,
    icon: "./assets/icon.png",
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#ffffff"
    },
    package: "com.craigb.gathr",
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json",
    permissions: [
      "ACCESS_FINE_LOCATION",
      "READ_CALENDAR",
      "WRITE_CALENDAR",
      "com.google.android.gms.permission.AD_ID"
    ],
    blockedPermissions: [
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
      "android.permission.RECORD_AUDIO",
      "android.permission.SYSTEM_ALERT_WINDOW"
    ],
    versionCode: 7,
    // Deep linking: App Links for Android
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          {
            scheme: "https",
            host: "link.gathrapp.ca",
            pathPrefix: "/event"
          },
          {
            scheme: "https",
            host: "link.gathrapp.ca",
            pathPrefix: "/special"
          }
        ],
        category: ["BROWSABLE", "DEFAULT"]
      }
    ]
  },

  web: {
    bundler: "metro"
  },

  newArchEnabled: true,  // SDK 54 defaults to New Architecture; keep Android aligned with rnmapbox 10.3.0's Fabric-first runtime.

plugins: [
    [
      "expo-build-properties",
      {
        "ios": {
          "deploymentTarget": "15.1",
          "useFrameworks": "static",
          "forceStaticLinking": ["RNFBApp", "RNFBAnalytics"],
          "podfileProperties": { 
            "use_modular_headers!": true 
          }
        },
        "android": {
          "buildToolsVersion": "36.0.0",
          "compileSdkVersion": 36,
          "targetSdkVersion": 36
        }
      }
    ],

    [
      "expo-notifications",
      {
        "icon": "./assets/notification-icon.png",
        "color": "#4A90E2"
      }
    ],

    "expo-asset",
    "expo-font",
    "expo-router",
    "expo-tracking-transparency",
    "expo-web-browser",

    [
      "react-native-google-mobile-ads",
      {
        androidAppId: "ca-app-pub-9606287073864764~3873969279",
        iosAppId: "ca-app-pub-9606287073864764~2166199571"
      }
    ],

    [
      "expo-location",
      {
        locationAlwaysAndWhenInUsePermission:
          "Allow GathR to use your location to show nearby events on the map and provide location-based analytics."
      }
    ],

    [
      "expo-calendar",
      {
        calendarPermission: "Allow GathR to access your calendar to add events"
      }
    ],

    [
      "expo-image-picker",
      {
        photosPermission:
          "Allow GathR to access your photos for profile images.",
        cameraPermission:
          "Allow GathR to use your camera for profile images.",
        microphonePermission: false
      }
    ],

    // SDK 54 / RN 0.81 path: let rnmapbox/maps use its current native defaults,
    // which now target the newer Mapbox Android artifacts required for 16 KB support.
    [
      "@rnmapbox/maps",
      {
        RNMapboxMapsDownloadToken: process.env.MAPBOX_DOWNLOADS_TOKEN,
      
      }
    ],
  ],

  extra: {
    eas: { projectId: "87fd0c8f-0007-49fb-a057-2f4e81afe1db" },
    router: { origin: false },
    mapboxAccessToken:
      process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ??
      process.env.MAPBOX_ACCESS_TOKEN ??
      "",

    "react-native-google-mobile-ads": {
      ios_app_id: "ca-app-pub-9606287073864764~2166199571",
      android_app_id: "ca-app-pub-9606287073864764~3873969279",
      iosAppId: "ca-app-pub-9606287073864764~2166199571",
      androidAppId: "ca-app-pub-9606287073864764~3873969279"
    }
  }
});
