// ===============================================================
// FILE: GathR/components/RegistrationPrompt.tsx
// PURPOSE: Modal overlay component that prompts guest users to register
// DESCRIPTION: This component displays an attractive overlay with registration
//              benefits and direct access to the registration flow when users
//              hit their interaction limit
// ===============================================================

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  Dimensions,
  StatusBar,
  ScrollView,
  SafeAreaView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useGuestLimitationStore } from '../store/guestLimitationStore';
import { DEFAULT_REGISTRATION_PROMPT_CONFIG } from '../types/guestLimitations';

// Get device dimensions for responsive layout
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/**
 * Props interface for the RegistrationPrompt component
 */
interface RegistrationPromptProps {
  // Visibility control
  visible?: boolean;                    // Override visibility (optional, defaults to store state)
  
  // Content customization
  title?: string;                       // Custom title text
  subtitle?: string;                    // Custom subtitle text
  benefits?: string[];                  // Custom benefits list
  primaryButtonText?: string;           // Custom primary button text
  secondaryButtonText?: string;         // Custom secondary button text
  
  // Behavior customization
  showDismissOption?: boolean;          // Whether to show "Maybe Later" option
  backdropDismissible?: boolean;        // Whether tapping backdrop dismisses prompt
  
  // Callback overrides
  onRegisterPress?: () => void;         // Custom registration handler
  onDismiss?: () => void;               // Custom dismiss handler
  onSecondaryPress?: () => void;        // Custom secondary action handler
  
  // Visual customization
  variant?: 'default' | 'minimal' | 'premium'; // Visual style variant
}

/**
 * RegistrationPrompt Component
 * 
 * A modal overlay that encourages guest users to register for full app access.
 * Integrates with the guest limitation store and provides direct navigation
 * to the registration flow.
 * 
 * Features:
 * - Animated entrance/exit
 * - Responsive design
 * - Customizable content and styling
 * - Direct registration flow integration
 * - Analytics tracking ready
 * 
 * Usage:
 * <RegistrationPrompt /> // Uses store state automatically
 * 
 * Or with custom content:
 * <RegistrationPrompt 
 *   title="Custom Title"
 *   benefits={['Benefit 1', 'Benefit 2']}
 *   onRegisterPress={customHandler}
 * />
 */
export const RegistrationPrompt: React.FC<RegistrationPromptProps> = ({
  visible,
  title = DEFAULT_REGISTRATION_PROMPT_CONFIG.title,
  subtitle = DEFAULT_REGISTRATION_PROMPT_CONFIG.subtitle,
  benefits = DEFAULT_REGISTRATION_PROMPT_CONFIG.benefits,
  primaryButtonText = DEFAULT_REGISTRATION_PROMPT_CONFIG.primaryButtonText,
  secondaryButtonText = DEFAULT_REGISTRATION_PROMPT_CONFIG.secondaryButtonText,
  showDismissOption = DEFAULT_REGISTRATION_PROMPT_CONFIG.showDismissOption,
  backdropDismissible = true,
  onRegisterPress,
  onDismiss,
  onSecondaryPress,
  variant = 'default'
}) => {
  
  // =============================================
  // HOOKS AND STATE
  // =============================================
  
  const router = useRouter();
  const guestStore = useGuestLimitationStore();
  
  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  
  // Determine visibility from props or store
  const isVisible = visible !== undefined ? visible : guestStore.isPromptVisible;
  
  // =============================================
  // ANIMATION EFFECTS
  // =============================================
  
  useEffect(() => {
    if (isVisible) {
      // Animate in
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Animate out
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 50,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.9,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isVisible, fadeAnim, slideAnim, scaleAnim]);
  
  // =============================================
  // EVENT HANDLERS
  // =============================================
  
  /**
   * Handle registration button press
   * Takes user directly to registration screen
   */
  const handleRegisterPress = () => {
    console.log('[RegistrationPrompt] Register button pressed');
    
    if (onRegisterPress) {
      onRegisterPress();
    } else {
      // Navigate directly to registration screen (index.tsx)
      router.push('/');
    }
    
    // Hide the prompt
    handleDismiss();
    
    // Track registration attempt for analytics
    // TODO: Add analytics tracking here
  };
  
  /**
   * Handle prompt dismissal
   * Hides the prompt and resets interaction counter
   */
  const handleDismiss = () => {
    console.log('[RegistrationPrompt] Prompt dismissed');
    
    if (onDismiss) {
      onDismiss();
    } else {
      guestStore.hidePrompt();
    }
    
    // Track dismissal for analytics
    // TODO: Add analytics tracking here
  };
  
  /**
   * Handle secondary button press (e.g., "Maybe Later")
   */
  const handleSecondaryPress = () => {
    console.log('[RegistrationPrompt] Secondary button pressed');
    
    if (onSecondaryPress) {
      onSecondaryPress();
    } else {
      handleDismiss();
    }
  };
  
  /**
   * Handle backdrop press
   */
  const handleBackdropPress = () => {
    if (backdropDismissible) {
      handleDismiss();
    }
  };
  
  // =============================================
  // RENDER METHODS
  // =============================================
  
  /**
   * Render the benefits list
   */
  const renderBenefits = () => (
    <View style={styles.benefitsContainer}>
      {benefits.map((benefit, index) => (
        <View key={index} style={styles.benefitItem}>
          <Ionicons 
            name="checkmark-circle" 
            size={20} 
            color="#4A90E2" 
            style={styles.benefitIcon}
          />
          <Text style={styles.benefitText}>{benefit}</Text>
        </View>
      ))}
    </View>
  );
  
  /**
   * Render the action buttons
   */
  const renderButtons = () => (
    <View style={styles.buttonContainer}>
      {/* Primary Registration Button */}
      <TouchableOpacity 
        style={[styles.primaryButton, styles[`${variant}PrimaryButton`]]}
        onPress={handleRegisterPress}
        activeOpacity={0.8}
      >
        <Text style={[styles.primaryButtonText, styles[`${variant}PrimaryButtonText`]]}>
          {primaryButtonText}
        </Text>
        <Ionicons 
          name="arrow-forward" 
          size={20} 
          color="#fff" 
          style={styles.buttonIcon}
        />
      </TouchableOpacity>
      
      {/* Secondary Button (if enabled) */}
      {showDismissOption && secondaryButtonText && (
        <TouchableOpacity 
          style={[styles.secondaryButton, styles[`${variant}SecondaryButton`]]}
          onPress={handleSecondaryPress}
          activeOpacity={0.6}
        >
          <Text style={[styles.secondaryButtonText, styles[`${variant}SecondaryButtonText`]]}>
            {secondaryButtonText}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
  
  /**
   * Render the main prompt content
   */
  const renderContent = () => (
    <Animated.View 
      style={[
        styles.promptContainer,
        styles[`${variant}PromptContainer`],
        {
          opacity: fadeAnim,
          transform: [
            { translateY: slideAnim },
            { scale: scaleAnim }
          ]
        }
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, styles[`${variant}Title`]]}>
          {title}
        </Text>
        <Text style={[styles.subtitle, styles[`${variant}Subtitle`]]}>
          {subtitle}
        </Text>
      </View>
      
      {/* Benefits Section */}
      <ScrollView 
        style={styles.benefitsScrollContainer}
        showsVerticalScrollIndicator={false}
      >
        {renderBenefits()}
      </ScrollView>
      
      {/* Action Buttons */}
      {renderButtons()}
      
      {/* Close Button (X) */}
      {backdropDismissible && (
        <TouchableOpacity 
          style={styles.closeButton}
          onPress={handleDismiss}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="close" size={24} color="#666" />
        </TouchableOpacity>
      )}
    </Animated.View>
  );
  
  // =============================================
  // MAIN RENDER
  // =============================================
  
  return (
    <Modal
      visible={isVisible}
      transparent={true}
      animationType="none" // We handle animation manually
      statusBarTranslucent={true}
      onRequestClose={handleDismiss}
    >
      <SafeAreaView style={styles.modalContainer}>
        <StatusBar backgroundColor="rgba(0, 0, 0, 0.5)" barStyle="light-content" />
        
        {/* Backdrop */}
        <TouchableOpacity 
          style={styles.backdrop}
          activeOpacity={1}
          onPress={handleBackdropPress}
        >
          <Animated.View 
            style={[
              styles.backdropOverlay,
              { opacity: fadeAnim }
            ]} 
          />
        </TouchableOpacity>
        
        {/* Prompt Content */}
        <View style={styles.contentContainer}>
          {renderContent()}
        </View>
      </SafeAreaView>
    </Modal>
  );
};

// =============================================
// STYLES
// =============================================

const styles = StyleSheet.create({
  // Modal container
  modalContainer: {
    flex: 1,
  },
  
  // Backdrop
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  
  backdropOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  
  // Content positioning
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  
  // Main prompt container
  promptContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    maxHeight: SCREEN_HEIGHT * 0.8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 16,
  },
  
  // Header section
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
  },
  
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
  },
  
  // Benefits section
  benefitsScrollContainer: {
    maxHeight: 200,
    marginBottom: 24,
  },
  
  benefitsContainer: {
    paddingVertical: 8,
  },
  
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  
  benefitIcon: {
    marginRight: 12,
  },
  
  benefitText: {
    fontSize: 16,
    color: '#444',
    flex: 1,
    lineHeight: 22,
  },
  
  // Button section
  buttonContainer: {
    gap: 12,
  },
  
  primaryButton: {
    backgroundColor: '#4A90E2',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4A90E2',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  
  primaryButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginRight: 8,
  },
  
  secondaryButton: {
    backgroundColor: 'transparent',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  secondaryButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '500',
  },
  
  buttonIcon: {
    marginLeft: 4,
  },
  
  // Close button
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 8,
  },
  
  // =============================================
  // VARIANT STYLES
  // =============================================
  
  // Default variant (already defined above)
  defaultPromptContainer: {},
  defaultTitle: {},
  defaultSubtitle: {},
  defaultPrimaryButton: {},
  defaultPrimaryButtonText: {},
  defaultSecondaryButton: {},
  defaultSecondaryButtonText: {},
  
  // Minimal variant
  minimalPromptContainer: {
    padding: 20,
    borderRadius: 12,
  },
  
  minimalTitle: {
    fontSize: 20,
  },
  
  minimalSubtitle: {
    fontSize: 14,
  },
  
  minimalPrimaryButton: {
    paddingVertical: 12,
  },
  
  minimalPrimaryButtonText: {
    fontSize: 16,
  },
  
  minimalSecondaryButton: {
    paddingVertical: 8,
  },
  
  minimalSecondaryButtonText: {
    fontSize: 14,
  },
  
  // Premium variant
  premiumPromptContainer: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  
  premiumTitle: {
    color: '#4A90E2',
  },
  
  premiumSubtitle: {
    color: '#555',
    fontSize: 15,
  },
  
  premiumPrimaryButton: {
    backgroundColor: '#007bff',
    shadowColor: '#007bff',
  },
  
  premiumPrimaryButtonText: {
    fontSize: 18,
    fontWeight: '700',
  },
  
  premiumSecondaryButton: {
    borderWidth: 1,
    borderColor: '#dee2e6',
  },
  
  premiumSecondaryButtonText: {
    color: '#495057',
  },
});

export default RegistrationPrompt;