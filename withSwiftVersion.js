const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// The specific code we need to add for Mapbox
const swiftVersionModification = `
  installer.pods_project.targets.each do |target|
    if target.name == 'MapboxMaps'
      target.build_configurations.each do |config|
        config.build_settings['SWIFT_VERSION'] = '5.0'
      end
    end
  end
`;

const withSwiftVersion = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.projectRoot, 'ios', 'Podfile');
      let podfileContent = fs.readFileSync(podfilePath, 'utf-8');

      // Prevent adding the code twice
      if (podfileContent.includes("config.build_settings['SWIFT_VERSION'] = '5.0'")) {
        return config;
      }

      // Find the existing post_install hook to inject our code
      const postInstallHook = 'post_install do |installer|';
      if (podfileContent.includes(postInstallHook)) {
        podfileContent = podfileContent.replace(
          postInstallHook,
          `${postInstallHook}\n${swiftVersionModification}`
        );
      } else {
        // Fallback in case no post_install hook exists
        podfileContent += `\n${postInstallHook}\n${swiftVersionModification}\nend`;
      }

      fs.writeFileSync(podfilePath, podfileContent);
      return config;
    },
  ]);
};

module.exports = withSwiftVersion;