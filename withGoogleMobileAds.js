// withGoogleMobileAds.js
const { withAndroidManifest, withInfoPlist } = require('@expo/config-plugins');

const withGoogleMobileAds = (config, props) => {
  // Modify AndroidManifest.xml to add the AdMob Application ID
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    if (manifest && manifest.manifest && manifest.manifest.application) {
      const app = manifest.manifest.application[0];
      if (!app['meta-data']) {
        app['meta-data'] = [];
      }
      app['meta-data'].push({
        $: {
          'android:name': 'com.google.android.gms.ads.APPLICATION_ID',
          'android:value': props.android_app_id,
        },
      });
    }
    return config;
  });

  // Modify Info.plist to add the Google Mobile Ads Application ID
  config = withInfoPlist(config, (config) => {
    config.modResults.GADApplicationIdentifier = props.ios_app_id;

    return config;
  });

  return config;
};

module.exports = withGoogleMobileAds;
