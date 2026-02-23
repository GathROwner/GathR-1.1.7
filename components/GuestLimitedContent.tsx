// ===============================================================
// FILE: GathR/components/GuestLimitedContent.tsx
// PURPOSE: Wrapper component that handles content limitations for guest users
// DESCRIPTION: This component automatically truncates content, shows lock icons,
//              and provides "register to unlock" functionality for guest users
//              while showing full content to registered users
// ===============================================================

import React, { ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ViewStyle, TextStyle } from 'react-native';
import { LockIcon } from './LockIcon';
import { useAuth } from '../contexts/AuthContext'; // Adjust import path as needed
import { DEFAULT_CONTENT_LIMITATION_CONFIG } from '../types/guestLimitations';

/**
 * Types of content that can be limited
 */
export type ContentType = 'text' | 'description' | 'title' | 'list' | 'custom';

/**
 * Props interface for the GuestLimitedContent component
 */
interface GuestLimitedContentProps {
  // Content to be limited or shown in full
  children: ReactNode;
  
  // Type of content for appropriate limitation strategy
  contentType?: ContentType;
  
  // Text-specific props (when contentType is 'text', 'description', or 'title')
  fullText?: string;                    // Full text to show to registered users
  maxLength?: number;                   // Maximum characters for guests (overrides defaults)
  
  // List-specific props (when contentType is 'list')
  itemCount?: number;                   // Total number of items in the list
  maxItems?: number;                    // Maximum items to show guests (overrides defaults)
  
  // Visual customization
  showLockIcon?: boolean;               // Whether to show lock icon (default: true)
  lockIconVariant?: 'inline' | 'badge' | 'overlay'; // Lock icon style
  truncationMessage?: string;           // Custom "register to unlock" message
  
  // Layout and styling
  containerStyle?: ViewStyle;           // Custom container styling
  truncatedStyle?: ViewStyle;           // Styling applied when content is truncated
  lockMessageStyle?: TextStyle;         // Custom lock message styling
  
  // Behavior
  onRegisterPress?: () => void;         // Custom registration handler
  showRegisterButton?: boolean;         // Whether to show register button (default: false)
  allowExpansion?: boolean;             // Whether to allow temporary expansion (default: false)
  
  // Testing and debugging
  forceLimit?: boolean;                 // Force limitation regardless of auth state (for testing)
}

/**
 * GuestLimitedContent Component
 * 
 * A versatile wrapper component that automatically handles content limitations
 * for guest users. It can truncate text, limit list items, or apply custom
 * limitations while always showing full content to authenticated users.
 * 
 * Usage Examples:
 * 
 * // Text truncation
 * <GuestLimitedContent 
 *   contentType="description" 
 *   fullText={event.description}
 *   maxLength={100}
 * >
 *   <Text>{event.description}</Text>
 * </GuestLimitedContent>
 * 
 * // List limitation
 * <GuestLimitedContent 
 *   contentType="list" 
 *   itemCount={events.length}
 *   maxItems={3}
 * >
 *   {events.map(event => <EventCard key={event.id} event={event} />)}
 * </GuestLimitedContent>
 * 
 * // Custom content with lock overlay
 * <GuestLimitedContent contentType="custom" lockIconVariant="overlay">
 *   <ComplexComponent />
 * </GuestLimitedContent>
 */
export const GuestLimitedContent: React.FC<GuestLimitedContentProps> = ({
  children,
  contentType = 'custom',
  fullText,
  maxLength,
  itemCount,
  maxItems,
  showLockIcon = true,
  lockIconVariant = 'inline',
  truncationMessage,
  containerStyle,
  truncatedStyle,
  lockMessageStyle,
  onRegisterPress,
  showRegisterButton = false,
  allowExpansion = false,
  forceLimit = false
}) => {
  
  // =============================================
  // HOOKS AND STATE
  // =============================================
  
  const { user } = useAuth();
  const [isExpanded, setIsExpanded] = React.useState(false);
  
  // Determine if content should be limited
  const isGuest = !user || forceLimit;
  const shouldLimit = isGuest && !isExpanded;
  
  // =============================================
  // CONTENT LIMITATION LOGIC
  // =============================================
  
  /**
   * Get the appropriate maximum length for text content
   */
  const getMaxLength = (): number => {
    if (maxLength !== undefined) return maxLength;
    
    const config = DEFAULT_CONTENT_LIMITATION_CONFIG;
    switch (contentType) {
      case 'title':
        return config.maxTitleLength;
      case 'description':
      case 'text':
        return config.maxDescriptionLength;
      default:
        return 100;
    }
  };
  
  /**
   * Get the appropriate maximum items for list content
   */
  const getMaxItems = (): number => {
    if (maxItems !== undefined) return maxItems;
    return DEFAULT_CONTENT_LIMITATION_CONFIG.showPreviewCount;
  };
  
  /**
   * Truncate text content for guests
   */
  const getTruncatedText = (text: string): string => {
    const maxLen = getMaxLength();
    if (text.length <= maxLen) return text;
    
    // Find the last complete word before the limit
    const truncated = text.substring(0, maxLen);
    const lastSpace = truncated.lastIndexOf(' ');
    
    if (lastSpace > maxLen * 0.8) {
      return truncated.substring(0, lastSpace) + '...';
    }
    
    return truncated + '...';
  };
  
  /**
   * Get truncation message based on content type
   */
  const getTruncationMessage = (): string => {
    if (truncationMessage) return truncationMessage;
    
    switch (contentType) {
      case 'description':
      case 'text':
        return 'Register to read more';
      case 'title':
        return 'Register to see full title';
      case 'list':
        return `Register to see all ${itemCount || 'items'}`;
      default:
        return 'Register to unlock';
    }
  };
  
  // =============================================
  // EVENT HANDLERS
  // =============================================
  
  /**
   * Handle register button press
   */
  const handleRegisterPress = () => {
    if (onRegisterPress) {
      onRegisterPress();
    } else {
      // Could trigger the registration prompt here
      console.log('[GuestLimitedContent] Register pressed - implement navigation');
    }
  };
  
  /**
   * Handle temporary expansion (if allowed)
   */
  const handleExpand = () => {
    if (allowExpansion) {
      setIsExpanded(true);
    }
  };
  
  // =============================================
  // RENDER METHODS
  // =============================================
  
  /**
   * Render lock icon with appropriate styling
   */
  const renderLockIcon = () => {
    if (!showLockIcon || !shouldLimit) return null;
    
    return (
      <LockIcon
        variant={lockIconVariant}
        showText={lockIconVariant !== 'inline'}
        text={getTruncationMessage()}
        touchable={!!onRegisterPress}
        onPress={onRegisterPress ? handleRegisterPress : undefined}
        size={lockIconVariant === 'overlay' ? 18 : 14}
      />
    );
  };
  
  /**
   * Render truncation message
   */
  const renderTruncationMessage = () => {
    if (!shouldLimit) return null;
    
    return (
      <View style={styles.truncationMessageContainer}>
        <Text style={[styles.truncationMessage, lockMessageStyle]}>
          {getTruncationMessage()}
        </Text>
        {showRegisterButton && (
          <TouchableOpacity 
            style={styles.registerButton}
            onPress={handleRegisterPress}
            activeOpacity={0.7}
          >
            <Text style={styles.registerButtonText}>Register</Text>
          </TouchableOpacity>
        )}
        {allowExpansion && (
          <TouchableOpacity 
            style={styles.expandButton}
            onPress={handleExpand}
            activeOpacity={0.7}
          >
            <Text style={styles.expandButtonText}>Show More</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };
  
  /**
   * Render text content with appropriate limitations
   */
  const renderTextContent = () => {
    if (fullText == null) {
      console.warn('[GuestLimitedContent] fullText prop required for text content types');
      return children;
    }
    
    if (!shouldLimit) {
      // Show full text for registered users
      return children;
    }
    
    // Show truncated text for guests
    const truncatedText = getTruncatedText(fullText);
    
    return (
      <View>
        <Text style={truncatedStyle}>
          {truncatedText}
        </Text>
        <View style={styles.textLockContainer}>
          {renderLockIcon()}
          {renderTruncationMessage()}
        </View>
      </View>
    );
  };
  
  /**
   * Render list content with appropriate limitations
   */
  const renderListContent = () => {
    if (!shouldLimit) {
      return children;
    }
    
    // For lists, we'd need to limit the number of children
    // This is a simplified implementation - in practice, you'd handle this
    // at the data level before passing to this component
    const maxItemsToShow = getMaxItems();
    
    return (
      <View>
        {/* Show limited content */}
        <View style={[styles.limitedContainer, truncatedStyle]}>
          {children}
        </View>
        
        {/* Show limitation indicator */}
        <View style={styles.listLockContainer}>
          {renderLockIcon()}
          {renderTruncationMessage()}
          {itemCount && itemCount > maxItemsToShow && (
            <Text style={styles.hiddenItemsText}>
              +{itemCount - maxItemsToShow} more items
            </Text>
          )}
        </View>
      </View>
    );
  };
  
  /**
   * Render custom content with overlay limitation
   */
  const renderCustomContent = () => {
    if (!shouldLimit) {
      return children;
    }
    
    return (
      <View style={styles.customContainer}>
        {/* Original content with overlay */}
        <View style={[styles.limitedContainer, truncatedStyle]}>
          {children}
        </View>
        
        {/* Lock overlay */}
        {lockIconVariant === 'overlay' && (
          <View style={styles.lockOverlay}>
            {renderLockIcon()}
          </View>
        )}
        
        {/* Bottom lock message */}
        {lockIconVariant !== 'overlay' && (
          <View style={styles.customLockContainer}>
            {renderLockIcon()}
            {renderTruncationMessage()}
          </View>
        )}
      </View>
    );
  };
  
  // =============================================
  // MAIN RENDER
  // =============================================
  
  /**
   * Render appropriate content based on type and limitation state
   */
  const renderContent = () => {
    switch (contentType) {
      case 'text':
      case 'description':
      case 'title':
        return renderTextContent();
      case 'list':
        return renderListContent();
      case 'custom':
      default:
        return renderCustomContent();
    }
  };
  
  return (
    <View style={[styles.container, containerStyle]}>
      {renderContent()}
    </View>
  );
};

// =============================================
// STYLES
// =============================================

const styles = StyleSheet.create({
  container: {
    // Base container - minimal styling
  },
  
  // Limited content container
  limitedContainer: {
    position: 'relative',
  },
  
  // Text content styles
  textLockContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  
  // List content styles
  listLockContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  
  hiddenItemsText: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
  },
  
  // Custom content styles
  customContainer: {
    position: 'relative',
  },
  
  customLockContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  
  lockOverlay: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  
  // Truncation message styles
  truncationMessageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  
  truncationMessage: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
  },
  
  // Button styles
  registerButton: {
    backgroundColor: '#4A90E2',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  
  registerButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  
  expandButton: {
    backgroundColor: 'transparent',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  
  expandButtonText: {
    color: '#4A90E2',
    fontSize: 12,
    fontWeight: '500',
  },
});

// =============================================
// UTILITY FUNCTIONS AND PRESETS
// =============================================

/**
 * Preset configurations for common use cases
 */
export const GuestLimitedContentPresets = {
  // Event description truncation
  eventDescription: {
    contentType: 'description' as ContentType,
    maxLength: 150,
    showLockIcon: true,
    lockIconVariant: 'inline' as const,
    showRegisterButton: false,
  },
  
  // Event title truncation
  eventTitle: {
    contentType: 'title' as ContentType,
    maxLength: 50,
    showLockIcon: true,
    lockIconVariant: 'inline' as const,
  },
  
  // Event list limitation
  eventList: {
    contentType: 'list' as ContentType,
    maxItems: 3,
    showLockIcon: true,
    lockIconVariant: 'badge' as const,
  },
  
  // Complex content overlay
  complexContent: {
    contentType: 'custom' as ContentType,
    showLockIcon: true,
    lockIconVariant: 'overlay' as const,
  },
};

/**
 * Helper function to create limited content with presets
 */
export const createLimitedContent = (
  preset: keyof typeof GuestLimitedContentPresets,
  children: ReactNode,
  overrides?: Partial<GuestLimitedContentProps>
): React.ReactElement => {
  const config = { ...GuestLimitedContentPresets[preset], ...overrides };
  return <GuestLimitedContent {...config}>{children}</GuestLimitedContent>;
};

export default GuestLimitedContent;