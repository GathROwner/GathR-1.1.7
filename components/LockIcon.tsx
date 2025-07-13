// ===============================================================
// FILE: GathR/components/LockIcon.tsx
// PURPOSE: Visual indicator component for content limited to guest users
// DESCRIPTION: A simple lock icon component that appears next to truncated
//              content to indicate that registration is required for full access
// ===============================================================

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ViewStyle, TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * Props interface for the LockIcon component
 */
interface LockIconProps {
  // Visual customization
  size?: number;                    // Size of the lock icon (default: 16)
  color?: string;                   // Color of the lock icon (default: '#666')
  showText?: boolean;               // Whether to show "Register to unlock" text (default: false)
  text?: string;                    // Custom text to display (default: "Register to unlock")
  
  // Layout and styling
  style?: ViewStyle;                // Custom container style
  iconStyle?: ViewStyle;            // Custom icon container style
  textStyle?: TextStyle;            // Custom text style
  orientation?: 'horizontal' | 'vertical'; // Layout orientation (default: 'horizontal')
  
  // Interaction
  onPress?: () => void;             // Optional callback when pressed
  touchable?: boolean;              // Whether the component is touchable (default: false)
  
  // Context-specific variants
  variant?: 'inline' | 'badge' | 'overlay'; // Different visual styles
}

/**
 * LockIcon Component
 * 
 * A reusable component that displays a lock icon to indicate limited content.
 * Can be customized for different contexts (inline text, badges, overlays, etc.)
 * 
 * Usage Examples:
 * 
 * // Simple inline lock icon
 * <LockIcon size={14} color="#999" />
 * 
 * // Lock icon with text
 * <LockIcon showText={true} text="Register to unlock full details" />
 * 
 * // Touchable lock icon that triggers registration
 * <LockIcon touchable={true} onPress={handleRegisterPress} />
 * 
 * // Badge-style lock icon for prominent display
 * <LockIcon variant="badge" showText={true} />
 */
export const LockIcon: React.FC<LockIconProps> = ({
  size = 16,
  color = '#666',
  showText = false,
  text = 'Register to unlock',
  style,
  iconStyle,
  textStyle,
  orientation = 'horizontal',
  onPress,
  touchable = false,
  variant = 'inline'
}) => {
  
  // Determine if component should be touchable
  const isInteractive = touchable && onPress;
  
  // Get styles based on variant
  const containerStyle = [
    styles.container,
    styles[`${variant}Container`],
    orientation === 'vertical' && styles.verticalContainer,
    isInteractive && styles.touchableContainer,
    style
  ];
  
  const iconContainerStyle = [
    styles.iconContainer,
    styles[`${variant}IconContainer`],
    iconStyle
  ];
  
  const textElementStyle = [
    styles.text,
    styles[`${variant}Text`],
    { color },
    textStyle
  ];
  
  /**
   * Render the lock icon
   */
  const renderIcon = () => (
    <View style={iconContainerStyle}>
      <Ionicons 
        name="lock-closed" 
        size={size} 
        color={color}
      />
    </View>
  );
  
  /**
   * Render the text (if enabled)
   */
  const renderText = () => {
    if (!showText) return null;
    
    return (
      <Text style={textElementStyle} numberOfLines={1}>
        {text}
      </Text>
    );
  };
  
  /**
   * Render the complete component content
   */
  const renderContent = () => (
    <View style={containerStyle}>
      {renderIcon()}
      {renderText()}
    </View>
  );
  
  // Return touchable or non-touchable version based on props
  if (isInteractive) {
    return (
      <TouchableOpacity 
        onPress={onPress}
        style={styles.touchableWrapper}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        {renderContent()}
      </TouchableOpacity>
    );
  }
  
  return renderContent();
};

// =============================================
// STYLES
// =============================================

const styles = StyleSheet.create({
  // Base container styles
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  
  verticalContainer: {
    flexDirection: 'column',
    alignItems: 'center',
  },
  
  touchableContainer: {
    // Add visual feedback for touchable state
  },
  
  touchableWrapper: {
    // Wrapper for TouchableOpacity
  },
  
  // Icon container styles
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  // Text styles
  text: {
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 4,
  },
  
  // =============================================
  // VARIANT-SPECIFIC STYLES
  // =============================================
  
  // Inline variant - for use within text or small spaces
  inlineContainer: {
    paddingHorizontal: 2,
    paddingVertical: 1,
  },
  
  inlineIconContainer: {
    // Minimal padding for inline use
  },
  
  inlineText: {
    fontSize: 11,
    fontWeight: '400',
    opacity: 0.8,
  },
  
  // Badge variant - for prominent display
  badgeContainer: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  
  badgeIconContainer: {
    marginRight: 4,
  },
  
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#555',
  },
  
  // Overlay variant - for overlaying content
  overlayContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    position: 'absolute',
    bottom: 8,
    right: 8,
  },
  
  overlayIconContainer: {
    marginRight: 6,
  },
  
  overlayText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
});

// =============================================
// PRESET CONFIGURATIONS
// =============================================

/**
 * Preset configurations for common use cases
 * These can be imported and used directly in components
 */
export const LockIconPresets = {
  // For use in event card descriptions
  eventDescription: {
    size: 14,
    color: '#666',
    showText: true,
    text: 'Register to read more',
    variant: 'inline' as const
  },
  
  // For use in list item titles
  listTitle: {
    size: 12,
    color: '#999',
    showText: false,
    variant: 'inline' as const
  },
  
  // For use as a prominent badge
  prominentBadge: {
    size: 16,
    color: '#4A90E2',
    showText: true,
    text: 'Register to unlock',
    variant: 'badge' as const,
    touchable: true
  },
  
  // For use in map cluster overlays
  mapOverlay: {
    size: 18,
    color: '#fff',
    showText: true,
    text: 'Register for details',
    variant: 'overlay' as const
  },
  
  // For use in filter sections
  filterLock: {
    size: 14,
    color: '#666',
    showText: true,
    text: 'Premium filter',
    variant: 'badge' as const
  }
};

// =============================================
// UTILITY FUNCTIONS
// =============================================

/**
 * Create a lock icon with preset configuration
 * @param preset - The preset configuration to use
 * @param overrides - Any properties to override from the preset
 * @returns JSX.Element
 */
export const createLockIcon = (
  preset: keyof typeof LockIconPresets, 
  overrides?: Partial<LockIconProps>
): React.ReactElement => {
  const config = { ...LockIconPresets[preset], ...overrides };
  return <LockIcon {...config} />;
};

/**
 * Hook to determine if a lock icon should be shown
 * This integrates with the guest limitation system
 */
export const useShouldShowLockIcon = (): boolean => {
  // This would integrate with your auth system and guest limitation store
  // For now, return true for guest users
  return true; // Replace with actual guest mode check
};

export default LockIcon;