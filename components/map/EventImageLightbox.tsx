import React, { useState, useRef } from 'react';
import {
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ScrollView, 
  Dimensions,
  Share,
  Linking,
  Platform,
  Alert,
  Animated,
  PanResponder
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import ImageView from "react-native-image-viewing";
import FallbackImage from '../common/FallbackImage';
import Autolink from 'react-native-autolink';

import type { Event } from '../../types/events';
import { addToCalendar } from '../../utils/calendarUtils';
import {
  formatEventDateTime,
  combineDateAndTime,
  getEventTimeStatus
} from '../../utils/dateUtils';

// ===============================================================
// GUEST LIMITATION IMPORTS
// ===============================================================
import { useAuth } from '../../contexts/AuthContext';
import { useGuestInteraction } from '../../hooks/useGuestInteraction';
import { InteractionType } from '../../types/guestLimitations';
import { GuestLimitedContent } from '../GuestLimitedContent';
import { LockIcon } from '../LockIcon';
import { RegistrationPrompt } from '../RegistrationPrompt';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Helper function to get color for event category
const getCategoryColor = (category: string): string => {
  switch (category.toLowerCase()) {
    case 'live music': return '#E94E77';
    case 'comedy show': return '#F1984D';
    case 'cabaret': return '#7B68EE';
    case 'sports': return '#4CAF50';
    case 'meeting': return '#2196F3';
    default: return '#757575';
  }
};

// Helper function to validate a ticket URL
const isValidTicketUrl = (url?: string): boolean => {
  return Boolean(url && url !== "N/A" && url !== "" && url.includes("http"));
};

// Helper function to check if an event is paid
const isPaidEvent = (price?: string): boolean => {
  return Boolean(
    price && 
    price !== "N/A" && 
    price !== "0" && 
    !price.toLowerCase().includes("free")
  );
};

interface EventImageLightboxProps {
  imageUrl: string;
  event: Event;
  onClose: () => void;
}

const EventImageLightbox: React.FC<EventImageLightboxProps> = ({
  imageUrl,
  event,
  onClose
}) => {
  // ===============================================================
  // GUEST LIMITATION SETUP
  // ===============================================================
  const { user } = useAuth();
  const isGuest = !user;
  const { trackInteraction } = useGuestInteraction();

  // ===============================================================
  // EXISTING STATE (keep all existing state)
  // ===============================================================
  
  // State for full-screen image viewer
  const [isImageViewerVisible, setIsImageViewerVisible] = useState(false);
  
  // State to prevent gesture conflicts when image viewer closes
  const [justClosedImageViewer, setJustClosedImageViewer] = useState(false);
  
  // Animation values for swipe-to-close
  const translateY = useRef(new Animated.Value(0)).current;
  const backgroundOpacity = useRef(new Animated.Value(1)).current;
  
  // Swipe-to-close constants
  const SWIPE_THRESHOLD = 150; // Distance threshold to trigger close
  const VELOCITY_THRESHOLD = 0.5; // Velocity threshold to trigger close
  
  // Pan responder for swipe gestures
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !isImageViewerVisible && !justClosedImageViewer, // Don't intercept when image viewer is open or just closed
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only respond to vertical swipes and ignore when image viewer is open or just closed
        const isVerticalSwipe = Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
        return isVerticalSwipe && Math.abs(gestureState.dy) > 10 && !isImageViewerVisible && !justClosedImageViewer;
      },
      onPanResponderGrant: () => {
        // Start gesture - stop any ongoing animations
        translateY.stopAnimation();
        translateY.extractOffset();
      },
      onPanResponderMove: (_, gestureState) => {
        // Only allow downward swipes (positive dy)
        const newTranslateY = Math.max(0, gestureState.dy);
        translateY.setValue(newTranslateY);
        
        // Adjust background opacity based on swipe distance
        const progress = Math.min(newTranslateY / SWIPE_THRESHOLD, 1);
        const newOpacity = 1 - (progress * 0.7); // Fade to 30% opacity
        backgroundOpacity.setValue(newOpacity);
      },
      onPanResponderRelease: (_, gestureState) => {
        translateY.flattenOffset();
        
        const { dy, vy } = gestureState;
        
        // Determine if we should close or snap back
        const shouldClose = dy > SWIPE_THRESHOLD || vy > VELOCITY_THRESHOLD;
        
        if (shouldClose) {
          // Animate out and close
          Animated.parallel([
            Animated.timing(translateY, {
              toValue: SCREEN_HEIGHT,
              duration: 300,
              useNativeDriver: true,
            }),
            Animated.timing(backgroundOpacity, {
              toValue: 0,
              duration: 300,
              useNativeDriver: true,
            }),
          ]).start(() => {
            onClose(); // NOTE: This doesn't track interaction - swipe to close
          });
        } else {
          // Snap back to original position
          Animated.parallel([
            Animated.spring(translateY, {
              toValue: 0,
              useNativeDriver: true,
              tension: 100,
              friction: 8,
            }),
            Animated.timing(backgroundOpacity, {
              toValue: 1,
              duration: 200,
              useNativeDriver: true,
            }),
          ]).start();
        }
      },
    })
  ).current;
  
  // Check if there's a valid ticket URL
  const hasTicketLink = isValidTicketUrl(event.ticketLinkEvents) || 
                        isValidTicketUrl(event.ticketLinkPosts);
  
  // Determine if it's a paid event
  const paid = isPaidEvent(event.ticketPrice);

  // ===============================================================
  // GUEST LIMITATION INTERACTION HANDLERS
  // ===============================================================

  /**
   * Handle image tap to full-screen with guest limitation tracking
   */
  const handleImagePress = () => {
    console.log(`[GuestLimitation] Image tap to full-screen: ${event.title}`);
    
    // Track image tap interaction for guests
    if (isGuest && !trackInteraction(InteractionType.CLUSTER_ITEM_CLICK)) {
      console.log('[GuestLimitation] Image tap interaction blocked - allowing action but prompt should show');
      // Still allow the full-screen image view - the prompt will show over it
    }
    
    // Proceed with opening full-screen viewer
    setIsImageViewerVisible(true);
  };

  /**
   * Handle share - BLOCKED for guests (premium feature)
   */
  const handleShare = async () => {
    if (isGuest) {
      console.log('[GuestLimitation] Share blocked - premium feature for registered users only');
      return; // Always block for guests
    }
    
    // Proceed with share for registered users
    try {
      await Share.share({
        message: `Check out ${event.title} at ${event.venue} on ${formatEventDateTime(event.startDate, event.startTime)}. ${event.description}`,
        title: event.title,
      });
    } catch (error) {
      console.error('Error sharing event', error);
    }
  };
  
  /**
   * Handle add to calendar - BLOCKED for guests (premium feature)
   */
  const handleAddToCalendar = async () => {
    if (isGuest) {
      console.log('[GuestLimitation] Calendar blocked - premium feature for registered users only');
      return; // Always block for guests
    }
    
    // Proceed with adding to calendar for registered users
    try {
      await addToCalendar({
        title: event.title,
        startDate: combineDateAndTime(event.startDate, event.startTime),
        endDate: combineDateAndTime(event.endDate || event.startDate, event.endTime || '11:59 PM'),
        location: `${event.venue}, ${event.address}`,
        notes: event.description
      });
    } catch (error) {
      console.error('Failed to add event to calendar', error);
    }
  };
  
  /**
   * Handle directions - BLOCKED for guests (premium feature)
   */
  const handleDirections = () => {
    if (isGuest) {
      console.log('[GuestLimitation] Directions blocked - premium feature for registered users only');
      return; // Always block for guests
    }
    
    // Proceed with getting directions for registered users
    const destination = encodeURIComponent(`${event.venue}, ${event.address}`);
    const url = Platform.select({
      ios: `maps:?q=${destination}`,
      android: `geo:0,0?q=${destination}`
    });
    
    if (url) {
      Linking.openURL(url);
    }
  };

  /**
   * Handle ticket purchase - BLOCKED for guests (premium feature)
   */
  const handleTickets = () => {
    if (isGuest) {
      console.log('[GuestLimitation] Tickets blocked - premium feature for registered users only');
      return; // Always block for guests
    }
    
    // Proceed with ticket purchase for registered users
    // Check ticketLinkEvents first, then fall back to ticketLinkPosts
    const ticketUrl = event.ticketLinkEvents || event.ticketLinkPosts;
    
    // Only open URL if it's a valid URL (not empty, not "N/A")
    if (isValidTicketUrl(ticketUrl)) {
      Linking.openURL(ticketUrl);
    }
  };

  // ===============================================================
  // NON-TRACKED CLOSE HANDLERS (don't track interactions)
  // ===============================================================

  /**
   * Handle close button press - NO interaction tracking
   */
  const handleCloseButton = () => {
    console.log('[GuestLimitation] Close button pressed - no interaction tracking');
    onClose(); // Direct close, no tracking
  };

  /**
   * Handle background tap to close - NO interaction tracking  
   */
  const handleBackgroundClose = () => {
    console.log('[GuestLimitation] Background tap to close - no interaction tracking');
    onClose(); // Direct close, no tracking
  };

  /**
   * Handle full-screen image viewer close - NO interaction tracking
   */
  const handleImageViewerClose = () => {
    console.log('[GuestLimitation] Full-screen image viewer closed - no interaction tracking');
    setIsImageViewerVisible(false);
    // Set cooldown flag to prevent gesture conflicts
    setJustClosedImageViewer(true);
    setTimeout(() => {
      setJustClosedImageViewer(false);
    }, 500); // 500ms cooldown
    // NOTE: No interaction tracking for closing full-screen viewer
  };

  // Determine time status
  const timeStatus = getEventTimeStatus(event);
  const isHappeningNow = timeStatus === 'now';

  // Prepare images array for the image viewer
  const images = [
    {
      uri: imageUrl,
    },
  ];

  return (
    <View 
      style={styles.container} 
      {...(!isImageViewerVisible && !justClosedImageViewer ? panResponder.panHandlers : {})}
    >
      {/* Background overlay */}
      <Animated.View
        style={[styles.backgroundOverlay, { opacity: backgroundOpacity }]}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={handleBackgroundClose} // Use non-tracking handler
        />
      </Animated.View>
      
      {/* Content container */}
      <Animated.View 
        style={[
          styles.contentContainer,
          { transform: [{ translateY: translateY }] }
        ]}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTextContainer}>
            <Text style={styles.title} numberOfLines={1}>{event.title}</Text>
            <Text style={styles.subtitle}>{event.venue}</Text>
          </View>
          <TouchableOpacity style={styles.closeButton} onPress={handleCloseButton}>
            <MaterialIcons name="close" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
        
        {/* Tappable Image with FallbackImage */}
        <TouchableOpacity onPress={handleImagePress} activeOpacity={0.9}>
          <FallbackImage
            imageUrl={imageUrl}
            category={event.category}
            type={event.type}
            style={styles.image}
            fallbackType="post"
            resizeMode="contain"
          />
          {/* Add a subtle zoom icon overlay */}
          <View style={styles.zoomIconOverlay}>
            <MaterialIcons name="zoom-in" size={24} color="rgba(255, 255, 255, 0.8)" />
          </View>
        </TouchableOpacity>
        
        {/* Status badges in their own container */}
        <View style={styles.badgeContainer}>
          {isHappeningNow && (
            <View style={styles.nowBadge}>
              <Text style={styles.badgeText}>HAPPENING NOW</Text>
            </View>
          )}
          <View style={[styles.categoryBadge, { backgroundColor: getCategoryColor(event.category) }]}>
            <Text style={styles.badgeText}>{event.category}</Text>
          </View>
          {event.ticketPrice && event.ticketPrice !== 'N/A' && (
            <View style={styles.priceBadge}>
              <Text style={styles.badgeText}>{event.ticketPrice}</Text>
            </View>
          )}
          
          {/* Add ticket/register button near price - grayed out for guests */}
          {hasTicketLink && paid && (
            <TouchableOpacity 
              style={[
                styles.buyTicketsButton,
                isGuest && styles.disabledButton
              ]}
              onPress={handleTickets}
              activeOpacity={isGuest ? 1 : 0.7}
              disabled={isGuest}
            >
              <View style={styles.buttonContent}>
                <Text style={[
                  styles.buyTicketsText,
                  isGuest && styles.disabledButtonText
                ]}>
                  Buy Tickets
                </Text>
                {isGuest && (
                  <View style={styles.buttonLockOverlay}>
                    <MaterialIcons 
                      name="lock" 
                      size={12} 
                      color="#FFFFFF" 
                    />
                  </View>
                )}
              </View>
            </TouchableOpacity>
          )}
          
          {hasTicketLink && !paid && (
            <TouchableOpacity 
              style={[
                styles.registerButton,
                isGuest && styles.disabledButton
              ]}
              onPress={handleTickets}
              activeOpacity={isGuest ? 1 : 0.7}
              disabled={isGuest}
            >
              <View style={styles.buttonContent}>
                <Text style={[
                  styles.registerButtonText,
                  isGuest && styles.disabledButtonText
                ]}>
                  Register
                </Text>
                {isGuest && (
                  <View style={styles.buttonLockOverlay}>
                    <MaterialIcons 
                      name="lock" 
                      size={12} 
                      color="#FFFFFF" 
                    />
                  </View>
                )}
              </View>
            </TouchableOpacity>
          )}
        </View>

        {/* Description in its own scrollable container with guest content limitation */}
        <ScrollView 
          style={styles.descriptionContainer} 
          contentContainerStyle={styles.descriptionContent}
          showsVerticalScrollIndicator={true}
        >
          <GuestLimitedContent 
            contentType="description" 
            fullText={event.description}
            maxLength={150} // Slightly longer for lightbox
          >
            <Autolink 
              text={event.description}
              style={styles.description}
              linkStyle={styles.linkText}
              onPress={(url, match) => {
                console.log('Link pressed:', url);
                Linking.openURL(url).catch(err => {
                  console.error('Failed to open URL:', err);
                  Alert.alert('Error', 'Could not open link');
                });
              }}
              showAlert={true}
              alertTitle="Open Link"
              alertMessage="Do you want to open this link?"
              alertConfirmText="Open"
              alertCancelText="Cancel"
            />
          </GuestLimitedContent>
        </ScrollView>
        
        {/* Time and location info in their own container */}
        <View style={styles.infoContainer}>
          <View style={styles.infoRow}>
            <MaterialIcons name="access-time" size={20} color="#FFFFFF" />
            <Text style={styles.infoText}>
              {formatEventDateTime(event.startDate, event.startTime, event)}
            </Text>
          </View>
          
          <View style={styles.infoRow}>
            <MaterialIcons name="place" size={20} color="#FFFFFF" />
            <Text style={styles.infoText}>{event.address}</Text>
          </View>
        </View>
        
        {/* Actions with premium feature restrictions for guests */}
        <View style={styles.actionContainer}>
          <TouchableOpacity 
            style={[
              styles.actionButton,
              isGuest && styles.disabledActionButton
            ]} 
            onPress={handleShare}
            activeOpacity={isGuest ? 1 : 0.7}
            disabled={isGuest}
          >
            <View style={styles.actionButtonContent}>
              <MaterialIcons 
                name="share" 
                size={22} 
                color={isGuest ? "#666666" : "#FFFFFF"} 
              />
              {isGuest && (
                <View style={styles.lockIconOverlay}>
                  <LockIcon 
                    variant="inline" 
                    size={10} 
                    showText={false}
                  />
                </View>
              )}
            </View>
            <Text style={[
              styles.actionText,
              isGuest && styles.disabledActionText
            ]}>
              Share
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[
              styles.actionButton,
              isGuest && styles.disabledActionButton
            ]} 
            onPress={handleAddToCalendar}
            activeOpacity={isGuest ? 1 : 0.7}
            disabled={isGuest}
          >
            <View style={styles.actionButtonContent}>
              <MaterialIcons 
                name="event" 
                size={22} 
                color={isGuest ? "#666666" : "#FFFFFF"} 
              />
              {isGuest && (
                <View style={styles.lockIconOverlay}>
                  <LockIcon 
                    variant="inline" 
                    size={10} 
                    showText={false}
                  />
                </View>
              )}
            </View>
            <Text style={[
              styles.actionText,
              isGuest && styles.disabledActionText
            ]}>
              Calendar
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[
              styles.actionButton,
              isGuest && styles.disabledActionButton
            ]} 
            onPress={handleDirections}
            activeOpacity={isGuest ? 1 : 0.7}
            disabled={isGuest}
          >
            <View style={styles.actionButtonContent}>
              <MaterialIcons 
                name="directions" 
                size={22} 
                color={isGuest ? "#666666" : "#FFFFFF"} 
              />
              {isGuest && (
                <View style={styles.lockIconOverlay}>
                  <LockIcon 
                    variant="inline" 
                    size={10} 
                    showText={false}
                  />
                </View>
              )}
            </View>
            <Text style={[
              styles.actionText,
              isGuest && styles.disabledActionText
            ]}>
              Directions
            </Text>
          </TouchableOpacity>
          
          {/* Only add the tickets button to action container if not displayed next to price already */}
          {hasTicketLink && !event.ticketPrice && (
            <TouchableOpacity 
              style={[
                styles.actionButton,
                isGuest && styles.disabledActionButton
              ]} 
              onPress={handleTickets}
              activeOpacity={isGuest ? 1 : 0.7}
              disabled={isGuest}
            >
              <View style={styles.actionButtonContent}>
                <MaterialIcons 
                  name="confirmation-number" 
                  size={22} 
                  color={isGuest ? "#666666" : "#FFFFFF"} 
                />
                {isGuest && (
                  <View style={styles.lockIconOverlay}>
                    <LockIcon 
                      variant="inline" 
                      size={10} 
                      showText={false}
                    />
                  </View>
                )}
              </View>
              <Text style={[
                styles.actionText,
                isGuest && styles.disabledActionText
              ]}>
                {paid ? "Tickets" : "Register"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        </Animated.View>
      
      {/* Full-Screen Image Viewer */}
      <ImageView
        images={images}
        imageIndex={0}
        visible={isImageViewerVisible}
        onRequestClose={handleImageViewerClose} // Use non-tracking handler
        backgroundColor="rgba(0, 0, 0, 0.9)"
        swipeToCloseEnabled={true}
        doubleTapToZoomEnabled={true}
        presentationStyle="overFullScreen"
        FooterComponent={() => null}
      />

      {/* =============================================================== */}
      {/* GUEST LIMITATION REGISTRATION PROMPT - ONLY FOR GUESTS */}
      {/* =============================================================== */}
      {isGuest && <RegistrationPrompt />}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backgroundOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  contentContainer: {
    width: SCREEN_WIDTH * 0.9,
    maxHeight: SCREEN_HEIGHT * 0.85,
    backgroundColor: '#222222',
    borderRadius: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#111111',
  },
  headerTextContainer: {
    flex: 1,
    marginRight: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 14,
    color: '#CCCCCC',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: SCREEN_HEIGHT * 0.35, // Fixed height at 35% of screen height
    backgroundColor: '#000000',
  },
  zoomIconOverlay: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 15,
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
  nowBadge: {
    backgroundColor: '#34A853',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 8,
    marginBottom: 6,
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 8,
    marginBottom: 6,
  },
  priceBadge: {
    backgroundColor: '#E94E77',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginBottom: 6,
    marginRight: 8,
  },
  badgeText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 12,
  },
  buyTicketsButton: {
    backgroundColor: '#E94E77',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginBottom: 6,
  },
  buyTicketsText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  registerButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginBottom: 6,
  },
  registerButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  // Disabled button styles for guests
  disabledButton: {
    backgroundColor: '#666666',
    opacity: 0.6,
  },
  disabledButtonText: {
    color: '#CCCCCC',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonLockOverlay: {
    marginLeft: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 4,
    padding: 2,
  },
  infoContainer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoText: {
    color: '#FFFFFF',
    fontSize: 14,
    marginLeft: 8,
    flex: 1,
  },
  descriptionContainer: {
    flex: 0,
    maxHeight: SCREEN_HEIGHT * 0.35, // Limit the height to ensure other elements are visible
    backgroundColor: '#222222',
  },
  descriptionContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  description: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 20,
  },
  linkText: {
    color: '#62B5FF',
    textDecorationLine: 'underline',
    fontWeight: '500',
  },
  actionContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: '#111111',
  },
  actionButton: {
    alignItems: 'center',
    padding: 10,
    position: 'relative',
  },
  actionButtonContent: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockIconOverlay: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 6,
    padding: 1,
  },
  disabledActionButton: {
    opacity: 0.6,
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 12,
    marginTop: 4,
  },
  disabledActionText: {
    color: '#666666',
  }
});

export default EventImageLightbox;