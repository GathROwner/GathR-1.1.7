const createConfig = require('../app.config.js');

const config = createConfig({ config: {} });
const token = config?.extra?.mapboxAccessToken;

if (typeof token !== 'string' || token.trim().length === 0) {
  console.error(
    'Mapbox runtime token is missing from app.config.js extra.mapboxAccessToken. ' +
      'Do not publish an OTA until MAPBOX_ACCESS_TOKEN or EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN is available.'
  );
  process.exit(1);
}

if (!token.trim().startsWith('pk.')) {
  console.error('Mapbox runtime token is present but does not look like a public pk.* token.');
  process.exit(1);
}

console.log(`Mapbox runtime token configured: pk.* length=${token.trim().length}`);
