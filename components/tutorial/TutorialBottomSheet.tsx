import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TutorialTooltipProps } from '../../types/tutorial';

const GATHR_GLOBE = require('../../assets/icon.png');

interface Props extends TutorialTooltipProps {
  stepId?: string;
  stepNumber?: number;
  totalSteps?: number;
  targetUnavailable?: boolean;
}

export const TutorialBottomSheet: React.FC<Props> = ({
  stepId,
  title,
  content,
  onNext,
  onPrevious,
  onSkip,
  showPrevious = false,
  showNext = true,
  showSkip = true,
  nextText = 'Next',
  sheetPosition = 'bottom',
  stepNumber = 1,
  totalSteps = 1,
  targetUnavailable = false,
}) => {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const entrance = useRef(new Animated.Value(0)).current;
  const isCompletion = stepId === 'completion';
  const isClusterStep = stepId === 'cluster-click';
  const isCalloutStep = stepId === 'callout-venue-selector';
  const isFeedExplanation =
    stepId === 'events-list-explanation' || stepId === 'specials-list-explanation';
  const horizontalInset = Math.max(14, insets.left + 12, insets.right + 12);
  const cardWidth = Math.min(430, windowWidth - horizontalInset * 2);

  useEffect(() => {
    entrance.setValue(0);
    Animated.spring(entrance, {
      toValue: 1,
      tension: 80,
      friction: 11,
      useNativeDriver: true,
    }).start();
  }, [entrance, stepId]);

  const verticalStyle = sheetPosition === 'top'
      ? { top: Math.max(insets.top + 12, Platform.OS === 'android' ? 34 : 16) }
      : sheetPosition === 'center'
      ? { top: Math.max(insets.top + 20, windowHeight * (isCompletion ? 0.18 : 0.28)) }
      : { bottom: Math.max(insets.bottom + 76, 84) };

  return (
    <Animated.View
      accessibilityViewIsModal
      style={[
        styles.card,
        verticalStyle,
        { width: cardWidth, left: (windowWidth - cardWidth) / 2 },
        isCompletion && styles.completionCard,
        isClusterStep && styles.clusterCard,
        isCalloutStep && styles.calloutCard,
        isFeedExplanation && styles.feedExplanationCard,
        {
          opacity: entrance,
          transform: [{
            translateY: entrance.interpolate({
              inputRange: [0, 1],
              outputRange: [sheetPosition === 'top' ? -14 : 18, 0],
            }),
          }],
        },
      ]}
    >
      {isCompletion && (
        <View style={styles.completionBrand}>
          <View style={styles.completionHalo}>
            <Image source={GATHR_GLOBE} style={styles.completionLogo} resizeMode="contain" />
          </View>
          <View style={styles.readyBadge}>
            <Ionicons name="checkmark" size={16} color="#087A55" />
            <Text style={styles.readyText}>TOUR COMPLETE</Text>
          </View>
        </View>
      )}

      <View style={[
        styles.progressHeader,
        isCalloutStep && styles.calloutProgressHeader,
        isFeedExplanation && styles.feedProgressHeader,
      ]}>
        <Text style={styles.progressText}>{stepNumber} of {totalSteps}</Text>
        {showSkip && !isCompletion && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ disabled: !onSkip }}
            disabled={!onSkip}
            onPress={onSkip}
            style={[styles.headerSkip, !onSkip && styles.actionDisabled]}
          >
            <Text style={styles.headerSkipText}>Skip</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={[
        styles.progressTrack,
        isClusterStep && styles.clusterProgressTrack,
        isCalloutStep && styles.calloutProgressTrack,
        isFeedExplanation && styles.feedProgressTrack,
      ]}>
        <View style={[styles.progressFill, { width: `${(stepNumber / totalSteps) * 100}%` }]} />
      </View>

      <Text style={[
        styles.title,
        isCompletion && styles.completionTitle,
        isClusterStep && styles.clusterTitle,
        isCalloutStep && styles.calloutTitle,
        isFeedExplanation && styles.feedTitle,
      ]} maxFontSizeMultiplier={1.35}>
        {title}
      </Text>
      {!!content && (
        <Text
          style={[
            styles.content,
            isCalloutStep && styles.calloutContent,
            isFeedExplanation && styles.feedContent,
          ]}
          maxFontSizeMultiplier={1.45}
        >
          {content}
        </Text>
      )}

      {targetUnavailable && (
        <View style={[styles.fallbackNote, isCalloutStep && styles.calloutFallbackNote]}>
          <Ionicons name="information-circle-outline" size={18} color="#48667E" />
          <Text style={styles.fallbackText}>This item is still loading. You can continue and come back anytime.</Text>
        </View>
      )}

      <View style={[
        styles.actions,
        isClusterStep && styles.clusterActions,
        isCalloutStep && styles.calloutActions,
        isFeedExplanation && styles.feedActions,
      ]}>
        {showPrevious ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Previous tutorial step"
            accessibilityState={{ disabled: !onPrevious }}
            disabled={!onPrevious}
            onPress={onPrevious}
            style={[
              styles.backButton,
              isCalloutStep && styles.calloutButton,
              isFeedExplanation && styles.feedButton,
              !onPrevious && styles.actionDisabled,
            ]}
          >
            <Ionicons name="arrow-back" size={19} color="#39566E" />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        ) : <View />}

        {showNext && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={nextText}
            accessibilityState={{ disabled: !onNext }}
            activeOpacity={0.86}
            disabled={!onNext}
            onPress={onNext}
            style={[
              styles.nextButton,
              isCompletion && styles.finishButton,
              isCalloutStep && styles.calloutButton,
              isFeedExplanation && styles.feedButton,
              !onNext && styles.actionDisabled,
            ]}
          >
            <Text style={styles.nextText}>{nextText}</Text>
            <Ionicons name={isCompletion ? 'checkmark' : 'arrow-forward'} size={19} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    zIndex: 101,
    left: 14,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: 17,
    paddingBottom: 16,
    borderWidth: 1,
    borderColor: '#DCEAF5',
    shadowColor: '#001526',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.24,
    shadowRadius: 26,
    elevation: 101,
  },
  completionCard: { paddingTop: 22, paddingBottom: 20 },
  clusterCard: { paddingTop: 13, paddingBottom: 13 },
  calloutCard: { borderRadius: 20, paddingHorizontal: 18, paddingTop: 11, paddingBottom: 11 },
  feedExplanationCard: { borderRadius: 20, paddingHorizontal: 18, paddingTop: 11, paddingBottom: 11 },
  progressHeader: { minHeight: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressText: { color: '#587085', fontSize: 13, fontWeight: '800' },
  headerSkip: { minWidth: 48, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  headerSkipText: { color: '#587085', fontSize: 14, fontWeight: '700' },
  progressTrack: { height: 4, overflow: 'hidden', borderRadius: 2, backgroundColor: '#E7F2FB', marginTop: 4, marginBottom: 15 },
  clusterProgressTrack: { marginBottom: 11 },
  calloutProgressHeader: { minHeight: 21 },
  calloutProgressTrack: { marginTop: 2, marginBottom: 8 },
  feedProgressHeader: { minHeight: 21 },
  feedProgressTrack: { marginTop: 2, marginBottom: 8 },
  progressFill: { height: '100%', borderRadius: 2, backgroundColor: '#2497F3' },
  title: { color: '#0B2235', fontSize: 22, lineHeight: 27, fontWeight: '800', letterSpacing: -0.35 },
  clusterTitle: { fontSize: 21, lineHeight: 25 },
  calloutTitle: { fontSize: 19, lineHeight: 23 },
  feedTitle: { fontSize: 19, lineHeight: 23 },
  content: { color: '#50677A', fontSize: 16, lineHeight: 22, marginTop: 7 },
  calloutContent: { fontSize: 14, lineHeight: 19, marginTop: 4 },
  feedContent: { fontSize: 14, lineHeight: 19, marginTop: 4 },
  fallbackNote: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#EEF6FC', borderRadius: 12, padding: 10, marginTop: 12, gap: 8 },
  calloutFallbackNote: { paddingVertical: 8, marginTop: 8 },
  fallbackText: { flex: 1, color: '#48667E', fontSize: 13, lineHeight: 18, fontWeight: '600' },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 17, gap: 10 },
  clusterActions: { marginTop: 13 },
  calloutActions: { marginTop: 9 },
  feedActions: { marginTop: 9 },
  backButton: { minHeight: 48, minWidth: 88, borderRadius: 14, borderWidth: 1, borderColor: '#D8E5EF', backgroundColor: '#F7FAFC', flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  backText: { color: '#39566E', fontSize: 15, fontWeight: '800' },
  nextButton: { minHeight: 50, minWidth: 116, borderRadius: 15, paddingHorizontal: 18, backgroundColor: '#168BE8', flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' },
  calloutButton: { minHeight: 44 },
  feedButton: { minHeight: 44 },
  finishButton: { flex: 1, backgroundColor: '#0B9B6D' },
  nextText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  actionDisabled: { opacity: 0.58 },
  completionBrand: { alignItems: 'center', marginBottom: 10 },
  completionHalo: { width: 92, height: 92, borderRadius: 46, backgroundColor: '#E8F5FE', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  completionLogo: { width: 72, height: 72, borderRadius: 36 },
  readyBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 12, backgroundColor: '#E5F7F0', paddingHorizontal: 10, paddingVertical: 5 },
  readyText: { color: '#087A55', fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  completionTitle: { textAlign: 'center', fontSize: 25, lineHeight: 31 },
});
