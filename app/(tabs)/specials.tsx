import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  ActivityIndicator, 
  TouchableOpacity, 
  Animated, 
  Dimensions, 
  ScrollView,
  Modal,
  Share,
  Platform,
  Linking,
  GestureResponderEvent,
  TextInput,
  Alert
} from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import FallbackImage from '../../components/common/FallbackImage';
import Autolink from 'react-native-autolink';

// Import the store and types
import { useMapStore } from '../../store';
import { Event } from '../../types/events';
import { TimeFilterType } from '../../types/filter';
import CategoryFilterOptions from '../../components/map/CategoryFilterOptions';

// Import components
import EventImageLightbox from '../../components/map/EventImageLightbox';
import NativeAdComponent from '../../components/ads/NativeAdComponent';

// Import utilities
import { 
  formatEventDateTime, 
  getEventTimeStatus, 
  sortEventsByTimeStatus,
  combineDateAndTime,
  isEventNow,
  isEventHappeningToday,
  formatTime,
  parseISO,
  format
} from '../../utils/dateUtils';
import { addToCalendar } from '../../utils/calendarUtils';

// Import priority utilities, user service, and distance calculation
import { 
  BASE_SCORES, 
  DISTANCE_BANDS, 
  ENGAGEMENT_TIERS, 
  calculateEngagementTier 
} from '../../utils/priorityUtils';
import * as userService from '../../services/userService';
import { calculateDistance } from '../../store/mapStore';

// Import for loading native ads
import useNativeAds from '../../hooks/useNativeAds';

// Import Firebase functionality for real-time updates
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, firestore } from '../../config/firebaseConfig';

// ===============================================================
// GUEST LIMITATION IMPORTS
// ===============================================================
import { useAuth } from '../../contexts/AuthContext';
import { useGuestInteraction } from '../../hooks/useGuestInteraction';
import { InteractionType } from '../../types/guestLimitations';
import { GuestLimitedContent } from '../../components/GuestLimitedContent';
import { LockIcon } from '../../components/LockIcon';
import { RegistrationPrompt } from '../../components/RegistrationPrompt';
import { trackTabSelect, trackScrollInteraction } from '../../store/guestLimitationStore';

// ===============================================================
// ANALYTICS IMPORT - RE-ENABLED
// ===============================================================
import useAnalytics from '../../hooks/useAnalytics';

// Constants
const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

// Define brand colors for consistency with events page
const BRAND = {
  primary: '#1E90FF',
  primaryDark: '#0066CC', 
  primaryLight: '#62B5FF',
  accent: '#FF3B30',
  accentDark: '#D32F2F',
  gray: '#666666',
  lightGray: '#E0E0E0',
  background: '#F5F8FF',
  white: '#FFFFFF',
  text: '#333333',
  textLight: '#777777'
};

// Helper function to get color for special category
const getCategoryColor = (category: string): string => {
  switch (category.toLowerCase()) {
    case 'live music': return BRAND.primary;
    case 'comedy show': return BRAND.primary;
    case 'cabaret': return BRAND.primary;
    case 'sports': return BRAND.primary;
    case 'meeting': return BRAND.primary;
    case 'food special': return BRAND.primary;
    case 'drink special': return BRAND.primary;
    case 'happy hour': return BRAND.primary;
    default: return BRAND.primary;
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

// Helper function to sort categories by user interest priority and count
const sortCategoriesByPriorityAndCount = (
  categoryFilterCounts: Record<string, number>,
  userInterests: string[]
): Record<string, number> => {
  const categoryArray = Object.entries(categoryFilterCounts).map(([category, count]) => ({
    category,
    count,
    matchesInterest: userInterests.some(interest => 
      interest.toLowerCase() === category.toLowerCase()
    )
  }));

  const sortedCategories = categoryArray.sort((a, b) => {
    if (a.matchesInterest && !b.matchesInterest) return -1;
    if (!a.matchesInterest && b.matchesInterest) return 1;
    return b.count - a.count;
  });

  const orderedCounts: Record<string, number> = {};
  sortedCategories.forEach(({ category, count }) => {
    orderedCounts[category] = count;
  });

  return orderedCounts;
};

// Badge Container component (same as events.tsx)
interface BadgeContainerProps {
  isNow: boolean;
  matchesUserInterests: boolean;
  isSaved: boolean;
}

const BadgeContainer: React.FC<BadgeContainerProps> = ({ 
  isNow, 
  matchesUserInterests, 
  isSaved 
}) => {
  if (!isNow && !matchesUserInterests && !isSaved) return null;
  
  const activeCount = (isNow ? 1 : 0) + (matchesUserInterests ? 1 : 0) + (isSaved ? 1 : 0);
  const multipleActive = activeCount > 1;
  
  return (
    <View style={styles.badgeContainer}>
      {isNow && (
        <View style={[styles.nowBadge, multipleActive && styles.compactBadge]}>
          <Text style={styles.nowBadgeText}>NOW</Text>
        </View>
      )}
      
      {matchesUserInterests && (
        <View style={[
          styles.forYouBadge, 
          multipleActive && styles.compactBadge,
          (multipleActive) && styles.iconOnlyBadge
        ]}>
          <MaterialIcons 
            name="thumb-up" 
            size={12} 
            color="#FFFFFF" 
          />
          {(!multipleActive || (!isNow && activeCount === 2)) && (
            <Text style={styles.badgeText}>For You</Text>
          )}
        </View>
      )}
      
      {isSaved && (
        <View style={[
          styles.savedBadge, 
          multipleActive && styles.compactBadge,
          multipleActive && styles.iconOnlyBadge
        ]}>
          <MaterialIcons 
            name="star" 
            size={12} 
            color={multipleActive ? "#FFFFFF" : "#000000"} 
          />
          {!multipleActive && (
            <Text style={styles.savedBadgeText}>Saved</Text>
          )}
        </View>
      )}
    </View>
  );
};

// EventListItem component with analytics
interface EventListItemProps {
  event: Event;
  onPress: () => void;
  onImagePress: (imageUrl: string, event: Event) => void;
  isSaved: boolean;
  matchesUserInterests: boolean;
  isGuest: boolean;
  analytics: any; // Analytics hook - RE-ENABLED
}

const EventListItem: React.FC<EventListItemProps> = ({ 
  event, 
  onPress, 
  onImagePress,
  isSaved,
  matchesUserInterests,
  isGuest,
  analytics
}) => {
  const [expanded, setExpanded] = useState(false);
  const [bookmarked, setBookmarked] = useState(isSaved);
  const [isToggling, setIsToggling] = useState(false);
  
  useEffect(() => {
    setBookmarked(isSaved);
  }, [isSaved]);
  
  const timeStatus = getEventTimeStatus(event);
  
  // ===============================================================
  // ANALYTICS-ENHANCED ACTION HANDLERS (Special-specific)
  // ===============================================================
  
  const handleAddToCalendar = async (e: GestureResponderEvent) => {
    e.stopPropagation();
    
    // Track calendar interaction for specials
    analytics.trackUserAction('calendar_add_attempt', {
      event_id: event.id.toString(),
      event_type: 'special', // Always special in this component
      special_category: event.category,
      is_guest: isGuest,
      interaction_blocked: isGuest
    });
    
    if (isGuest) {
      console.log('[GuestLimitation] Calendar blocked - premium feature for registered users only');
      return;
    }
    
    try {
      const startTime = Date.now();
      
      await addToCalendar({
        title: event.title,
        startDate: combineDateAndTime(event.startDate, event.startTime),
        endDate: combineDateAndTime(event.endDate || event.startDate, event.endTime || '11:59 PM'),
        location: `${event.venue}, ${event.address}`,
        notes: event.description
      });
      
      // Track successful calendar addition for special
      analytics.trackUserAction('calendar_add_success', {
        event_id: event.id.toString(),
        event_type: 'special',
        special_category: event.category,
        venue_name: event.venue,
        response_time_ms: Date.now() - startTime
      });
      
      // Track special-specific conversion
      analytics.trackConversion('special_calendar_addition', {
        content_id: event.id.toString(),
        content_type: 'special',
        special_category: event.category,
        value: 1
      });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      analytics.trackError('special_calendar_add_failed', errorMessage, {
        event_id: event.id.toString(),
        user_action: 'add_special_to_calendar'
      });
      console.error('Failed to add special to calendar', error);
    }
  };
  
  const handleShare = async (e: GestureResponderEvent) => {
    e.stopPropagation();
    
    // Track share interaction for specials
    analytics.trackUserAction('share_attempt', {
      event_id: event.id.toString(),
      event_type: 'special',
      special_category: event.category,
      is_guest: isGuest,
      interaction_blocked: isGuest
    });
    
    if (isGuest) {
      console.log('[GuestLimitation] Share blocked - premium feature for registered users only');
      return;
    }
    
    try {
      const startTime = Date.now();
      
      await Share.share({
        message: `Check out ${event.title} at ${event.venue} on ${formatEventDateTime(event.startDate, event.startTime)}. ${event.description}`,
        title: event.title,
      });
      
      // Track successful special share
      analytics.trackUserAction('share_success', {
        event_id: event.id.toString(),
        event_type: 'special',
        special_category: event.category,
        venue_name: event.venue,
        response_time_ms: Date.now() - startTime
      });
      
      // Track special-specific conversion
      analytics.trackConversion('special_share', {
        content_id: event.id.toString(),
        content_type: 'special',
        special_category: event.category,
        value: 1
      });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage !== 'User did not share') {
        analytics.trackError('special_share_failed', errorMessage, {
          event_id: event.id.toString(),
          user_action: 'share_special'
        });
      }
      console.error('Error sharing special', error);
    }
  };
  
  const handleTickets = (e: GestureResponderEvent) => {
    e.stopPropagation();
    
    const ticketUrl = event.ticketLinkEvents || event.ticketLinkPosts;
    
    // Track ticket interaction for specials
    analytics.trackUserAction('ticket_link_attempt', {
      event_id: event.id.toString(),
      event_type: 'special',
      special_category: event.category,
      has_valid_url: isValidTicketUrl(ticketUrl),
      ticket_price: event.ticketPrice,
      is_guest: isGuest,
      interaction_blocked: isGuest
    });
    
    if (isGuest) {
      console.log('[GuestLimitation] Tickets blocked - premium feature for registered users only');
      return;
    }
    
    if (isValidTicketUrl(ticketUrl)) {
      // Track successful special ticket link opening
      analytics.trackUserAction('ticket_link_opened', {
        event_id: event.id.toString(),
        event_type: 'special',
        special_category: event.category,
        ticket_price: event.ticketPrice,
        venue_name: event.venue
      });
      
      // Track special-specific conversion
      analytics.trackConversion('special_ticket_engagement', {
        content_id: event.id.toString(),
        content_type: 'special',
        special_category: event.category,
        value: isPaidEvent(event.ticketPrice) ? 1 : 0.5
      });
      
      Linking.openURL(ticketUrl);
    }
  };
  
  const toggleBookmark = async (e: GestureResponderEvent) => {
    e.stopPropagation();
    
    // Track bookmark interaction for specials
    analytics.trackUserAction('bookmark_attempt', {
      event_id: event.id.toString(),
      event_type: 'special',
      special_category: event.category,
      current_bookmark_status: bookmarked,
      is_guest: isGuest,
      interaction_blocked: isGuest
    });
    
    if (isGuest) {
      console.log('[GuestLimitation] Bookmark blocked - premium feature for registered users only');
      return;
    }
    
    if (isToggling) return;
    
    try {
      setIsToggling(true);
      const startTime = Date.now();
      const previousState = bookmarked;
      
      // Optimistic UI update
      setBookmarked(!bookmarked);
      
      const result = await userService.toggleSavedEvent(event.id);
      
      if (!result.success) {
        // Revert UI state if operation failed
        setBookmarked(bookmarked);
        
        analytics.trackError('special_bookmark_failed', result.message || 'Failed to update bookmark', {
          event_id: event.id.toString(),
          user_action: 'toggle_special_bookmark'
        });
        
        Alert.alert('Error', result.message || 'Failed to update saved special');
      } else {
        // Track successful special bookmark toggle
        analytics.trackUserAction('bookmark_success', {
          event_id: event.id.toString(),
          event_type: 'special',
          special_category: event.category,
          new_bookmark_status: !previousState,
          venue_name: event.venue,
          response_time_ms: Date.now() - startTime
        });
        
        // Track special-specific conversion
        analytics.trackConversion('special_save', {
          content_id: event.id.toString(),
          content_type: 'special',
          special_category: event.category,
          value: !previousState ? 1 : -1
        });
      }
    } catch (error) {
      setBookmarked(bookmarked);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      analytics.trackError('special_bookmark_error', errorMessage, {
        event_id: event.id.toString(),
        user_action: 'toggle_special_bookmark'
      });
      
      console.error('Error toggling saved special:', error);
      Alert.alert('Error', 'Failed to update saved special');
    } finally {
      setIsToggling(false);
    }
  };
  
  // Rest of the component logic (same as events but for specials)
  const hasTicketLink = isValidTicketUrl(event.ticketLinkEvents) || 
                        isValidTicketUrl(event.ticketLinkPosts);
  const paid = isPaidEvent(event.ticketPrice);
  
  const safeNumberToString = (value: any): string => {
    if (value === undefined || value === null) return '';
    return String(value);
  };
  
  const isGreaterThanZero = (value: any): boolean => {
    if (value === undefined || value === null) return false;
    const num = parseInt(String(value), 10);
    return !isNaN(num) && num > 0;
  };
  
  const showBuyTicketsButton = hasTicketLink && paid;
  const showRegisterButton = hasTicketLink && !paid && event.ticketPrice;
  const showTicketedEventBadge = hasTicketLink && 
                                !showBuyTicketsButton && 
                                !showRegisterButton;
  
  const formatFullDateTime = (): string => {
    let dateTimeStr = formatEventDateTime(event.startDate, event.startTime, event);
    
    if (event.endTime && event.endTime !== event.startTime) {
      dateTimeStr += ` to ${formatTime(event.endTime)}`;
      
      if (event.endDate && event.endDate !== event.startDate) {
        dateTimeStr += `, ${format(parseISO(event.endDate), 'MMM d')}`;
      }
    }
    
    return dateTimeStr;
  };
  
  return (
    <TouchableOpacity 
      style={[
        styles.eventCard,
        timeStatus === 'now' && styles.nowEventCard,
        matchesUserInterests && styles.interestMatchCard,
        isSaved && styles.savedCard
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[
        styles.cardIndicator, 
        { backgroundColor: getCategoryColor(event.category) }
      ]} />
      
      <View style={styles.cardTopSection}>
        <View style={styles.contentSection}>
          <Text 
            style={styles.cardTitle} 
            numberOfLines={1}
            adjustsFontSizeToFit={true}
            minimumFontScale={0.7}
          >
            {event.title}
          </Text>
          
          <View style={styles.venueContainer}>
            <View style={styles.venueRow}>
              <MaterialIcons name="place" size={14} color="#666666" />
              <Text 
                style={styles.venueText} 
                numberOfLines={1}
                adjustsFontSizeToFit={true}
                minimumFontScale={0.8}
              >
                {event.venue}
              </Text>
            </View>
            {event.address && (
              <Text 
                style={styles.addressText} 
                numberOfLines={1}
                adjustsFontSizeToFit={true}
                minimumFontScale={0.8}
              >
                {event.address}
              </Text>
            )}
          </View>
          
          <View style={styles.dateTimeRow}>
            <MaterialIcons name="access-time" size={14} color="#666666" />
            <Text 
              style={styles.dateTimeText}
              numberOfLines={1}
              adjustsFontSizeToFit={true}
              minimumFontScale={0.7}
            >
              {formatFullDateTime()}
            </Text>
          </View>
          
          {(event.engagementScore !== undefined && isGreaterThanZero(event.engagementScore)) && (
            <View style={styles.engagementRow}>
              {event.likes !== undefined && isGreaterThanZero(event.likes) && (
                <View style={styles.metricItem}>
                  <MaterialIcons name="thumb-up" size={12} color="#666666" />
                  <Text style={styles.metricText}>
                    {safeNumberToString(event.likes)}
                  </Text>
                </View>
              )}
              
              {event.shares !== undefined && isGreaterThanZero(event.shares) && (
                <View style={styles.metricItem}>
                  <MaterialIcons name="share" size={12} color="#666666" />
                  <Text style={styles.metricText}>
                    {safeNumberToString(event.shares)}
                  </Text>
                </View>
              )}
              
              {event.usersResponded !== undefined && isGreaterThanZero(event.usersResponded) && (
                <View style={styles.metricItem}>
                  <MaterialIcons name="person" size={12} color="#666666" />
                  <Text style={styles.metricText}>
                    {safeNumberToString(event.usersResponded)}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
        
        <View style={styles.imageSection}>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => onImagePress(event.imageUrl || event.profileUrl, event)}
          >
            <FallbackImage 
              imageUrl={event.imageUrl || event.profileUrl}
              category={event.category}
              type={event.type}
              style={styles.cardImage}
              fallbackType={event.imageUrl ? 'post' : 'profile'}
            />
            
            <BadgeContainer 
              isNow={timeStatus === 'now'}
              matchesUserInterests={matchesUserInterests}
              isSaved={isSaved}
            />
          </TouchableOpacity>
        </View>
      </View>
      
      <View style={styles.descriptionSection}>
        <GuestLimitedContent 
          contentType="description" 
          fullText={event.description}
          maxLength={80}
        >
          <Autolink 
            text={event.description}
            style={styles.cardDescription}
            numberOfLines={expanded ? undefined : 2}
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
        
        {event.description && event.description.length > 80 && (
          <TouchableOpacity 
            onPress={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
              
              // Track special description expansion
              analytics.trackUserAction('description_expand', {
                event_id: event.id.toString(),
                event_type: 'special',
                expanded: !expanded,
                description_length: event.description.length
              });
            }}
            style={styles.readMoreButton}
          >
            <Text style={styles.readMoreText}>
              {expanded ? "Show less" : "Read more"}
            </Text>
          </TouchableOpacity>
        )}
      </View>
      
      <View style={styles.cardBottomRow}>
        <View style={styles.leftSection}>
          <View style={[
            styles.categoryButton2,
            { backgroundColor: getCategoryColor(event.category) }
          ]}>
            <Text style={styles.categoryText}>{event.category}</Text>
          </View>
          
          {showTicketedEventBadge && (
            <View style={styles.ticketedEventBadge}>
              <Text style={styles.ticketedEventText}>Ticketed Event</Text>
            </View>
          )}
          
          {event.ticketPrice && 
           event.ticketPrice !== 'N/A' && 
           event.ticketPrice !== "0" &&
           event.ticketPrice !== "Ticketed Event" &&
           !(event.ticketPrice.toLowerCase() === "free" && showRegisterButton) && (
            <View style={styles.priceTag}>
              <Text style={styles.priceText}>{event.ticketPrice}</Text>
            </View>
          )}
          
          {showBuyTicketsButton && (
            <TouchableOpacity 
              style={[
                styles.buyTicketsButton,
                isGuest && styles.disabledPremiumButton
              ]}
              onPress={handleTickets}
              activeOpacity={isGuest ? 1 : 0.7}
              disabled={isGuest}
            >
              <View style={styles.premiumButtonContent}>
                <Text style={[
                  styles.buyTicketsText,
                  isGuest && styles.disabledPremiumButtonText
                ]}>
                  Buy Tickets
                </Text>
                {isGuest && (
                  <MaterialIcons name="lock" size={12} color="#FFFFFF" />
                )}
              </View>
            </TouchableOpacity>
          )}

          {showRegisterButton && (
            <TouchableOpacity 
              style={[
                styles.registerButton,
                isGuest && styles.disabledPremiumButton
              ]}
              onPress={handleTickets}
              activeOpacity={isGuest ? 1 : 0.7}
              disabled={isGuest}
            >
              <View style={styles.premiumButtonContent}>
                <Text style={[
                  styles.registerButtonText,
                  isGuest && styles.disabledPremiumButtonText
                ]}>
                  Register
                </Text>
                {isGuest && (
                  <MaterialIcons name="lock" size={12} color="#FFFFFF" />
                )}
              </View>
            </TouchableOpacity>
          )}
        </View>
        
        <View style={styles.rightSection}>
          <TouchableOpacity 
            style={[
              styles.quickActionButton,
              isGuest && styles.disabledActionButton
            ]}
            onPress={handleAddToCalendar}
            activeOpacity={isGuest ? 1 : 0.7}
            disabled={isGuest}
          >
            <View style={styles.actionButtonCircle}>
              <MaterialIcons 
                name="event" 
                size={22} 
                color={isGuest ? "#CCCCCC" : "#666666"} 
              />
              {isGuest && (
                <View style={styles.lockIconOverlay}>
                  <MaterialIcons name="lock" size={8} color="#333333" />
                </View>
              )}
            </View>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[
              styles.quickActionButton,
              isGuest && styles.disabledActionButton
            ]}
            onPress={handleShare}
            activeOpacity={isGuest ? 1 : 0.7}
            disabled={isGuest}
          >
            <View style={styles.actionButtonCircle}>
              <MaterialIcons 
                name="share" 
                size={22} 
                color={isGuest ? "#CCCCCC" : "#666666"} 
              />
              {isGuest && (
                <View style={styles.lockIconOverlay}>
                  <MaterialIcons name="lock" size={8} color="#333333" />
                </View>
              )}
            </View>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[
              styles.quickActionButton,
              isGuest && styles.disabledActionButton
            ]}
            onPress={toggleBookmark}
            activeOpacity={isGuest ? 1 : 0.7}
            disabled={isGuest || isToggling}
          >
            <View style={styles.actionButtonCircle}>
              <MaterialIcons 
                name={bookmarked ? "star" : "star-outline"} 
                size={22} 
                color={isGuest ? "#CCCCCC" : bookmarked ? "#FFD700" : "#666666"} 
              />
              {isGuest && (
                <View style={styles.lockIconOverlay}>
                  <MaterialIcons name="lock" size={8} color="#333333" />
                </View>
              )}
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
};

// Main Specials Screen component
function SpecialsScreen() {
  // ===============================================================
  // ANALYTICS INTEGRATION - RE-ENABLED
  // ===============================================================
  const analytics = useAnalytics();
  
  // Track screen focus for session analytics - RE-ENABLED
  useFocusEffect(
    useCallback(() => {
      const startTime = Date.now();
      
      analytics.trackScreenView('specials', {
        content_type: 'special_list',
        user_type: isGuest ? 'guest' : 'registered'
      });
      
      // Return cleanup function to track time spent
      return () => {
        const timeSpent = Date.now() - startTime;
        analytics.trackEngagementDepth('specials', timeSpent, {
          interactions: 0,
          featuresUsed: ['special_list']
        });
      };
    }, []) // Keep dependency array empty - this prevents the infinite loop
  );

  // Tutorial auto-advancement detection
  useFocusEffect(
    useCallback(() => {
      setTimeout(() => {
        console.log('🔍 SPECIALS SCREEN: Screen focused, checking for tutorial');
        if ((global as any).onSpecialsScreenNavigated) {
          console.log('🔍 SPECIALS SCREEN: Calling tutorial advancement');
          (global as any).onSpecialsScreenNavigated();
        }
      }, 100);
    }, [])
  );

  // Guest limitation setup
  const { user } = useAuth();
  const isGuest = !user;
  const { trackInteraction } = useGuestInteraction();

  // Store integration
  const { 
    events,
    filteredEvents,
    isLoading, 
    error, 
    fetchEvents,
    setTypeFilters,
    categories,
    filterCriteria,
    userLocation,
    getTimeFilterCounts,
    getCategoryFilterCounts,
    scrollTriggers,
  } = useMapStore();

  // State management
  const [scrollY] = useState(new Animated.Value(0));
  const [headerHeight, setHeaderHeight] = useState(0);
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);
  const headerTranslateY = useRef(new Animated.Value(0)).current;
  const lastScrollY = useRef(0);
  const flatListRef = useRef<FlatList>(null);
  
  // Performance tracking for specials
  const [listLoadTime, setListLoadTime] = useState<number | null>(null);
  const [scrollStartTime, setScrollStartTime] = useState<number | null>(null);

  // Scroll to top functionality
  useEffect(() => {
    if (scrollTriggers.specials > 0) {
      console.log('[SpecialsScreen] Scroll trigger detected, scrolling to top');
      
      // Track scroll to top interaction for specials
      analytics.trackUserAction('scroll_to_top', {
        screen: 'specials',
        trigger_source: 'tab_double_tap'
      });
      
      flatListRef.current?.scrollToOffset({ 
        animated: true, 
        offset: 0 
      });
    }
  }, [scrollTriggers.specials]); // Remove analytics from dependency array

  // Screen focus detection and tab interaction tracking
  useFocusEffect(
    React.useCallback(() => {
      console.log('[GuestLimitation] Specials screen gained focus');
      
      if (isGuest) {
        console.log('[GuestLimitation] Tracking Specials tab selection for guest');
        trackTabSelect('specials');
      }
    }, [isGuest])
  );
  
  // Native ads setup
  const adFrequency = 4;
  const totalEventCount = events.length;
  const calculatedAdCount = Math.ceil(totalEventCount / adFrequency);
  const minAdCount = 2;
  const maxAdCount = 10;
  const adCount = Math.max(minAdCount, Math.min(calculatedAdCount, maxAdCount));
  const nativeAds = useNativeAds(adCount, 'specials');
  
  // UI state
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [detailsVisible, setDetailsVisible] = useState(false);
  const detailsAnimation = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const [showBanner, setShowBanner] = useState(false);
  const [selectedImageData, setSelectedImageData] = useState<{
    imageUrl: string;
    event: Event;
  } | null>(null);
  
  // User preferences
  const [userInterests, setUserInterests] = useState<string[]>([]);
  const [savedEvents, setSavedEvents] = useState<string[]>([]);
  
  // Load user preferences
  useEffect(() => {
    const loadUserPreferences = async () => {
      const startTime = Date.now();
      
      try {
        const interests = await userService.getUserInterests();
        const saved = await userService.getSavedEvents();
        
        setUserInterests(interests);
        setSavedEvents(saved);
        
        // Track preferences load performance for specials screen - RE-ENABLED
        analytics.trackPerformance('preferences_load', Date.now() - startTime, {
          interests_count: interests.length,
          saved_events_count: saved.length,
          screen: 'specials'
        });
        
        console.log('Loaded user preferences:', {
          interests: interests,
          saved: saved
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        analytics.trackError('preferences_load_failed', errorMessage, {
          user_action: 'load_preferences',
          screen: 'specials'
        });
        console.error('Error loading user preferences:', error);
      }
    };
    
    loadUserPreferences();
  }, []); // Remove analytics from dependency array
  
  // Banner animation
  useEffect(() => {
    if (userInterests.length > 0) {
      setShowBanner(true);
      fadeAnim.setValue(1);
      
      const timer = setTimeout(() => {
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 800,
          useNativeDriver: true
        }).start(() => setShowBanner(false));
      }, 1500);
      
      return () => clearTimeout(timer);
    }
  }, [userInterests, filterCriteria]);
  
  // Firebase listener for real-time updates
  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    
    console.log('Setting up Firebase listener for user preferences');
    
    const userDocRef = doc(firestore, 'users', currentUser.uid);
    const unsubscribe = onSnapshot(userDocRef, (snapshot) => {
      if (snapshot.exists()) {
        const userData = snapshot.data();
        
        setUserInterests(userData.userInterests || []);
        setSavedEvents(userData.savedEvents || []);
        
        console.log('User preferences updated from Firebase:', {
          interests: userData.userInterests || [],
          saved: userData.savedEvents || []
        });
      }
    }, (error) => {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      analytics.trackError('firebase_listener_error', errorMessage, {
        listener_type: 'user_preferences',
        screen: 'specials'
      });
      console.error('Error in Firebase listener:', error);
    });
    
    return () => {
      console.log('Removing Firebase listener');
      unsubscribe();
    };
  }, []); // Remove analytics from dependency array
  
  // Fetch specials data
  useEffect(() => {
    if (events.length === 0) {
      const startTime = Date.now();
      setListLoadTime(startTime);
      
      fetchEvents().then(() => {
        const loadTime = Date.now() - startTime;
        
        // Track specials list load performance
        analytics.trackPerformance('specials_list_load', loadTime, {
          specials_count: events.filter(e => e.type === 'special').length,
          content_type: 'specials'
        });
        
        setListLoadTime(loadTime);
      }).catch((error) => {
        analytics.trackError('specials_list_load_failed', error.message, {
          user_action: 'fetch_specials'
        });
      });
    }
  }, [events, fetchEvents]); // Remove analytics from dependency array
  
  // ===============================================================
  // ANALYTICS-ENHANCED FILTER HANDLERS (Special-specific)
  // ===============================================================
  
  const handleTimeFilterChange = (filter: TimeFilterType) => {
    console.log(`[GuestLimitation] Time filter click: ${filter}`);
    
    const filterChangeStartTime = Date.now();
    const previousFilter = filterCriteria.specialFilters.timeFilter;
    
    if (isGuest && !trackInteraction(InteractionType.LIST_FILTER)) {
      console.log('[GuestLimitation] Filter interaction blocked - allowing action but prompt should show');
    }
    
    const newFilter = filterCriteria.specialFilters.timeFilter === filter 
      ? TimeFilterType.ALL 
      : filter;
    
    console.log(`Changing time filter from ${filterCriteria.specialFilters.timeFilter} to: ${newFilter}`);
    
    setTypeFilters('special', { timeFilter: newFilter });
    
    // Track special-specific filter effectiveness
    setTimeout(() => {
      const filterChangeTime = Date.now() - filterChangeStartTime;
      const timeFilterCounts = getTimeFilterCounts('special');
      
      analytics.trackEventFilter('time', newFilter, {
        previous_filter: previousFilter,
        result_count: timeFilterCounts[newFilter] || 0,
        filter_change_time_ms: filterChangeTime,
        content_type: 'specials', // Special-specific
        is_guest: isGuest
      });
      
      // Track special filter effectiveness
      analytics.trackUserAction('special_filter_effectiveness', {
        filter_type: 'time',
        filter_value: newFilter,
        result_count: timeFilterCounts[newFilter] || 0,
        response_time_ms: filterChangeTime
      });
    }, 100);
  };

  const handleSavedFilterToggle = () => {
    console.log('[GuestLimitation] Saved filter click');
    
    if (isGuest && !trackInteraction(InteractionType.LIST_FILTER)) {
      console.log('[GuestLimitation] Saved filter interaction blocked - allowing action but prompt should show');
    }
    
    const currentlyFiltering = filterCriteria.specialFilters.savedOnly === true;
    const newSavedFilter = !currentlyFiltering;
    
    // Track special saved filter usage
    analytics.trackEventFilter('saved', newSavedFilter.toString(), {
      previous_value: currentlyFiltering.toString(),
      saved_specials_count: savedEvents.length,
      content_type: 'specials',
      is_guest: isGuest
    });
    
    setTypeFilters('special', { savedOnly: newSavedFilter });
  };

  const handleCategoryClearFilter = () => {
    console.log('[GuestLimitation] Category clear filter click');
    
    if (isGuest && !trackInteraction(InteractionType.LIST_FILTER)) {
      console.log('[GuestLimitation] Category clear filter interaction blocked - allowing action but prompt should show');
    }
    
    // Track special category filter clear
    analytics.trackEventFilter('category', 'clear', {
      previous_category: filterCriteria.specialFilters.category || 'none',
      content_type: 'specials',
      is_guest: isGuest
    });
    
    setTypeFilters('special', { category: undefined });
  };

  const handleCategorySelect = (category: string) => {
    console.log(`[GuestLimitation] Category filter click: ${category}`);
    
    if (isGuest && !trackInteraction(InteractionType.LIST_FILTER)) {
      console.log('[GuestLimitation] Category filter interaction blocked - allowing action but prompt should show');
    }
    
    // Track special category filter selection with effectiveness metrics
    setTimeout(() => {
      const categoryFilterCounts = getCategoryFilterCounts('special');
      
      analytics.trackEventFilter('category', category, {
        result_count: categoryFilterCounts[category] || 0,
        user_has_interest: userInterests.includes(category),
        content_type: 'specials',
        is_guest: isGuest
      });
    }, 100);
  };

  // Get dynamic filter counts
  const timeFilterCounts = getTimeFilterCounts('special');
  const categoryFilterCounts = getCategoryFilterCounts('special');
  
  // Helper functions
  const matchesUserInterests = (event: Event): boolean => {
    if (!userInterests || userInterests.length === 0) return false;
    return userInterests.some(interest => 
      interest.toLowerCase() === event.category.toLowerCase()
    );
  };
  
  const isEventSaved = (event: Event): boolean => {
    if (!savedEvents || savedEvents.length === 0) return false;
    return savedEvents.includes(event.id.toString());
  };

  // ===============================================================
  // ANALYTICS-ENHANCED EVENT HANDLERS (Special-specific)
  // ===============================================================
  
  const handleEventPress = (event: Event) => {
    console.log(`[GuestLimitation] Special press: ${event.title}`);
    
    // Track special discovery and interaction
    const specialDiscoveryData = {
      event_id: event.id.toString(),
      event_type: 'special',
      special_category: event.category,
      venue_name: event.venue,
      discovery_method: 'list_view',
      matches_user_interests: matchesUserInterests(event),
      is_saved: isEventSaved(event),
      time_status: getEventTimeStatus(event),
      has_ticket_price: !!event.ticketPrice,
      is_guest: isGuest,
      list_position: prioritizedSpecials.findIndex(e => e.id === event.id) + 1,
      total_list_items: prioritizedSpecials.length
    };
    
    // Track special view
    analytics.trackEventViewWithContext(specialDiscoveryData);
    
    // Track special-specific content discovery
    analytics.trackUserAction('special_discovery', {
      ...specialDiscoveryData,
      discovery_source: 'specials_list'
    });
    
    if (isGuest && !trackInteraction(InteractionType.LIST_ITEM_CLICK)) {
      console.log('[GuestLimitation] Special click interaction blocked - allowing action but prompt should show');
    }
    
    const imageUrl = event.imageUrl || event.profileUrl;
    
    if (imageUrl) {
      console.log('CARD PRESSED - Opening lightbox for:', imageUrl);
      handleImagePress(imageUrl, event);
    } else {
      setSelectedEvent(event);
      setDetailsVisible(true);
      
      Animated.spring(detailsAnimation, {
        toValue: 0,
        useNativeDriver: true,
        friction: 8,
        tension: 40
      }).start();
    }
  };

  const handleImagePress = (imageUrl: string, event: Event) => {
    console.log(`[GuestLimitation] Image press: ${event.title}`);
    
    // Track special image interaction
    analytics.trackUserAction('special_image_view', {
      event_id: event.id.toString(),
      event_type: 'special',
      special_category: event.category,
      image_type: event.imageUrl ? 'post_image' : 'profile_image',
      discovery_method: 'list_view',
      is_guest: isGuest
    });
    
    if (isGuest && !trackInteraction(InteractionType.LIST_ITEM_CLICK)) {
      console.log('[GuestLimitation] Image click interaction blocked - allowing action but prompt should show');
    }
    
    setSelectedImageData({ imageUrl, event });
  };

  // ===============================================================
  // ENHANCED SCROLL HANDLER WITH SPECIAL-SPECIFIC ANALYTICS
  // ===============================================================
  
  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    {
      useNativeDriver: false,
      listener: (event: any) => {
        const currentScrollY = event.nativeEvent.contentOffset.y;
        const scrollDiff = currentScrollY - lastScrollY.current;
        
        // Track scroll start for engagement metrics
        if (!scrollStartTime && currentScrollY > 0) {
          setScrollStartTime(Date.now());
        }
        
        // Track scroll interaction for guests
        if (isGuest && currentScrollY > 0) {
          trackScrollInteraction('specials');
        }
        
        // Track scroll depth for special-specific engagement analytics
        const contentHeight = prioritizedSpecials.length * 200;
        const scrollPercentage = Math.floor((currentScrollY / contentHeight) * 100);
        
        if (scrollPercentage > 0 && scrollPercentage % 25 === 0) {
          analytics.trackUserAction('special_scroll_depth', {
            screen: 'specials',
            scroll_percentage: scrollPercentage,
            content_type: 'specials_list',
            scroll_direction: scrollDiff > 0 ? 'down' : 'up'
          });
        }
        
        // Header collapse animation
        if (headerHeight > 0 && Math.abs(scrollDiff) > 5) {
          if (scrollDiff > 0 && currentScrollY > 50 && !isHeaderCollapsed) {
            setIsHeaderCollapsed(true);
            Animated.timing(headerTranslateY, {
              toValue: -headerHeight,
              duration: 300,
              useNativeDriver: true,
            }).start();
          } else if (scrollDiff < 0 && isHeaderCollapsed) {
            setIsHeaderCollapsed(false);
            Animated.timing(headerTranslateY, {
              toValue: 0,
              duration: 300,
              useNativeDriver: true,
            }).start();
          }
        }
        
        lastScrollY.current = currentScrollY;
      },
    }
  );
  
  // Filter and sort specials
  const specialItems = filteredEvents.filter(event => event.type === 'special');
  
  // Enhanced sorting with special-specific analytics tracking
  const sortAndPrioritizeSpecials = (specials: Event[]): Event[] => {
    const sortStartTime = Date.now();
    
    const specialsWithScores = specials.map(special => {
      const isSaved = isEventSaved(special);
      const timeStatus = getEventTimeStatus(special);
      const matchesInterest = matchesUserInterests(special);
      
      const scoreCategory = matchesInterest ? 'INTEREST_MATCH' : 'NON_INTEREST';
      const baseScore = BASE_SCORES[scoreCategory][timeStatus];
      
      let proximityMultiplier = 1.0;
      let distance = Infinity;
      
      if (userLocation) {
        distance = calculateDistance(
          userLocation.coords.latitude,
          userLocation.coords.longitude,
          special.latitude,
          special.longitude
        );
        
        for (const band of DISTANCE_BANDS) {
          if (distance <= band.maxDistance) {
            proximityMultiplier = band.multiplier;
            break;
          }
        }
      }
      
      const engagementTierPoints = calculateEngagementTier(special);
      const compositeScore = (baseScore * proximityMultiplier) + engagementTierPoints;
      
      return { 
        event: special,
        isSaved,
        timeStatus,
        compositeScore,
        distance
      };
    });
    
    // Group and sort (same logic as events)
    const savedNowSpecials = specialsWithScores.filter(item => 
      item.isSaved && item.timeStatus === 'now'
    );
    const savedTodaySpecials = specialsWithScores.filter(item => 
      item.isSaved && item.timeStatus === 'today'
    );
    const savedFutureSpecials = specialsWithScores.filter(item => 
      item.isSaved && item.timeStatus === 'future'
    );
    const unsavedSpecials = specialsWithScores.filter(item => !item.isSaved);
    
    [savedNowSpecials, savedTodaySpecials, savedFutureSpecials, unsavedSpecials].forEach(group => {
      group.sort((a, b) => {
        if (b.compositeScore !== a.compositeScore) {
          return b.compositeScore - a.compositeScore;
        }
        return a.distance - b.distance;
      });
    });
    
    const sortedSpecials = [
      ...savedNowSpecials.map(item => item.event),
      ...savedTodaySpecials.map(item => item.event),
      ...savedFutureSpecials.map(item => item.event),
      ...unsavedSpecials.map(item => item.event)
    ];
    
    // Track special sorting performance
    const sortTime = Date.now() - sortStartTime;
    analytics.trackPerformance('specials_sort', sortTime, {
      specials_count: specials.length,
      sort_time_ms: sortTime,
      has_user_location: !!userLocation,
      user_interests_count: userInterests.length
    });
    
    return sortedSpecials;
  };
  
  const prioritizedSpecials = sortAndPrioritizeSpecials(specialItems);
  
  // Create specials with ads list
  type SpecialListItem = {
    type: 'special';
    data: Event;
  };
  
  type AdListItem = {
    type: 'ad';
    data: {
      ad: any;
      loading: boolean;
    };
  };
  
  type ListItem = SpecialListItem | AdListItem;
  
  const specialsWithAds = useMemo<ListItem[]>(() => {
    if (prioritizedSpecials.length === 0) return [];
    
    const adFrequency = 4;
    let result: ListItem[] = [];
    let adIndex = 0;
    
    prioritizedSpecials.forEach((special, index) => {
      result.push({ type: 'special', data: special });
      
      if ((index + 1) % adFrequency === 0 && adIndex < nativeAds.length) {
        result.push({ type: 'ad', data: nativeAds[adIndex] });
        adIndex++;
      }
    });
    
    return result;
  }, [prioritizedSpecials, nativeAds]);
  
  // Track special priority effectiveness
  useEffect(() => {
    if (prioritizedSpecials.length > 0) {
      const topSpecials = prioritizedSpecials.slice(0, 10);
      const interestMatches = topSpecials.filter(e => matchesUserInterests(e)).length;
      const savedSpecials = topSpecials.filter(e => isEventSaved(e)).length;
      
      analytics.trackUserAction('special_priority_effectiveness', {
        top_10_interest_matches: interestMatches,
        top_10_saved_specials: savedSpecials,
        total_specials: prioritizedSpecials.length,
        user_interests_count: userInterests.length,
        personalization_score: (interestMatches + savedSpecials) / 10
      });
    }
  }, [prioritizedSpecials, userInterests, savedEvents]); // Remove analytics from dependency array
  
  // Close special details
  const handleCloseDetails = () => {
    Animated.spring(detailsAnimation, {
      toValue: SCREEN_HEIGHT,
      useNativeDriver: true,
      friction: 8,
      tension: 40
    }).start(() => {
      setDetailsVisible(false);
      setSelectedEvent(null);
    });
  };
  
  // Handle modal close
  const handleModalClose = () => {
    setSelectedImageData(null);
  };
  
  // Loading state
  if (isLoading && events.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={BRAND.primary} />
        <Text style={styles.statusText}>Loading specials...</Text>
      </View>
    );
  }
  
  // Error state
  if (error) {
    // Track special error state
    analytics.trackError('specials_list_error', error, {
      screen: 'specials',
      user_action: 'view_specials_list'
    });
    
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Error: {error}</Text>
      </View>
    );
  }
  
  return (
    <View style={styles.container}>
      {/* Collapsible Header */}
      <Animated.View 
        style={[
          styles.collapsibleHeader,
          { transform: [{ translateY: headerTranslateY }] }
        ]}
        onLayout={(event) => {
          const height = event.nativeEvent.layout.height;
          console.log('Header height measured:', height);
          setHeaderHeight(height + 5);
        }}
      >
        {/* Filtering section */}
        <View style={styles.filtersContainer}>
          <View style={styles.sectionHeaderContainer}>
          <Text style={styles.filterSectionTitle}>When</Text>
          <TouchableOpacity 
            onPress={() => handleTimeFilterChange(TimeFilterType.ALL)}
            style={styles.filterClearButton}
          >
            <Text style={styles.clearButtonText}>
              {filterCriteria.specialFilters.timeFilter === TimeFilterType.ALL ? "Showing All" : "Show All"}
            </Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.timeFilterContainer}>
        <TouchableOpacity
            style={[
              styles.timeFilterPill,
              styles.timeFilterPillNow,
              filterCriteria.specialFilters.timeFilter === TimeFilterType.NOW && styles.activeTimeFilterPill
            ]}
            onPress={() => handleTimeFilterChange(TimeFilterType.NOW)}
          >
            <MaterialIcons 
              name="access-time" 
              size={14} 
              color={filterCriteria.specialFilters.timeFilter === TimeFilterType.NOW ? '#FFFFFF' : '#666666'} 
              style={styles.timeFilterIcon}
            />
            <Text style={[
              styles.timeFilterText,
              filterCriteria.specialFilters.timeFilter === TimeFilterType.NOW && styles.activeTimeFilterText
            ]}>
              Happening Now ({timeFilterCounts[TimeFilterType.NOW]})
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[
              styles.timeFilterPill,
              styles.timeFilterPillToday,
              filterCriteria.specialFilters.timeFilter === TimeFilterType.TODAY && styles.activeTimeFilterPill
            ]}
            onPress={() => handleTimeFilterChange(TimeFilterType.TODAY)}
          >
            <MaterialIcons 
              name="today" 
              size={14} 
              color={filterCriteria.specialFilters.timeFilter === TimeFilterType.TODAY ? '#FFFFFF' : '#666666'} 
              style={styles.timeFilterIcon}
            />
            <Text style={[
              styles.timeFilterText,
              filterCriteria.specialFilters.timeFilter === TimeFilterType.TODAY && styles.activeTimeFilterText
            ]}>
              Today ({timeFilterCounts[TimeFilterType.TODAY]})
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[
              styles.timeFilterPill,
              styles.timeFilterPillUpcoming,
              filterCriteria.specialFilters.timeFilter === TimeFilterType.UPCOMING && styles.activeTimeFilterPill
            ]}
            onPress={() => handleTimeFilterChange(TimeFilterType.UPCOMING)}
          >
            <MaterialIcons 
              name="event" 
              size={14} 
              color={filterCriteria.specialFilters.timeFilter === TimeFilterType.UPCOMING ? '#FFFFFF' : '#666666'} 
              style={styles.timeFilterIcon}
            />
            <Text style={[
              styles.timeFilterText,
              filterCriteria.specialFilters.timeFilter === TimeFilterType.UPCOMING && styles.activeTimeFilterText
            ]}>
              Upcoming ({timeFilterCounts[TimeFilterType.UPCOMING]})
            </Text>
          </TouchableOpacity>
          </View>
        
        <View style={styles.filterDivider} />
        <View style={styles.sectionHeaderContainer}>
          <Text style={styles.filterSectionTitle}>Category</Text>
          <TouchableOpacity 
            onPress={handleCategoryClearFilter}
            style={styles.filterClearButton}
          >
            <Text style={styles.clearButtonText}>
              {filterCriteria.specialFilters.category === undefined ? "Showing All" : "Show All"}
            </Text>
          </TouchableOpacity>
        </View>
        
        {(() => {
          const sortedCounts = sortCategoriesByPriorityAndCount(categoryFilterCounts, userInterests);
          
          return (
            <CategoryFilterOptions 
              type="special" 
              counts={sortedCounts}
              onCategorySelect={handleCategorySelect}
            />
          );
        })()}
        </View>
      </Animated.View>
      
      {/* User preferences banner */}
      {showBanner && userInterests.length > 0 && (
        <Animated.View style={[
          styles.preferencesBar, 
          { 
            opacity: fadeAnim,
            top: Math.max(headerHeight, 120)
          }
        ]}>
          <Text style={styles.preferencesText}>
            Prioritizing specials by your interests
          </Text>
        </Animated.View>
      )}
         
      {/* Specials list with ads */}
      <FlatList
        ref={flatListRef}
        data={specialsWithAds}
        keyExtractor={(item, index) => 
          item.type === 'special' ? `special-${item.data.id}` : `ad-${index}`
        }
        onScroll={handleScroll}
        scrollEventThrottle={16}
        contentContainerStyle={[
          styles.listContent,
          { 
            paddingTop: Math.max(headerHeight, 120) + (showBanner ? 35 : 0)
          }
        ]}
        renderItem={({ item }) => {
          if (item.type === 'ad') {
            return (
              <View style={styles.adContainer}>
                <NativeAdComponent 
                  nativeAd={item.data.ad} 
                  loading={item.data.loading}
                />
              </View>
            );
          } else {
            return (
              <EventListItem 
                event={item.data} 
                onPress={() => handleEventPress(item.data)}
                onImagePress={handleImagePress}
                isSaved={isEventSaved(item.data)}
                matchesUserInterests={matchesUserInterests(item.data)}
                isGuest={isGuest}
                analytics={analytics} // Pass analytics hook directly
              />
            );
          }
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.statusText}>
              No specials match your current filters
            </Text>
          </View>
        }
        onEndReached={() => {
          // Track specials list end reached
          analytics.trackUserAction('specials_list_end_reached', {
            screen: 'specials',
            total_items: specialsWithAds.length,
            scroll_engagement: 'high'
          });
        }}
        onEndReachedThreshold={0.1}
      />
      
      {/* Special details bottom sheet */}
      {detailsVisible && selectedEvent && (
        <Animated.View 
          style={[
            styles.detailsContainer, 
            { transform: [{ translateY: detailsAnimation }] }
          ]}
        >
          <View style={styles.detailsHeader}>
            <View style={styles.headerHandle} />
            <TouchableOpacity 
              style={styles.closeButton}
              onPress={handleCloseDetails}
            >
              <MaterialIcons name="close" size={24} color="#666666" />
            </TouchableOpacity>
          </View>
          
          <View style={styles.detailsContent}>
            <Text style={styles.detailsTitle}>{selectedEvent.title}</Text>
          </View>
        </Animated.View>
      )}
      
      {/* Image Lightbox */}
      {selectedImageData && (
        <Modal
          transparent={true}
          visible={!!selectedImageData}
          animationType="fade"
          onRequestClose={handleModalClose}
          statusBarTranslucent={true}
        >
          <EventImageLightbox
            imageUrl={selectedImageData.imageUrl}
            event={selectedImageData.event}
            onClose={handleModalClose}
          />
        </Modal>
      )}

      {/* Guest limitation registration prompt */}
      {isGuest && <RegistrationPrompt />}
    </View>
  );
}

// Styles (same as events.tsx)
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingTop: 3,
  },
  collapsibleHeader: {
    position: 'absolute',
    top: 3,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    zIndex: 10,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 50,
  },
  listContent: {
    paddingVertical: 16,
    paddingTop: 0,
  },
  emptyContainer: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: {
    fontSize: 16,
    color: '#666666',
    marginTop: 12,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#E94E77',
    textAlign: 'center',
  },
  adContainer: {
    backgroundColor: '#FFFFFF',
    paddingBottom: 12,
    borderBottomWidth: 6,
    borderBottomColor: '#E8E8E8',
  },
  preferencesBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: '#F5F9FF',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 6,
    borderBottomColor: '#E8E8E8',
    zIndex: 15,
    elevation: 15,
  },
  preferencesText: {
    fontSize: 14,
    color: BRAND.primary,
    textAlign: 'center',
  },
  filtersContainer: {
    backgroundColor: '#F8F8F8',
    paddingTop: 1,
    paddingBottom: 1,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  sectionHeaderContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginBottom: 1,
  },
  filterSectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#333333',
  },
  filterClearButton: {
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  clearButtonText: {
    fontSize: 11,
    color: BRAND.primary,
    fontWeight: '500',
  },
  filterDivider: {
    height: 1,
    backgroundColor: '#EEEEEE',
    marginVertical: 1,
  },
  timeFilterContainer: {
    paddingHorizontal: 8,
    paddingBottom: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeFilterPill: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginHorizontal: 3,
    borderWidth: 1,
    borderColor: '#EEEEEE',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeFilterPillNow: {
    flex: 1.4,
  },
  timeFilterPillToday: {
    flex: 0.8,
  },
  timeFilterPillUpcoming: {
    flex: 1.2,
  },
  timeFilterIcon: {
    marginRight: 4,
  },
  activeTimeFilterPill: {
    backgroundColor: BRAND.primary,
    borderColor: BRAND.primary,
  },
  activeSavedFilterPill: {
    backgroundColor: BRAND.primary,
    borderColor: BRAND.primary,
  },
  timeFilterText: {
    fontSize: 12,
    color: '#666666',
    fontWeight: '500',
  },
  activeTimeFilterText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  eventCard: {
    backgroundColor: '#FFFFFF',
    marginBottom: 0,
    paddingBottom: 12,
    overflow: 'hidden',
    position: 'relative',
    borderBottomWidth: 6,
    borderBottomColor: '#E8E8E8',
  },
  nowEventCard: {
    borderLeftColor: '#34A853',
    borderLeftWidth: 4,
    backgroundColor: '#FAFFF9',
  },
  interestMatchCard: {
    borderLeftColor: BRAND.primary,
    borderLeftWidth: 4,
    backgroundColor: '#F5F9FF',
  },
  savedCard: {
    borderLeftColor: '#FFD700',
    borderLeftWidth: 4,
    backgroundColor: '#FFFBEB',
  },
  cardIndicator: {
    width: 3,
    height: '100%',
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: 1,
  },
  badgeContainer: {
    position: 'absolute',
    top: 5,
    right: 5,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    zIndex: 10,
  },
  nowBadge: {
    backgroundColor: '#34A853',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginLeft: 5,
  },
  forYouBadge: {
    backgroundColor: BRAND.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginLeft: 5,
    flexDirection: 'row',
    alignItems: 'center',
  },
  savedBadge: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginLeft: 5,
    flexDirection: 'row',
    alignItems: 'center',
  },
  compactBadge: {
    marginLeft: 3,
  },
  iconOnlyBadge: {
    paddingHorizontal: 5,
  },
  nowBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  savedBadgeText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  cardTopSection: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 8,
  },
  contentSection: {
    width: '65%',
    paddingRight: 8,
  },
  imageSection: {
    width: '35%',
    height: 'auto',
    position: 'relative',
  },
  cardImage: {
    width: '100%',
    height: 100,
    borderRadius: 8,
    backgroundColor: '#F0F0F0',
  },
  descriptionSection: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333333',
    marginBottom: 4,
  },
  venueContainer: {
    marginBottom: 4,
  },
  venueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  venueText: {
    fontSize: 13,
    color: '#666666',
    marginLeft: 4,
    flex: 1,
  },
  addressText: {
    fontSize: 12,
    color: '#999999',
    marginLeft: 18,
    marginTop: 2,
  },
  dateTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  dateTimeText: {
    fontSize: 13,
    color: '#666666',
    marginLeft: 4,
    flex: 1,
  },
  engagementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  metricItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  metricText: {
    fontSize: 12,
    color: '#666666',
    marginLeft: 3,
  },
  cardDescription: {
    fontSize: 14,
    color: '#555555',
    lineHeight: 18,
  },
  linkText: {
    color: BRAND.primary,
    textDecorationLine: 'underline',
    fontWeight: '500',
  },
  readMoreButton: {
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  readMoreText: {
    color: BRAND.primary,
    fontWeight: '500',
    fontSize: 12,
  },
  cardBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryButton2: { 
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 8,
  },
  categoryText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  ticketedEventBadge: {
    backgroundColor: '#F0F8FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 8,
    borderWidth: 1,
    borderColor: BRAND.primary,
  },
  ticketedEventText: {
    color: BRAND.primary,
    fontSize: 12,
    fontWeight: '500',
  },
  priceTag: {
    backgroundColor: '#FFF0F3',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 8,
  },
  priceText: {
    color: BRAND.accent,
    fontSize: 12,
    fontWeight: '500',
  },
  buyTicketsButton: {
    backgroundColor: BRAND.accent,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  buyTicketsText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  registerButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginLeft: 8,
  },
  registerButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  disabledPremiumButton: {
    backgroundColor: '#666666',
    opacity: 0.6,
  },
  disabledPremiumButtonText: {
    color: '#CCCCCC',
  },
  premiumButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  disabledActionButton: {
    opacity: 0.6,
  },
  lockIconOverlay: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 6,
    padding: 1,
  },
  quickActionButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  actionButtonCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  detailsContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 10,
    height: SCREEN_HEIGHT * 0.8,
    zIndex: 5,
  },
  detailsHeader: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
    position: 'relative',
  },
  headerHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#DDDDDD',
  },
  closeButton: {
    position: 'absolute',
    right: 10,
    top: 10,
    padding: 5,
  },
  detailsContent: {
    flex: 1,
    padding: 16,
  },
  detailsTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333333',
    marginBottom: 10,
  }
});

export default SpecialsScreen;