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
import { TutorialFocusShimmer } from './TutorialFocusShimmer';

const GATHR_GLOBE = require('../../assets/icon.png');

interface Props extends TutorialTooltipProps {
  stepId?: string;
  staticScene?: boolean;
  stepNumber?: number;
  totalSteps?: number;
  targetUnavailable?: boolean;
}

export const TutorialBottomSheet: React.FC<Props> = ({
  stepId,
  staticScene = false,
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
  const horizontalInset = Math.max(8, insets.left + 8, insets.right + 8);
  const cardWidth = Math.min(440, windowWidth - horizontalInset * 2);

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
      ? { top: Math.max(insets.top + 8, Platform.OS === 'android' ? 30 : 12) }
      : sheetPosition === 'center'
      ? { top: Math.max(insets.top + 20, windowHeight * (isCompletion ? 0.18 : 0.28)) }
      : { bottom: Math.max(insets.bottom + 72, 80) };

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
        staticScene && styles.staticSceneCard,
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
      {!isCompletion && <View pointerEvents="none" style={styles.cardAccent} />}
      {isCompletion && <TutorialFocusShimmer borderRadius={18} />}
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
        staticScene && styles.staticSceneProgressHeader,
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
        staticScene && styles.staticSceneProgressTrack,
      ]}>
        <View style={[styles.progressFill, { width: `${(stepNumber / totalSteps) * 100}%` }]} />
      </View>

      <Text style={[
        styles.title,
        isCompletion && styles.completionTitle,
        isClusterStep && styles.clusterTitle,
        isCalloutStep && styles.calloutTitle,
        isFeedExplanation && styles.feedTitle,
        staticScene && styles.staticSceneTitle,
      ]} maxFontSizeMultiplier={1.35}>
        {title}
      </Text>
      {!!content && (
        <Text
          style={[
            styles.content,
            isCalloutStep && styles.calloutContent,
            isFeedExplanation && styles.feedContent,
            staticScene && styles.staticSceneContent,
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
        staticScene && styles.staticSceneActions,
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
              staticScene && styles.staticSceneButton,
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
              staticScene && styles.staticSceneButton,
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
    borderRadius: 18,
    backgroundColor: '#FCFEFF',
    paddingHorizontal: 14,
    paddingTop: 9,
    paddingBottom: 10,
    borderWidth: 1,
    borderColor: '#C9DFEF',
    shadowColor: '#001526',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 14,
  },
  completionCard: { paddingTop: 22, paddingBottom: 20 },
  clusterCard: { paddingTop: 9, paddingBottom: 10 },
  calloutCard: { borderRadius: 18, paddingHorizontal: 13, paddingTop: 8, paddingBottom: 9 },
  feedExplanationCard: { borderRadius: 18, paddingHorizontal: 13, paddingTop: 8, paddingBottom: 9 },
  staticSceneCard: { borderRadius: 18, paddingHorizontal: 13, paddingTop: 8, paddingBottom: 9 },
  cardAccent: {
    position: 'absolute', top: 0, left: 20, right: 20, height: 2, borderBottomLeftRadius: 2, borderBottomRightRadius: 2,
    backgroundColor: '#2497F3', opacity: 0.9,
  },
  progressHeader: { position: 'relative', minHeight: 24, flexDirection: 'row', alignItems: 'center' },
  progressText: { color: '#587085', fontSize: 13, fontWeight: '800' },
  headerSkip: {
    position: 'absolute', right: -4, top: -10, minWidth: 48, minHeight: 44,
    alignItems: 'flex-end', justifyContent: 'center',
  },
  headerSkipText: { color: '#587085', fontSize: 14, fontWeight: '700' },
  progressTrack: { height: 3, overflow: 'hidden', borderRadius: 2, backgroundColor: '#E3EFF8', marginTop: 1, marginBottom: 9 },
  clusterProgressTrack: { marginBottom: 8 },
  calloutProgressHeader: { minHeight: 22 },
  calloutProgressTrack: { marginTop: 1, marginBottom: 6 },
  feedProgressHeader: { minHeight: 22 },
  staticSceneProgressHeader: { minHeight: 22 },
  feedProgressTrack: { marginTop: 1, marginBottom: 6 },
  staticSceneProgressTrack: { marginTop: 1, marginBottom: 6 },
  progressFill: { height: '100%', borderRadius: 2, backgroundColor: '#2497F3' },
  title: { color: '#0B2235', fontSize: 20, lineHeight: 24, fontWeight: '800', letterSpacing: -0.3 },
  clusterTitle: { fontSize: 19, lineHeight: 23 },
  calloutTitle: { fontSize: 18, lineHeight: 22 },
  feedTitle: { fontSize: 18, lineHeight: 22 },
  staticSceneTitle: { fontSize: 18, lineHeight: 22 },
  content: { color: '#50677A', fontSize: 15, lineHeight: 20, marginTop: 4 },
  calloutContent: { fontSize: 13.5, lineHeight: 18, marginTop: 3 },
  feedContent: { fontSize: 13.5, lineHeight: 18, marginTop: 3 },
  staticSceneContent: { fontSize: 13.5, lineHeight: 18, marginTop: 3 },
  fallbackNote: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#EEF6FC', borderRadius: 12, padding: 10, marginTop: 12, gap: 8 },
  calloutFallbackNote: { paddingVertical: 8, marginTop: 8 },
  fallbackText: { flex: 1, color: '#48667E', fontSize: 13, lineHeight: 18, fontWeight: '600' },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 9, gap: 8 },
  clusterActions: { marginTop: 9 },
  calloutActions: { marginTop: 7 },
  feedActions: { marginTop: 7 },
  staticSceneActions: { marginTop: 7 },
  backButton: { minHeight: 44, minWidth: 82, borderRadius: 13, borderWidth: 1, borderColor: '#D8E5EF', backgroundColor: '#F7FAFC', flexDirection: 'row', gap: 5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  backText: { color: '#39566E', fontSize: 15, fontWeight: '800' },
  nextButton: {
    minHeight: 44, minWidth: 112, borderRadius: 13, paddingHorizontal: 16, backgroundColor: '#168BE8',
    flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', shadowColor: '#168BE8',
    shadowOpacity: 0.25, shadowRadius: 9, shadowOffset: { width: 0, height: 5 }, elevation: 3,
  },
  calloutButton: { minHeight: 44 },
  feedButton: { minHeight: 44 },
  staticSceneButton: { minHeight: 44 },
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
