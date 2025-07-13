/**
 * GathR Tutorial System - Unified Tutorial Sheet Component
 * 
 * This component creates consistent tutorial sheets that slide from different
 * directions based on context while maintaining identical visual design.
 * Smart positioning: slides from the side that doesn't block the content being explained.
 * 
 * Created: Unified sheet implementation
 * Dependencies: React Native core, tutorial types
 * Used by: TutorialManager
 */

import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  Platform
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { TutorialTooltipProps } from '../../types/tutorial';
import { TUTORIAL_CONFIG } from '../../config/tutorialSteps';
import { IconLegendDemo } from './TutorialDemoComponents';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface TutorialBottomSheetProps extends TutorialTooltipProps {
  stepNumber?: number;
  totalSteps?: number;
}

export const TutorialBottomSheet: React.FC<TutorialBottomSheetProps> = ({
  title,
  content,
  onNext,
  onPrevious,
  onSkip,
  showPrevious = false,
  showNext = true,
  showSkip = true,
  nextText = "Next",
  sheetPosition = 'bottom',
  stepNumber,
  totalSteps
}) => {
  const slideAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    // Animate sheet entrance - same animation for all positions
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 50,
        friction: 8
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 50,
        friction: 8
      })
    ]).start();
  }, [slideAnim, scaleAnim]);

  const getSheetStyle = () => {
    // CONSISTENT base style for all sheets
    const baseStyle = {
      transform: [{ scale: scaleAnim }]
    };

    // Handle different POSITIONS with same VISUAL DESIGN, different SLIDE DIRECTIONS
    if (typeof sheetPosition === 'number') {
      // Custom Y position - slide down from above
      return {
        ...baseStyle,
        position: 'absolute' as const,
        top: sheetPosition,
        left: 0,
        right: 0,
        transform: [
          ...baseStyle.transform,
          {
            translateY: slideAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [-100, 0] // Slide down from above
            })
          }
        ]
      };
    }

    switch (sheetPosition) {
      case 'top':
        // Slides DOWN from top - for bottom navigation tutorials
        return {
          ...baseStyle,
          position: 'absolute' as const,
          top: Platform.OS === 'ios' ? 100 : 80,
          left: 0,
          right: 0,
          transform: [
            ...baseStyle.transform,
            {
              translateY: slideAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [-150, 0] // Slide DOWN from above
              })
            }
          ]
        };
        
      case 'center':
        // Slides from center - for standalone messages
        return {
          ...baseStyle,
          position: 'absolute' as const,
          top: SCREEN_HEIGHT * 0.3,
          left: 0,
          right: 0,
          transform: [
            ...baseStyle.transform,
            {
              translateY: slideAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [50, 0] // Gentle slide from center
              })
            }
          ]
        };
        
      case 'bottom':
      default:
        // Slides UP from bottom - for top content tutorials
        return {
          ...baseStyle,
          position: 'absolute' as const,
          bottom: 90, // Above bottom navigation
          left: 0,
          right: 0,
          transform: [
            ...baseStyle.transform,
            {
              translateY: slideAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [200, 0] // Slide UP from below
              })
            }
          ]
        };
    }
  };

  // Function to render content - special case for cluster-click step
  const renderContent = () => {
    // Check if this is the cluster-click step by title
    const isClusterClickStep = title === 'Event Clusters - Tab the Marker!';
    
    if (isClusterClickStep) {
      return (
        <View style={styles.contentContainer}>
          <Text style={styles.content}>{content}</Text>
          <IconLegendDemo />
        </View>
      );
    }
    
    // Regular text content for other steps
    return (
      <View style={styles.contentContainer}>
        <Text style={styles.content}>{content}</Text>
      </View>
    );
  };

  return (
    <Animated.View style={[
      styles.sheet, // SINGLE consistent style for all
      getSheetStyle()
    ]}>
      
      {/* Header with title and step indicator - CONSISTENT layout */}
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {stepNumber && totalSteps && (
          <View style={styles.stepBadge}>
            <Text style={styles.stepText}>{stepNumber}/{totalSteps}</Text>
          </View>
        )}
      </View>
      
      {/* Content - Updated to support rich content for cluster-click step */}
      {content && renderContent()}
      
      {/* Actions - CONSISTENT button layout */}
      <View style={styles.actionContainer}>
        <View style={styles.leftActions}>
          {showSkip && (
            <TouchableOpacity style={styles.skipButton} onPress={onSkip}>
              <Text style={styles.skipText}>Skip Tutorial</Text>
            </TouchableOpacity>
          )}
        </View>
        
        <View style={styles.rightActions}>
          {showPrevious && (
            <TouchableOpacity style={styles.previousButton} onPress={onPrevious}>
              <MaterialIcons name="chevron-left" size={18} color="#666" />
              <Text style={styles.previousText}>Back</Text>
            </TouchableOpacity>
          )}
          
          {showNext && (
            <TouchableOpacity style={styles.nextButton} onPress={onNext}>
              <Text style={styles.nextText}>{nextText}</Text>
              <MaterialIcons name="chevron-right" size={18} color="#FFF" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  // SINGLE CONSISTENT SHEET STYLE - no variations
  sheet: {
  backgroundColor: '#FFFFFF',
  borderRadius: 20,
  paddingHorizontal: 14,
  paddingTop: 8,
  paddingBottom: 6,
  // Enhanced shadow for better visibility
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 16 },
  shadowOpacity: 0.25,
  shadowRadius: 40,
  elevation: 25,
  // Subtle brand accent
  borderWidth: 1,
  borderColor: 'rgba(30, 144, 255, 0.2)',
},
  
  // CONSISTENT header layout
  header: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  marginBottom: 8, // Reduced from 12 to 8
  marginTop: 0, // No progress bar, no extra space needed
},
  title: {
    fontSize: 18, // Reduced from 20 to 18
    fontWeight: '700',
    color: '#1A202C',
    flex: 1,
    lineHeight: 22, // Reduced proportionally
  },
  stepBadge: {
    backgroundColor: '#E6FFFA',
    paddingHorizontal: 10, // Reduced from 12 to 10
    paddingVertical: 3, // Reduced from 4 to 3
    borderRadius: 10, // Reduced from 12 to 10
    marginLeft: 12, // Reduced from 16 to 12
  },
  stepText: {
    color: '#0D9488',
    fontSize: 9, // Reduced from 10 to 9
    fontWeight: '600',
  },
  
  // CONSISTENT content styling
  contentContainer: {
    marginBottom: 12, // Reduced from 16 to 12
  },
  content: {
    fontSize: 14, // Reduced from 16 to 14
    lineHeight: 18, // Increased for better readability
    color: '#4A5568',
  },
  
  // CONSISTENT action button layout
  actionContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 0, // No extra margin below buttons
  },
  leftActions: {
    flex: 1,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10, // Reduced from 12 to 10
  },
  skipButton: {
    paddingVertical: 8, // Reduced from 10 to 8
    paddingHorizontal: 12, // Reduced from 14 to 12
  },
  skipText: {
    color: '#9CA3AF',
    fontSize: 12, // Reduced from 14 to 12
    fontWeight: '500',
  },
  previousButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7FAFC',
    paddingVertical: 8, // Reduced from 10 to 8
    paddingHorizontal: 12, // Reduced from 14 to 12
    borderRadius: 10, // Reduced from 12 to 10
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  previousText: {
    color: '#4A5568',
    fontSize: 12, // Reduced from 14 to 12
    fontWeight: '600',
    marginLeft: 3, // Reduced from 4 to 3
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TUTORIAL_CONFIG.PRIMARY_COLOR,
    paddingVertical: 10, // Reduced from 12 to 10
    paddingHorizontal: 16, // Reduced from 18 to 16
    borderRadius: 10, // Reduced from 12 to 10
    shadowColor: TUTORIAL_CONFIG.PRIMARY_COLOR,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  nextText: {
    color: '#FFFFFF',
    fontSize: 14, // Reduced from 16 to 14
    fontWeight: '600',
    marginRight: 3, // Reduced from 4 to 3
  },
});

/**
 * UNIFIED SHEET DESIGN PRINCIPLES:
 * 
 * ✅ CONSISTENT VISUAL DESIGN:
 *    - Same rounded corners (20px) for all sheets
 *    - Same padding (24px) for all sheets  
 *    - Same shadow and elevation for all sheets
 *    - Same typography and spacing throughout
 *    - Same button styling and layout
 * 
 * ✅ SMART CONTEXTUAL POSITIONING:
 *    - 'top': Slides DOWN from top (for bottom nav tutorials)
 *    - 'bottom': Slides UP from bottom (for top content tutorials)  
 *    - 'center': Gentle center animation (for standalone messages)
 *    - number: Custom position with slide down animation
 * 
 * ✅ MODERN UX PATTERNS:
 *    - Progress bar always visible for step tracking
 *    - Step badge always in same top-right position
 *    - Consistent button hierarchy and touch targets
 *    - Smooth spring animations for premium feel
 * 
 * 🎯 THE RESULT:
 *    Every tutorial sheet looks identical but slides from the optimal
 *    direction to avoid blocking the content being explained. This creates
 *    a consistent, professional, and intuitive tutorial experience.
 */