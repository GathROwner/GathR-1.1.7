const createExpoWebpackConfigAsync = require('@expo/webpack-config');

module.exports = async function (env, argv) {
  const config = await createExpoWebpackConfigAsync(env, argv);
  
  // Add any custom config here
  config.resolve.alias = {
    ...config.resolve.alias,
    // Alias react-native to react-native-web for web platform
    'react-native$': 'react-native-web',
    // Ensure Platform is properly resolved
    'react-native/Libraries/Utilities/Platform': 'react-native-web/dist/exports/Platform',
  };

  return config;
};