module.exports = ({ config }) => ({
  ...config,
  name: "GathR",
  slug: "gathr",
  version: "1.0.8", // ✅ Bumped version for new build
  orientation: "portrait",
  scheme: "gathr",
  userInterfaceStyle: "automatic",
  icon: "./assets/icon.png",
  splash: {
    image: "./assets/splash.png",
    resizeMode: "contain",
    backgroundColor: "#ffffff"
  },
  updates: {
    fallbackToCacheTimeout: 0
  },
  assetBundlePatterns: ["**/*"],
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.craigb.gathr",
    buildNumber: "4", // ✅ Incremented build number
    googleServicesFile: "./GoogleService-Info.plist",
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSLocationWhenInUseUsageDescription:
        "GathR needs your location to show nearby events on the map",
      NSCalendarsUsageDescription:
        "GathR needs access to your calendar to add events you're interested in attending",
      GADApplicationIdentifier: "ca-app-pub-9606287073864764~2166199571",
      SKAdNetworkItems: [
        { SKAdNetworkIdentifier: "cstr6suwn9.skadnetwork" },
        { SKAdNetworkIdentifier: "4fzdc2evr5.skadnetwork" },
        { SKAdNetworkIdentifier: "4pfyvq9l8r.skadnetwork" },
        { SKAdNetworkIdentifier: "2fnua5tdw4.skadnetwork" },
        { SKAdNetworkIdentifier: "ydx93a7ass.skadnetwork" },
        { SKAdNetworkIdentifier: "5lm9lj6jb7.skadnetwork" },
        { SKAdNetworkIdentifier: "c6k4g5qg8m.skadnetwork" },
        { SKAdNetworkIdentifier: "3rd42ekr43.skadnetwork" },
        { SKAdNetworkIdentifier: "ludvb6z3bs.skadnetwork" },
        { SKAdNetworkIdentifier: "f38h382jlk.skadnetwork" },
        { SKAdNetworkIdentifier: "v9wttpbfk9.skadnetwork" },
        { SKAdNetworkIdentifier: "n38lu8286q.skadnetwork" },
        { SKAdNetworkIdentifier: "7ug5zh24hu.skadnetwork" },
        { SKAdNetworkIdentifier: "9rd848q2bz.skadnetwork" },
        { SKAdNetworkIdentifier: "n6fk4nfna4.skadnetwork" },
        { SKAdNetworkIdentifier: "kbd757ywx3.skadnetwork" },
        { SKAdNetworkIdentifier: "9t245vhmpl.skadnetwork" },
        { SKAdNetworkIdentifier: "2u9pt9hc89.skadnetwork" },
        { SKAdNetworkIdentifier: "8s468mfl3y.skadnetwork" },
        { SKAdNetworkIdentifier: "av6w8kgt66.skadnetwork" },
        { SKAdNetworkIdentifier: "klf5c3l5u5.skadnetwork" },
        { SKAdNetworkIdentifier: "ppxm28t8ap.skadnetwork" },
        { SKAdNetworkIdentifier: "424m5254lk.skadnetwork" },
        { SKAdNetworkIdentifier: "uw77j35x4d.skadnetwork" },
        { SKAdNetworkIdentifier: "578prtvx9j.skadnetwork" },
        { SKAdNetworkIdentifier: "glqzh8vgby.skadnetwork" },
        { SKAdNetworkIdentifier: "22mmun2rn5.skadnetwork" },
        { SKAdNetworkIdentifier: "prcb7njmu6.skadnetwork" },
        { SKAdNetworkIdentifier: "ecpz2srf59.skadnetwork" },
        { SKAdNetworkIdentifier: "wzmmz9fp6w.skadnetwork" },
        { SKAdNetworkIdentifier: "yclnxrl5pm.skadnetwork" },
        { SKAdNetworkIdentifier: "t38b2kh725.skadnetwork" },
        { SKAdNetworkIdentifier: "7rz58n8ntl.skadnetwork" },
        { SKAdNetworkIdentifier: "ejvt5qm6ak.skadnetwork" },
        { SKAdNetworkIdentifier: "5tjdwbrq8w.skadnetwork" },
        { SKAdNetworkIdentifier: "p78axxw29g.skadnetwork" },
        { SKAdNetworkIdentifier: "mlmmfzh3r3.skadnetwork" },
        { SKAdNetworkIdentifier: "275upjj5gd.skadnetwork" },
        { SKAdNetworkIdentifier: "3sh42y64q3.skadnetwork" },
        { SKAdNetworkIdentifier: "5l3tpt7t6e.skadnetwork" },
        { SKAdNetworkIdentifier: "mtkv5xtk9e.skadnetwork" },
        { SKAdNetworkIdentifier: "6g9af3uyq4.skadnetwork" },
        { SKAdNetworkIdentifier: "hs6bdukanm.skadnetwork" },
        { SKAdNetworkIdentifier: "a8cz6cu7e5.skadnetwork" },
        { SKAdNetworkIdentifier: "x5l83yy675.skadnetwork" },
        { SKAdNetworkIdentifier: "44jx6755aq.skadnetwork" },
        { SKAdNetworkIdentifier: "u679fj5vs4.skadnetwork" },
        { SKAdNetworkIdentifier: "g28c52eehv.skadnetwork" },
        { SKAdNetworkIdentifier: "wg4vff78zm.skadnetwork" },
        { SKAdNetworkIdentifier: "y5ghdn5j9k.skadnetwork" },
        { SKAdNetworkIdentifier: "rx5hdcabgc.skadnetwork" },
        { SKAdNetworkIdentifier: "g2y4y55b64.skadnetwork" },
        { SKAdNetworkIdentifier: "523jb4fst2.skadnetwork" },
        { SKAdNetworkIdentifier: "294l99pt4k.skadnetwork" },
        { SKAdNetworkIdentifier: "hjevpa356n.skadnetwork" },
        { SKAdNetworkIdentifier: "cj5566h2ga.skadnetwork" },
        { SKAdNetworkIdentifier: "ggvn48r87g.skadnetwork" },
        { SKAdNetworkIdentifier: "k674qkevps.skadnetwork" },
        { SKAdNetworkIdentifier: "r45fhb6rf7.skadnetwork" },
        { SKAdNetworkIdentifier: "x44k69ngh6.skadnetwork" },
        { SKAdNetworkIdentifier: "97r2b46745.skadnetwork" },
        { SKAdNetworkIdentifier: "v79kvwwj4g.skadnetwork" },
        { SKAdNetworkIdentifier: "488r3q3dtq.skadnetwork" },
        { SKAdNetworkIdentifier: "24t9a8vw3c.skadnetwork" },
        { SKAdNetworkIdentifier: "6xzpu9s2p8.skadnetwork" },
        { SKAdNetworkIdentifier: "737z793b9f.skadnetwork" },
        { SKAdNetworkIdentifier: "m5mvw97r93.skadnetwork" },
        { SKAdNetworkIdentifier: "238da6jt44.skadnetwork" },
        { SKAdNetworkIdentifier: "f73kdq92p3.skadnetwork" },
        { SKAdNetworkIdentifier: "44n7hlldy6.skadnetwork" },
        { SKAdNetworkIdentifier: "kbmxgpxpgc.skadnetwork" },
        { SKAdNetworkIdentifier: "52fl2v3hgk.skadnetwork" },
        { SKAdNetworkIdentifier: "s39g8k73mm.skadnetwork" },
        { SKAdNetworkIdentifier: "zq492l623r.skadnetwork" },
        { SKAdNetworkIdentifier: "3qcr597p9d.skadnetwork" },
        { SKAdNetworkIdentifier: "4468km3ulz.skadnetwork" },
        { SKAdNetworkIdentifier: "v72qych5uu.skadnetwork" },
        { SKAdNetworkIdentifier: "54nzkqm89y.skadnetwork" },
        { SKAdNetworkIdentifier: "cp8zw746q7.skadnetwork" },
        { SKAdNetworkIdentifier: "79pbpufp63.skadnetwork" },
        { SKAdNetworkIdentifier: "gdwd3w9et3.skadnetwork" },
        { SKAdNetworkIdentifier: "a2p9lx4jpn.skadnetwork" },
        { SKAdNetworkIdentifier: "6p4ks3rnbw.skadnetwork" },
        { SKAdNetworkIdentifier: "b9bk5wbcq9.skadnetwork" },
        { SKAdNetworkIdentifier: "lr83yxwka7.skadnetwork" },
        { SKAdNetworkIdentifier: "mls7yz5dvl.skadnetwork" },
        { SKAdNetworkIdentifier: "4dzt52r2t5.skadnetwork" },
        { SKAdNetworkIdentifier: "e5fvkxwrpn.skadnetwork" },
        { SKAdNetworkIdentifier: "nu4557a4je.skadnetwork" },
        { SKAdNetworkIdentifier: "252b5q8x7y.skadnetwork" },
        { SKAdNetworkIdentifier: "hdw39hrw9y.skadnetwork" },
        { SKAdNetworkIdentifier: "9g2aggbj52.skadnetwork" },
        { SKAdNetworkIdentifier: "krvm3zuq6h.skadnetwork" },
        { SKAdNetworkIdentifier: "pu4na253f3.skadnetwork" },
        { SKAdNetworkIdentifier: "y2ed4ez56y.skadnetwork" }
      ],
      // ✅ Enhanced privacy description for analytics
      NSUserTrackingUsageDescription:
        "This allows us to provide personalized ads and improve your experience by analyzing app usage patterns and demographics. You can always change this in Settings."
    }
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#ffffff"
    },
    package: "com.craigb.gathr",
    permissions: [
      "ACCESS_FINE_LOCATION",
      "READ_CALENDAR",
      "WRITE_CALENDAR"
    ],
    versionCode: 3 // ✅ Incremented Android version code
  },
  web: {
    bundler: "metro"
  },
  plugins: [
    [
      "expo-build-properties",
      {
        "ios": {
          "useFrameworks": "static",
          "podfileProperties": { 
            "use_modular_headers!": true 
          }
        }
      }
    ],
    "expo-asset",
    "expo-router",
    "expo-tracking-transparency",
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
        calendarPermission:
          "Allow GathR to access your calendar to add events"
      }
    ],
    [
      "expo-image-picker",
      {
        photosPermission:
          "Allow GathR to access your photos for profile images.",
        cameraPermission:
          "Allow GathR to use your camera for profile images."
      }
    ]
  ],
  extra: {
    eas: {
      projectId: "87fd0c8f-0007-49fb-a057-2f4e81afe1db"
    },
    router: {
      origin: false
    },
    "react-native-google-mobile-ads": {
      // Including both formats for maximum compatibility
      // Snake case (older format)
      ios_app_id: "ca-app-pub-9606287073864764~2166199571",
      android_app_id: "ca-app-pub-9606287073864764~3873969279",
      // Camel case (newer format)
      iosAppId: "ca-app-pub-9606287073864764~2166199571",
      androidAppId: "ca-app-pub-9606287073864764~3873969279"
    }
  }
});