import React, { useState, useRef, useEffect, useMemo } from 'react';

// TypeScript fix for global tutorial manager
declare global {
  namespace NodeJS {
    interface Global {
      tutorialManager?: {
        getCurrentStep?: () => { id: string } | null;
        getIsActive?: () => boolean;
        getCurrentSubStep?: () => number;
        setVenueSelectorMeasurement?: {
          x: number;
          y: number;
          width: number;
          height: number;
        };
      };
    }
  }
}

// Extend globalThis for tutorial manager
declare const global: typeof globalThis & {
  tutorialManager?: {
    getCurrentStep?: () => { id: string } | null;
    getIsActive?: () => boolean;
    getCurrentSubStep?: () => number;
    setVenueSelectorMeasurement?: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  };
};
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ScrollView, 
  Linking, 
  Platform,
  Share,
  Animated,
  Dimensions,
  NativeSyntheticEvent,
  PanResponder,
  StatusBar,
  BackHandler,
  Modal,
  Alert
} from 'react-native';
import * as Calendar from 'expo-calendar';
import { MaterialIcons, Ionicons, FontAwesome } from '@expo/vector-icons';
import FallbackImage from '../common/FallbackImage';
import Autolink from 'react-native-autolink';

import type { Event, Venue, Cluster, TimeStatus } from '../../types/events';

// Add global tutorial manager type declarations
declare global {
  var tutorialManager: {
    getCurrentStep?: () => { id: string } | null;
    getIsActive?: () => boolean;
    getCurrentSubStep?: () => number;
  } | undefined;
}
import { addToCalendar } from '../../utils/calendarUtils';
import EventImageLightbox from './EventImageLightbox';

// Import user service for saved events functionality
import * as userService from '../../services/userService';

// Import Firebase functionality
import { doc, onSnapshot, DocumentSnapshot } from 'firebase/firestore';
import { auth, firestore } from '../../config/firebaseConfig';

// Import the centralized date utilities
import { 
  formatTime, 
  formatEventDateTime, 
  isEventNow, 
  isEventHappeningToday, 
  getEventTimeStatus, 
  sortEventsByTimeStatus,
  getRelativeTimeDescription,
  combineDateAndTime
} from '../../utils/dateUtils';

// Import ad components and hooks
import useNativeAds from '../../hooks/useNativeAds';
import CompactNativeAdComponent from '../ads/CompactNativeAdComponent';

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
const CALLOUT_NORMAL_HEIGHT = 440; // Increased to accommodate venue selector in all cases
const CALLOUT_MIN_HEIGHT = 300;
const CALLOUT_MAX_HEIGHT = SCREEN_HEIGHT - 100; // Nearly full screen
const DRAG_THRESHOLD = 50;
const VELOCITY_THRESHOLD = 0.3;

// Define brand colors for consistency with events tab
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

// Helper function to get color for event category - Updated to use BRAND colors
const getCategoryColor = (category: string): string => {
  switch (category.toLowerCase()) {
    case 'live music': return BRAND.primary;
    case 'comedy show': return BRAND.primary;
    case 'cabaret': return BRAND.primary;
    case 'sports': return BRAND.primary;
    case 'meeting': return BRAND.primary;
    case 'family friendly': return BRAND.primary;
    case 'social gatherings & parties': return BRAND.primary;
    case 'drink special': return BRAND.primary;
    case 'food special': return BRAND.primary;
    case 'happy hour': return BRAND.primary;
    default: return BRAND.primary; // Default to primary blue for consistency
  }
};

// Helper function to get color for time status
const getTimeStatusColor = (timeStatus: TimeStatus): string => {
  switch (timeStatus) {
    case 'now':
      return '#34A853'; // Green for now
    case 'today':
      return '#FBBC05'; // Yellow for today
    case 'future':
    default:
      return '#9AA0A6'; // Gray for future
  }
};

// Helper function to validate a ticket URL
const isValidTicketUrl = (url?: string): boolean => {
  return Boolean(url && url !== "N/A" && url !== "" && url.includes("http"));
};

// Helper function to check if an event is paid - UPDATED to handle "Ticketed Event" text
const isPaidEvent = (price?: string): boolean => {
  // If price is exactly "Ticketed Event", consider it a paid event
  if (price === "Ticketed Event") {
    return true; 
  }
  
  return Boolean(
    price && 
    price !== "N/A" && 
    price !== "0" && 
    !price.toLowerCase().includes("free")
  );
};

// Define types for badge props
interface BadgeContainerProps {
  isNow: boolean;
  matchesUserInterests: boolean;
  isSaved: boolean;
}

// Badge Container component for horizontal badge layout
// with smart display logic for multiple badges
const BadgeContainer: React.FC<BadgeContainerProps> = ({ 
  isNow, 
  matchesUserInterests, 
  isSaved 
}) => {
  // If no badges to show, return null
  if (!isNow && !matchesUserInterests && !isSaved) return null;
  
  // Determine how many badges are active for smart display logic
  const activeCount = (isNow ? 1 : 0) + (matchesUserInterests ? 1 : 0) + (isSaved ? 1 : 0);
  const multipleActive = activeCount > 1;
  
  return (
    <View style={badgeStyles.badgeContainer}>
      {/* NOW Badge - Always show with text due to importance */}
      {isNow && (
        <View style={[badgeStyles.nowBadge, multipleActive && badgeStyles.compactBadge]}>
          <Text style={badgeStyles.nowBadgeText}>NOW</Text>
        </View>
      )}
      
      {/* For You Badge - Condensed to just icon when multiple badges */}
      {matchesUserInterests && (
        <View style={[
          badgeStyles.forYouBadge, 
          multipleActive && badgeStyles.compactBadge,
          // Adjust padding when showing just the icon
          (multipleActive) && badgeStyles.iconOnlyBadge
        ]}>
          <MaterialIcons 
            name="thumb-up" 
            size={12} 
            color="#FFFFFF" 
          />
          {/* Only show text if single badge or if NOW is not present */}
          {(!multipleActive || (!isNow && activeCount === 2)) && (
            <Text style={badgeStyles.badgeText}>For You</Text>
          )}
        </View>
      )}
      
      {/* Saved Badge - Condensed to just icon when multiple badges */}
      {isSaved && (
        <View style={[
          badgeStyles.savedBadge, 
          multipleActive && badgeStyles.compactBadge,
          // Adjust padding when showing just the icon
          multipleActive && badgeStyles.iconOnlyBadge
        ]}>
          <MaterialIcons 
            name="star" 
            size={12} 
            color={multipleActive ? "#FFFFFF" : "#000000"} 
          />
          {/* Only show text when it's the only badge */}
          {!multipleActive && (
            <Text style={badgeStyles.savedBadgeText}>Saved</Text>
          )}
        </View>
      )}
    </View>
  );
};

// Function to sort and prioritize events - similar to the one in events.tsx
const sortAndPrioritizeCalloutEvents = (events: Event[], savedEvents: string[]): Event[] => {
  // Create a copy of events with priority scores added
  const eventsWithPriority = events.map(event => {
    // Check saved status
    const isSaved = savedEvents.includes(event.id.toString());
    const savedScore = isSaved ? 1000 : 0;
    
    // Calculate time status score
    let timeScore = 0;
    if (isEventNow(event.startDate, event.startTime, event.endDate, event.endTime)) {
      timeScore = 10;
    } else if (isEventHappeningToday(event)) {
      timeScore = 5;
    } else {
      timeScore = 1;
    }
    
    // Get engagement score
    let engagementScore = 0;
    if (event.engagementScore !== undefined && event.engagementScore !== null) {
      const parsed = parseInt(String(event.engagementScore), 10);
      if (!isNaN(parsed)) {
        engagementScore = parsed;
      }
    }
    
    // Calculate final priority score
    const priorityScore = savedScore + timeScore + engagementScore;
    
    return {
      ...event,
      priorityScore
    };
  });
  
  // Sort events by priority score (highest first)
  return eventsWithPriority.sort((a, b) => {
    const scoreA = typeof a.priorityScore === 'number' ? a.priorityScore : 0;
    const scoreB = typeof b.priorityScore === 'number' ? b.priorityScore : 0;
    return scoreB - scoreA;
  });
};

// Define a type for the mixed content items (event or ad)
type ContentItem = {
  type: 'event' | 'ad';
  data: Event | {
    ad: any;
    loading: boolean;
  };
};

// Helper function to mix content items with ads
const mixContentWithAds = (
  contentItems: Event[], 
  ads: {ad: any; loading: boolean}[], 
  isMinimalContent: boolean
): ContentItem[] => {
  if (contentItems.length === 0) return [];
  
  // For minimal content (1 event or 1 special or 1 of each)
  if (isMinimalContent) {
    // Convert all content items to ContentItem format
    const result: ContentItem[] = contentItems.map(item => ({
      type: 'event',
      data: item
    }));
    
    // Append one ad if available
    if (ads.length > 0) {
      result.push({
        type: 'ad',
        data: ads[0]
      });
    }
    
    return result;
  }
  
  // For multiple items (insert an ad after every second item)
  const result: ContentItem[] = [];
  let adIndex = 0;
  
  contentItems.forEach((item, index) => {
    // Add the content item
    result.push({
      type: 'event',
      data: item
    });
    
    // After every second item, add an ad if available
    if ((index + 1) % 2 === 0 && adIndex < ads.length) {
      result.push({
        type: 'ad',
        data: ads[adIndex]
      });
      adIndex++;
    }
  });
  
  return result;
};

// Pulsing effect component for "now" events in the callout
interface PulsingEffectProps {
  color: string;
}

const PulsingEffect: React.FC<PulsingEffectProps> = ({ color }) => {
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    // Create pulsing animation
    const pulseAnimation = Animated.sequence([
      Animated.timing(opacity, {
        toValue: 0.8,
        duration: 500,
        useNativeDriver: true
      }),
      Animated.timing(opacity, {
        toValue: 0.5,
        duration: 500,
        useNativeDriver: true
      })
    ]);

    // Loop the animation
    Animated.loop(pulseAnimation).start();

    return () => {
      // Clean up animation
      opacity.stopAnimation();
    };
  }, []);

  return (
    <Animated.View 
      style={[
        styles.pulsingEffect,
        { 
          backgroundColor: color,
          opacity: opacity
        }
      ]} 
    />
  );
};

// Venue Selector Component - Modified to work with single venue
interface VenueSelectorProps {
  venues: Venue[];
  activeVenueIndex: number;
  onSelectVenue: (index: number) => void;
  onScroll?: (event: NativeSyntheticEvent<any>) => void;
}

const VenueSelector: React.FC<VenueSelectorProps> = ({ 
  venues, 
  activeVenueIndex, 
  onSelectVenue,
  onScroll
}) => {
  // LOG: VenueSelector rendering - tracks venues count and active index for debugging selector state
  // console.log("VenueSelector rendering with venues:", venues.length, 
  //            "activeIndex:", activeVenueIndex);
  
  return (
    <View style={styles.venueSelectorWrapper}>
      <ScrollView 
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[
          styles.venueSelectorContainer,
          venues.length <= 1 && styles.singleVenueSelectorContainer
        ]}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {venues.map((venue, index) => {
          const events = venue.events.filter(event => event.type === 'event');
          const specials = venue.events.filter(event => event.type === 'special');
          const profileImage = venue.events.find(event => event.profileUrl)?.profileUrl;
          
          // LOG: Venue option details - shows venue data for debugging venue selector options
          // console.log(`Venue option ${index}: ${venue.venue}, events: ${events.length}, specials: ${specials.length}, hasImage: ${!!profileImage}`);
          
          return (
            <TouchableOpacity 
              key={`venue-${venue.locationKey}-${index}`}
              style={[
                styles.venueOption,
                activeVenueIndex === index && styles.venueOptionActive,
                venues.length <= 1 && styles.singleVenueOption
              ]}
              onPress={() => onSelectVenue(index)}
              activeOpacity={0.7}
            >
            {profileImage !== undefined ? (
              <FallbackImage 
                imageUrl={profileImage}
                category=""
                type={venue.events.find(e => e.type === 'event') ? 'event' : 'special'}
                style={styles.venueProfileImage}
                fallbackType="profile"
              />
            ) : (
              <FallbackImage 
                imageUrl=""
                category=""
                type={venue.events.find(e => e.type === 'event') ? 'event' : 'special'}
                style={styles.venueProfileImage}
                fallbackType="profile"
              />
            )}
                          
              <Text 
                style={[
                  styles.venueOptionName,
                  activeVenueIndex === index && styles.venueOptionNameActive
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit={true}
              >
                {venue.venue}
              </Text>
              
              <View style={styles.venueItemCounts}>
                {events.length > 0 && (
                  <View style={styles.countContainer}>
                    <Text style={styles.countText}>{events.length}</Text>
                    <MaterialIcons name="event" size={14} color="#666666" />
                  </View>
                )}
                
                {specials.length > 0 && (
                  <View style={styles.countContainer}>
                    <Text style={styles.countText}>{specials.length}</Text>
                    <MaterialIcons name="restaurant" size={14} color="#666666" />
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

// Enhanced Tab component for the callout
type TabType = 'events' | 'specials' | 'venue';

interface EventTabsProps {
  activeTab: TabType;
  onChangeTab: (tab: TabType) => void;
  eventCount: number;
  specialCount: number;
  venueCount: number;
}

const EventTabs: React.FC<EventTabsProps> = ({ 
  activeTab, 
  onChangeTab, 
  eventCount, 
  specialCount, 
  venueCount 
}) => {
  return (
    <View style={styles.tabContainer}>
      {eventCount > 0 && (
        <TouchableOpacity 
          style={[
            styles.tabPill, 
            activeTab === 'events' && styles.activeTabPill
          ]} 
          onPress={() => onChangeTab('events')}
          activeOpacity={0.7}
        >
          <MaterialIcons 
            name="event" 
            size={16} 
            color={activeTab === 'events' ? '#FFFFFF' : '#666666'} 
            style={styles.tabIcon}
          />
          <Text style={[
            styles.tabPillText, 
            activeTab === 'events' && styles.activeTabPillText
          ]}>
            Events ({eventCount})
          </Text>
        </TouchableOpacity>
      )}
      
      {specialCount > 0 && (
        <TouchableOpacity 
          style={[
            styles.tabPill, 
            activeTab === 'specials' && styles.activeTabPill
          ]} 
          onPress={() => onChangeTab('specials')}
          activeOpacity={0.7}
        >
          <MaterialIcons 
            name="restaurant" 
            size={16} 
            color={activeTab === 'specials' ? '#FFFFFF' : '#666666'} 
            style={styles.tabIcon}
          />
          <Text style={[
            styles.tabPillText, 
            activeTab === 'specials' && styles.activeTabPillText
          ]}>
            Specials ({specialCount})
          </Text>
        </TouchableOpacity>
      )}
      
      <TouchableOpacity 
        style={[
          styles.tabPill, 
          activeTab === 'venue' && styles.activeTabPill
        ]} 
        onPress={() => onChangeTab('venue')}
        activeOpacity={0.7}
      >
        <MaterialIcons 
          name="place" 
          size={16} 
          color={activeTab === 'venue' ? '#FFFFFF' : '#666666'} 
          style={styles.tabIcon}
        />
        <Text style={[
          styles.tabPillText, 
          activeTab === 'venue' && styles.activeTabPillText
        ]}>
          Venue Info
        </Text>
      </TouchableOpacity>
    </View>
  );
};

// Component for event actions
interface EventActionsProps {
  event: Event;
}

const EventActions: React.FC<EventActionsProps> = ({ event }) => {
  const addEventToCalendar = async () => {
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
  
  const shareEvent = async () => {
    try {
      await Share.share({
        message: `Check out ${event.title} at ${event.venue} on ${formatEventDateTime(event.startDate, event.startTime)}. ${event.description}`,
        title: event.title,
      });
    } catch (error) {
      console.error('Error sharing event', error);
    }
  };
  
  const buyTickets = () => {
    // Check ticketLinkEvents first, then fall back to ticketLinkPosts if needed
    const ticketUrl = event.ticketLinkEvents || event.ticketLinkPosts;
    
    // Only open URL if it's a valid URL (not empty, not "N/A")
    if (isValidTicketUrl(ticketUrl)) {
      Linking.openURL(ticketUrl);
    }
  };
  
  // Check if there's a valid ticket URL
  const hasTicketLink = isValidTicketUrl(event.ticketLinkEvents) || 
                        isValidTicketUrl(event.ticketLinkPosts);
  
  // Determine if it's a paid event vs. free event
  const paid = isPaidEvent(event.ticketPrice);
  
  return (
    <View style={styles.actionContainer}>
      <TouchableOpacity 
        style={styles.actionButton} 
        onPress={shareEvent}
        activeOpacity={0.7}
      >
        <MaterialIcons name="share" size={20} color="#444444" />
        <Text style={styles.actionText}>Share</Text>
      </TouchableOpacity>
      
      <TouchableOpacity 
        style={styles.actionButton} 
        onPress={addEventToCalendar}
        activeOpacity={0.7}
      >
        <MaterialIcons name="event" size={20} color="#444444" />
        <Text style={styles.actionText}>Add to Calendar</Text>
      </TouchableOpacity>
      
      {hasTicketLink && (
        <TouchableOpacity 
          style={styles.ticketButton} 
          onPress={buyTickets}
          activeOpacity={0.7}
        >
          <Text style={styles.ticketButtonText}>
            {paid ? "Buy Tickets" : "Register"}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

// Event card component for carousel
interface EventCardProps {
  event: Event;
  isSelected: boolean;
  onPress: () => void;
}

const EventCard: React.FC<EventCardProps> = ({ event, isSelected, onPress }) => {
  const timeStatus = getEventTimeStatus(event);
  
  return (
    <TouchableOpacity 
      style={[
        styles.eventCard,
        isSelected && styles.selectedEventCard,
        timeStatus === 'now' && styles.nowEventCard
      ]} 
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[
        styles.cardCategoryIndicator, 
        { backgroundColor: getCategoryColor(event.category) }
      ]} />
      
      {timeStatus === 'now' && (
        <View style={styles.nowIndicator}>
          <Text style={styles.nowIndicatorText}>NOW</Text>
        </View>
      )}
      
      <Text style={styles.cardTitle} numberOfLines={1}>
        {event.title}
      </Text>
      
      <Text style={styles.cardDateTime}>
        {formatEventDateTime(event.startDate, event.startTime, event)}
      </Text>
      
      <GuestLimitedContent 
        contentType="description" 
        fullText={event.description}
        maxLength={100}
      >
        <Text style={styles.cardDescription} numberOfLines={2}>
          {event.description}
        </Text>
      </GuestLimitedContent>
    </TouchableOpacity>
  );
};

// Event details tab content
interface EventDetailsProps {
  event: Event;
  onImagePress: (imageUrl: string, event: Event) => void;
}

const EventDetailsContent: React.FC<EventDetailsProps> = ({ event, onImagePress }) => {
  const [expanded, setExpanded] = useState(false);
  const needsReadMore = event.description.length > 120;
  const timeStatus = getEventTimeStatus(event);
  
  return (
    <View style={styles.detailsContainer}>
      {timeStatus === 'now' && (
        <View style={styles.nowBanner}>
          <PulsingEffect color={getTimeStatusColor('now')} />
          <Text style={styles.nowBannerText}>HAPPENING NOW</Text>
        </View>
      )}
      
      {event.imageUrl && (
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => onImagePress(event.imageUrl, event)}
        >
          <FallbackImage 
            imageUrl={event.imageUrl}
            category={event.category}
            type={event.type}
            style={styles.eventImage}
            fallbackType="post"
          />
        </TouchableOpacity>
      )}
      
      <Text style={styles.eventTitle}>{event.title}</Text>
      
      <View style={styles.eventMetaContainer}>
        <View style={[styles.categoryBadge, { backgroundColor: getCategoryColor(event.category) }]}>
          <Text style={styles.categoryText}>{event.category}</Text>
        </View>
        
        <View style={styles.timeContainer}>
          <MaterialIcons name="access-time" size={16} color="#666666" />
          <Text style={styles.eventTime}>
            {formatEventDateTime(event.startDate, event.startTime, event)}
          </Text>
        </View>
      </View>
      
      {event.ticketPrice && event.ticketPrice !== 'N/A' && (
        <View style={styles.priceContainer}>
          <MaterialIcons name="local-offer" size={16} color="#E94E77" />
          <Text style={styles.ticketPrice}>{event.ticketPrice}</Text>
        </View>
      )}
      
      <View style={styles.descriptionContainer}>
        <GuestLimitedContent 
          contentType="description" 
          fullText={event.description}
          maxLength={120}
        >
          <Autolink 
            text={event.description}
            style={styles.eventDescription}
            numberOfLines={expanded ? undefined : 3}
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
        
        {needsReadMore && (
          <TouchableOpacity 
            onPress={() => setExpanded(!expanded)}
            style={styles.expandButton}
            activeOpacity={0.7}
          >
            <Text style={styles.expandButtonText}>
              {expanded ? 'Show Less' : 'Read More'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
      
      <EventActions event={event} />
    </View>
  );
};

// Venue info tab content
interface VenueInfoProps {
  venue: Venue;
}

const VenueInfoContent: React.FC<VenueInfoProps> = ({ venue }) => {
  const handleDirections = () => {
    const destination = encodeURIComponent(`${venue.venue}, ${venue.address}`);
    const url = Platform.select({
      ios: `maps:?q=${destination}`,
      android: `geo:0,0?q=${destination}`
    });
    
    if (url) {
      Linking.openURL(url);
    }
  };
  
  const eventsByDate = venue.events.reduce((acc, event) => {
    const date = event.startDate;
    if (!acc[date]) acc[date] = [];
    acc[date].push(event);
    return acc;
  }, {} as Record<string, Event[]>);
  
  const sortedDates = Object.keys(eventsByDate).sort((a, b) => 
    new Date(a).getTime() - new Date(b).getTime()
  );
  
  for (const date of sortedDates) {
    eventsByDate[date] = sortEventsByTimeStatus(eventsByDate[date]);
  }
  
  return (
    <View style={styles.venueInfoContainer}>
      <View style={styles.venueDetailSection}>
        <Text style={styles.venueName}>{venue.venue}</Text>
        <Text style={styles.venueAddress}>{venue.address}</Text>
        
        <TouchableOpacity 
          style={styles.directionsButton}
          onPress={handleDirections}
          activeOpacity={0.7}
        >
          <MaterialIcons name="directions" size={16} color="#FFFFFF" />
          <Text style={styles.directionsButtonText}>Directions</Text>
        </TouchableOpacity>
      </View>
      
      {sortedDates.length > 0 && (
        <>
          <Text style={styles.upcomingEventsTitle}>Upcoming Events</Text>
          
          {sortedDates.map((date, dateIndex) => (
            <View key={`date-${date}-${dateIndex}`} style={styles.dateSection}>
              <Text style={styles.dateHeader}>
                {formatEventDateTime(date, '12:00 PM').split(' at ')[0]}
              </Text>
              
              {eventsByDate[date].map((event, eventIndex) => {
                const timeStatus = getEventTimeStatus(event);
                
                return (
                  <View 
                    key={`event-${event.id}-${date}-${eventIndex}`} 
                    style={[
                      styles.venueEventItem,
                      timeStatus === 'now' && styles.nowVenueEventItem
                    ]}
                  >
                    {timeStatus === 'now' && (
                      <PulsingEffect color={getTimeStatusColor('now')} />
                    )}
                    <View style={[
                      styles.eventTimeIndicator, 
                      { backgroundColor: getCategoryColor(event.category) }
                    ]} />
                    <View style={styles.venueEventDetails}>
                      <Text style={styles.venueEventTime}>{formatTime(event.startTime)}</Text>
                      <Text 
                        style={[
                          styles.venueEventTitle,
                          timeStatus === 'now' && styles.nowVenueEventTitle
                        ]}
                      >
                        {event.title}
                      </Text>
                      {timeStatus === 'now' && (
                        <View style={styles.inlineNowIndicator}>
                          <Text style={styles.inlineNowText}>NOW</Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          ))}
        </>
      )}
    </View>
  );
};

// Special card component for multiple specials
interface SpecialCardProps {
  event: Event;
  onSelectEvent?: (event: Event) => void;
  showVenueName?: boolean;
  onImagePress: (imageUrl: string, event: Event) => void;
  isSaved?: boolean; // Add this prop to pass the saved status
  matchesUserInterests?: boolean; // Add this prop for "For You" badges
  userInterests?: string[]; // Add user interests for matching logic
  isGuest?: boolean; // Add guest status prop
}

const SpecialCard: React.FC<SpecialCardProps> = ({ 
  event, 
  onSelectEvent,
  showVenueName = false,
  onImagePress,
  isSaved = false, // Default to false if not provided
  matchesUserInterests = false, // Default to false if not provided
  userInterests = [], // Default to empty array if not provided
  isGuest = false // Default to false if not provided
}) => {
  const [expanded, setExpanded] = useState(false);
  const [bookmarked, setBookmarked] = useState(isSaved);
  const [isToggling, setIsToggling] = useState(false); // Add loading state
  const timeStatus = getEventTimeStatus(event);
  
  // Update bookmarked state when isSaved prop changes
  useEffect(() => {
    setBookmarked(isSaved);
  }, [isSaved]);

  // Function to check if an event matches user interests (if not passed as prop)
  const eventMatchesUserInterests = matchesUserInterests || (
    userInterests.length > 0 && userInterests.some(interest => 
      interest.toLowerCase() === event.category.toLowerCase()
    )
  );
  
  // Safe getter for numeric values with string conversion
  const safeNumberToString = (value: any): string => {
    if (value === undefined || value === null) return '';
    return String(value);
  };
  
  // Safely check if a number-like value is greater than zero
  const isGreaterThanZero = (value: any): boolean => {
    if (value === undefined || value === null) return false;
    const num = parseInt(String(value), 10);
    return !isNaN(num) && num > 0;
  };
  
  const handleAddToCalendar = async (e: any) => {
    e.stopPropagation();
    
    // Block for guests - premium feature
    if (isGuest) {
      console.log('[GuestLimitation] Calendar blocked - premium feature for registered users only');
      return;
    }
    
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
  
  const handleShare = async (e: any) => {
    e.stopPropagation();
    
    // Block for guests - premium feature
    if (isGuest) {
      console.log('[GuestLimitation] Share blocked - premium feature for registered users only');
      return;
    }
    
    try {
      await Share.share({
        message: `Check out ${event.title} at ${event.venue} on ${formatEventDateTime(event.startDate, event.startTime)}. ${event.description}`,
        title: event.title,
      });
    } catch (error) {
      console.error('Error sharing event', error);
    }
  };
  
  const handleTickets = (e: any) => {
    e.stopPropagation();
    
    // Block for guests - premium feature
    if (isGuest) {
      console.log('[GuestLimitation] Tickets blocked - premium feature for registered users only');
      return;
    }
    
    // Check ticketLinkEvents first, then fall back to ticketLinkPosts
    const ticketUrl = event.ticketLinkEvents || event.ticketLinkPosts;
    
    // Only open URL if it's a valid URL (not empty, not "N/A")
    if (isValidTicketUrl(ticketUrl)) {
      Linking.openURL(ticketUrl);
    }
  };
  
  const toggleBookmark = async (e: any) => {
    e.stopPropagation();
    
    // Block for guests - premium feature
    if (isGuest) {
      console.log('[GuestLimitation] Bookmark blocked - premium feature for registered users only');
      return;
    }
    
    // If already toggling, do nothing to prevent double-clicks
    if (isToggling) return;
    
    try {
      setIsToggling(true);
      
      // Optimistic UI update
      setBookmarked(!bookmarked);
      
      // Call the toggleSavedEvent function from userService
      const result = await userService.toggleSavedEvent(event.id);
      
      if (!result.success) {
        // Revert UI state if operation failed
        setBookmarked(bookmarked);
        
        // Show error message
        Alert.alert('Error', result.message || 'Failed to update saved event');
      } else {
        // Optional: Show success message (uncomment if desired)
        // const action = result.saved ? 'saved' : 'removed from saved items';
        // console.log(`Event ${action} successfully`);
      }
    } catch (error) {
      // Revert UI state if operation failed
      setBookmarked(bookmarked);
      console.error('Error toggling saved event:', error);
      Alert.alert('Error', 'Failed to update saved event');
    } finally {
      setIsToggling(false);
    }
  };
  
  const getCategoryTag = () => {
    if (event.category.toLowerCase() === 'drink special') {
      return 'Drink Special';
    } else if (event.category.toLowerCase() === 'food special') {
      return 'Food Special';
    } else if (event.category.toLowerCase() === 'live music') {
      return 'Live Music';
    } else if (event.category.toLowerCase() === 'happy hour') {
      return 'Happy Hour';
    } else {
      return event.category;
    }
  };
  
  // Check if there's a valid ticket URL
  const hasTicketLink = isValidTicketUrl(event.ticketLinkEvents) || 
                        isValidTicketUrl(event.ticketLinkPosts);
  
  // Determine if it's a paid event
  const paid = isPaidEvent(event.ticketPrice);
  
  return (
    <View style={[
      styles.specialCard,
      timeStatus === 'now' && styles.nowSpecialCard,
      eventMatchesUserInterests && styles.interestMatchCard,
      isSaved && styles.savedCard
    ]}>
      {/* Left side color indicator */}
      <View style={[
        styles.cardIndicator, 
        { backgroundColor: getCategoryColor(event.category) }
      ]} />
      
      <View style={styles.cardTopSection}>
        {/* Text content section */}
        <View style={styles.contentSection}>
          <Text 
            style={styles.cardTitle} 
            numberOfLines={1}
            adjustsFontSizeToFit={true}
            minimumFontScale={0.7}
          >
            {event.title}
          </Text>
          
          {/* Venue name for multi-venue display */}
          {showVenueName && (
            <Text style={styles.venueNameText}>{event.venue}</Text>
          )}
          
          <View style={styles.dateTimeRow}>
            <MaterialIcons name="access-time" size={14} color="#666666" />
            <Text 
              style={styles.dateTimeText}
              numberOfLines={1}
              adjustsFontSizeToFit={true}
              minimumFontScale={0.7}
            >
              {formatEventDateTime(event.startDate, event.startTime, event)}
            </Text>
          </View>
          
          {/* Engagement metrics row with proper Text wrapping */}
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
        
        {/* Image section with badge container */}
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
            
            {/* Badge container positioned at top right of image */}
            <BadgeContainer 
              isNow={timeStatus === 'now'}
              matchesUserInterests={eventMatchesUserInterests}
              isSaved={isSaved}
            />
          </TouchableOpacity>
        </View>
      </View>
      
      {/* Description section - Now full width with content limitation */}
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
            }}
            style={styles.readMoreButton}
          >
            <Text style={styles.readMoreText}>
              {expanded ? "Show less" : "Read more"}
            </Text>
          </TouchableOpacity>
        )}
      </View>
      
      {/* Bottom action section */}
      <View style={styles.cardBottomRow}>
        <View style={styles.leftSection}>
          <View style={[
            styles.categoryButton2,
            { backgroundColor: getCategoryColor(event.category) }
          ]}>
            <Text style={styles.categoryText}>{getCategoryTag()}</Text>
          </View>
          
          {/* Ticketed Event badge - Show if has ticket link but not showing buttons */}
          {hasTicketLink && !paid && !event.ticketPrice && (
            <View style={styles.ticketedEventBadge}>
              <Text style={styles.ticketedEventText}>Ticketed Event</Text>
            </View>
          )}
          
          {/* Price tag - Only show if not "Ticketed Event" and not showing "Free" with Register button */}
          {event.ticketPrice && 
           event.ticketPrice !== 'N/A' && 
           event.ticketPrice !== "0" &&
           event.ticketPrice !== "Ticketed Event" &&
           !(event.ticketPrice.toLowerCase() === "free" && hasTicketLink && !paid) && (
            <View style={styles.priceTag}>
              <Text style={styles.priceText}>{event.ticketPrice}</Text>
            </View>
          )}
          
          {/* Buy Tickets button */}
          {hasTicketLink && paid && (
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

          {/* Register button for free events with ticket links */}
          {hasTicketLink && !paid && event.ticketPrice && (
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
        
        {/* Action buttons with circular backgrounds - locked for guests */}
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
    </View>
  );
};

// Multiple Events Content Component
interface MultipleEventsContentProps {
  events: Event[];
  onSelectEvent: (event: Event) => void;
  isMultiVenue?: boolean;
  onImagePress: (imageUrl: string, event: Event) => void;
  savedEvents: string[];
  isGuest?: boolean; // Add guest status prop
}

const MultipleEventsContent: React.FC<MultipleEventsContentProps> = ({ 
  events, 
  onSelectEvent,
  isMultiVenue = false,
  onImagePress,
  savedEvents,
  isGuest = false
}) => {
  // Use the prioritization function instead of simple time sorting
  const sortedEvents = sortAndPrioritizeCalloutEvents(events, savedEvents);

  // TODO: Get user interests - for now using empty array
  // This should be passed down from parent component or fetched here
  const userInterests: string[] = [];

  return (
    <View style={styles.multiEventsContainer}>
      {sortedEvents.map((event, index) => (
        <TouchableOpacity
          key={`multiple-event-${event.id}-${index}`}
          style={styles.multiEventCard}
          onPress={() => onSelectEvent(event)}
          activeOpacity={0.7}
        >
          <SpecialCard 
            event={event} 
            showVenueName={isMultiVenue}
            onImagePress={onImagePress}
            isSaved={savedEvents.includes(event.id.toString())}
            userInterests={userInterests}
            isGuest={isGuest}
          />
        </TouchableOpacity>
      ))}
    </View>
  );
};

// Callout state for the bottom sheet
type CalloutState = 'expanded' | 'normal' | 'minimized';

interface EventCalloutProps {
  venues: Venue[];
  cluster: Cluster | null;
  onClose: () => void;
  onEventSelected?: (event: Event) => void;
}

const EventCallout: React.FC<EventCalloutProps> = ({ 
  venues, 
  cluster,
  onClose,
  onEventSelected 
}) => {
  // LOG: EventCallout rendered - shows venues and cluster data for debugging callout state
  // console.log("EventCallout rendered with props:", {
  //   venuesLength: venues ? venues.length : 0,
  //   isMultiVenue: venues && venues.length > 1,
  //   venueNames: venues ? venues.map(v => v.venue) : [],
  //   hasCluster: !!cluster,
  //   clusterType: cluster?.clusterType
  // });

  // ===============================================================
  // GUEST LIMITATION SETUP
  // ===============================================================
  const { user } = useAuth();
  const isGuest = !user;
  const { trackInteraction } = useGuestInteraction();
  
  // Track scroll state per venue+tab combination
  const [scrolledCombinations, setScrolledCombinations] = useState<Set<string>>(new Set());
  
  // ===============================================================
  // EXISTING STATE (keep all existing state)
  // ===============================================================
  
  // State for saved events
  const [savedEvents, setSavedEvents] = useState<string[]>([]);
  
  // Fetch saved events when component mounts
  useEffect(() => {
    const fetchSavedEvents = async () => {
      try {
        const saved = await userService.getSavedEvents();
        setSavedEvents(saved);
      } catch (error) {
        console.error('Error fetching saved events:', error);
      }
    };
    
    fetchSavedEvents();
    
    // Set up listener for saved events changes
    const currentUser = auth?.currentUser;
    if (currentUser) {
      const userDocRef = doc(firestore, 'users', currentUser.uid);
      const unsubscribe = onSnapshot(userDocRef, (snapshot: DocumentSnapshot) => {
        if (snapshot.exists()) {
          const userData = snapshot.data();
          if (userData.savedEvents) {
            setSavedEvents(userData.savedEvents);
          }
        }
      });
      
      return () => unsubscribe();
    }
  }, []);
  
  const findMostRelevantVenueIndex = (venues: Venue[]): number => {
    if (!venues || venues.length === 0) return 0;
    if (venues.length === 1) return 0;
    
    const venuesWithNowEvents = venues.map((venue, index) => {
      const hasNowEvents = venue.events.some(event => 
        isEventNow(event.startDate, event.startTime, event.endDate, event.endTime)
      );
      return { index, hasNowEvents };
    });
    
    const nowVenue = venuesWithNowEvents.find(v => v.hasNowEvents);
    if (nowVenue) {
      console.log(`Found venue with 'happening now' content at index ${nowVenue.index}: ${venues[nowVenue.index].venue}`);
      return nowVenue.index;
    }
    
    let earliestEventTime = new Date(8640000000000000);
    let earliestVenueIndex = 0;
    
    venues.forEach((venue, index) => {
      venue.events.forEach(event => {
        try {
          const eventStartTime = combineDateAndTime(event.startDate, event.startTime);
          if (eventStartTime < earliestEventTime) {
            earliestEventTime = eventStartTime;
            earliestVenueIndex = index;
          }
        } catch (error) {
          console.warn(`Error parsing date for event: ${event.title}`, error);
        }
      });
    });
    
    console.log(`Selected venue with earliest event at index ${earliestVenueIndex}: ${venues[earliestVenueIndex].venue}`);
    return earliestVenueIndex;
  };
  
  const initialVenueIndex = useMemo(() => {
    return findMostRelevantVenueIndex(venues);
  }, [venues]);
  
  const [activeVenueIndex, setActiveVenueIndex] = useState(initialVenueIndex);
  const activeVenue = venues[activeVenueIndex];
  // LOG: Active venue tracking - shows currently selected venue for debugging venue state
  // console.log("Active venue index:", activeVenueIndex, 
  //             "Active venue:", activeVenue ? activeVenue.venue : 'none');
  
  const isMultiVenue = venues.length > 1;
  // LOG: Multi-venue detection - tracks venue count for debugging layout decisions
  // console.log("Is multi-venue:", isMultiVenue, 
  //             "Total venues:", venues.length);
  
  const events = activeVenue.events.filter(event => event.type === 'event');
  const specials = activeVenue.events.filter(event => event.type === 'special');
  // LOG: Active venue content counts - shows events and specials count for debugging content display
  // console.log("Active venue events:", events.length, 
  //             "Active venue specials:", specials.length);
  
  const hasEvents = events.length > 0;
  const hasSpecials = specials.length > 0;
  
  const getInitialActiveTab = (): TabType => {
    const hasNowEvents = events.some(event => 
      isEventNow(event.startDate, event.startTime, event.endDate, event.endTime)
    );
    const hasNowSpecials = specials.some(special => 
      isEventNow(special.startDate, special.startTime, special.endDate, special.endTime)
    );
    
    if (hasNowSpecials) return 'specials';
    if (hasNowEvents) return 'events';
    if (hasEvents) return 'events';
    if (hasSpecials) return 'specials';
    return 'venue';
  };
  
  const [activeTab, setActiveTab] = useState<TabType>(getInitialActiveTab());
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(
    hasEvents ? events[0] : (hasSpecials ? specials[0] : null)
  );
  const [calloutState, setCalloutState] = useState<CalloutState>('normal');
  const [scrollEnabled, setScrollEnabled] = useState(true);
  
// Keep track of scroll position
  const scrollViewRef = useRef<ScrollView>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [canScrollMore, setCanScrollMore] = useState(false);

  // NEW: Venue selector scroll progress
  const [venueScrollProgress, setVenueScrollProgress] = useState(0);
  const [venueCanScrollMore, setVenueCanScrollMore] = useState(false);
  
  const [selectedImageData, setSelectedImageData] = useState<{
    imageUrl: string;
    event: Event;
  } | null>(null);
  
  // Change this: remove the calloutVisible state
  // Instead, use CSS to show/hide the callout when the lightbox is open
  const isLightboxOpen = selectedImageData !== null;
  
  // Calculate the number of ads needed based on the content
  const calculateAdCount = useMemo(() => {
    let adCount = 1; // Default minimum
    
    // Get active content based on current tab
    const activeContent = activeTab === 'events' ? events : activeTab === 'specials' ? specials : [];
    
    // Check if current tab has minimal content (each tab is evaluated independently)
    const isCurrentTabMinimalContent = activeContent.length <= 1;
    
    if (activeContent.length > 0) {
      if (isCurrentTabMinimalContent) {
        // For minimal content (just 1 item), we just need 1 ad
        adCount = 1;
      } else {
        // For multiple items, calculate 1 ad per 2 content items
        adCount = Math.ceil(activeContent.length / 2);
        
        // Apply reasonable limits
        const maxAds = 5;
        adCount = Math.min(adCount, maxAds);
      }
    }
    
    console.log(`Calculated ${adCount} ads needed for ${activeTab} tab with ${activeContent.length} items (${isCurrentTabMinimalContent ? 'minimal content' : 'multiple items'})`);
    return adCount;
  }, [activeTab, events.length, specials.length]);
  
  // Load native ads for the current tab
  const nativeAds = useNativeAds(calculateAdCount, activeTab === 'events' ? 'events' : 'specials');
  
  // Create mixed content arrays for events and specials tabs
  const mixedEventsContent = useMemo(() => {
    // For events tab: evaluate only the events count (independent of specials)
    const isMinimalEventsContent = events.length <= 1;
    return mixContentWithAds(events, nativeAds, isMinimalEventsContent);
  }, [events, nativeAds]);
  
  const mixedSpecialsContent = useMemo(() => {
    // For specials tab: evaluate only the specials count (independent of events)
    const isMinimalSpecialsContent = specials.length <= 1;
    return mixContentWithAds(specials, nativeAds, isMinimalSpecialsContent);
  }, [specials, nativeAds]);
  
  const handleImagePress = (imageUrl: string, event: Event) => {
    console.log('IMAGE PRESSED - Starting handleImagePress with URL:', imageUrl);
    console.log('EVENT DATA:', { 
      id: event.id, 
      title: event.title, 
      type: event.type 
    });
    
    // Just set the selectedImageData - don't hide the callout
    setSelectedImageData({ imageUrl, event });
    console.log('ATTEMPTING to set selectedImageData state...');
  };
  
  const handleModalClose = () => {
    console.log('LIGHTBOX CLOSE triggered');
    setSelectedImageData(null);
  };
  
  // ===============================================================
  // GUEST LIMITATION INTERACTION HANDLERS
  // ===============================================================
  
  /**
   * Handle venue selection with guest limitation tracking
   */
  const handleVenueSelect = (index: number) => {
    console.log(`[GuestLimitation] Venue change: ${activeVenueIndex} → ${index}`);
    
    // Track venue change interaction for guests
    if (isGuest && !trackInteraction(InteractionType.CLUSTER_VENUE_CHANGE)) {
      console.log('[GuestLimitation] Venue change interaction blocked - allowing action but prompt should show');
      // Still allow the venue change - the prompt will show over the content
    }
    
    // Clear scroll tracking for the new venue+tab combination
    const newScrollKey = `venue_${index}_tab_${activeTab}`;
    setScrolledCombinations(prev => {
      const newSet = new Set(prev);
      newSet.delete(newScrollKey); // Remove if exists so first scroll in new venue counts
      return newSet;
    });
    
    // Proceed with venue change
    setActiveVenueIndex(index);
  };
  
  /**
   * Handle tab change with guest limitation tracking
   */
  const handleTabChange = (tab: TabType) => {
    console.log(`[GuestLimitation] Tab change: ${activeTab} → ${tab}`);
    
    // Track tab change interaction for guests
    if (isGuest && !trackInteraction(InteractionType.CLUSTER_TAB_CHANGE)) {
      console.log('[GuestLimitation] Tab change interaction blocked - allowing action but prompt should show');
      // Still allow the tab change - the prompt will show over the content
    }
    
    // Clear scroll tracking for the new venue+tab combination
    const newScrollKey = `venue_${activeVenueIndex}_tab_${tab}`;
    setScrolledCombinations(prev => {
      const newSet = new Set(prev);
      newSet.delete(newScrollKey); // Remove if exists so first scroll in new tab counts
      return newSet;
    });
    
    // Proceed with tab change
    setActiveTab(tab);
  };
  
  /**
   * Handle scroll with first-scroll-per-venue-tab-combination tracking
   */
  const handleContentScroll = (event: NativeSyntheticEvent<any>) => {
    // Always update scroll progress for UI
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const progress = contentOffset.y / (contentSize.height - layoutMeasurement.height);
    setScrollProgress(Math.min(Math.max(progress, 0), 1));
    setCanScrollMore(contentSize.height > layoutMeasurement.height);
    
    // Track interaction only for guests and only first scroll per venue+tab combo
    if (isGuest) {
      const scrollKey = `venue_${activeVenueIndex}_tab_${activeTab}`;
      
      if (!scrolledCombinations.has(scrollKey)) {
        console.log(`[GuestLimitation] First scroll in ${scrollKey}`);
        
        // Mark this combination as scrolled
        setScrolledCombinations(prev => new Set(prev).add(scrollKey));
        
        // Track the scroll interaction
        if (!trackInteraction(InteractionType.CLUSTER_SCROLL)) {
          console.log('[GuestLimitation] Scroll interaction blocked - allowing scroll but prompt should show');
          // Continue allowing scroll - the prompt will show over the content
        }
      }
    }
  };
  
  /**
   * Handle event selection with guest limitation tracking
   */
  const handleEventSelect = (event: Event) => {
    console.log(`[GuestLimitation] Event click: ${event.title}`);
    
    // Track event click interaction for guests
    if (isGuest && !trackInteraction(InteractionType.CLUSTER_ITEM_CLICK)) {
      console.log('[GuestLimitation] Event click interaction blocked - allowing action but prompt should show');
      // Still allow the event selection - the prompt will show over the lightbox
    }
    
    // Keep existing functionality
    setSelectedEvent(event);
    if (onEventSelected) {
      onEventSelected(event);
    }
    
    // Add lightbox functionality
    // Check if the event has an image to display
    const imageUrl = event.imageUrl || event.profileUrl;
    if (imageUrl) {
      // Use the same lightbox opening logic that's used for image clicks
      console.log('CARD PRESSED - Opening lightbox for:', imageUrl);
      console.log('EVENT DATA:', { 
        id: event.id, 
        title: event.title, 
        type: event.type 
      });
      
      // Use the existing state variables 
      setSelectedImageData({ imageUrl, event });
    }
  };
  
  // NEW: Venue scroll handler
  const handleVenueScroll = (event: NativeSyntheticEvent<any>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const progress = contentOffset.x / (contentSize.width - layoutMeasurement.width);
    setVenueScrollProgress(Math.min(Math.max(progress, 0), 1));
    setVenueCanScrollMore(contentSize.width > layoutMeasurement.width);
  };
  
  const translateY = useRef(new Animated.Value(0)).current;
  const backgroundOpacity = useRef(new Animated.Value(0)).current;
  const indicatorRotation = useRef(new Animated.Value(0)).current;
  
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  
  useEffect(() => {
    console.log("Venues changed, recalculating most relevant venue");
    setActiveVenueIndex(findMostRelevantVenueIndex(venues));
  }, [venues]);
  
  useEffect(() => {
  console.log("Venue change effect triggered - activeVenueIndex:", activeVenueIndex);
  
  // 🎯 TUTORIAL FIX: Prevent automatic tab changes during venue selector tutorial step
  if (global.tutorialManager && typeof global.tutorialManager.getCurrentStep === 'function') {
    const currentStep = global.tutorialManager.getCurrentStep();
    const isActive = global.tutorialManager.getIsActive?.();
    
    if (isActive && currentStep?.id === 'callout-venue-selector') {
      console.log("🔴 TUTORIAL FIX: Skipping automatic tab change during venue selector step");
      
      // Still set the default event, but don't change tabs automatically
      const venueEvents = activeVenue.events.filter(event => event.type === 'event');
      const venueSpecials = activeVenue.events.filter(event => event.type === 'special');
      
      let defaultEvent = null;
      if (activeTab === 'events' && venueEvents.length > 0) {
        const sortedEvents = sortAndPrioritizeCalloutEvents(venueEvents, savedEvents);
        defaultEvent = sortedEvents[0];
      } else if (activeTab === 'specials' && venueSpecials.length > 0) {
        const sortedSpecials = sortAndPrioritizeCalloutEvents(venueSpecials, savedEvents);
        defaultEvent = sortedSpecials[0];
      }
      
      setSelectedEvent(defaultEvent);
      return; // Exit early - don't do automatic tab switching
    }
  }
  
  const venueEvents = activeVenue.events.filter(event => event.type === 'event');
  const venueSpecials = activeVenue.events.filter(event => event.type === 'special');
  
  let newActiveTab = activeTab;
  if (activeTab === 'events' && venueEvents.length === 0) {
    if (venueSpecials.length > 0) {
      newActiveTab = 'specials';
    } else {
      newActiveTab = 'venue';
    }
  } else if (activeTab === 'specials' && venueSpecials.length === 0) {
    if (venueEvents.length > 0) {
      newActiveTab = 'events';
    } else {
      newActiveTab = 'venue';
    }
  }
  
  if (newActiveTab !== activeTab) {
    console.log("Changing active tab from", activeTab, "to", newActiveTab);
    setActiveTab(newActiveTab);
  }
  
  let defaultEvent = null;
  if (newActiveTab === 'events' && venueEvents.length > 0) {
    // Use prioritized sorting for default event selection
    const sortedEvents = sortAndPrioritizeCalloutEvents(venueEvents, savedEvents);
    defaultEvent = sortedEvents[0];
  } else if (newActiveTab === 'specials' && venueSpecials.length > 0) {
    // Use prioritized sorting for default event selection
    const sortedSpecials = sortAndPrioritizeCalloutEvents(venueSpecials, savedEvents);
    defaultEvent = sortedSpecials[0];
  }
  
  console.log("Setting default event:", defaultEvent ? defaultEvent.title : 'none');
  setSelectedEvent(defaultEvent);
}, [activeVenueIndex, activeVenue, savedEvents]);
  
  useEffect(() => {
    console.log('selectedImageData CHANGED:', 
      selectedImageData ? {
        url: selectedImageData.imageUrl,
        eventTitle: selectedImageData.event.title
      } : 'null'
    );
  }, [selectedImageData]);
  
  const setCalloutStateWithAnimation = (state: CalloutState) => {
    console.log('ANIMATION - Changing from', calloutState, 'to', state);
    setCalloutState(state);
    
    let targetTranslateY: number;
    let targetOpacity: number;
    let targetRotation: number;
    
    switch (state) {
      case 'expanded':
        targetTranslateY = SCREEN_HEIGHT * 0.15;
        targetOpacity = 0.5;
        targetRotation = 1;
        break;
      case 'minimized':
        targetTranslateY = CALLOUT_NORMAL_HEIGHT - CALLOUT_MIN_HEIGHT;
        targetOpacity = 0;
        targetRotation = 0;
        break;
      default:
        targetTranslateY = 0;
        targetOpacity = 0;
        targetRotation = 0;
    }
    
    console.log('ANIMATION TARGETS - translateY:', targetTranslateY, 'opacity:', targetOpacity);
    
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: targetTranslateY,
        useNativeDriver: true,
        bounciness: 0
      }),
      Animated.timing(backgroundOpacity, {
        toValue: targetOpacity,
        duration: 200,
        useNativeDriver: true
      }),
      Animated.timing(indicatorRotation, {
        toValue: targetRotation,
        duration: 200,
        useNativeDriver: true
      })
    ]).start();
  };

  // Attach the PanResponder only to the draggable area (left + center)
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (event, gestureState) => {
        return Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onMoveShouldSetPanResponder: (_, gestureState) => {
        const isVerticalGesture = Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
        return isVerticalGesture && Math.abs(gestureState.dy) > 10;
      },
      onPanResponderGrant: () => {
        translateY.stopAnimation();
        translateY.extractOffset();
        setScrollEnabled(false);
      },
      onPanResponderMove: (_, gestureState) => {
        // LOG: Pan gesture movement tracking
        // console.log('MOVE - dy:', gestureState.dy.toFixed(2), 'dx:', gestureState.dx.toFixed(2), 'vy:', gestureState.vy.toFixed(2));
        translateY.setValue(gestureState.dy);
        let opacity = 0;
        if (calloutState === 'expanded') {
          opacity = Math.max(0, 0.5 - (gestureState.dy / SCREEN_HEIGHT));
        } else if (calloutState === 'normal' && gestureState.dy < 0) {
          opacity = Math.min(0.5, Math.abs(gestureState.dy) / SCREEN_HEIGHT);
        }
        backgroundOpacity.setValue(opacity);
        const rotation = calloutState === 'expanded' ? 
          Math.max(0, 1 - (gestureState.dy / 300)) :
          Math.min(1, Math.abs(gestureState.dy) / 300);
        indicatorRotation.setValue(rotation);
      },
      onPanResponderRelease: (_, gestureState) => {
        translateY.flattenOffset();
        setScrollEnabled(true);
        const { dy, vy } = gestureState;
        console.log('RELEASE - dy:', dy.toFixed(2), 'vy:', vy.toFixed(2), 'current state:', calloutState);
        if (calloutState === 'minimized' && dy > 10) {
          console.log('CLOSING callout');
          onClose();
          return;
        }
        let targetState = calloutState;
        if (Math.abs(vy) > VELOCITY_THRESHOLD) {
          console.log('VELOCITY-BASED decision - threshold exceeded:', Math.abs(vy), '>', VELOCITY_THRESHOLD);
          if (vy > 0) {
            console.log('SWIPING DOWN with velocity');
            if (calloutState === 'expanded') targetState = 'normal';
            else if (calloutState === 'normal') targetState = 'minimized';
          } else {
            console.log('SWIPING UP with velocity');
            if (calloutState === 'minimized') targetState = 'normal';
            else if (calloutState === 'normal') targetState = 'expanded';
          }
        } else if (Math.abs(dy) > DRAG_THRESHOLD) {
          console.log('DISTANCE-BASED decision - threshold exceeded:', Math.abs(dy), '>', DRAG_THRESHOLD);
          if (dy > 0) {
            console.log('DRAGGED DOWN');
            if (calloutState === 'expanded') targetState = 'normal';
            else if (calloutState === 'normal') targetState = 'minimized';
          } else {
            console.log('DRAGGED UP');
            if (calloutState === 'minimized') targetState = 'normal';
            else if (calloutState === 'normal') targetState = 'expanded';
          }
        }
        console.log('TARGET STATE decided:', targetState);
        setCalloutStateWithAnimation(targetState);
      }
    })
  ).current;

  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (calloutState === 'expanded') {
        setCalloutStateWithAnimation('normal');
        return true;
      }
      return false;
    });
    
    return () => backHandler.remove();
  }, [calloutState]);

  useEffect(() => {
    console.log("Initial callout animation effect");
    setCalloutStateWithAnimation('normal');
  }, []);

  const handleTouchStart = (e: NativeSyntheticEvent<any>) => {
    touchStartX.current = e.nativeEvent.pageX;
    touchStartY.current = e.nativeEvent.pageY;
  };

  const handleTouchEnd = (e: NativeSyntheticEvent<any>) => {
    const touchEndX = e.nativeEvent.pageX;
    const touchEndY = e.nativeEvent.pageY;
    
    const swipeX = touchStartX.current - touchEndX;
    const swipeY = Math.abs(touchStartY.current - touchEndY);
    
    if (Math.abs(swipeX) > 50 && swipeY < 50) {
      if (swipeX > 0) {
        if (activeTab === 'events' && hasSpecials) {
          handleTabChange('specials');
        } else if ((activeTab === 'events' || activeTab === 'specials')) {
          handleTabChange('venue');
        }
      } else {
        if (activeTab === 'venue' && hasSpecials) {
          handleTabChange('specials');
        } else if (activeTab === 'venue' && hasEvents) {
          handleTabChange('events');
        } else if (activeTab === 'specials' && hasEvents) {
          handleTabChange('events');
        }
      }
    }
  };

  // Enhanced render function for content items (events and ads)
  const renderContentItem = (item: ContentItem, index: number) => {
    if (item.type === 'ad') {
      // Render ad component
      const adData = item.data as {ad: any; loading: boolean};
      return (
        <View key={`ad-${index}`} style={styles.adContainer}>
          <CompactNativeAdComponent 
            nativeAd={adData.ad}
            loading={adData.loading}
          />
        </View>
      );
    } else {
      // Render event/special card
      const event = item.data as Event;
      return (
        <TouchableOpacity 
          key={`event-${event.id}-${index}`}
          onPress={() => handleEventSelect(event)}
          activeOpacity={0.7}
          testID={index === 0 ? "event-list-item" : undefined}
        >
          <SpecialCard 
            event={event} 
            showVenueName={isMultiVenue}
            onImagePress={handleImagePress}
            isSaved={savedEvents.includes(event.id.toString())}
            isGuest={isGuest}
          />
        </TouchableOpacity>
      );
    }
  };

  const rotateZ = indicatorRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg']
  });

  //console.log("RENDER CHECK - Will lightbox render?", !!selectedImageData);
  // LOG: EventCallout final render state
    // console.log("Rendering EventCallout - isMultiVenue:", isMultiVenue, 
    //             "Callout height:", calloutState === 'expanded' ? 'EXPANDED' : 
    //                              calloutState === 'minimized' ? 'MINIMIZED' : 
    //                              `NORMAL`);

  return (
    <>
      <Animated.View 
        style={[
          styles.dimOverlay,
          { opacity: backgroundOpacity }
        ]} 
        pointerEvents="none"
      />
      
      {/* Always render the callout, but apply style changes when lightbox is open */}
      <Animated.View 
        style={[
          styles.calloutContainer,
          { 
            height: calloutState === 'expanded' ? CALLOUT_MAX_HEIGHT : 
                  calloutState === 'minimized' ? CALLOUT_MIN_HEIGHT : 
                  CALLOUT_NORMAL_HEIGHT,
            transform: [{ translateY: translateY }],
            // Apply reduced opacity when lightbox is open
            opacity: isLightboxOpen ? 0.3 : 1,
            // Disable pointer events when lightbox is open
            pointerEvents: isLightboxOpen ? 'none' : 'auto'
          }
        ]}
      >
        <View style={styles.compactHeaderContainer}>
          {/* Draggable area: Left section + Center (drag handle) */}
          <View style={styles.headerDraggableArea} {...panResponder.panHandlers}>
            <View style={styles.headerLeftSection}>
              <Text style={styles.venueTitleSmall} numberOfLines={1}>
                {isMultiVenue 
                  ? `${venues.length} Venues | ${venues.reduce((total, v) => total + v.events.length, 0)} Items`
                  : events.length > 0 && specials.length > 0 
                    ? `${events.length} Events | ${specials.length} Specials`
                    : events.length > 0 
                      ? `${events.length} Events` 
                      : specials.length > 0 
                        ? `${specials.length} Specials`
                        : `${activeVenue.venue}`
                }
              </Text>
            </View>
            <View style={styles.headerCenterSectionAbsolute}>
              <View style={styles.handleContainer}>
                <View style={styles.handle} />
                <Animated.View style={{ transform: [{ rotateZ }], marginTop: 4 }}>
                  <MaterialIcons name="keyboard-arrow-up" size={20} color="#999999" />
                </Animated.View>
              </View>
            </View>
          </View>
          {/* Non-draggable area: Right section with reset and close buttons */}
          <View style={styles.headerRightSection}>
            <TouchableOpacity 
              onPress={() => setCalloutStateWithAnimation('normal')} 
              style={styles.resetButton}
              activeOpacity={0.7}
            >
              <MaterialIcons name="unfold-less" size={18} color="#666666" />
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={() => {
                console.log("🔴 CALLOUT DEBUG: CLOSE BUTTON PRESSED");
                onClose();
                console.log("🔴 CALLOUT DEBUG: After onClose() call");
              }} 
              style={styles.closeButton} 
              activeOpacity={0.7}
            >
              <MaterialIcons name="close" size={22} color="#666666" />
            </TouchableOpacity>
          </View>
        </View>
        
        <View 
  testID="venue-selector" 
  ref={(ref) => {
  if (ref && global.tutorialManager) {
    ref.measure((x, y, width, height, pageX, pageY) => {
      console.log('🔍 VENUE MEASUREMENT: Got coordinates:', { x, y, width, height, pageX, pageY });
      if (global.tutorialManager) {
        global.tutorialManager.setVenueSelectorMeasurement = {
          x: pageX,
          y: pageY,
          width,
          height
        };
        console.log('🔍 VENUE MEASUREMENT: Stored in global:', global.tutorialManager.setVenueSelectorMeasurement);
      }
    });
  }
}}
>
  <VenueSelector
    venues={venues}
    activeVenueIndex={activeVenueIndex}
    onSelectVenue={handleVenueSelect}
    onScroll={handleVenueScroll}
  />
</View>
        
        {/* Venue Selector Progress Bar */}
        {venueCanScrollMore && (
          <View style={styles.venueProgressContainer}>
            <View style={[styles.venueProgressBar, { width: `${venueScrollProgress * 100}%` }]} />
          </View>
        )}
        
        {/* Divider between venue selector and tabs */}
        <View style={styles.venueSelectorDivider} />
        
        <View testID="event-tabs" data-testid="event-tabs">
          <EventTabs 
            activeTab={activeTab} 
            onChangeTab={handleTabChange}
            eventCount={events.length}
            specialCount={specials.length}
            venueCount={venues.length}
          />
        </View>
        
        <View style={styles.contentContainer}>
        <ScrollView 
            ref={scrollViewRef}
            style={styles.calloutContent}
            showsVerticalScrollIndicator={false}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            scrollEventThrottle={16}
            scrollEnabled={scrollEnabled && calloutState !== 'minimized'}
            bounces={false}
            contentContainerStyle={styles.scrollContentContainer}
            onScroll={handleContentScroll}
          >
            {activeTab === 'events' && (
              <>
                {hasEvents && (
                  <View style={styles.multiEventsContainer}>
                    {/* Use the mixed content array instead of directly mapping events */}
                    {mixedEventsContent.map((item, index) => renderContentItem(item, index))}
                  </View>
                )}
              </>
            )}
            
            {activeTab === 'specials' && (
              <>
                {hasSpecials && (
                  <View style={styles.multiEventsContainer}>
                    {/* Use the mixed content array instead of directly mapping specials */}
                    {mixedSpecialsContent.map((item, index) => renderContentItem(item, index))}
                  </View>
                )}
              </>
            )}
            
            {activeTab === 'venue' && (
              <VenueInfoContent venue={activeVenue} />
            )}
            
            <View style={styles.smallBottomPadding} />
          </ScrollView>
          
          {/* Vertical Scroll Progress Bar */}
          {canScrollMore && (
            <View style={styles.verticalProgressContainer}>
              <View style={[styles.verticalProgressBar, { height: `${scrollProgress * 100}%` }]} />
            </View>
          )}
        </View>
      </Animated.View>

      {/* Render the lightbox modal when needed */}
      {selectedImageData && (
        <Modal
          transparent={true}
          visible={true}
          animationType="fade"
          onRequestClose={handleModalClose}
          statusBarTranslucent={true}
          presentationStyle="overFullScreen"
          hardwareAccelerated={true}
        >
          <EventImageLightbox
            imageUrl={selectedImageData.imageUrl}
            event={selectedImageData.event}
            onClose={handleModalClose}
          />
        </Modal>
      )}

      {/* =============================================================== */}
      {/* GUEST LIMITATION REGISTRATION PROMPT - ONLY FOR GUESTS */}
      {/* =============================================================== */}
      {isGuest && <RegistrationPrompt />}
    </>
  );
};

// Badge styles - separate StyleSheet for organization
const badgeStyles = StyleSheet.create({
  badgeContainer: {
    position: 'absolute',
    top: 5,
    right: 5,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    zIndex: 10,
  },
  // Individual badge styles - Updated for condensed display
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
  // Compact badge styles
  compactBadge: {
    marginLeft: 3, // Reduced margin
  },
  iconOnlyBadge: {
    paddingHorizontal: 5, // Reduced horizontal padding
  },
  // Badge text styles
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
});

const styles = StyleSheet.create({
  dimOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
    zIndex: 1,
  },
  calloutContainer: {
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
    zIndex: 5, 
    overflow: 'hidden',
  },
  compactHeaderContainer: {
    flexDirection: 'row',
    paddingHorizontal: 18,
    paddingVertical: 8,
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  // New wrapper for the draggable area (left + center)
  headerDraggableArea: {
    flexDirection: 'row',
    flex: 1,
    alignItems: 'center',
  },
  headerLeftSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-start',
    marginLeft: 5,
  },
  headerRightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: 5,
  },
  headerCenterSectionAbsolute: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 9,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#DDDDDD',
  },
  venueTitleSmall: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333333',
    textAlign: 'center',
  },
  resetButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    marginRight: 8,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    zIndex: 10,
  },
  venueSelectorDivider: {
    height: 1,
    backgroundColor: '#E0E0E0',
    marginHorizontal: 0,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F8F8F8',
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: 'space-around',
    gap: 8,
  },
  tabPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    minHeight: 36,
  },
  activeTabPill: {
    backgroundColor: '#E94E77',
    borderColor: '#E94E77',
    shadowColor: '#E94E77',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  tabIcon: {
    marginRight: 4,
  },
  tabPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666666',
  },
  activeTabPillText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  contentContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  scrollContentContainer: {
    flexGrow: 1,
  },
  calloutContent: {
    flex: 1,
  },
  smallBottomPadding: {
    height: 16,
  },
  // Vertical scroll indicator styles
  verticalProgressContainer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 2,
    width: 3,
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: 1.5,
  },
  verticalProgressBar: {
    width: '100%',
    backgroundColor: '#E94E77',
    borderRadius: 1.5,
  },
  // Venue selector progress bar styles
  venueProgressContainer: {
    height: 3,
    backgroundColor: 'rgba(0,0,0,0.1)',
    marginHorizontal: 12,
  },
  venueProgressBar: {
    height: '100%',
    backgroundColor: '#E94E77',
    borderRadius: 1.5,
  },
  // Ad container styling
  adContainer: {
    marginBottom: 12,
  },
  carouselContainer: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  eventCard: {
    width: 200,
    height: 120,
    backgroundColor: '#F8F8F8',
    borderRadius: 12,
    marginRight: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#EEEEEE',
    position: 'relative',
    overflow: 'hidden',
  },
  selectedEventCard: {
    borderColor: '#E94E77',
    borderWidth: 2,
    backgroundColor: '#FFF5F7',
  },
  nowEventCard: {
    borderColor: '#34A853',
    borderWidth: 2,
    backgroundColor: '#E6F4EA',
  },
  cardCategoryIndicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 5,
    height: '100%',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333333',
    marginLeft: 8,
    marginBottom: 4,
  },
  cardDateTime: {
    fontSize: 12,
    color: '#666666',
    marginLeft: 8,
    marginBottom: 6,
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
  nowIndicator: {
    position: 'absolute',
    top: 5,
    right: 5,
    backgroundColor: '#34A853',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  nowIndicatorText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  venueSelectorWrapper: {
    backgroundColor: '#F8F8F8',
    paddingVertical: 8,
  },
  venueSelectorContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  singleVenueSelectorContainer: {
    justifyContent: 'center',
    flexGrow: 1,
  },
  venueOption: {
    flexGrow: 1,
    width: 90,
    marginHorizontal: 5,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: '#EEEEEE',
  },
  singleVenueOption: {
    width: 150,
  },
  venueOptionActive: {
    borderColor: '#E94E77',
    backgroundColor: '#FFF5F7',
    borderWidth: 2,
  },
  venueOptionName: {
    fontSize: 12,
    fontWeight: '500',
    color: '#333333',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 2,
  },
  venueOptionNameActive: {
    color: '#E94E77',
    fontWeight: '700',
  },
  venueProfileImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
  },
  venuePlaceholderImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E0E0E0',
  },
  venueItemCounts: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  countContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 2,
  },
  countText: {
    fontSize: 12,
    color: '#666666',
    marginRight: 2,
  },
  multiEventsContainer: {
    padding: 0, // Remove padding to allow full-width cards
  },
  multiEventCard: {
    marginBottom: 0, // Remove margin since we're using dividers
    overflow: 'hidden',
  },
  // Removed cardDivider - now using borderBottom on each card like events tab
  specialCard: {
    backgroundColor: '#FFFFFF',
    paddingBottom: 12,
    overflow: 'hidden',
    position: 'relative',
    // Remove borderRadius for full-width effect
    // Remove elevation/shadow for cleaner full-width look
    borderBottomWidth: 6, // Thicker divider like events tab
    borderBottomColor: '#E8E8E8', // More visible gray, similar to events tab
  },
  nowSpecialCard: {
    borderLeftColor: '#34A853',
    borderLeftWidth: 4, // Thick left border instead of full border
    backgroundColor: '#FAFFF9',
  },
  interestMatchCard: {
    borderLeftColor: BRAND.primary, // Updated to primary blue
    borderLeftWidth: 4, // Thick left border instead of full border
    backgroundColor: '#F5F9FF', // Light blue tint
  },
  savedCard: {
    borderLeftColor: '#FFD700', // Gold for saved
    borderLeftWidth: 4, // Thick left border instead of full border
    backgroundColor: '#FFFBEB', // Very light gold tint
  },
  cardIndicator: {
    width: 3, // Slightly thinner for cleaner look
    height: '100%',
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: 1,
  },
  cardTopSection: {
    flexDirection: 'row',
    paddingHorizontal: 16, // Horizontal padding for edge spacing
    paddingVertical: 12,
    paddingBottom: 8, // Reduced to closer connect with description
  },
  contentSection: {
    width: '65%', // Make sure content section is 65% of the width
    paddingRight: 8,
  },
  imageSection: {
    width: '35%', // Make sure image section is 35% of the width
    height: 'auto',
    position: 'relative', // For proper badge positioning
  },
  cardImage: {
    width: '100%',
    height: 100,
    borderRadius: 8,
    backgroundColor: '#F0F0F0',
  },
  // Added new description section that takes full width
  descriptionSection: {
    paddingHorizontal: 16, // Match horizontal padding with top section
    paddingBottom: 8,
  },

  venueNameText: {
    fontSize: 12,
    color: '#666666',
    marginBottom: 2,
    fontStyle: 'italic',
  },
  dateTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  dateTimeText: {
    fontSize: 13,
    color: '#666666',
    marginLeft: 4,
    flex: 1, // Allow text to take available space
  },
  engagementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
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

  
  readMoreButton: {
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  readMoreText: {
    color: BRAND.primary, // Updated to primary blue
    fontWeight: '500',
    fontSize: 12,
  },
  cardNowIndicator: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#34A853',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardNowText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  specialCardTopSection: {
    flexDirection: 'row',
    minHeight: 120,
  },
  specialCardContent: {
    width: '65%',
    padding: 12,
    paddingLeft: 16,
  },
  specialCardRightSection: {
    width: '35%',
    height: 120,
  },
  specialCardImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F0F0F0',
  },
  specialCardTitle: {
    fontSize: 16,
    fontWeight: '800' ,
    color: '#333333',
    marginBottom: 12,
  },

  specialCardDateTime: {
    fontSize: 12,
    color: '#666666',
    marginLeft: 4,
  },
  specialCardDescription: {
    fontSize: 14,
    color: '#555555',
    lineHeight: 18,
    marginBottom: 4,
  },

  cardBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16, // Match horizontal padding with other sections
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
  // Note: categoryButton2 to avoid conflict with the filter categoryButton
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
  // Added style for Ticketed Event badge
  ticketedEventBadge: {
    backgroundColor: '#F0F8FF', // Light blue background
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
    color: BRAND.accent, // Updated to accent red
    fontSize: 12,
    fontWeight: '500',
  },
  buyTicketsButton: {
    backgroundColor: BRAND.accent, // Updated to accent red
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
  // Premium feature disabled styles for guests
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
  // New circular background for action buttons
  actionButtonCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  nowBanner: {
    backgroundColor: '#E6F4EA',
    padding: 10,
    marginBottom: 16,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  nowBannerText: {
    color: '#34A853',
    fontWeight: 'bold',
    fontSize: 16,
  },
  pulsingEffect: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#34A853',
  },
  detailsContainer: {
    padding: 10,
  },
  eventImage: {
    width: '80%',
    height: 180,
    borderRadius: 12,
    marginBottom: 16,
    alignSelf: 'center',
    backgroundColor: '#F0F0F0',
  },
  eventTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 10,
    color: '#333333',
  },
  eventMetaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  categoryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    marginRight: 10,
    marginBottom: 6,
  },

  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  eventTime: {
    fontSize: 14,
    color: '#666666',
    marginLeft: 6,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  ticketPrice: {
    fontSize: 14,
    color: '#E94E77',
    fontWeight: '600',
    marginLeft: 6,
  },
  descriptionContainer: {
    marginBottom: 20,
    alignItems: 'center',
  },
  eventDescription: {
    fontSize: 15,
    color: '#333333',
    lineHeight: 22,
  },
  expandButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  expandButtonText: {
    color: '#E94E77',
    fontWeight: '500',
    fontSize: 14,
  },
  actionContainer: {
    flexDirection: 'row',
    marginTop: 8,
    padding: 12,
    backgroundColor: '#F8F8F8',
    borderRadius: 12,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  actionText: {
    fontSize: 13,
    color: '#444444',
    marginLeft: 6,
  },
  ticketButton: {
    backgroundColor: '#E94E77',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  ticketButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  venueInfoContainer: {
    padding: 16,
  },
  venueDetailSection: {
    marginBottom: 24,
  },
  venueName: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 6,
    color: '#333333',
  },
  venueAddress: {
    fontSize: 15,
    color: '#666666',
    marginBottom: 16,
  },
  directionsButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  directionsButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  upcomingEventsTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    color: '#333333',
  },
  dateSection: {
    marginBottom: 20,
  },
  dateHeader: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333333',
    marginBottom: 10,
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  venueEventItem: {
    flexDirection: 'row',
    marginBottom: 12,
    paddingLeft: 4,
    position: 'relative',
    overflow: 'hidden',
  },
  nowVenueEventItem: {
    backgroundColor: '#E6F4EA',
    borderRadius: 8,
    padding: 6,
  },
  eventTimeIndicator: {
    width: 4,
    borderRadius: 2,
    marginRight: 10,
  },
  venueEventDetails: {
    flex: 1,
  },
  venueEventTime: {
    fontSize: 13,
    color: '#666666',
    marginBottom: 3,
  },
  venueEventTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#333333',
  },
  nowVenueEventTitle: {
    color: '#34A853',
    fontWeight: '700',
  },
  inlineNowIndicator: {
    backgroundColor: '#34A853',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  inlineNowText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  }
});

export default EventCallout;