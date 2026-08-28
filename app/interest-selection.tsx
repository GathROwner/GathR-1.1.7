import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  Animated,
  Dimensions
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { auth, firestore } from '../config/firebaseConfig';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { EVENT_CATEGORIES, SPECIAL_CATEGORIES } from '../constants/eventCategories';

// Define the interest categories (matching InterestFilterPills icon mapping)
const CATEGORY_ICON: Record<string, { icon: string; iconLib: string }> = {
  'Live Music': { icon: 'audiotrack', iconLib: 'MaterialIcons' },
  'Trivia Night': { icon: 'psychology-alt', iconLib: 'MaterialIcons' },
  Comedy: { icon: 'sentiment-very-satisfied', iconLib: 'MaterialIcons' },
  'Workshops & Classes': { icon: 'school', iconLib: 'Ionicons' },
  Religious: { icon: 'church', iconLib: 'MaterialIcons' },
  Sports: { icon: 'sports-basketball', iconLib: 'MaterialIcons' },
  'Family Friendly': { icon: 'family-restroom', iconLib: 'MaterialIcons' },
  'Gatherings & Parties': { icon: 'nightlife', iconLib: 'MaterialIcons' },
  Cinema: { icon: 'theaters', iconLib: 'MaterialIcons' },
  'Happy Hour': { icon: 'local-bar', iconLib: 'MaterialIcons' },
  'Food Special': { icon: 'restaurant', iconLib: 'MaterialIcons' },
  'Drink Special': { icon: 'wine-bar', iconLib: 'MaterialIcons' },
};

const EVENT_INTERESTS = EVENT_CATEGORIES.map((name) => ({ name, ...CATEGORY_ICON[name] }));
const SPECIAL_INTERESTS = SPECIAL_CATEGORIES.map((name) => ({ name, ...CATEGORY_ICON[name] }));

// Get screen dimensions to calculate button sizes and optimize layout
const { width } = Dimensions.get('window');
const BUTTON_MARGIN = 4;
const COLUMN_COUNT = 3;
const BUTTON_WIDTH = (width - 40 - (COLUMN_COUNT * 2 * BUTTON_MARGIN)) / COLUMN_COUNT;

export default function InterestSelection() {
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scaleAnim] = useState(new Animated.Value(1));
  const router = useRouter();
  const params = useLocalSearchParams();
  
  // Check if we came from profile using the URL parameter
  const isFromProfile = params.fromProfile === 'true';

  // Animation when selecting interests
  const animateSelection = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 1.03,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      })
    ]).start();
  };

  // 🎯 TUTORIAL INTEGRATION: Function to trigger tutorial for new users
  const triggerTutorialIfNeeded = () => {
    // Only trigger tutorial for new users (not coming from profile)
    if (!isFromProfile) {
      console.log('=== TUTORIAL TRIGGER DEBUG ===');
      console.log('isFromProfile:', isFromProfile);
      console.log('Available global functions:', Object.keys(global).filter(key => key.includes('Tutorial')));
      
      // Try manual trigger first (more reliable)
      // @ts-ignore - Global function added by TutorialManager
      if (typeof global.manualTriggerGathRTutorial === 'function') {
        console.log('Using manual trigger (recommended)');
        // @ts-ignore
        global.manualTriggerGathRTutorial();
      }
      // Fallback to auto trigger
      // @ts-ignore - Global function added by TutorialManager
      else if (typeof global.autoTriggerGathRTutorial === 'function') {
        console.log('Using auto trigger (fallback)');
        // @ts-ignore
        global.autoTriggerGathRTutorial();
      } else {
        console.warn('Tutorial system not available - no global functions found');
        console.log('Available globals:', Object.keys(global).slice(0, 10), '...');
      }
    } else {
      console.log('User came from profile - not triggering tutorial');
    }
  };

  // Check if user is authenticated and fetch existing interests
  useEffect(() => {
    const checkAuthAndFetchInterests = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        // Redirect to login if not authenticated
        router.replace('/');
        return;
      }

      try {
        // Fetch user's existing interests
        const userDoc = await getDoc(doc(firestore, 'users', currentUser.uid));
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          if (userData.userInterests && Array.isArray(userData.userInterests)) {
            setSelectedInterests(userData.userInterests);
          }
        }
      } catch (error) {
        console.error('Error fetching user interests:', error);
      } finally {
        setLoading(false);
      }
    };

    checkAuthAndFetchInterests();
  }, [router]);

  const toggleInterest = (interest: string) => {
    animateSelection();
    setSelectedInterests(prev => 
      prev.includes(interest)
        ? prev.filter(item => item !== interest)
        : [...prev, interest]
    );
  };

  const isInterestSelected = (interest: string) => {
    return selectedInterests.includes(interest);
  };

  const saveInterests = async () => {
    if (selectedInterests.length === 0) {
      Alert.alert(
        'Select Interests',
        'Please select at least one interest to continue.',
        [{ text: 'OK' }]
      );
      return;
    }

    setSaving(true);
    
    try {
      const userId = auth.currentUser?.uid;
      if (!userId) {
        throw new Error('User not authenticated');
      }

      // Update the user document with selected interests
      const userRef = doc(firestore, 'users', userId);
      
      // Get the current user data
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        await updateDoc(userRef, {
          userInterests: selectedInterests,
          lastUpdated: new Date()
        });
        
        // Navigate back to profile if coming from there, otherwise to main app
        if (isFromProfile) {
          router.back();
        } else {
          // 🎯 TUTORIAL INTEGRATION: Navigate to map screen for new users
          router.replace('/(tabs)/map');
          
          // 🎯 TUTORIAL INTEGRATION: Trigger tutorial after navigation
          // Small delay to let the map screen settle before showing tutorial
          setTimeout(() => {
            triggerTutorialIfNeeded();
          }, 1000);
        }
      } else {
        throw new Error('User document not found');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      Alert.alert('Error', `Failed to save your interests: ${errorMessage}`);
      console.error('Error saving interests:', error);
    } finally {
      setSaving(false);
    }
  };

  const skipSelection = () => {
    // Navigate to the main app without saving interests
    if (isFromProfile) {
      router.back();
    } else {
      router.replace('/(tabs)/map');
      
      // 🎯 TUTORIAL INTEGRATION: Still trigger tutorial even if user skipped interests
      // Some users might skip interests but still want to learn how to use the app
      setTimeout(() => {
        triggerTutorialIfNeeded();
      }, 1000);
    }
  };

  const renderInterestButton = (interestItem: { name: string, icon: string, iconLib: string }) => {
    const isSelected = isInterestSelected(interestItem.name);

    const IconComponent = interestItem.iconLib === 'Ionicons' ? Ionicons : MaterialIcons;

    return (
      <Pressable
        key={interestItem.name}
        style={[
          styles.interestButton,
          isSelected && styles.selectedInterestButton,
          { width: BUTTON_WIDTH }
        ]}
        onPress={() => toggleInterest(interestItem.name)}
        accessibilityRole="checkbox"
        accessibilityLabel={interestItem.name}
        accessibilityState={{ checked: isSelected }}
      >
        <IconComponent
          name={interestItem.icon as any}
          size={14}
          color={isSelected ? '#FFFFFF' : '#4A90E2'}
          style={styles.interestIcon}
        />
        <Text
          maxFontSizeMultiplier={1.1}
          style={[
            styles.interestButtonText,
            isSelected && styles.selectedInterestButtonText,
          ]}
          adjustsFontSizeToFit
          minimumFontScale={0.72}
          numberOfLines={2}
        >
          {interestItem.name}
        </Text>
        {isSelected && (
          <View style={styles.checkmarkContainer}>
            <Ionicons name="checkmark-circle" size={14} color="#FFFFFF" />
          </View>
        )}
      </Pressable>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1E90FF" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.screenContent}>
        {/* Progress indicator */}
        {!isFromProfile && <View style={styles.progressContainer}>
          <View style={styles.progressStep}>
            <View style={[styles.progressDot, styles.completedDot]} />
            <Text style={styles.progressText}>Account</Text>
          </View>
          <View style={styles.progressLine} />
          <View style={styles.progressStep}>
            <View style={[styles.progressDot, styles.activeDot]} />
            <Text style={[styles.progressText, styles.activeText]}>Interests</Text>
          </View>
          <View style={styles.progressLine} />
          <View style={styles.progressStep}>
            <View style={styles.progressDot} />
            <Text style={styles.progressText}>Explore</Text>
          </View>
        </View>}

        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text maxFontSizeMultiplier={1.15} numberOfLines={1} style={styles.title}>{isFromProfile ? 'Your interests' : 'Personalize GathR'}</Text>
            <Animated.View style={[styles.selectionBadge, { transform: [{ scale: scaleAnim }] }]}>
              <Text maxFontSizeMultiplier={1.05} style={[styles.selectionBadgeText, selectedInterests.length > 0 && styles.activeSelectionCount]}>{selectedInterests.length} selected</Text>
            </Animated.View>
          </View>
          <Text maxFontSizeMultiplier={1.1} numberOfLines={2} style={styles.subtitle}>
            Choose what you want to see in events and specials.
          </Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="calendar" size={20} color="#333333" />
            <Text maxFontSizeMultiplier={1.1} style={styles.sectionTitle}>Event types</Text>
            <Text maxFontSizeMultiplier={1.05} style={styles.categoryCount}>
              {selectedInterests.filter(item => EVENT_INTERESTS.some(event => event.name === item)).length}/9
            </Text>
          </View>
          <View style={styles.interestGrid}>
            {EVENT_INTERESTS.map((interest) => renderInterestButton(interest))}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="pricetag" size={20} color="#333333" />
            <Text maxFontSizeMultiplier={1.1} style={styles.sectionTitle}>Special offers</Text>
            <Text maxFontSizeMultiplier={1.05} style={styles.categoryCount}>
              {selectedInterests.filter(item => SPECIAL_INTERESTS.some(special => special.name === item)).length}/3
            </Text>
          </View>
          <View style={styles.interestGrid}>
            {SPECIAL_INTERESTS.map((interest) => renderInterestButton(interest))}
          </View>
        </View>

        <View style={styles.buttonContainer}>
          <Pressable
            style={styles.saveButton}
            onPress={saveInterests}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Text maxFontSizeMultiplier={1.1} style={styles.saveButtonText}>{isFromProfile ? 'Save' : 'Continue'}</Text>
                <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
              </>
            )}
          </Pressable>

          <Pressable
            style={styles.skipButton}
            onPress={skipSelection}
            disabled={saving}
          >
            <Text maxFontSizeMultiplier={1.1} style={styles.skipButtonText}>
              {isFromProfile ? 'Cancel' : 'Skip for Now'}
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F8FF', // Slightly cooler light blue
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F8FF',
  },
  screenContent: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    gap: 10,
  },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  progressStep: {
    alignItems: 'center',
  },
  progressDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#E0E0E0',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    marginBottom: 2,
  },
  completedDot: {
    backgroundColor: '#4CAF50',
  },
  activeDot: {
    backgroundColor: '#4A90E2',
  },
  progressLine: {
    height: 2,
    width: 40,
    backgroundColor: '#E0E0E0',
    marginHorizontal: 8,
  },
  progressText: {
    fontSize: 11,
    color: '#888888',
  },
  activeText: {
    color: '#4A90E2',
    fontWeight: '600',
  },
  header: {
    gap: 3,
    marginBottom: 2,
  },
  titleRow: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  title: {
    flex: 1,
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333333',
  },
  subtitle: {
    fontSize: 14,
    color: '#666666',
    lineHeight: 18,
  },
  selectionBadge: {
    minHeight: 30,
    justifyContent: 'center',
    paddingHorizontal: 11,
    borderRadius: 15,
    backgroundColor: '#E8F0FE',
  },
  selectionBadgeText: {
    color: '#667085',
    fontSize: 12,
    fontWeight: '700',
  },
  section: {
    gap: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 28,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: '#333333',
    marginLeft: 8,
  },
  interestGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -BUTTON_MARGIN,
  },
  interestButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 6,
    margin: BUTTON_MARGIN,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    height: 48,
  },
  selectedInterestButton: {
    backgroundColor: '#4A90E2',
    borderColor: '#3A80D2',
  },
  interestIcon: {
    marginRight: 6,
  },
  interestButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#333333',
    flexShrink: 1,
    textAlign: 'center',
    lineHeight: 15,
  },
  selectedInterestButtonText: {
    color: '#FFFFFF',
  },
  checkmarkContainer: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#4A90E2',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  categoryCount: {
    marginLeft: 'auto',
    fontSize: 12,
    color: '#888888',
  },
  activeSelectionCount: {
    color: '#4A90E2',
    fontWeight: '600',
  },
  buttonContainer: {
    marginTop: 'auto',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  saveButton: {
    flex: 1.5,
    minHeight: 48,
    backgroundColor: '#4A90E2',
    borderRadius: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    // Fixed shadow warning by ensuring solid background
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginRight: 8,
  },
  skipButton: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 10,
    backgroundColor: '#FFF',
  },
  skipButtonText: {
    color: '#666666',
    fontSize: 15,
  },
});

/**
 * 🎯 TUTORIAL INTEGRATION NOTES:
 * 
 * 1. Auto-Trigger Logic:
 *    - Only triggers for new users (not coming from profile)
 *    - Triggers after both "Save Interests" and "Skip for Now"
 *    - Uses global.autoTriggerGathRTutorial() from TutorialManager
 * 
 * 2. Timing:
 *    - 1-second delay after navigation to let map screen settle
 *    - Prevents tutorial from appearing before map is ready
 * 
 * 3. Error Handling:
 *    - Checks if global function exists before calling
 *    - Graceful fallback if tutorial system isn't available
 *    - Console logging for debugging
 * 
 * 4. User Experience:
 *    - Tutorial triggers automatically for first-time users
 *    - Existing users (from profile) don't see tutorial
 *    - Works whether user saves interests or skips
 * 
 * 5. Integration Flow:
 *    Interest Selection → Save/Skip → Navigate to Map → Tutorial Welcome Screen
 * 
 * NEXT STEPS:
 * - Test the auto-trigger by creating a new user account
 * - Add component targeting (CSS classes) to map elements
 * - Add tutorial restart option to profile screen
 */
