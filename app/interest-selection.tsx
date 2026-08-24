import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  SafeAreaView
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
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

export default function InterestSelection() {
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const params = useLocalSearchParams();
  
  // Check if we came from profile using the URL parameter
  const isFromProfile = params.fromProfile === 'true';

  const selectedEventCount = selectedInterests.filter((item) =>
    EVENT_INTERESTS.some((event) => event.name === item)
  ).length;
  const selectedSpecialCount = selectedInterests.filter((item) =>
    SPECIAL_INTERESTS.some((special) => special.name === item)
  ).length;

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
    const isWide = [
      'Workshops & Classes',
      'Family Friendly',
      'Gatherings & Parties',
    ].includes(interestItem.name);

    return (
      <Pressable
        key={interestItem.name}
        style={({ pressed }) => [
          styles.interestButton,
          isWide && styles.wideInterestButton,
          isSelected && styles.selectedInterestButton,
          pressed && styles.pressedInterestButton,
        ]}
        onPress={() => toggleInterest(interestItem.name)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isSelected }}
        accessibilityLabel={interestItem.name}
      >
        <View style={styles.interestContent}>
          <View style={[styles.interestIconBadge, isSelected && styles.selectedInterestIconBadge]}>
            <IconComponent
              name={interestItem.icon as any}
              size={18}
              color={isSelected ? '#1479D3' : '#607A95'}
            />
          </View>
          <Text
            style={[
              styles.interestButtonText,
              isSelected && styles.selectedInterestButtonText,
            ]}
            numberOfLines={2}
          >
            {interestItem.name}
          </Text>
        </View>
        {isSelected && (
          <Ionicons
            name="checkmark-circle"
            size={16}
            color="#1788EB"
            style={styles.interestCheck}
          />
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
      <Stack.Screen
        options={{
          title: isFromProfile ? 'Edit interests' : 'Choose interests',
          headerBackTitle: 'Back',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: '#FFFFFF' },
          headerTitleStyle: {
            color: '#172235',
            fontSize: 18,
            fontWeight: '700',
          },
        }}
      />
      <View style={styles.scrollContent}>
        {!isFromProfile && (
          <View style={styles.onboardingCard}>
            <View style={styles.onboardingTopRow}>
              <View>
                <Text style={styles.eyebrow}>STEP 2 OF 3</Text>
                <Text style={styles.onboardingTitle}>Your interests</Text>
              </View>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>2/3</Text>
              </View>
            </View>
            <View style={styles.progressTrack}>
              <View style={styles.progressFill} />
            </View>
            <View style={styles.progressLabels}>
              <Text style={styles.progressLabelComplete}>Account complete</Text>
              <Text style={styles.progressLabelNext}>Explore next</Text>
            </View>
          </View>
        )}

        <View style={styles.header}>
          <Text style={styles.title}>
            {isFromProfile ? 'Shape your GathR' : 'Make GathR yours'}
          </Text>
          <Text style={styles.subtitle}>
            Choose what you want GathR to surface more often. You can change this anytime.
          </Text>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeadingGroup}>
              <View style={[styles.sectionIconBadge, styles.eventIconBadge]}>
                <Ionicons name="calendar" size={19} color="#1479D3" />
              </View>
              <View>
                <Text style={styles.sectionTitle}>Events</Text>
                <Text style={styles.sectionSubtitle}>Things you’d like to do</Text>
              </View>
            </View>
            <View style={[styles.sectionCountBadge, selectedEventCount > 0 && styles.activeSectionCountBadge]}>
              <Text style={[styles.sectionCountText, selectedEventCount > 0 && styles.activeSectionCountText]}>
                {selectedEventCount}/{EVENT_INTERESTS.length}
              </Text>
            </View>
          </View>
          <View style={styles.interestGrid}>
            {EVENT_INTERESTS.map(renderInterestButton)}
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeadingGroup}>
              <View style={[styles.sectionIconBadge, styles.specialIconBadge]}>
                <Ionicons name="pricetag" size={19} color="#8C5A13" />
              </View>
              <View>
                <Text style={styles.sectionTitle}>Deals &amp; specials</Text>
                <Text style={styles.sectionSubtitle}>Offers worth knowing about</Text>
              </View>
            </View>
            <View style={[styles.sectionCountBadge, selectedSpecialCount > 0 && styles.activeSectionCountBadge]}>
              <Text style={[styles.sectionCountText, selectedSpecialCount > 0 && styles.activeSectionCountText]}>
                {selectedSpecialCount}/{SPECIAL_INTERESTS.length}
              </Text>
            </View>
          </View>
          <View style={styles.interestGrid}>
            {SPECIAL_INTERESTS.map(renderInterestButton)}
          </View>
        </View>
      </View>

      <View style={styles.actionBar}>
        <View style={styles.actionSummaryRow}>
          <Text style={styles.actionSummaryLabel}>
            {selectedInterests.length === 0 ? 'Choose at least one' : 'Your GathR mix'}
          </Text>
          <Text style={styles.actionSummaryCount}>
            {selectedInterests.length} selected
          </Text>
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.saveButton,
            selectedInterests.length === 0 && styles.disabledSaveButton,
            pressed && selectedInterests.length > 0 && styles.pressedSaveButton,
          ]}
          onPress={saveInterests}
          disabled={saving || selectedInterests.length === 0}
          accessibilityRole="button"
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Text style={styles.saveButtonText}>
                {isFromProfile ? 'Save changes' : 'Continue'}
              </Text>
              <Ionicons
                name={isFromProfile ? 'checkmark' : 'arrow-forward'}
                size={21}
                color="#FFFFFF"
              />
            </>
          )}
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.skipButton, pressed && styles.pressedSkipButton]}
          onPress={skipSelection}
          disabled={saving}
        >
          <Text style={styles.skipButtonText}>
            {isFromProfile ? 'Cancel' : 'Skip for now'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F7FD',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F7FD',
  },
  scrollContent: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 4,
  },
  onboardingCard: {
    backgroundColor: '#EAF4FE',
    borderWidth: 1,
    borderColor: '#D3E8FB',
    borderRadius: 15,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 10,
  },
  onboardingTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 7,
  },
  eyebrow: {
    color: '#1479D3',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 1,
  },
  onboardingTitle: {
    color: '#172235',
    fontSize: 15,
    fontWeight: '700',
  },
  stepBadge: {
    minWidth: 38,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  stepBadgeText: {
    color: '#1479D3',
    fontSize: 11,
    fontWeight: '800',
  },
  progressTrack: {
    height: 4,
    backgroundColor: '#D4E1EF',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    width: '66.666%',
    height: '100%',
    backgroundColor: '#1788EB',
    borderRadius: 2,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 5,
  },
  progressLabelComplete: {
    color: '#39745E',
    fontSize: 9,
    fontWeight: '600',
  },
  progressLabelNext: {
    color: '#728399',
    fontSize: 9,
    fontWeight: '600',
  },
  header: {
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  title: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '800',
    color: '#172235',
    letterSpacing: -0.45,
    marginBottom: 3,
  },
  subtitle: {
    fontSize: 13,
    color: '#5E6D80',
    lineHeight: 17,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 17,
    padding: 10,
    marginBottom: 9,
    borderWidth: 1,
    borderColor: '#E4EBF3',
    shadowColor: '#19324D',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionHeadingGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  sectionIconBadge: {
    width: 31,
    height: 31,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  eventIconBadge: {
    backgroundColor: '#E8F4FF',
  },
  specialIconBadge: {
    backgroundColor: '#FFF3DD',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#172235',
  },
  sectionSubtitle: {
    marginTop: 1,
    fontSize: 10,
    color: '#758397',
  },
  sectionCountBadge: {
    minWidth: 38,
    borderRadius: 12,
    backgroundColor: '#F0F3F7',
    paddingHorizontal: 7,
    paddingVertical: 5,
    alignItems: 'center',
    marginLeft: 8,
  },
  activeSectionCountBadge: {
    backgroundColor: '#E7F4FF',
  },
  sectionCountText: {
    color: '#7B8795',
    fontSize: 10,
    fontWeight: '700',
  },
  activeSectionCountText: {
    color: '#1479D3',
  },
  interestGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 6,
  },
  interestButton: {
    width: '32%',
    minHeight: 48,
    backgroundColor: '#F7F9FC',
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: '#E4EAF1',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  wideInterestButton: {
    width: '66%',
  },
  selectedInterestButton: {
    backgroundColor: '#EAF5FF',
    borderColor: '#7ABCF1',
  },
  pressedInterestButton: {
    opacity: 0.72,
  },
  interestContent: {
    maxWidth: '91%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  interestIconBadge: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: '#EDF1F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedInterestIconBadge: {
    backgroundColor: '#D8ECFD',
  },
  interestButtonText: {
    fontSize: 10.5,
    lineHeight: 12,
    fontWeight: '600',
    color: '#344154',
    textAlign: 'center',
  },
  selectedInterestButtonText: {
    color: '#175E9D',
  },
  interestCheck: {
    position: 'absolute',
    top: 3,
    right: 3,
    backgroundColor: '#EAF5FF',
    borderRadius: 8,
  },
  actionBar: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#DEE6EF',
    paddingHorizontal: 16,
    paddingTop: 7,
    paddingBottom: 4,
    shadowColor: '#19324D',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 8,
  },
  actionSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 5,
    paddingHorizontal: 2,
  },
  actionSummaryLabel: {
    color: '#667588',
    fontSize: 10,
    fontWeight: '600',
  },
  actionSummaryCount: {
    color: '#1479D3',
    fontSize: 10,
    fontWeight: '800',
  },
  saveButton: {
    height: 44,
    backgroundColor: '#1788EB',
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  disabledSaveButton: {
    backgroundColor: '#B9C8D8',
  },
  pressedSaveButton: {
    opacity: 0.82,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  skipButton: {
    minHeight: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressedSkipButton: {
    opacity: 0.55,
  },
  skipButtonText: {
    color: '#697789',
    fontSize: 12,
    fontWeight: '600',
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
