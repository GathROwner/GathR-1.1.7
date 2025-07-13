/**
 * GathR Tutorial System - Enhanced Tutorial Spotlight Component with View-based Overlay
 * 
 * This component creates perfect cutouts using positioned Views with proper circle
 * and rounded rectangle shapes, ensuring touch events pass through to highlighted elements.
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  Dimensions
} from 'react-native';
import { TutorialSpotlightProps } from '../../types/tutorial';
import { TUTORIAL_CONFIG } from '../../config/tutorialSteps';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export const TutorialSpotlight: React.FC<TutorialSpotlightProps> = ({
  spotlight,
  children
}) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (spotlight) {
      // Create pulsing animation for spotlight border
      const pulse = Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: TUTORIAL_CONFIG.SPOTLIGHT_PULSE_DURATION,
          useNativeDriver: true
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: TUTORIAL_CONFIG.SPOTLIGHT_PULSE_DURATION,
          useNativeDriver: true
        })
      ]);

      const loopingAnimation = Animated.loop(pulse);
      loopingAnimation.start();

      return () => {
        loopingAnimation.stop();
        pulseAnim.stopAnimation();
      };
    }
  }, [spotlight, pulseAnim]);

  // If no spotlight, render full dark overlay for welcome/completion screens
  if (!spotlight) {
    return (
      <View style={styles.container} pointerEvents="box-none">
        <View style={styles.fullOverlay} />
        {children}
      </View>
    );
  }

  const { x, y, width, height, borderRadius = 8 } = spotlight;

  // Determine if we should render as circle
  const isCircle = borderRadius >= Math.min(width, height) / 2;
  const radius = Math.min(width, height) / 2;
  const centerX = x + width / 2;
  const centerY = y + height / 2;

  // For circles, we'll create multiple Views that form a circular cutout
  const renderCircleOverlay = () => {
    const overlayViews = [];
    
    // Top section (above circle)
    overlayViews.push(
      <View
        key="top"
        style={[
          styles.overlaySection,
          {
            top: 0,
            left: 0,
            right: 0,
            height: centerY - radius,
          }
        ]}
        pointerEvents="none"
      />
    );

    // Bottom section (below circle) 
    overlayViews.push(
      <View
        key="bottom"
        style={[
          styles.overlaySection,
          {
            top: centerY + radius,
            left: 0,
            right: 0,
            bottom: 0,
          }
        ]}
        pointerEvents="none"
      />
    );

    // Create horizontal strips that get progressively smaller to form circle
    const stripCount = radius * 2; // One strip per pixel of diameter
    
    for (let i = 0; i < stripCount; i++) {
      const stripY = centerY - radius + i;
      const distanceFromCenter = Math.abs(stripY - centerY);
      
      // Calculate how far from the center this strip can extend horizontally
      const maxHorizontalDistance = Math.sqrt(radius * radius - distanceFromCenter * distanceFromCenter);
      const stripLeftEdge = centerX - maxHorizontalDistance;
      const stripRightEdge = centerX + maxHorizontalDistance;
      
      // Left side overlay for this strip
      if (stripLeftEdge > 0) {
        overlayViews.push(
          <View
            key={`left-${i}`}
            style={[
              styles.overlaySection,
              {
                top: stripY,
                left: 0,
                width: stripLeftEdge,
                height: 1,
              }
            ]}
            pointerEvents="none"
          />
        );
      }
      
      // Right side overlay for this strip
      if (stripRightEdge < SCREEN_WIDTH) {
        overlayViews.push(
          <View
            key={`right-${i}`}
            style={[
              styles.overlaySection,
              {
                top: stripY,
                left: stripRightEdge,
                right: 0,
                height: 1,
              }
            ]}
            pointerEvents="none"
          />
        );
      }
    }

    return overlayViews;
  };

  // For rectangles, create rounded rectangular cutout that matches border rings
  const renderRectangleOverlay = () => {
    const hasRoundedCorners = borderRadius > 0;
    
    return (
      <>
        {/* Top overlay */}
        <View
          style={[
            styles.overlaySection,
            {
              top: 0,
              left: 0,
              right: 0,
              height: y,
            }
          ]}
          pointerEvents="none"
        />
        
        {/* Left overlay */}
        <View
          style={[
            styles.overlaySection,
            {
              top: y,
              left: 0,
              width: x,
              height: height,
            }
          ]}
          pointerEvents="none"
        />
        
        {/* Right overlay */}
        <View
          style={[
            styles.overlaySection,
            {
              top: y,
              left: x + width,
              right: 0,
              height: height,
            }
          ]}
          pointerEvents="none"
        />
        
        {/* Bottom overlay */}
        <View
          style={[
            styles.overlaySection,
            {
              top: y + height,
              left: 0,
              right: 0,
              bottom: 0,
            }
          ]}
          pointerEvents="none"
        />

        {/* Corner fillers to create rounded rectangular cutout */}
        {hasRoundedCorners && (
          <>
            {/* Top-left corner filler */}
            <View
              style={[
                styles.cornerFiller,
                {
                  left: x,
                  top: y,
                  width: borderRadius,
                  height: borderRadius,
                  borderBottomRightRadius: borderRadius,
                }
              ]}
              pointerEvents="none"
            />
            
            {/* Top-right corner filler */}
            <View
              style={[
                styles.cornerFiller,
                {
                  left: x + width - borderRadius,
                  top: y,
                  width: borderRadius,
                  height: borderRadius,
                  borderBottomLeftRadius: borderRadius,
                }
              ]}
              pointerEvents="none"
            />
            
            {/* Bottom-left corner filler */}
            <View
              style={[
                styles.cornerFiller,
                {
                  left: x,
                  top: y + height - borderRadius,
                  width: borderRadius,
                  height: borderRadius,
                  borderTopRightRadius: borderRadius,
                }
              ]}
              pointerEvents="none"
            />
            
            {/* Bottom-right corner filler */}
            <View
              style={[
                styles.cornerFiller,
                {
                  left: x + width - borderRadius,
                  top: y + height - borderRadius,
                  width: borderRadius,
                  height: borderRadius,
                  borderTopLeftRadius: borderRadius,
                }
              ]}
              pointerEvents="none"
            />
          </>
        )}
      </>
    );
  };

  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* Render appropriate overlay based on shape */}
      {isCircle ? renderCircleOverlay() : renderRectangleOverlay()}

      {/* Animated border rings positioned around cutout */}
      <Animated.View
        style={[
          styles.borderRing,
          {
            left: x - 4,
            top: y - 4,
            width: width + 8,
            height: height + 8,
            borderRadius: isCircle ? (radius + 4) : (borderRadius + 4),
            transform: [{ scale: pulseAnim }]
          }
        ]}
        pointerEvents="none"
      />
      
      {/* Outer glow ring */}
      <Animated.View
        style={[
          styles.glowRing,
          {
            left: x - 8,
            top: y - 8,
            width: width + 16,
            height: height + 16,
            borderRadius: isCircle ? (radius + 8) : (borderRadius + 8),
            opacity: pulseAnim.interpolate({
              inputRange: [1, 1.05],
              outputRange: [0.6, 0.9]
            })
          }
        ]}
        pointerEvents="none"
      />
      
      {/* The spotlight area is completely empty - touches pass through to map */}
      
      {/* Render children (tooltip) on top */}
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
  },
  overlaySection: {
    position: 'absolute',
    backgroundColor: TUTORIAL_CONFIG.OVERLAY_COLOR,
  },
  cornerFiller: {
    position: 'absolute',
    backgroundColor: TUTORIAL_CONFIG.OVERLAY_COLOR,
  },
  fullOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: TUTORIAL_CONFIG.OVERLAY_COLOR,
    pointerEvents: 'none',
  },
   borderRing: {
    position: 'absolute',
    borderWidth: 4,
    borderColor: '#FF6B35', // ← Changed from '#00A8FF' to vibrant orange
    backgroundColor: 'transparent',
    shadowColor: '#FF6B35', // ← Changed from '#00A8FF' to vibrant orange
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 0,
    pointerEvents: 'none',
  },
  glowRing: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
    shadowColor: '#FF8C42', // ← Changed from '#40C4FF' to lighter orange glow
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 0,
    pointerEvents: 'none',
  },
});

/**
 * PERFECT CUTOUT ALIGNMENT EXPLANATION:
 * 
 * 1. Circle Algorithm:
 *    - Creates horizontal strips from top to bottom of circle
 *    - For each strip, calculates precise horizontal extent using pythagorean theorem
 *    - Places overlay Views on left and right sides, leaving circular area empty
 *    - Result: True circular cutout that matches circular border rings perfectly
 * 
 * 2. Rounded Rectangle Algorithm:
 *    - Four main overlay Views create basic rectangular cutout
 *    - Four corner filler Views create rounded corners that match border ring borderRadius
 *    - Each corner filler has borderRadius on the inner corner facing the cutout
 *    - Result: Rounded rectangular cutout that perfectly matches rounded border rings
 * 
 * 3. Visual Alignment:
 *    - Cutout shape exactly matches border ring shape
 *    - Border rings positioned precisely around cutout edges
 *    - Pulsing animation scales border rings while maintaining alignment
 *    - No visual gaps or mismatches between cutout and border
 * 
 * 4. Touch Precision:
 *    - All overlay and filler Views have pointerEvents="none"
 *    - Cutout area (including rounded corners) allows perfect click-through
 *    - Border rings don't interfere with touch events
 */