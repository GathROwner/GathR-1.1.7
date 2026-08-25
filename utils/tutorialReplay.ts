interface ProfileTutorialReplayDependencies {
  restartTutorial?: (() => void) | null;
  dismissProfile: () => void;
}

/**
 * Starts the root tutorial before dismissing the native Profile modal.
 *
 * On iOS, root overlays render beneath a presented native-stack modal. Keeping
 * both operations together prevents an active tutorial from being hidden
 * behind Profile, without waiting for an arbitrary animation timeout.
 */
export const beginProfileTutorialReplay = ({
  restartTutorial,
  dismissProfile,
}: ProfileTutorialReplayDependencies): boolean => {
  if (typeof restartTutorial !== 'function') return false;

  restartTutorial();
  dismissProfile();
  return true;
};
