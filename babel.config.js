module.exports = function(api) {
  const isProduction = api.env('production');
  const plugins = [];

  // Strip console.* in production bundles to reduce JS-thread overhead.
  // Keep warn/error for critical diagnostics.
  if (isProduction) {
    plugins.push(['transform-remove-console', { exclude: ['warn', 'error'] }]);
  }

  return {
    presets: ['babel-preset-expo'],
    plugins
  };
};
