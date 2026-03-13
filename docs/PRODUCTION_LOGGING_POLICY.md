# Production Logging Policy

This project strips debug `console.*` calls from production bundles via Babel.

## Current Behavior

- Config source: `babel.config.js`
- Plugin: `babel-plugin-transform-remove-console`
- Active in: production builds only (`api.env('production')`)
- Stripped in production: `console.log`, `console.info`, `console.debug`, etc.
- Kept in production: `console.warn`, `console.error`

## Why

- Reduce JS-thread work on high-frequency paths (map camera ticks, animations, filtering loops).
- Improve responsiveness and help reduce battery drain.

## Rules for Contributors and AI Assistants

1. Do not rely on `console.*` for required runtime behavior.
2. Use analytics/error reporting for production observability.
3. For noisy debug logs in hot paths, prefer:
   - temporary local debugging, or
   - `if (__DEV__)` guards when clarity is needed.
4. Keep `react-native-reanimated/plugin` last in Babel plugins.

## Verification

- Dev build: debug logs should appear normally.
- Production/EAS release build: debug logs should be stripped automatically.
