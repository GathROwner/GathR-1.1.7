/**
 * GathR Tutorial System - Modern Welcome Screen Component
 * 
 * Modernized version with improved styling, better spacing, and contemporary design
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
import { WelcomeScreenProps } from '../../types/tutorial';
import { TUTORIAL_CONFIG } from '../../config/tutorialSteps';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onStart,
  onSkip
}) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    // Animate welcome screen entrance
    Animated.sequence([
      Animated.delay(150),
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 50,
          friction: 8
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 50,
          friction: 8
        })
      ])
    ]).start();
  }, [fadeAnim, scaleAnim, slideAnim]);

  return (
    <Animated.View 
      style={[
        styles.container,
        {
          opacity: fadeAnim,
          transform: [
            { scale: scaleAnim },
            { translateY: slideAnim }
          ]
        }
      ]}
    >
      {/* Header with modern icon and title */}
      <View style={styles.header}>
        <View style={styles.iconContainer}>
          <View style={styles.iconGradient}>
            <MaterialIcons name="explore" size={36} color="#FFFFFF" />
          </View>
        </View>
        
        <Text style={styles.title}>Welcome to GathR!</Text>
        <Text style={styles.subtitle}>
          Discover amazing local events and specials with a quick guided tour.
        </Text>
      </View>
      
      {/* Modern feature list with enhanced styling */}
      <View style={styles.featureList}>
        <FeatureItem 
          icon="location-on" 
          text="Find events near you on the map"
          color="#FF6B6B"
        />
        <FeatureItem 
          icon="restaurant" 
          text="Discover food & drink specials"
          color="#4ECDC4"
        />
        <FeatureItem 
          icon="tune" 
          text="Filter by your interests"
          color="#45B7D1"
        />
        <FeatureItem 
          icon="schedule" 
          text="See what's happening now"
          color="#FFA726"
        />
        <FeatureItem 
          icon="favorite" 
          text="Suggest your favorite venues"
          color="#AB47BC"
        />
      </View>
      
      {/* Modern action buttons */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity 
          style={styles.skipButton} 
          onPress={onSkip}
          activeOpacity={0.7}
        >
          <Text style={styles.skipButtonText}>Skip for Now</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.startButton} 
          onPress={onStart}
          activeOpacity={0.8}
        >
          <Text style={styles.startButtonText}>Start Tutorial</Text>
          <MaterialIcons name="arrow-forward" size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
      
      {/* Improved footer with better spacing */}
      <View style={styles.footer}>
        <View style={styles.durationContainer}>
          <MaterialIcons name="access-time" size={12} color="#94A3B8" />
          <Text style={styles.durationText}>About 2 minutes</Text>
        </View>
      </View>
    </Animated.View>
  );
};

// Separate component for feature items to improve reusability and styling
const FeatureItem: React.FC<{
  icon: string;
  text: string;
  color: string;
}> = ({ icon, text, color }) => (
  <View style={styles.featureItem}>
    <View style={[styles.featureIconContainer, { backgroundColor: color }]}>
      <MaterialIcons name={icon as any} size={15} color="#FFFFFF" />
    </View>
    <Text style={styles.featureText}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: '15%',
    left: 20,
    right: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.15,
    shadowRadius: 25,
    elevation: 20,
    maxHeight: SCREEN_HEIGHT * 0.68,
  },
  header: {
    alignItems: 'center',
    marginBottom: 22,
  },
  iconContainer: {
    marginBottom: 16,
  },
  iconGradient: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: TUTORIAL_CONFIG.PRIMARY_COLOR,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: TUTORIAL_CONFIG.PRIMARY_COLOR,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
    // Modern gradient effect simulation
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1F2937',
    marginBottom: 6,
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 20,
    color: '#6B7280',
    textAlign: 'center',
    fontWeight: '400',
    paddingHorizontal: 4,
  },
  featureList: {
    marginBottom: 24,
    paddingHorizontal: 2,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    paddingVertical: 1,
  },
  featureIconContainer: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  featureText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
    flex: 1,
    lineHeight: 18,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    gap: 10,
  },
  skipButton: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flex: 0.4,
  },
  skipButtonText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TUTORIAL_CONFIG.PRIMARY_COLOR,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
    shadowColor: TUTORIAL_CONFIG.PRIMARY_COLOR,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
    flex: 0.58,
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginRight: 6,
    letterSpacing: 0.2,
  },
  footer: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 2,
  },
  durationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  durationText: {
    fontSize: 12,
    color: '#64748B',
    marginLeft: 5,
    fontWeight: '500',
  },
});

/**
 * MODERN DESIGN IMPROVEMENTS:
 * 
 * 1. Compact Layout:
 *    - Reduced overall padding and margins for better space efficiency
 *    - Smaller icon sizes while maintaining visual hierarchy
 *    - Tighter spacing between elements without compromising readability
 * 
 * 2. Visual Hierarchy:
 *    - Better typography with improved weights and spacing
 *    - More sophisticated color scheme
 *    - Enhanced visual separation between sections
 * 
 * 3. Icon & Feature Styling:
 *    - Colored circular containers for feature icons
 *    - Each feature has its own accent color
 *    - Optimized sizing for compact layout
 * 
 * 4. Button Design:
 *    - Skip button has subtle background and border
 *    - Better proportional sizing with flex
 *    - Enhanced shadows with appropriate scale
 * 
 * 5. Footer Fix:
 *    - Duration text in a compact pill-shaped container
 *    - Proper sizing to prevent cutoff
 *    - Balanced padding and spacing
 * 
 * 6. Modern Touches:
 *    - Contemporary border radius
 *    - Improved shadows with multiple levels
 *    - Better color palette with grays
 *    - Letter spacing for premium feel
 * 
 * 7. Size Optimization:
 *    - More compact overall footprint
 *    - Reduced maxHeight from 75% to 68%
 *    - Tighter spacing throughout for mobile efficiency
 */