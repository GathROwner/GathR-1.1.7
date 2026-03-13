module.exports = function(api) {
  const isProduction = api.env('production');
  const plugins = [];

  // Strip console.* in production bundles to reduce JS-thread overhead.
  // Keep warn/error for critical diagnostics.
  if (isProduction) {
    plugins.push(['transform-remove-console', { exclude: ['warn', 'error'] }]);
  }

  // Must remain last per Reanimated docs.
  plugins.push('react-native-reanimated/plugin');

  return {
    presets: ['babel-preset-expo'],
    plugins
  };
};
