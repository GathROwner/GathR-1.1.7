import React, { useEffect, useMemo, useState } from 'react';
import {
  Image,
  type ImageSourcePropType,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { SocialProfile } from '../../types/social';

const BRAND = '#2F80ED';

const DEMO_AVATARS_BY_UID: Record<string, ImageSourcePropType> = {
  gathr_demo_craig_emma_v1: require('../../assets/social-avatars/emma-brooks-demo.jpg'),
  gathr_demo_craig_liam_v1: require('../../assets/social-avatars/liam-patel-demo.jpg'),
  gathr_demo_craig_maya_v1: require('../../assets/social-avatars/maya-chen-demo.jpg'),
  gathr_demo_craig_noah_v1: require('../../assets/social-avatars/noah-grant-demo.jpg'),
  gathr_demo_craig_sofia_v1: require('../../assets/social-avatars/sofia-reyes-demo.jpg'),
};

type AvatarProfile = Pick<SocialProfile, 'uid' | 'displayName' | 'photoURL'>;

export function hasBundledDemoAvatar(uid: string) {
  return Boolean(DEMO_AVATARS_BY_UID[uid]);
}

export function ProfileAvatar({
  profile,
  size = 42,
  borderWidth = 0,
}: {
  profile: AvatarProfile;
  size?: number;
  borderWidth?: number;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const initial = profile.displayName.trim().charAt(0).toUpperCase() || '?';
  const source = useMemo<ImageSourcePropType | null>(() => {
    const remoteURL = String(profile.photoURL || '').trim();
    if (remoteURL) return { uri: remoteURL };
    return DEMO_AVATARS_BY_UID[profile.uid] || null;
  }, [profile.photoURL, profile.uid]);

  useEffect(() => setImageFailed(false), [source]);

  const shellStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    borderWidth,
  };

  if (source && !imageFailed) {
    return (
      <View style={[styles.shell, shellStyle]}>
        <Image
          accessible={false}
          onError={() => setImageFailed(true)}
          resizeMode="cover"
          source={source}
          style={styles.image}
        />
      </View>
    );
  }

  return (
    <View accessible={false} style={[styles.shell, styles.fallback, shellStyle]}>
      <Text style={[styles.initial, { fontSize: Math.max(15, size * 0.38) }]}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flexShrink: 0,
    overflow: 'hidden',
    borderColor: '#FFFFFF',
    backgroundColor: '#DCEBFF',
  },
  image: { width: '100%', height: '100%' },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  initial: { color: BRAND, fontWeight: '800' },
});
