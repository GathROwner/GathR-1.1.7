import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { WelcomeScreenProps } from '../../types/tutorial';

const GATHR_GLOBE = require('../../assets/icon.png');
const GATHR_WORDMARK = require('../../assets/GathR Text Logo.png');

const FEATURES = [
  { icon: 'map-outline' as const, text: 'Discover what is happening nearby' },
  { icon: 'options-outline' as const, text: 'Shape results around your plans' },
  { icon: 'people-outline' as const, text: 'Help great local places get found' },
];

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onStart,
  onSkip,
  stepNumber = 1,
  totalSteps = 11,
}) => {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(entrance, {
      toValue: 1,
      tension: 70,
      friction: 10,
      useNativeDriver: true,
    }).start();
  }, [entrance]);

  return (
    <View style={[styles.stage, {
      paddingTop: insets.top + 16,
      paddingBottom: insets.bottom + 16,
      paddingLeft: insets.left + 18,
      paddingRight: insets.right + 18,
    }]}>
      <Animated.View
        accessibilityViewIsModal
        style={[
          styles.card,
          { maxHeight: windowHeight - insets.top - insets.bottom - 32 },
          {
            opacity: entrance,
            transform: [{
              translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }),
            }],
          },
        ]}
      >
        <View style={styles.brandRow}>
          <Image source={GATHR_GLOBE} style={styles.globe} resizeMode="contain" />
          <Image source={GATHR_WORDMARK} style={styles.wordmark} resizeMode="contain" />
        </View>

        <View style={styles.progressRow}>
          <Text style={styles.eyebrow}>QUICK TOUR</Text>
          <Text style={styles.progressText}>{stepNumber} of {totalSteps}</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${(stepNumber / totalSteps) * 100}%` }]} />
        </View>

        <Text style={styles.title} maxFontSizeMultiplier={1.35}>Find your next reason to get together.</Text>
        <Text style={styles.subtitle} maxFontSizeMultiplier={1.4}>
          A quick, hands-on tour of the Map, Events, Specials, and Profile.
        </Text>

        <View style={styles.featureList}>
          {FEATURES.map((feature) => (
            <View key={feature.text} style={styles.featureRow}>
              <View style={styles.featureIcon}>
                <Ionicons name={feature.icon} size={20} color="#168BE8" />
              </View>
              <Text style={styles.featureText} maxFontSizeMultiplier={1.35}>{feature.text}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Start GathR tour"
          activeOpacity={0.86}
          onPress={onStart}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>Start the tour</Text>
          <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Skip tutorial"
          activeOpacity={0.7}
          onPress={onSkip}
          style={styles.skipButton}
        >
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>
        <Text style={styles.duration}>About one minute</Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  stage: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    backgroundColor: 'rgba(4, 20, 35, 0.76)',
  },
  card: {
    width: '100%',
    maxWidth: 430,
    alignSelf: 'center',
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    padding: 24,
    shadowColor: '#001526',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.28,
    shadowRadius: 30,
    elevation: 24,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 22 },
  globe: { width: 56, height: 56, borderRadius: 28 },
  wordmark: { width: 132, height: 42, marginLeft: 10 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { color: '#168BE8', fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
  progressText: { color: '#607387', fontSize: 13, fontWeight: '700' },
  progressTrack: { height: 5, borderRadius: 3, backgroundColor: '#E7F2FB', marginTop: 9, marginBottom: 22, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: '#2497F3' },
  title: { color: '#0B2235', fontSize: 30, lineHeight: 35, fontWeight: '800', letterSpacing: -0.7 },
  subtitle: { color: '#5B6D7E', fontSize: 16, lineHeight: 23, marginTop: 10 },
  featureList: { marginTop: 22, marginBottom: 20, gap: 12 },
  featureRow: { flexDirection: 'row', alignItems: 'center' },
  featureIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#EAF5FE', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  featureText: { flex: 1, color: '#20394E', fontSize: 15, lineHeight: 20, fontWeight: '600' },
  primaryButton: { minHeight: 52, borderRadius: 16, backgroundColor: '#168BE8', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  skipButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  skipText: { color: '#526A7F', fontSize: 15, fontWeight: '700' },
  duration: { textAlign: 'center', color: '#8797A6', fontSize: 12, fontWeight: '600' },
});
