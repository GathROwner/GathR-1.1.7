/**
 * GathR Tutorial System - Tutorial Overlay Component
 * 
 * This component creates the dark overlay that appears during the tutorial,
 * providing the backdrop for all tutorial elements while maintaining
 * smooth animations and proper z-index layering.
 * 
 * Created: Step 2A of tutorial implementation  
 * Dependencies: React Native core, tutorial types
 * Used by: TutorialManager
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  Dimensions,
  StatusBar,
  Platform
} from 'react-native';
import { TutorialOverlayProps } from '../../types/tutorial';
import { TUTORIAL_CONFIG } from '../../config/tutorialSteps';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export const TutorialOverlay: React.FC<TutorialOverlayProps> = ({
  isVisible,
  onRequestClose,
  children
}) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isVisible) {
      // Fade in the overlay
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: TUTORIAL_CONFIG.FADE_DURATION,
        useNativeDriver: true
      }).start();
    } else {
      // Fade out the overlay
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: TUTORIAL_CONFIG.FADE_DURATION - 100, // Slightly faster fade out
        useNativeDriver: true
      }).start();
    }
  }, [isVisible, fadeAnim]);

  if (!isVisible) return null;

  return (
    <Animated.View 
      style={[
        styles.overlay, 
        { opacity: fadeAnim }
      ]}
      pointerEvents="box-none" // Allow interactions with spotlight areas
    >
      {/* Update status bar for tutorial mode */}
      <StatusBar 
        backgroundColor={TUTORIAL_CONFIG.OVERLAY_COLOR} 
        barStyle="light-content" 
        animated={true}
      />
      
      {children}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent', // REMOVE THE DARK BACKGROUND!
    zIndex: 9999,
    elevation: 9999, // Android elevation for proper layering
  },
});

/**
 * INTEGRATION NOTES:
 * 
 * 1. Z-Index Management:
 *    - Uses zIndex: 9999 to ensure tutorial appears above all other content
 *    - Uses elevation: 9999 for Android compatibility
 * 
 * 2. Pointer Events:
 *    - Uses pointerEvents="box-none" to allow spotlight interactions
 *    - Child components can override this for specific areas
 * 
 * 3. Status Bar:
 *    - Updates status bar to match overlay color during tutorial
 *    - Uses animated transitions for smooth experience
 * 
 * 4. Performance:
 *    - Uses native driver for animations
 *    - Minimal re-renders with useRef for animation values
 * 
 * 5. Platform Considerations:
 *    - Handles both iOS and Android status bar behavior
 *    - Uses elevation for Android z-index support
 */