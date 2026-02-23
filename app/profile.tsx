import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ActivityIndicator, 
  Alert, 
  Image, 
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
  TouchableWithoutFeedback,
  Animated,
  Dimensions,
  StatusBar,
  Clipboard,
} from 'react-native';
import { useRouter, useNavigation, usePathname } from 'expo-router';
import { auth, firestore, storage } from '../config/firebaseConfig';
import { doc, getDoc, updateDoc, deleteDoc, addDoc, collection, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { 
  signOut, 
  deleteUser, 
  EmailAuthProvider, 
  reauthenticateWithCredential 
} from 'firebase/auth';
import { amplitudeTrack, amplitudeSetUserId } from '../lib/amplitudeAnalytics';
import { TUTORIAL_STEPS } from '../config/tutorialSteps';
import { useUserPrefsStore, updateShowDailyHotspot } from '../store/userPrefsStore';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { 
  ref, 
  uploadBytesResumable, 
  getDownloadURL, 
  deleteObject 
} from 'firebase/storage';




// Get screen dimensions for responsive design
const { width, height } = Dimensions.get('window');



// Define brand colors
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

// Enhanced Facebook Page Submission Component  
interface FacebookPageSubmissionProps {
  isHighlighted?: boolean;
  pulseAnim?: Animated.Value;
}

const FacebookPageSubmission = React.forwardRef<View, FacebookPageSubmissionProps>(({ 
  isHighlighted = false, 
  pulseAnim 
}, ref) => {
  const [facebookUrl, setFacebookUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [dailyCount, setDailyCount] = useState(0);
  
  // Log tutorial state but don't force collapse - padding handles the pulse
  useEffect(() => {
    const tutorialActive = (global as any).tutorialHighlightFacebookSubmission;
    console.log('ðŸŽ¯ FACEBOOK SUBMISSION: Component mounted/updated. Tutorial active:', tutorialActive, 'Expanded:', isExpanded);
  }, [(global as any).tutorialHighlightFacebookSubmission]);

  // Load daily count on component mount
  useEffect(() => {
    loadDailyCount();
  }, []);

  const loadDailyCount = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    
    try {
      const submissionsQuery = query(
        collection(firestore, 'pageSubmissions'), 
        where('userId', '==', currentUser.uid),
        where('submittedAt', '>=', startOfDay),
        where('submittedAt', '<', endOfDay)
      );
      const submissionDocs = await getDocs(submissionsQuery);
      setDailyCount(submissionDocs.size);
    } catch (error) {
      console.error('Error loading daily count:', error);
    }
  };

  const validateFacebookUrl = (url: string): boolean => {
    // Enhanced regex patterns for different Facebook URL formats
    const patterns = [
      /^https:\/\/(www\.)?facebook\.com\/[a-zA-Z0-9._-]+\/?$/,
      /^https:\/\/(www\.)?facebook\.com\/pages\/[^\/]+\/\d+\/?$/,
      /^https:\/\/(www\.)?facebook\.com\/profile\.php\?id=\d+$/,
      /^facebook\.com\/[a-zA-Z0-9._-]+\/?$/,
      /^www\.facebook\.com\/[a-zA-Z0-9._-]+\/?$/
    ];
    
    return patterns.some(pattern => pattern.test(url.trim()));
  };

  const normalizeFacebookUrl = (url: string): string => {
    return url.trim()
      .toLowerCase()
      .replace(/\/$/, '') // Remove trailing slash
      .replace(/^https:\/\/www\.facebook\.com\//, 'https://www.facebook.com/')
      .replace(/^www\.facebook\.com\//, 'https://www.facebook.com/')
      .replace(/^facebook\.com\//, 'https://www.facebook.com/');
  };

  const autoFormatUrl = (input: string): string => {
    // Auto-add https://www.facebook.com/ if user just types page name
    if (input && !input.includes('facebook.com') && !input.includes('http')) {
      return `https://www.facebook.com/${input}`;
    }
    return input;
  };

  // NEW: URL Resolution Logic
  const isShareUrl = (url: string): boolean => {
    return url.includes('/share/') || url.includes('mibextid=') || url.includes('fbshid=');
  };

  const resolveShareUrl = async (shareUrl: string): Promise<string | null> => {
    try {
      // Make a HEAD request to follow redirects
      const response = await fetch(shareUrl, {
        method: 'HEAD',
        redirect: 'follow'
      });
      
      // Extract clean Facebook URL from final destination
      const finalUrl = response.url;
      
      // Verify it's a valid Facebook URL and extract clean format
      if (finalUrl.includes('facebook.com')) {
        // Extract page name from URL
        const match = finalUrl.match(/facebook\.com\/([^\/\?]+)/);
        if (match && match[1]) {
          return `https://www.facebook.com/${match[1]}`;
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error resolving share URL:', error);
      return null;
    }
  };

  const handleUrlChange = async (text: string) => {
    const formattedUrl = autoFormatUrl(text);
    setFacebookUrl(formattedUrl);
    
    // Check if it's a share URL and try to resolve it
    if (isShareUrl(formattedUrl)) {
      setIsResolving(true);
      
      const resolvedUrl = await resolveShareUrl(formattedUrl);
      
      if (resolvedUrl) {
        setFacebookUrl(resolvedUrl);
        Alert.alert('âœ… URL Resolved!', 'We found the clean page URL for you.');
      } else {
        Alert.alert(
          'Share Link Detected', 
          'Could not resolve automatically. Please visit the page and copy the URL from your browser\'s address bar instead.'
        );
      }
      
      setIsResolving(false);
    }
  };

  const checkDailyLimit = async (): Promise<boolean> => {
    return dailyCount < 5;
  };

  const checkDuplicate = async (normalizedUrl: string): Promise<boolean> => {
    try {
      const existingQuery = query(
        collection(firestore, 'pageSubmissions'),
        where('normalizedUrl', '==', normalizedUrl)
      );
      const existingDocs = await getDocs(existingQuery);
      return existingDocs.size > 0;
    } catch (error) {
      console.error('Error checking duplicate:', error);
      return false;
    }
  };

  const handleSubmit = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      Alert.alert('Error', 'You must be logged in to submit pages');
      return;
    }

    if (!validateFacebookUrl(facebookUrl)) {
      Alert.alert('Invalid URL', 'Please enter a valid Facebook page URL\n\nExample: https://www.facebook.com/pagename');
      return;
    }

    setIsSubmitting(true);

    try {
      // Check daily limit
      const withinLimit = await checkDailyLimit();
      if (!withinLimit) {
        Alert.alert('Daily Limit Reached', 'You can submit up to 5 Facebook pages per day. Please try again tomorrow.');
        setIsSubmitting(false);
        return;
      }

      const normalizedUrl = normalizeFacebookUrl(facebookUrl);
      
      // Check for duplicates (silently ignore)
      const isDuplicate = await checkDuplicate(normalizedUrl);
      if (isDuplicate) {
        Alert.alert('Success', 'Thank you for your submission! We\'ll review it soon.');
        setFacebookUrl('');
        setDailyCount(prev => prev + 1);
        setIsExpanded(false); // Collapse after submission
        setIsSubmitting(false);
        return;
      }

      // Submit to Firestore - KEEPING EXACT SAME FORMAT
      await addDoc(collection(firestore, 'pageSubmissions'), {
        url: facebookUrl.trim(),
        normalizedUrl: normalizedUrl,
        userId: currentUser.uid,
        userEmail: currentUser.email,
        submittedAt: serverTimestamp(),
        status: 'pending'
      });

      // ðŸ”¥ ANALYTICS: Track Facebook page submission
      amplitudeTrack('facebook_page_submitted', {
        url: normalizedUrl,
        was_duplicate: isDuplicate,
        daily_submission_count: dailyCount + 1,
        source: 'profile_screen',
        referrer_screen: '/profile',
      });

      Alert.alert('Success', 'Thank you for your submission! We\'ll review it soon.');
      setFacebookUrl('');
      setDailyCount(prev => prev + 1);
      setIsExpanded(false); // Collapse after submission
    } catch (error) {
      console.error('Error submitting page:', error);
      Alert.alert('Error', 'Failed to submit page. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const tutorialHighlightStyle = {
    shadowColor: '#FF6B35',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 12,
    elevation: 15,
    borderWidth: 3,
    borderColor: '#FF8C42',
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    transform: pulseAnim ? [{ scale: pulseAnim }] : [],
  };

  return (
    <Animated.View style={isHighlighted ? tutorialHighlightStyle : {}}>
      <View 
        ref={ref}
        style={submissionStyles.container}
        onLayout={() => {
          // Immediate measurement DISABLED - one-shot measurement system handles all measurements with padding
          // The one-shot system measures once, applies padding, and marks as stable
          // Do NOT overwrite facebookSubmissionLayout here or it will replace the padded measurement
        }}
      >
      {/* Compact Header - Always Visible */}
      <TouchableOpacity 
        style={[submissionStyles.header, submissionStyles.expandableHeader]}
        onPress={() => setIsExpanded(!isExpanded)}
        activeOpacity={0.7}
      >
        <View style={submissionStyles.headerLeft}>
          <Ionicons name="add-circle-outline" size={24} color={BRAND.primary} />
          <View style={submissionStyles.titleContainer}>
            <Text style={submissionStyles.title}>Suggest a Facebook Page</Text>
            <Text style={submissionStyles.subtitle}>
              ({dailyCount} of 5 Daily Submissions)
            </Text>
          </View>
        </View>
        
        <View style={[
          submissionStyles.expandIcon,
          { transform: [{ rotate: isExpanded ? '180deg' : '0deg' }] }
        ]}>
          <Ionicons name="chevron-down" size={20} color={BRAND.primary} />
        </View>
      </TouchableOpacity>

      {/* Daily limit progress bar - Always visible */}
      <View style={submissionStyles.progressContainer}>
        <View style={submissionStyles.progressBar}>
          <View style={[
            submissionStyles.progressFill, 
            { width: `${(dailyCount / 5) * 100}%` }
          ]} />
        </View>
      </View>

      {/* Expanded Content */}
      {isExpanded && (
        <View style={submissionStyles.expandedContent}>
          <Text style={submissionStyles.description}>
            Know a local business or venue that should be included? Submit their Facebook page!
          </Text>
          
          <View style={submissionStyles.inputContainer}>
            <Ionicons name="logo-facebook" size={20} color={BRAND.primary} style={submissionStyles.inputIcon} />
            <TextInput
              style={submissionStyles.input}
              placeholder="https://www.facebook.com/pagename or just 'pagename'"
              value={facebookUrl}
              onChangeText={handleUrlChange}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholderTextColor={BRAND.textLight}
            />
            {isResolving && (
              <ActivityIndicator size="small" color={BRAND.primary} style={submissionStyles.resolvingIcon} />
            )}
          </View>
          
          <TouchableOpacity
            style={[
              submissionStyles.submitButton, 
              (isSubmitting || dailyCount >= 5) && submissionStyles.submitButtonDisabled
            ]}
            onPress={handleSubmit}
            disabled={isSubmitting || dailyCount >= 5}
          >
            {isSubmitting ? (
              <ActivityIndicator color={BRAND.white} size="small" />
            ) : (
              <>
                <Ionicons name="paper-plane-outline" size={18} color={BRAND.white} style={submissionStyles.buttonIcon} />
                <Text style={submissionStyles.submitButtonText}>
                  {dailyCount >= 5 ? 'Daily Limit Reached' : 'Submit Page'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
       )}
      </View>
    </Animated.View>
  );
});

export default function ProfileScreen() {
  // State variables
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [photoURL, setPhotoURL] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingChanges, setSavingChanges] = useState(false);
  const [editedDisplayName, setEditedDisplayName] = useState('');
  const [newPhotoURI, setNewPhotoURI] = useState('');
  const [userInterests, setUserInterests] = useState<string[]>([]);
  const [memberSince, setMemberSince] = useState('');
  const [isEmailCopied, setIsEmailCopied] = useState(false);
  
  // Delete account state
  const [passwordInput, setPasswordInput] = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [deletionInProgress, setDeletionInProgress] = useState(false);

  // Daily hotspot preference
  const showDailyHotspot = useUserPrefsStore((state) => state.showDailyHotspot);
  const setShowDailyHotspot = useUserPrefsStore((state) => state.setShowDailyHotspot);
  
  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const headerOpacity = useRef(new Animated.Value(0)).current;
  const modalAnimation = useRef(new Animated.Value(0)).current;
  
  // Tutorial awareness for Facebook submission
  const facebookSubmissionRef = useRef<View>(null);
  const facebookSubmissionPulseAnim = useRef(new Animated.Value(1)).current;
  const [facebookSubmissionHighlighted, setFacebookSubmissionHighlighted] = useState(false);
  
  // Profile container ref for modal header measurement
  const profileContainerRef = useRef<KeyboardAvoidingView>(null);
  
  // Make it globally accessible for tutorial measurement
  useEffect(() => {
    (global as any).profileContainerRef = profileContainerRef;
    return () => {
      delete (global as any).profileContainerRef;
    };
  }, []);

  // Use useRef to persist measurement state across re-renders
  const hasMeasuredRef = useRef(false);
  
  useEffect(() => {
    console.log('ðŸ“ ONE-SHOT MEASUREMENT: Starting Facebook submission measurement');
    console.log('ðŸ“ ONE-SHOT MEASUREMENT: hasMeasured status:', hasMeasuredRef.current);
    
    const interval = setInterval(() => {
      const globalFlag = (global as any).tutorialHighlightFacebookSubmission || false;
      
      if (globalFlag !== facebookSubmissionHighlighted) {
        setFacebookSubmissionHighlighted(globalFlag);
        console.log('ðŸ“ ONE-SHOT MEASUREMENT: Tutorial highlight flag changed to:', globalFlag);
      }
      
      /*
      Polling lifecycle:
    â€¢ While highlight flag is ON â†’ poll until we stabilize (or finalize elsewhere).
    â€¢ When flag turns OFF â†’ clear interval immediately to avoid log spam
      after leaving the step or finishing the tutorial.
*/
      // Reset when flag turns off
      if (!globalFlag) {
        (global as any).facebookSubmissionStable = false;
        (global as any).facebookSubmissionLayout = null;
        if (hasMeasuredRef.current) {
          hasMeasuredRef.current = false; // Reset the ref
        }
        clearInterval(interval); // ðŸ”• ensure no lingering logs
        console.log('ðŸ“ ONE-SHOT MEASUREMENT: Reset - tutorial flag off (interval cleared)');
        return;
      }
      
      // Only measure ONCE when flag is on and we haven't measured yet
      if (globalFlag && facebookSubmissionRef.current && !hasMeasuredRef.current) {
        console.log('ðŸ“ ONE-SHOT MEASUREMENT: Taking single measurement (first time only)...');
        
        // IMMEDIATELY set the flag to prevent re-measurement
        hasMeasuredRef.current = true;
        
        // Clear any stale measurements before our measurement
        console.log('ðŸ§¹ ONE-SHOT MEASUREMENT: Clearing stale data before measurement');
        (global as any).facebookSubmissionLayout = null;
        (global as any).facebookSubmissionStable = false;
        
        facebookSubmissionRef.current.measureInWindow((x: number, y: number, width: number, height: number) => {
          const rawMeasurement = { 
            x: Math.round(x), 
            y: Math.round(y), 
            width: Math.round(width), 
            height: Math.round(height) 
          };
          
          console.log('ðŸ“ ONE-SHOT MEASUREMENT: Raw measurement:', rawMeasurement);
          
          /*
  PROFILE â†’ FACEBOOK SUBMISSION: ONE-SHOT MEASUREMENT
  Modal header adjustment:
    â€¢ iOS modals render ~72px lower vs "transparent" modal mode.
    â€¢ Android uses 0 (no header delta).
  We subtract this only on iOS to normalize the rect used by the tutorial spotlight.
*/
            const modalHeaderHeight = Platform.OS === 'ios' ? 72 : 0;
          console.log('📍 ONE-SHOT MEASUREMENT: Using modal header offset:', modalHeaderHeight);
          
          const adjustedMeasurement = {
            ...rawMeasurement,
            y: rawMeasurement.y - modalHeaderHeight
          };
          
          console.log('ðŸ“ ONE-SHOT MEASUREMENT: Adjusted for modal header:', {
            originalY: rawMeasurement.y,
            headerHeight: modalHeaderHeight,
            adjustedY: adjustedMeasurement.y
          });
          
          // Apply proportional padding for scale: 1.15 pulse animation
          // We use 1.35x multiplier to ensure full coverage regardless of when we measure in the pulse cycle
          // This accounts for: measuring at min (needs 115% coverage) or measuring mid-pulse (needs buffer both ways)
          const paddingFactorX = 0.175; // 17.5% padding on each side horizontally (35% total)
          const paddingFactorY = 0.175; // 17.5% padding on each side vertically (35% total)
          const sizeMultiplier = 1.35; // 135% of measured size for generous coverage
          
          const paddedMeasurement = {
            x: Math.round(adjustedMeasurement.x - (adjustedMeasurement.width * paddingFactorX)),
            y: Math.round(adjustedMeasurement.y - (adjustedMeasurement.height * paddingFactorY)),
            width: Math.round(adjustedMeasurement.width * sizeMultiplier),
            height: Math.round(adjustedMeasurement.height * sizeMultiplier)
          };
          
          console.log('ðŸ“ ONE-SHOT MEASUREMENT: Using generous 35% padding for full pulse coverage');
          console.log('ðŸ“ ONE-SHOT MEASUREMENT: Initial padded measurement:', paddedMeasurement);
          console.log('ðŸ“ ONE-SHOT MEASUREMENT: Padding applied:', {
            xAdjustment: rawMeasurement.width * paddingFactorX,
            yAdjustment: rawMeasurement.height * paddingFactorY,
            widthIncrease: rawMeasurement.width * (sizeMultiplier - 1),
            heightIncrease: rawMeasurement.height * (sizeMultiplier - 1)
          });
          
          // Constrain to screen bounds with 4px margin
          const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
          const SCREEN_MARGIN = 15;
          
          // Calculate constraints
          const minX = SCREEN_MARGIN;
          const maxX = SCREEN_WIDTH - SCREEN_MARGIN;
          const minY = SCREEN_MARGIN;
          const maxY = SCREEN_HEIGHT - SCREEN_MARGIN;
          
          // Apply constraints
          let constrainedMeasurement = { ...paddedMeasurement };
          
          // Constrain X position
          if (constrainedMeasurement.x < minX) {
            console.log('ðŸ“ ONE-SHOT MEASUREMENT: Adjusting X from', constrainedMeasurement.x, 'to', minX);
            constrainedMeasurement.x = minX;
          }
          
          // Constrain width if it would exceed right edge
          const rightEdge = constrainedMeasurement.x + constrainedMeasurement.width;
          if (rightEdge > maxX) {
            const newWidth = maxX - constrainedMeasurement.x;
            console.log('ðŸ“ ONE-SHOT MEASUREMENT: Adjusting width from', constrainedMeasurement.width, 'to', newWidth, '(right edge was', rightEdge, ')');
            constrainedMeasurement.width = newWidth;
          }
          
          // Constrain Y position
          if (constrainedMeasurement.y < minY) {
            console.log('ðŸ“ ONE-SHOT MEASUREMENT: Adjusting Y from', constrainedMeasurement.y, 'to', minY);
            constrainedMeasurement.y = minY;
          }
          
          // Constrain height if it would exceed bottom edge
          const bottomEdge = constrainedMeasurement.y + constrainedMeasurement.height;
          if (bottomEdge > maxY) {
            const newHeight = maxY - constrainedMeasurement.y;
            console.log('ðŸ“ ONE-SHOT MEASUREMENT: Adjusting height from', constrainedMeasurement.height, 'to', newHeight, '(bottom edge was', bottomEdge, ')');
            constrainedMeasurement.height = newHeight;
          }
          
          // Fine-tune coverage - extend bottom without losing top
          const HEIGHT_EXTENSION = 5; // Extend spotlight height by 5 pixels at bottom
          constrainedMeasurement.height = constrainedMeasurement.height + HEIGHT_EXTENSION;
          console.log('ðŸ“ ONE-SHOT MEASUREMENT: Extended height by', HEIGHT_EXTENSION, 'pixels to better contain bottom pulse');
          
          console.log('ðŸ“ ONE-SHOT MEASUREMENT: Final constrained measurement:', constrainedMeasurement);
          console.log('ðŸ“ ONE-SHOT MEASUREMENT: Screen bounds:', {
            screenWidth: SCREEN_WIDTH,
            screenHeight: SCREEN_HEIGHT,
            margin: SCREEN_MARGIN,
            resultingBounds: {
              left: constrainedMeasurement.x,
              right: constrainedMeasurement.x + constrainedMeasurement.width,
              top: constrainedMeasurement.y,
              bottom: constrainedMeasurement.y + constrainedMeasurement.height
            }
          });
          
          // Store constrained measurement and mark as stable immediately
          (global as any).facebookSubmissionLayout = constrainedMeasurement;
          (global as any).facebookSubmissionStable = true;
         
          
          console.log('âœ… ONE-SHOT MEASUREMENT: Complete! Marked as stable with padded bounds');
          console.log('âœ… ONE-SHOT MEASUREMENT: hasMeasured set to true, will not measure again');
          
          // Force re-render to show overlay
          setFacebookSubmissionHighlighted(prev => !prev);
        });
            } else if (globalFlag && hasMeasuredRef.current) {
        // We've already measured; if the layout is marked stable, stop polling entirely.
        if ((global as any).facebookSubmissionStable) {
          clearInterval(interval);
          console.log('ðŸ“ ONE-SHOT MEASUREMENT: Stable; interval cleared after "already measured" check');
        } else {
          // Not stable yet; do NOT spam logs.
          // Leave interval running until facebookSubmissionStable flips true.
        }
      }

    }, 200);
    
    return () => {
      console.log('ðŸ“ ONE-SHOT MEASUREMENT: Cleanup - stopping interval');
      clearInterval(interval);
    };
  }, [facebookSubmissionHighlighted]);

  useEffect(() => {
    if (facebookSubmissionHighlighted) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(facebookSubmissionPulseAnim, { toValue: 1.15, useNativeDriver: true, duration: 800 }),
          Animated.timing(facebookSubmissionPulseAnim, { toValue: 1, useNativeDriver: true, duration: 800 }),
        ])
      ).start();
    } else {
      facebookSubmissionPulseAnim.stopAnimation();
      facebookSubmissionPulseAnim.setValue(1);
    }
  }, [facebookSubmissionHighlighted]);
  
const router = useRouter();
const navigation = useNavigation();
const pathname = usePathname();
const lastRestartClickAtRef = useRef(0); // dedupe double-taps (<350ms)


  // Set up header close button with circular background
  useEffect(() => {
    navigation.setOptions({
      headerShown: false, // Hide the default header
    });
  }, [navigation]);

  

  // Animation on component mount
  useEffect(() => {
    // Animate profile card
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(headerOpacity, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      })
    ]).start();
  }, [fadeAnim, scaleAnim, headerOpacity]);

  // Modal animation
  useEffect(() => {
    if (showPasswordModal) {
      Animated.timing(modalAnimation, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(modalAnimation, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [showPasswordModal, modalAnimation]);

  // Cached user profile (5 min)
const currentUser = auth.currentUser;

const { data: cachedProfile, isFetching: profileFetching } = useQuery({
  queryKey: ['user-profile', currentUser?.uid],
  enabled: !!currentUser,
  staleTime: 1000 * 60 * 5,
  queryFn: async () => {
    const snap = await getDoc(doc(firestore, 'users', currentUser!.uid));
    return snap.exists() ? snap.data() : null;
  },
});

// Sync cached profile into component state
useEffect(() => {
  if (!currentUser) {
    router.replace('/');
    return;
  }
  if (cachedProfile) {
    setEmail(currentUser.email || '');
    setDisplayName(cachedProfile.displayName || '');
    setEditedDisplayName(cachedProfile.displayName || '');
    setPhotoURL(cachedProfile.photoURL || '');
    setUserInterests(cachedProfile.userInterests || []);

    if (cachedProfile.createdAt) {
      const createdAt = cachedProfile.createdAt.toDate
        ? cachedProfile.createdAt.toDate()
        : new Date(cachedProfile.createdAt);
      setMemberSince(createdAt.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      }));
    }
    setLoading(false);
  }
}, [cachedProfile, currentUser?.uid, router]);



  

  const handleProfilePictureUpdate = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Sorry, we need camera roll permissions to change your profile picture.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setNewPhotoURI(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error updating profile picture:', error);
      Alert.alert('Error', 'Failed to update profile picture.');
    }
  };

  const uploadImageToFirebase = async (uri: string, userId: string): Promise<string> => {
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      
      const storageRef = ref(storage, `profilePictures/${userId}`);
      const uploadTask = uploadBytesResumable(storageRef, blob);
      
      return new Promise<string>((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            // Progress monitoring if needed
          },
          (error) => {
            reject(error);
          },
          async () => {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            resolve(downloadURL as string);
          }
        );
      });
    } catch (error) {
      console.error('Error uploading image:', error);
      throw error;
    }
  };

  const saveChanges = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      Alert.alert('Error', 'User not authenticated');
      return;
    }

    if (!editedDisplayName.trim()) {
      Alert.alert('Error', 'Display name cannot be empty');
      return;
    }

    setSavingChanges(true);

    try {
      const userRef = doc(firestore, 'users', currentUser.uid);
      
      // Properly typed update data
      const updateData: {
        displayName: string;
        lastUpdated: Date;
        photoURL?: string;
      } = {
        displayName: editedDisplayName,
        lastUpdated: new Date()
      };

      // Upload new profile picture if selected
      if (newPhotoURI) {
        const newPhotoURL = await uploadImageToFirebase(newPhotoURI, currentUser.uid);
        updateData.photoURL = newPhotoURL;
        setPhotoURL(newPhotoURL);
      }

      await updateDoc(userRef, updateData);
      
      setDisplayName(editedDisplayName);
      setNewPhotoURI('');
      setIsEditing(false);
      
      Alert.alert('Success', 'Profile updated successfully');
    } catch (error) {
      console.error('Error updating profile:', error);
      Alert.alert('Error', 'Failed to update profile');
    } finally {
      setSavingChanges(false);
    }
  };

const handleLogout = async () => {
  try {
    // Track before signOut (navigator may unmount during sign-out)
    console.log('[analytics] about to track logout');
    amplitudeTrack('user_logout');
  } catch (e) {
    console.warn('[analytics] logout track failed', e);
  }

  try {
    await signOut(auth);
  } finally {
    // Always drop back to device-level analytics
    amplitudeSetUserId(undefined);
    console.log('[analytics] cleared amplitude user id after signOut');
  }

  try {
    router.replace('/');
  } catch (error) {
    console.error('Logout navigation error:', error);
  }
};



  const handleInterests = () => {
    router.push({
      pathname: '/interest-selection',
      params: { fromProfile: 'true' }
    });
  };

  // Toggle daily hotspot setting
  const handleToggleHotspot = async () => {
    const newValue = !showDailyHotspot;
    setShowDailyHotspot(newValue);

    // Persist to Firestore
    const currentUser = auth.currentUser;
    if (currentUser) {
      try {
        await updateShowDailyHotspot(currentUser.uid, newValue);
      } catch (error) {
        console.error('Failed to update hotspot setting:', error);
      }
    }

    // Track analytics
    amplitudeTrack('hotspot_setting_toggled', {
      enabled: newValue,
      source: 'profile',
    });
  };

  // Copy email to clipboard
  const copyEmailToClipboard = () => {
    Clipboard.setString(email);
    setIsEmailCopied(true);
    
    // Reset the copied state after 2 seconds
    setTimeout(() => {
      setIsEmailCopied(false);
    }, 2000);
  };

  // Delete account functionality
  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This action cannot be undone. All your data will be permanently deleted.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => promptForPassword(),
        },
      ]
    );
  };

  const promptForPassword = () => {
    setPasswordInput('');
    setShowPasswordModal(true);
  };

  const handlePasswordChange = (text: string) => {
    setPasswordInput(text);
  };

  const confirmDeletion = async () => {
    if (!passwordInput.trim()) {
      Alert.alert('Error', 'Please enter your password to confirm account deletion');
      return;
    }

    setDeletionInProgress(true);

    try {
      const user = auth.currentUser;
      if (!user || !user.email) {
        throw new Error('User not found or email not available');
      }

      // Re-authenticate user for security
      const credential = EmailAuthProvider.credential(user.email, passwordInput);
      await reauthenticateWithCredential(user, credential);

      // Delete from Firestore first
      await deleteUserData(user.uid);

      // Delete profile picture from Storage if exists
      if (photoURL) {
        await deleteUserProfilePicture(user.uid);
      }

      // Finally delete the user's authentication record
      await deleteUser(user);

      // Navigate to login screen
      router.replace('/');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      
      if (errorMessage.includes('auth/wrong-password') || errorMessage.includes('auth/invalid-credential')) {
        Alert.alert('Error', 'Incorrect password. Please try again.');
      } else {
        Alert.alert('Error', `Failed to delete account: ${errorMessage}`);
      }
      console.error('Account deletion error:', error);
    } finally {
      setDeletionInProgress(false);
      setShowPasswordModal(false);
    }
  };

  const deleteUserData = async (userId: string) => {
    try {
      // Delete user document
      const userRef = doc(firestore, 'users', userId);
      await deleteDoc(userRef);
      
      // Add code here to delete any other user-related data
      // For example, saved events, user-generated content, etc.
    } catch (error) {
      console.error('Error deleting user data:', error);
      throw error;
    }
  };

  const deleteUserProfilePicture = async (userId: string) => {
    try {
      const storageRef = ref(storage, `profilePictures/${userId}`);
      await deleteObject(storageRef);
    } catch (error) {
      console.error('Error deleting profile picture:', error);
      // Continue with deletion even if picture removal fails
    }
  };

  // Close the profile screen
  const handleCloseProfile = () => {
    // Animate the card out
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 0.9,
        duration: 300,
        useNativeDriver: true,
      })
    ]).start(() => {
      router.back();
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={BRAND.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      ref={profileContainerRef}
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
    >
      <StatusBar barStyle="light-content" />
      
          
    
      
      {/* Header Section - FIXED: reduced height */}
      <Animated.View style={[styles.header, { opacity: headerOpacity }]}>
        <View style={styles.headerBackground}>
          <Text style={styles.headerTitle}>Profile</Text>
          <TouchableOpacity 
            onPress={handleCloseProfile}
            style={styles.closeButton}
            accessibilityLabel="Close profile"
          >
            <Ionicons name="close" size={22} color={BRAND.white} />
          </TouchableOpacity>
        </View>
      </Animated.View>
      
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View 
          style={[
            styles.profileContainer,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }]
            }
          ]}
        >
          {/* Profile Image Section - FIXED: adjusted position */}
          <View style={styles.profileImageSection}>
            <TouchableOpacity 
              onPress={isEditing ? handleProfilePictureUpdate : () => {}}
              disabled={!isEditing}
              style={styles.profileImageContainer}
            >
              {newPhotoURI ? (
                <Image source={{ uri: newPhotoURI }} style={styles.profileImage} />
              ) : photoURL ? (
                <Image source={{ uri: photoURL }} style={styles.profileImage} />
              ) : (
                <View style={styles.profileImagePlaceholder}>
                  <Ionicons name="person" size={50} color={BRAND.lightGray} />
                </View>
              )}
              {isEditing && (
                <View style={styles.cameraIconContainer}>
                  <Ionicons name="camera" size={18} color={BRAND.white} />
                </View>
              )}
            </TouchableOpacity>
          </View>
          
          {/* Profile Content */}
          <View style={styles.profileContent}>
            {isEditing ? (
              <TextInput
                style={styles.nameInput}
                value={editedDisplayName}
                onChangeText={setEditedDisplayName}
                placeholder="Enter your name"
                maxLength={50}
                placeholderTextColor={BRAND.textLight}
              />
            ) : (
              <Text style={styles.userName}>{displayName || 'User'}</Text>
            )}
            
            {memberSince ? (
              <View style={styles.memberSinceContainer}>
                <Ionicons name="calendar-outline" size={14} color={BRAND.textLight} />
                <Text style={styles.memberSinceText}>Member since {memberSince}</Text>
              </View>
            ) : null}
            
            {/* Email Card */}
            <TouchableOpacity 
              style={styles.emailContainer}
              onPress={copyEmailToClipboard}
              activeOpacity={0.7}
            >
              <View style={styles.emailContent}>
                <Ionicons name="mail-outline" size={18} color={BRAND.primary} style={styles.emailIcon} />
                <View>
                  <Text style={styles.emailLabel}>Email</Text>
                  <Text style={styles.emailValue}>{email}</Text>
                </View>
              </View>
              <View style={styles.copyIconContainer}>
                {isEmailCopied ? (
                  <Ionicons name="checkmark" size={20} color={BRAND.primary} />
                ) : (
                  <Ionicons name="copy-outline" size={18} color={BRAND.textLight} />
                )}
              </View>
            </TouchableOpacity>
            
            {/* Edit Mode Buttons */}
            {isEditing ? (
              <View style={styles.editButtonsContainer}>
                <TouchableOpacity 
                  style={styles.saveButton} 
                  onPress={saveChanges}
                  disabled={savingChanges}
                >
                  {savingChanges ? (
                    <ActivityIndicator color={BRAND.white} size="small" />
                  ) : (
                    <>
                      <Ionicons name="checkmark" size={20} color={BRAND.white} style={styles.buttonIcon} />
                      <Text style={styles.saveButtonText}>Save Changes</Text>
                    </>
                  )}
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={styles.cancelButton} 
                  onPress={() => {
                    setIsEditing(false);
                    setEditedDisplayName(displayName);
                    setNewPhotoURI('');
                  }}
                >
                  <Ionicons name="close" size={20} color={BRAND.primary} style={styles.buttonIcon} />
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {/* Profile Management Buttons */}
                <View style={styles.actionButtonsContainer}>
                  <TouchableOpacity 
                    style={styles.editButton} 
                    onPress={() => setIsEditing(true)}
                  >
                    <Ionicons name="create-outline" size={20} color={BRAND.primary} style={styles.buttonIcon} />
                    <Text style={styles.editButtonText}>Edit Profile</Text>
                  </TouchableOpacity>
                  
                  {/* FIXED: Interest row with count moved outside button */}
                  <View style={styles.interestsRow}>
                    <TouchableOpacity 
                      style={styles.interestsButton} 
                      onPress={handleInterests}
                    >
                      <Ionicons name="pricetag-outline" size={20} color={BRAND.primary} style={styles.buttonIcon} />
                      <Text style={styles.interestsButtonText}>Manage Interests</Text>
                    </TouchableOpacity>
                    
                    {/* FIXED: Count badge outside button */}
                    <View style={styles.countBadge}>
                      <Text style={styles.countNumber}>{userInterests.length}</Text>
                      <Text style={styles.countLabel}>Saved</Text>
                    </View>
                  </View>

                  {/* Tutorial Replay Button */}
                  <TouchableOpacity 
                    style={styles.tutorialButton} 
                    onPress={() => {
                      Alert.alert(
                        'Replay Tutorial',
                        'Would you like to replay the GathR tutorial? This will guide you through the app features again.',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { 
                            text: 'Start Tutorial', 
onPress: () => {
  // ðŸ”” analytics: tutorial_restart_clicked (fires BEFORE overlay opens)
  try {
    const now = Date.now();
    if (now - lastRestartClickAtRef.current >= 350) {
      lastRestartClickAtRef.current = now;

      amplitudeTrack('tutorial_restart_clicked', {
        tutorial_id: 'main_onboarding_v1',
        tutorial_version: 1,
        total_steps: Array.isArray(TUTORIAL_STEPS) ? TUTORIAL_STEPS.length : 0,
        source: 'tutorial_system',
        from_screen: pathname || '/profile',
        user_initiated: true,
        launch_source: 'profile',
        is_guest: !auth.currentUser,
      });
    }
  } catch (e) {
    console.log('[analytics] tutorial_restart_clicked failed:', e);
  }

  // Close profile modal and start tutorial
  router.back();
  setTimeout(() => {
    // Mark this launch as user-initiated from Profile for downstream events
    (global as any).tutorialLaunchUserInitiated = true;
    (global as any).tutorialLaunchSource = 'profile';

    if ((global as any).triggerGathRTutorial) {
      (global as any).triggerGathRTutorial();
    }
  }, 500);
}

                          }
                        ]
                      );
                    }}
                  >
                    <Ionicons name="help-circle-outline" size={20} color={BRAND.primary} style={styles.buttonIcon} />
                    <Text style={styles.tutorialButtonText}>Replay Tutorial</Text>
                  </TouchableOpacity>

                  {/* Daily Hotspot Toggle */}
                  <TouchableOpacity
                    style={styles.hotspotToggle}
                    onPress={handleToggleHotspot}
                  >
                    <View style={styles.hotspotToggleContent}>
                      <Ionicons
                        name="flame-outline"
                        size={20}
                        color={showDailyHotspot ? BRAND.primary : BRAND.gray}
                        style={styles.buttonIcon}
                      />
                      <View style={styles.hotspotToggleText}>
                        <Text style={[
                          styles.hotspotToggleLabel,
                          !showDailyHotspot && styles.hotspotToggleLabelDisabled
                        ]}>
                          Daily Hotspot
                        </Text>
                        <Text style={styles.hotspotToggleDescription}>
                          Highlight popular spots on map open
                        </Text>
                      </View>
                    </View>
                    <Ionicons
                      name={showDailyHotspot ? "checkmark-circle" : "ellipse-outline"}
                      size={24}
                      color={showDailyHotspot ? BRAND.primary : BRAND.gray}
                    />
                  </TouchableOpacity>
                </View>

                {/* Facebook Page Submission Component */}
                <FacebookPageSubmission 
                  ref={facebookSubmissionRef}
                  isHighlighted={facebookSubmissionHighlighted}
                  pulseAnim={facebookSubmissionPulseAnim}
                />
                
                {/* Account Management Buttons */}
                  <View style={styles.accountActionsContainer}>
                    <TouchableOpacity 
                      style={styles.deleteButton} 
                      onPress={handleDeleteAccount}
                    >
                      <Ionicons name="trash-outline" size={20} color={BRAND.white} style={styles.buttonIcon} />
                      <Text style={styles.deleteButtonText} numberOfLines={1}>Delete Account</Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                      style={styles.logoutButton} 
                      onPress={handleLogout}
                    >
                      <Ionicons name="log-out-outline" size={20} color={BRAND.white} style={styles.buttonIcon} />
                      <Text style={styles.logoutButtonText} numberOfLines={1}>Log Out</Text>
                    </TouchableOpacity>
                  </View>
              </>
            )}
          </View>
        </Animated.View>
      </ScrollView>
      
      {/* Tutorial overlay for modal screens */}
      {(global as any).tutorialOverlayForModal && (global as any).tutorialOverlayForModal()}
      
      {/* Password Confirmation Modal with standard animations */}
      {showPasswordModal && (
        <Modal
          visible={showPasswordModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowPasswordModal(false)}
        >
          <TouchableWithoutFeedback onPress={() => setShowPasswordModal(false)}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback onPress={e => e.stopPropagation()}>
                <Animated.View 
                  style={[
                    styles.modalContent,
                    {
                      opacity: modalAnimation,
                      transform: [
                        { 
                          scale: modalAnimation.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.9, 1]
                          }) 
                        }
                      ]
                    }
                  ]}
                >
                  <View style={styles.modalHeader}>
                    <Ionicons name="warning" size={28} color={BRAND.accent} />
                    <Text style={styles.modalTitle}>Confirm Account Deletion</Text>
                  </View>
                  
                  <Text style={styles.modalText}>
                    This action cannot be undone. Please enter your password to confirm.
                  </Text>
                  
                  <View style={styles.passwordInputContainer}>
                    <Ionicons name="lock-closed-outline" size={20} color={BRAND.textLight} style={styles.passwordIcon} />
                    <TextInput
                      style={styles.passwordInput}
                      value={passwordInput}
                      onChangeText={handlePasswordChange}
                      placeholder="Enter your password"
                      secureTextEntry={true}
                      autoCapitalize="none"
                      placeholderTextColor={BRAND.textLight}
                    />
                  </View>
                  
                  <View style={styles.modalButtons}>
                    <TouchableOpacity 
                      style={[styles.modalButton, styles.cancelModalButton]}
                      onPress={() => setShowPasswordModal(false)}
                    >
                      <Text style={styles.cancelModalButtonText}>Cancel</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                      style={[styles.modalButton, styles.confirmModalButton]}
                      onPress={confirmDeletion}
                      disabled={deletionInProgress}
                    >
                      {deletionInProgress ? (
                        <ActivityIndicator color={BRAND.white} size="small" />
                      ) : (
                        <Text style={styles.confirmModalButtonText}>Confirm Deletion</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </Animated.View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}
    </KeyboardAvoidingView>
  );
}

const submissionStyles = StyleSheet.create({
  container: {
    backgroundColor: BRAND.background,
    borderRadius: 16,
    padding: 12,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: BRAND.lightGray,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  expandableHeader: {
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  titleContainer: {
    alignItems: 'center',
    marginLeft: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: BRAND.text,
  },
  subtitle: {
    fontSize: 11,
    color: BRAND.textLight,
    marginTop: 2,
  },
  expandIcon: {
    padding: 4,
  },
  progressContainer: {
    marginBottom: 12,
  },
  progressBar: {
    height: 4,
    backgroundColor: BRAND.lightGray,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: BRAND.primary,
  },
  expandedContent: {
    marginTop: 8,
  },
  description: {
    fontSize: 14,
    color: BRAND.textLight,
    marginBottom: 16,
    lineHeight: 20,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BRAND.white,
    borderWidth: 1,
    borderColor: BRAND.lightGray,
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: BRAND.text,
  },
  resolvingIcon: {
    marginLeft: 8,
  },
  submitButton: {
    backgroundColor: BRAND.primary,
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    shadowColor: BRAND.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  submitButtonDisabled: {
    backgroundColor: BRAND.lightGray,
  },
  submitButtonText: {
    color: BRAND.white,
    fontSize: 16,
    fontWeight: '600',
  },
  buttonIcon: {
    marginRight: 8,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: BRAND.background,
  },
  // FIXED: Reduced header height
  header: {
    width: '100%',
    height: 70, // Reduced from 120
    zIndex: 1,
  },
  headerBackground: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: BRAND.primary,
    paddingTop: Platform.OS === 'ios' ? 10 : 20,
    paddingHorizontal: 40,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: BRAND.white,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // FIXED: Adjusted content padding
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 30,
    paddingTop: 20, // Reduced from 60
  },
  // FIXED: Adjusted top margin
  profileContainer: {
    marginTop: 0, // Adjusted from -80
    borderRadius: 24,
    overflow: 'visible',
  },
  // FIXED: Repositioned profile image section
  profileImageSection: {
    alignItems: 'center',
    marginBottom: 10,
    zIndex: 2,
  },
  profileImageContainer: {
    height: 120,
    width: 120,
    borderRadius: 60,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
    backgroundColor: BRAND.white,
  },
  profileImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: BRAND.white,
  },
  profileImagePlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: BRAND.lightGray,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: BRAND.white,
  },
  cameraIconContainer: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: BRAND.primary,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: BRAND.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  profileContent: {
    backgroundColor: BRAND.white,
    borderRadius: 24,
    padding: 20,
    paddingTop: 64, // Increased to accommodate profile image overlap
    marginTop: -50, // Negative margin to overlap with profile image
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  userName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: BRAND.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  memberSinceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  memberSinceText: {
    fontSize: 14,
    color: BRAND.textLight,
    marginLeft: 4,
  },
  nameInput: {
    alignSelf: 'center',
    width: '100%',
    height: 50,
    backgroundColor: BRAND.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BRAND.lightGray,
    marginBottom: 16,
    paddingHorizontal: 15,
    fontSize: 18,
    textAlign: 'center',
    color: BRAND.text,
  },
  emailContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: BRAND.background,
    borderRadius: 12,
    padding: 15,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  emailContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  emailIcon: {
    marginRight: 10,
  },
  emailLabel: {
    fontSize: 13,
    color: BRAND.textLight,
    marginBottom: 2,
  },
  emailValue: {
    fontSize: 16,
    fontWeight: '500',
    color: BRAND.text,
  },
  copyIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.03)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // REMOVED: Stand-alone stats container
  editButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  actionButtonsContainer: {
    marginBottom: 16,
  },
  accountActionsContainer: {
  flexDirection: 'row', // Changed from 'column'
  justifyContent: 'space-between',
  gap: 8, // Add gap between buttons
  marginTop: 8, // Reduced from 16
},
  saveButton: {
    flex: 1,
    backgroundColor: BRAND.primary,
    borderRadius: 30,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
    shadowColor: BRAND.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  saveButtonText: {
    color: BRAND.white,
    fontWeight: '600',
    fontSize: 16,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: BRAND.white,
    borderWidth: 1,
    borderColor: BRAND.primary,
    borderRadius: 30,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  cancelButtonText: {
    color: BRAND.primary,
    fontWeight: '600',
    fontSize: 16,
  },
  editButton: {
    height: 40,
    backgroundColor: BRAND.white,
    borderWidth: 1,
    borderColor: BRAND.primary,
    borderRadius: 30,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
      ...(Platform.OS === 'android' ? { marginTop: 0 } : null),
  },
  editButtonText: {
    color: BRAND.primary,
    fontWeight: '600',
    fontSize: 16,
      ...(Platform.OS === 'android'
    ? { includeFontPadding: false, textAlignVertical: 'center', lineHeight: 20 }
    : null),
  },
  // FIXED: New interests row with button and count
  interestsRow: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 10, // REDUCED from 12 (if you haven't already)
},

interestsButton: {
  flex: 1,
  backgroundColor: BRAND.white,
  borderWidth: 1,
  borderColor: BRAND.primary,
  borderRadius: 20, // REDUCED from 30 to match 40px height
  paddingVertical: 10, // REDUCED from 14 to make height 40px
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  marginRight: 10,
},
  interestsButtonText: {
  color: BRAND.primary,
  fontWeight: '600',
  fontSize: 15, // REDUCED from 16 to match other compact buttons
},
  // FIXED: Added count badge style
  countBadge: {
  alignItems: 'center',
  backgroundColor: BRAND.background,
  borderRadius: 12, // REDUCED from 16
  paddingVertical: 6, // REDUCED from 8
  paddingHorizontal: 10, // REDUCED from 12
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.05,
  shadowRadius: 3,
  elevation: 1,
},

countNumber: {
  fontSize: 18, // REDUCED from 20
  fontWeight: 'bold',
  color: BRAND.primary,
},

countLabel: {
  fontSize: 11, // REDUCED from 12
  color: BRAND.textLight,
  marginTop: 1, // REDUCED from 2
},
  logoutButton: {
  backgroundColor: BRAND.primary,
  borderRadius: 20, // Matches the 40px height
  height: 40, // EXPLICIT HEIGHT - add this
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  marginRight: 4,
  flex: 1,
  shadowColor: BRAND.primary,
  shadowOffset: { width: 0, height: 3 },
  shadowOpacity: 0.2,
  shadowRadius: 4,
  elevation: 3,
},
  logoutButtonText: {
  color: BRAND.white,
  fontWeight: '600',
  fontSize: 15,
},
  deleteButton: {
  backgroundColor: BRAND.accent,
  borderRadius: 20, // Matches the 40px height  
  height: 40, // EXPLICIT HEIGHT - add this
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  marginLeft: 4,
  flex: 1,
  shadowColor: BRAND.accent,
  shadowOffset: { width: 0, height: 3 },
  shadowOpacity: 0.2,
  shadowRadius: 4,
  elevation: 3,
},

  deleteButtonText: {
  color: BRAND.white,
  fontWeight: '600',
  fontSize: 15,
},
  buttonIcon: {
    marginRight: 8,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: BRAND.white,
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginLeft: 12,
    color: BRAND.accent,
  },
  modalText: {
    fontSize: 16,
    marginBottom: 24,
    color: BRAND.text,
    lineHeight: 22,
  },
  passwordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BRAND.background,
    borderWidth: 1,
    borderColor: BRAND.lightGray,
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 24,
  },
  passwordIcon: {
    marginRight: 10,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: BRAND.text,
  },
  modalButtons: {
    flexDirection: 'column',
  },
  modalButton: {
    paddingVertical: 14,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 6,
  },
  cancelModalButton: {
    backgroundColor: BRAND.white,
    borderWidth: 1,
    borderColor: BRAND.gray,
  },
  confirmModalButton: {
    backgroundColor: BRAND.accent,
    shadowColor: BRAND.accent,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  cancelModalButtonText: {
    color: BRAND.gray,
    fontWeight: '600',
    fontSize: 16,
  },
  confirmModalButtonText: {
    color: BRAND.white,
    fontWeight: '600',
    fontSize: 16,
  },
  tutorialButton: {
    height: 40,
    backgroundColor: BRAND.white,
    borderWidth: 1,
    borderColor: BRAND.primary,
    borderRadius: 20,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  tutorialButtonText: {
    color: BRAND.primary,
    fontWeight: '600',
    fontSize: 15,
  },
  hotspotToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: BRAND.white,
    borderWidth: 1,
    borderColor: BRAND.lightGray,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 10,
  },
  hotspotToggleContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  hotspotToggleText: {
    marginLeft: 4,
    flex: 1,
  },
  hotspotToggleLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: BRAND.text,
  },
  hotspotToggleLabelDisabled: {
    color: BRAND.gray,
  },
  hotspotToggleDescription: {
    fontSize: 12,
    color: BRAND.textLight,
    marginTop: 2,
  },
});