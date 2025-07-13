import React, { useEffect, useState } from 'react';
import { View, Text, Animated, Easing } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

// Mini version of the broadcasting effect for tutorial with complete tree structure - COMPACT
export const TutorialBroadcastingEffect: React.FC = () => {
  const [animation] = useState(new Animated.Value(0));
  
  useEffect(() => {
    const createAnimation = () => {
      return Animated.loop(
        Animated.sequence([
          Animated.timing(animation, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true,
            easing: Easing.linear
          }),
          Animated.timing(animation, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true
          })
        ])
      );
    };
    
    createAnimation().start();
    
    return () => animation.stopAnimation();
  }, []);
  
  const opacity = animation.interpolate({
    inputRange: [0, 0.3, 1],
    outputRange: [0.6, 0.4, 0],
    extrapolate: 'clamp'
  });
  
  const scale = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 2.5],
    extrapolate: 'clamp'
  });
  
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      {/* Broadcasting effect rings - slightly smaller */}
      <View style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View
          style={{
            position: 'absolute',
            width: 20,
            height: 20,
            borderRadius: 10,
            borderWidth: 2,
            borderColor: '#34A853',
            opacity,
            transform: [{ scale }]
          }}
        />
        {/* Tree top (circle) - slightly smaller */}
        <View style={{
          width: 15,
          height: 15,
          borderRadius: 7.5,
          backgroundColor: '#34A853',
          borderWidth: 2,
          borderColor: '#FFFFFF'
        }} />
      </View>
      
      {/* Tree trunk - smaller */}
      <View style={{
        width: 6,
        height: 5,
        backgroundColor: '#34A853',
        marginTop: -2
      }} />
    </View>
  );
};

// Yellow "Today" tree - COMPACT
export const TutorialTodayTree: React.FC = () => (
  <View style={{ alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{
        width: 15,
        height: 15,
        borderRadius: 7.5,
        backgroundColor: '#FBBC05',
        borderWidth: 2,
        borderColor: '#FFFFFF'
      }} />
    </View>
    <View style={{
      width: 6,
      height: 5,
      backgroundColor: '#FBBC05',
      marginTop: -2
    }} />
  </View>
);

// Gray "Upcoming" tree - COMPACT
export const TutorialUpcomingTree: React.FC = () => (
  <View style={{ alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{
        width: 15,
        height: 15,
        borderRadius: 7.5,
        backgroundColor: '#9AA0A6',
        borderWidth: 2,
        borderColor: '#FFFFFF'
      }} />
    </View>
    <View style={{
      width: 6,
      height: 5,
      backgroundColor: '#9AA0A6',
      marginTop: -2
    }} />
  </View>
);

// Mini "N" badge for tutorial - COMPACT
export const TutorialNBadge: React.FC = () => (
  <View style={{
    backgroundColor: '#FF5722',
    width: 14,
    height: 14,
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FFFFFF'
  }}>
    <Text style={{
      color: '#FFFFFF',
      fontSize: 9,
      fontWeight: 'bold'
    }}>N</Text>
  </View>
);

// Mini "T" badge for tutorial (Today) - COMPACT
export const TutorialTBadge: React.FC = () => (
  <View style={{
    backgroundColor: '#F59E0B',
    width: 14,
    height: 14,
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FFFFFF'
  }}>
    <Text style={{
      color: '#FFFFFF',
      fontSize: 9,
      fontWeight: 'bold'
    }}>T</Text>
  </View>
);

// Mini "NOW" badge for tutorial - COMPACT
export const TutorialNowBadge: React.FC = () => (
  <View style={{
    backgroundColor: '#34A853',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3
  }}>
    <Text style={{ 
      color: '#FFFFFF', 
      fontSize: 9, 
      fontWeight: 'bold' 
    }}>
      NOW
    </Text>
  </View>
);

// Individual icon button component - COMPACT VERSION
const IconButton: React.FC<{ icon: string; label: string }> = ({ icon, label }) => (
  <View style={{
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 8,
    minWidth: 75,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  }}>
    <MaterialIcons name={icon as any} size={20} color="#4B5563" />
    <Text style={{
      fontSize: 10,
      color: '#374151',
      textAlign: 'center',
      marginTop: 4,
      fontWeight: '600',
      lineHeight: 12
    }}>
      {label}
    </Text>
  </View>
);

// Demo icon legend component - COMPACT VERSION WITH BACKGROUND PANEL
export const IconLegendDemo: React.FC = () => (
  <View style={{ marginVertical: 8 }}>
    {/* Top divider - separates explanation text from legend content */}
    <View style={{
      height: 1,
      backgroundColor: '#E9ECEF',
      marginHorizontal: 15,
      marginBottom: 12
    }} />
    
    {/* Legend Panel Container */}
    <View style={{
      backgroundColor: '#F8FAFC', // Light gray background
      borderRadius: 12,
      padding: 12,
      marginHorizontal: 8,
      borderWidth: 1,
      borderColor: 'rgba(226, 232, 240, 0.5)', // Very light border
      // Subtle shadow
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 1,
    }}>
      {/* Row 1: Three basic icons - compact */}
      <View style={{ 
        flexDirection: 'row', 
        justifyContent: 'space-between',
        marginBottom: 10,
        paddingHorizontal: 2
      }}>
        <IconButton icon="event" label="# of Events" />
        <IconButton icon="restaurant" label="# of Specials" />
        <IconButton icon="home" label="Number of Venues" />
      </View>
      
      {/* Section divider - thinner margins */}
      <View style={{
        height: 1,
        backgroundColor: '#E2E8F0',
        marginHorizontal: 8,
        marginBottom: 10
      }} />
      
      {/* Row 2: Tree markers - compact */}
      <View style={{ marginBottom: 10 }}>
        <Text style={{
          fontSize: 12,
          fontWeight: '600',
          color: '#4A5568',
          textAlign: 'center',
          marginBottom: 8
        }}>
          Event Timing
        </Text>
        
        <View style={{ 
          flexDirection: 'row', 
          justifyContent: 'space-between',
          paddingHorizontal: 2
        }}>
          {/* Green pulsing "now" tree - compact */}
          <View style={{
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#F0FDF4',
            borderRadius: 8,
            padding: 8,
            flex: 0.31,
            borderWidth: 1.5,
            borderColor: '#BBF7D0'
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 1 }}>
              <TutorialBroadcastingEffect />
              <View style={{ marginLeft: 4 }}>
                <TutorialNBadge />
              </View>
            </View>
            <Text style={{ 
              fontSize: 10, 
              color: '#166534',
              textAlign: 'center',
              fontWeight: '600'
            }}>
              Happening Now
            </Text>
          </View>
          
          {/* Yellow "today" tree - compact */}
          <View style={{
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#FFFBEB',
            borderRadius: 8,
            padding: 8,
            flex: 0.31,
            borderWidth: 1.5,
            borderColor: '#FDE68A'
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 1 }}>
              <TutorialTodayTree />
              <View style={{ marginLeft: 4 }}>
                <TutorialTBadge />
              </View>
            </View>
            <Text style={{ 
              fontSize: 10, 
              color: '#92400E',
              textAlign: 'center',
              fontWeight: '600'
            }}>
              Today
            </Text>
          </View>
          
          {/* Gray "upcoming" tree - compact */}
          <View style={{
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#F9FAFB',
            borderRadius: 8,
            padding: 8,
            flex: 0.31,
            borderWidth: 1.5,
            borderColor: '#D1D5DB'
          }}>
            <TutorialUpcomingTree />
            <Text style={{ 
              fontSize: 10, 
              color: '#374151',
              textAlign: 'center',
              marginTop: 6,
              fontWeight: '600'
            }}>
              Upcoming
            </Text>
          </View>
        </View>
      </View>
      
      {/* Section divider - thinner margins */}
      <View style={{
        height: 1,
        backgroundColor: '#E2E8F0',
        marginHorizontal: 8,
        marginVertical: 10
      }} />
      
      {/* Row 3: Status badges - compact */}
      <View>
        <Text style={{
          fontSize: 12,
          fontWeight: '600',
          color: '#4A5568',
          textAlign: 'center',
          marginBottom: 8
        }}>
          Status Indicators
        </Text>
        
        <View style={{ 
          flexDirection: 'row', 
          justifyContent: 'space-between',
          paddingHorizontal: 2
        }}>
          {/* NOW badge - compact */}
          <View style={{
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#F0FDF4',
            borderRadius: 8,
            padding: 12,
            flex: 0.47,
            borderWidth: 1.5,
            borderColor: '#BBF7D0'
          }}>
            <TutorialNowBadge />
            <Text style={{
              fontSize: 10,
              color: '#166534',
              textAlign: 'center',
              marginTop: 6,
              fontWeight: '600'
            }}>
              It's Happening Now
            </Text>
          </View>
          
          {/* Thumbs up - compact */}
          <View style={{
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#EFF6FF',
            borderRadius: 8,
            padding: 12,
            flex: 0.47,
            borderWidth: 1.5,
            borderColor: '#BFDBFE'
          }}>
            <MaterialIcons name="thumb-up" size={20} color="#1E90FF" />
            <Text style={{
              fontSize: 10,
              color: '#1E40AF',
              textAlign: 'center',
              marginTop: 6,
              fontWeight: '600'
            }}>
              It's in your interests
            </Text>
          </View>
        </View>
      </View>
    </View>
  </View>
);