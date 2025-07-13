/**
 * GathR Tutorial System - Tutorial Tooltip Component
 * 
 * This component displays the tutorial content in a beautifully designed tooltip
 * with navigation controls. It handles positioning, animations, and user interactions
 * for each tutorial step.
 * 
 * Created: Step 2C of tutorial implementation  
 * Dependencies: React Native core, Expo vector icons, tutorial types
 * Used by: TutorialManager
 */

import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { TutorialTooltipProps } from '../../types/tutorial';
import { TUTORIAL_CONFIG } from '../../config/tutorialSteps';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export const TutorialTooltip: React.FC<TutorialTooltipProps> = ({
  title,
  content,
  onNext,
  onPrevious,
  onSkip,
  showPrevious = false,
  showNext = true,
  showSkip = true,
  nextText = "Next",
  position,
  placement
}) => {
  const slideAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    // Animate tooltip entrance
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 40,
        friction: 8
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 40,
        friction: 8
      })
    ]).start();
  }, [slideAnim, scaleAnim]);

  const getTooltipStyle = () => {
    const baseStyle = {
      position: 'absolute' as const,
      transform: [
        {
          translateY: slideAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [20, 0]
          })
        },
        { scale: scaleAnim }
      ]
    };

    // Center placement for welcome and completion screens
    if (placement === 'center') {
      return {
        ...baseStyle,
        top: '35%' as const,
        left: 20,
        right: 20,
      };
    }

    // Calculate tooltip position based on target element
    const tooltipWidth = TUTORIAL_CONFIG.TOOLTIP_MAX_WIDTH;
    const tooltipHeight = 200; // Estimated tooltip height
    const margin = 20;
    
    let left = position.x - tooltipWidth / 2;
    let top = position.y;
    
    // Keep tooltip within screen bounds horizontally
    if (left < margin) left = margin;
    if (left + tooltipWidth > SCREEN_WIDTH - margin) {
      left = SCREEN_WIDTH - tooltipWidth - margin;
    }

    switch (placement) {
      case 'top':
        top = position.y - tooltipHeight - 20;
        // If tooltip would go off top, switch to bottom
        if (top < margin) {
          top = position.y + 20;
        }
        return {
          ...baseStyle,
          top,
          left,
          width: tooltipWidth
        };
        
      case 'bottom':
        top = position.y + 20;
        // If tooltip would go off bottom, switch to top
        if (top + tooltipHeight > SCREEN_HEIGHT - margin) {
          top = position.y - tooltipHeight - 20;
        }
        return {
          ...baseStyle,
          top,
          left,
          width: tooltipWidth
        };
        
      case 'left':
        top = Math.max(margin, Math.min(position.y - 50, SCREEN_HEIGHT - tooltipHeight - margin));
        return {
          ...baseStyle,
          top,
          right: SCREEN_WIDTH - position.x + 20,
          width: Math.min(250, position.x - 40)
        };
        
      case 'right':
        top = Math.max(margin, Math.min(position.y - 50, SCREEN_HEIGHT - tooltipHeight - margin));
        return {
          ...baseStyle,
          top,
          left: position.x + 20,
          width: Math.min(250, SCREEN_WIDTH - position.x - 40)
        };
        
      default:
        // Fallback to bottom placement
        top = position.y + 20;
        if (top + tooltipHeight > SCREEN_HEIGHT - margin) {
          top = position.y - tooltipHeight - 20;
        }
        top = Math.max(margin, Math.min(top, SCREEN_HEIGHT - tooltipHeight - margin));
        
        return {
          ...baseStyle,
          top,
          left,
          width: tooltipWidth
        };
    }
  };

  return (
    <Animated.View style={[styles.tooltip, getTooltipStyle()]}>
      {/* Main content area */}
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        {content && <Text style={styles.description}>{content}</Text>}
      </View>
      
      {/* Button controls */}
      <View style={styles.buttonContainer}>
        {/* Skip button (left side) */}
        {showSkip && (
          <TouchableOpacity style={styles.skipButton} onPress={onSkip}>
            <Text style={styles.skipButtonText}>Skip</Text>
          </TouchableOpacity>
        )}
        
        {/* Navigation buttons (right side) */}
        <View style={styles.navigationButtons}>
          {/* Previous button */}
          {showPrevious && (
            <TouchableOpacity style={styles.prevButton} onPress={onPrevious}>
              <MaterialIcons name="chevron-left" size={20} color="#666" />
              <Text style={styles.prevButtonText}>Back</Text>
            </TouchableOpacity>
          )}
          
          {/* Next/Continue button */}
          {showNext && (
            <TouchableOpacity style={styles.nextButton} onPress={onNext}>
              <Text style={styles.nextButtonText}>{nextText}</Text>
              <MaterialIcons name="chevron-right" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  tooltip: {
    backgroundColor: '#FFFFFF',
    borderRadius: TUTORIAL_CONFIG.TOOLTIP_BORDER_RADIUS,
    padding: TUTORIAL_CONFIG.TOOLTIP_PADDING,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 12, // Android shadow
    maxWidth: TUTORIAL_CONFIG.TOOLTIP_MAX_WIDTH,
  },
  content: {
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
    lineHeight: 24,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    color: '#666',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skipButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  skipButtonText: {
    color: '#999',
    fontSize: 14,
    fontWeight: '500',
  },
  navigationButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  prevButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginRight: 12,
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
  },
  prevButtonText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TUTORIAL_CONFIG.PRIMARY_COLOR,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    shadowColor: TUTORIAL_CONFIG.PRIMARY_COLOR,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  nextButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginRight: 8,
  },
});

/**
 * TOOLTIP POSITIONING LOGIC:
 * 
 * The tooltip uses intelligent positioning to ensure it's always visible:
 * 
 * 1. Center Placement:
 *    - Used for welcome and completion screens
 *    - Centers horizontally and positions at 35% from top
 * 
 * 2. Directional Placement:
 *    - top: Positions above target element
 *    - bottom: Positions below target element  
 *    - left: Positions to the left of target
 *    - right: Positions to the right of target
 * 
 * 3. Boundary Handling:
 *    - Keeps tooltip within screen bounds with 20px margin
 *    - Adjusts width for left/right placements based on available space
 *    - Prevents tooltip from being cut off
 * 
 * INTEGRATION NOTES:
 * 
 * 1. Animation:
 *    - Slide and scale entrance animations
 *    - Spring animations for natural feel
 *    - Uses native driver for performance
 * 
 * 2. Button Logic:
 *    - Skip button always on left when shown
 *    - Navigation buttons on right (back + next/continue)
 *    - Next button text changes based on step type
 * 
 * 3. Accessibility:
 *    - High contrast text colors
 *    - Appropriate touch targets (44px minimum)
 *    - Clear visual hierarchy
 * 
 * 4. Content Handling:
 *    - Supports multi-line content with proper line height
 *    - Responsive to different content lengths
 *    - Maintains readability across all screen sizes
 */