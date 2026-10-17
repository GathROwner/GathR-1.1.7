const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const easConfig = require(path.join(projectRoot, "eas.json"));
const createAppConfig = require(path.join(projectRoot, "app.config.js"));

function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(projectRoot, relativePath), "utf8"));
}

function readPlistString(relativePath, key) {
  const contents = fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = contents.match(
    new RegExp(`<key>${escapedKey}<\\/key>\\s*<string>([^<]+)<\\/string>`)
  );
  return match?.[1]?.trim() ?? "";
}

const preview = easConfig.build?.preview;
const production = easConfig.build?.production;

invariant(preview, "Missing EAS Preview build profile");
invariant(production, "Missing EAS Production build profile");
invariant(preview.distribution === "internal", "Preview must remain an internal build");
invariant(preview.channel === "preview", "Preview must use the preview OTA channel");
invariant(preview.environment === "preview", "Preview must use the EAS Preview environment");
invariant(preview.ios?.autoIncrement === true, "Preview iOS build numbers must auto-increment");
invariant(
  preview.env?.EXPO_PUBLIC_FIREBASE_TARGET === "staging",
  "Preview must target staging Firebase"
);
invariant(
  preview.env?.EXPO_PUBLIC_USE_FIREBASE_EMULATORS === "false",
  "Preview must not use local Firebase emulators"
);
invariant(
  preview.env?.EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG === "true",
  "Preview must explicitly enable the App Check debug provider"
);
invariant(
  preview.env?.GOOGLE_SERVICES_PLIST === "./GoogleService-Info.staging.plist",
  "Preview iOS must use the staging GoogleService-Info.plist"
);
invariant(
  preview.env?.GOOGLE_SERVICES_JSON === "./google-services.staging.json",
  "Preview Android must use the staging google-services.json"
);

const previousEnvironment = {};
for (const [name, value] of Object.entries(preview.env)) {
  previousEnvironment[name] = process.env[name];
  process.env[name] = value;
}

let appConfig;
try {
  appConfig = createAppConfig({ config: {} });
} finally {
  for (const [name, value] of Object.entries(previousEnvironment)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}

invariant(appConfig.ios?.bundleIdentifier === "com.craigb.gathr", "Unexpected iOS bundle ID");
invariant(appConfig.android?.package === "com.craigb.gathr", "Unexpected Android package ID");
invariant(
  appConfig.ios?.googleServicesFile === "./GoogleService-Info.staging.plist",
  "Resolved Preview iOS config is not staging"
);
invariant(
  appConfig.android?.googleServicesFile === "./google-services.staging.json",
  "Resolved Preview Android config is not staging"
);

const stagingPlistPath = preview.env.GOOGLE_SERVICES_PLIST;
const stagingAndroidConfig = readJson(preview.env.GOOGLE_SERVICES_JSON);
invariant(
  readPlistString(stagingPlistPath, "PROJECT_ID") === "gathr-social-staging",
  "Staging iOS Firebase file has the wrong project"
);
invariant(
  readPlistString(stagingPlistPath, "BUNDLE_ID") === "com.craigb.gathr",
  "Staging iOS Firebase file has the wrong bundle ID"
);
invariant(
  stagingAndroidConfig.project_info?.project_id === "gathr-social-staging",
  "Staging Android Firebase file has the wrong project"
);

invariant(production.channel === "production", "Production OTA channel changed unexpectedly");
invariant(
  production.env?.EXPO_PUBLIC_FIREBASE_TARGET !== "staging",
  "Production must not target staging Firebase"
);
invariant(
  production.env?.EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG !== "true",
  "Production must not enable the App Check debug provider"
);
invariant(
  !production.env?.GOOGLE_SERVICES_PLIST && !production.env?.GOOGLE_SERVICES_JSON,
  "Production must continue using the default production Firebase files"
);

console.log(
  `Preview native config verified: ${appConfig.version} / runtime ${appConfig.version} / staging Firebase / internal iOS build`
);
