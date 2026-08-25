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
  Share,
  Switch,
} from 'react-native';
import { useRouter, useNavigation, usePathname } from 'expo-router';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { auth, firestore, storage } from '../config/firebaseConfig';
import { doc, getDoc, updateDoc, deleteDoc, addDoc, collection, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { 
  signOut, 
  deleteUser, 
  EmailAuthProvider, 
  reauthenticateWithCredential,
  reload,
} from 'firebase/auth';
import { amplitudeTrack, amplitudeSetUserId } from '../lib/amplitudeAnalytics';
import { TUTORIAL_STEPS } from '../config/tutorialSteps';
import { unregisterSharedEventPushNotifications } from '../lib/sharedEventPushNotifications';
import { requestCurrentUserEmailChange } from '../lib/accountEmailChange';
import { useUserPrefsStore, updateShowDailyHotspot, updateShowTrendingOnOpen } from '../store/userPrefsStore';
import { useTutorialUiStore } from '../store/tutorialUiStore';
import GathrWordmarkLogo from '../components/common/GathrWordmarkLogo';
import { publishTutorialMeasurement } from '../utils/tutorialReadiness';
import { beginProfileTutorialReplay } from '../utils/tutorialReplay';
import {
  getTutorialModalOverlay,
  subscribeTutorialModalOverlay,
} from '../utils/tutorialModalOverlay';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { 
  ref, 
  uploadBytesResumable, 
  getDownloadURL, 
  deleteObject 
} from 'firebase/storage';




const APP_SHARE_URL = 'https://www.gathrapp.ca/app/';

const APP_RUNTIME_VERSION = Updates.runtimeVersion || (__DEV__ ? 'development' : Constants.expoConfig?.version) || 'unknown';
const APP_DISPLAY_VERSION = Application.nativeApplicationVersion || Updates.runtimeVersion || (__DEV__ ? 'development' : Constants.expoConfig?.version) || 'unknown';
const APP_NATIVE_BUILD = Application.nativeBuildVersion;
const APP_UPDATE_CHANNEL = Updates.channel || (__DEV__ ? 'development' : 'unassigned');
const APP_UPDATE_SOURCE = !Updates.isEnabled
  ? 'Development'
  : Updates.isEmbeddedLaunch
    ? 'Embedded'
    : 'OTA';
const APP_UPDATE_ID = Updates.updateId || null;
const APP_SHORT_UPDATE_ID = APP_UPDATE_ID?.slice(0, 8) || APP_UPDATE_SOURCE;
const APP_CHANNEL_LABEL = APP_UPDATE_CHANNEL.charAt(0).toUpperCase() + APP_UPDATE_CHANNEL.slice(1);

const getCompactInterestLabel = (interest: string) =>
  interest.toLowerCase().startsWith('social gathering') ? 'Gatherings' : interest;
const APP_VERSION_SUMMARY = `GathR ${APP_DISPLAY_VERSION}${APP_NATIVE_BUILD ? ` (${APP_NATIVE_BUILD})` : ''} · ${APP_CHANNEL_LABEL}`;
const APP_UPDATE_SUMMARY = `Runtime ${APP_RUNTIME_VERSION} · ${APP_UPDATE_SOURCE}${APP_UPDATE_ID ? ` ${APP_SHORT_UPDATE_ID}` : ''}`;
const APP_VERSION_DETAILS = [
  `App: ${APP_DISPLAY_VERSION}`,
  `Build: ${APP_NATIVE_BUILD || 'unknown'}`,
  `Channel: ${APP_UPDATE_CHANNEL}`,
  `Runtime: ${APP_RUNTIME_VERSION}`,
  `Source: ${APP_UPDATE_SOURCE}`,
  `Update: ${APP_UPDATE_ID || 'none'}`,
  `Created: ${Updates.createdAt?.toISOString() || 'unknown'}`,
].join('\n');

const ProfileTutorialOverlayHost: React.FC<{
  hostRef: React.RefObject<View | null>;
}> = ({ hostRef }) => {
  const renderOverlay = React.useSyncExternalStore(
    subscribeTutorialModalOverlay,
    getTutorialModalOverlay,
    getTutorialModalOverlay,
  );

  return (
    <View
      ref={hostRef}
      collapsable={false}
      pointerEvents="box-none"
      style={[StyleSheet.absoluteFillObject, { zIndex: 100, elevation: 100 }]}
    >
      {typeof renderOverlay === 'function' ? renderOverlay() : null}
    </View>
  );
};

// Pulsing Hotspot Circle Icon Component
const HotspotCircleIcon: React.FC<{ isActive: boolean }> = ({ isActive }) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  return (
    <View style={styles.hotspotIconWrapper}>
      <Animated.View
        style={[
          styles.hotspotCircle,
          isActive && styles.hotspotCircleActive,
          { transform: [{ scale: pulseAnim }] },
        ]}
      />
    </View>
  );
};



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

const PROFILE_BUTTON_FILL = 'rgba(30, 144, 255, 0.03)';
const ANDROID_PROFILE_BUTTON_FILL = '#CAE5FF';
const PROFILE_BUTTON_INNER_FILL = Platform.OS === 'android'
  ? ANDROID_PROFILE_BUTTON_FILL
  : PROFILE_BUTTON_FILL;

const PAGE_SUBMISSION_PRECHECK_BASE_URL = (
  (typeof process !== 'undefined' && process?.env?.EXPO_PUBLIC_GATHR_BACKEND_URL) ||
  'https://gathr-backend-924732524090.northamerica-northeast1.run.app'
).replace(/\/+$/, '');

type FacebookScrapeabilityPrecheckResult = {
  success?: boolean;
  status?: string;
  reason?: string;
  httpStatus?: number;
  finalUrl?: string;
  recommendation?: string;
  warnSubmitter?: boolean;
};

const runFacebookScrapeabilityPrecheck = async (url: string): Promise<FacebookScrapeabilityPrecheckResult | null> => {
  const baseUrl = String(PAGE_SUBMISSION_PRECHECK_BASE_URL || '').trim();
  if (!baseUrl) return null;

  try {
    const endpoint = `${baseUrl}/api/facebook-page-scrapeability-check?url=${encodeURIComponent(url)}`;
    const response = await fetch(endpoint, { method: 'GET' });
    if (!response.ok) return null;
    const payload = await response.json();
    return (payload && typeof payload === 'object') ? payload : null;
  } catch (error) {
    console.warn('Facebook scrapeability precheck failed:', error);
    return null;
  }
};

const confirmSubmitWithScrapeabilityWarning = (check: FacebookScrapeabilityPrecheckResult): Promise<boolean> =>
  new Promise((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const lines = [
      'This Facebook page may not be publicly scrapeable (logged-out/public check failed).',
      '',
      'GathR may not be able to scrape posts from it even if you can view it while logged in.',
    ];
    if (check?.reason) {
      lines.push('', `Check result: ${check.reason}`);
    }
    if (check?.httpStatus) {
      lines.push(`HTTP status: ${check.httpStatus}`);
    }
    lines.push('', 'Submit anyway?');

    Alert.alert(
      'Scrapeability Warning',
      lines.join('\n'),
      [
        { text: 'Cancel', style: 'cancel', onPress: () => finish(false) },
        { text: 'Submit Anyway', onPress: () => finish(true) },
      ],
      {
        cancelable: true,
        onDismiss: () => finish(false),
      }
    );
  });

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
      /^https:\/\/(www\.)?facebook\.com\/people\/[^\/]+\/\d+\/?$/,
      /^https:\/\/(www\.)?facebook\.com\/pages\/[^\/]+\/\d+\/?$/,
      /^https:\/\/(www\.)?facebook\.com\/profile\.php\?id=\d+$/,
      /^facebook\.com\/[a-zA-Z0-9._-]+\/?$/,
      /^facebook\.com\/people\/[^\/]+\/\d+\/?$/,
      /^www\.facebook\.com\/[a-zA-Z0-9._-]+\/?$/,
      /^www\.facebook\.com\/people\/[^\/]+\/\d+\/?$/
    ];

    const trimmed = url.trim();
    const isPatternMatch = patterns.some(pattern => pattern.test(trimmed));
    if (!isPatternMatch) return false;

    // Guard: reject non-page Facebook paths that can appear after redirects.
    try {
      const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
      const parsed = new URL(withProtocol);
      if (!/(\.|^)facebook\.com$/i.test(parsed.hostname)) return false;

      const firstSegment = (parsed.pathname.split('/').filter(Boolean)[0] || '').toLowerCase();
      const disallowed = new Set([
        'login',
        'checkpoint',
        'recover',
        'share',
        'sharer',
        'share.php',
        'dialog',
        'help',
        'privacy',
        'terms',
        'l.php',
      ]);
      if (disallowed.has(firstSegment)) return false;
    } catch (_) {
      return false;
    }

    return true;
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
        let parsed = new URL(finalUrl);
        if (!/(\.|^)facebook\.com$/i.test(parsed.hostname)) {
          return null;
        }

        let segments = parsed.pathname.split('/').filter(Boolean);
        let first = (segments[0] || '').toLowerCase();

        // If share resolution lands on login, try to recover the original target from next=...
        if (first === 'login') {
          const nextRaw = parsed.searchParams.get('next');
          if (!nextRaw) return null;
          try {
            const decodedNext = decodeURIComponent(nextRaw);
            const nextUrl = /^https?:\/\//i.test(decodedNext)
              ? decodedNext
              : `https://www.facebook.com${decodedNext.startsWith('/') ? '' : '/'}${decodedNext}`;
            parsed = new URL(nextUrl);
            if (!/(\.|^)facebook\.com$/i.test(parsed.hostname)) {
              return null;
            }
            segments = parsed.pathname.split('/').filter(Boolean);
            first = (segments[0] || '').toLowerCase();
          } catch (_) {
            return null;
          }
        }

        // Keep profile.php?id=<id> form intact when that's the canonical landing URL.
        if (parsed.pathname.toLowerCase() === '/profile.php') {
          const profileId = parsed.searchParams.get('id');
          if (profileId && /^\d+$/.test(profileId)) {
            return `https://www.facebook.com/profile.php?id=${profileId}`;
          }
        }

        // Never resolve to non-page endpoints.
        const disallowed = new Set(['login', 'checkpoint', 'recover', 'share', 'sharer', 'share.php', 'dialog', 'help', 'privacy', 'terms', 'l.php']);
        if (disallowed.has(first)) {
          return null;
        }

        // Facebook sometimes resolves pages to /people/<display-name>/<id>/ paths.
        // Returning just "/people" was the regression causing bad submissions.
        if (first === 'people' && segments.length >= 3 && /^\d+$/.test(segments[2])) {
          return `https://www.facebook.com/people/${segments[1]}/${segments[2]}`;
        }

        // Legacy pages format.
        if (first === 'pages' && segments.length >= 3 && /^\d+$/.test(segments[2])) {
          return `https://www.facebook.com/pages/${segments[1]}/${segments[2]}`;
        }

        if (segments.length > 0) {
          return `https://www.facebook.com/${segments[0]}`;
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
      const scrapeabilityPrecheck = await runFacebookScrapeabilityPrecheck(facebookUrl.trim());
      if (scrapeabilityPrecheck?.status === 'likely_not_public' || scrapeabilityPrecheck?.warnSubmitter) {
        const proceedWithWarning = await confirmSubmitWithScrapeabilityWarning(scrapeabilityPrecheck);
        if (!proceedWithWarning) {
          setIsSubmitting(false);
          return;
        }
      }
      
      // Check for duplicates (silently ignore)
      const isDuplicate = await checkDuplicate(normalizedUrl);
      if (isDuplicate) {
        // Persist duplicate submit attempts so the daily counter survives reloads.
        // Use a non-pending status so the backend approval-email listener ignores it.
        await addDoc(collection(firestore, 'pageSubmissions'), {
          url: facebookUrl.trim(),
          normalizedUrl: normalizedUrl,
          userId: currentUser.uid,
          userEmail: currentUser.email,
          submittedAt: serverTimestamp(),
          status: 'duplicate',
          duplicateDetected: true,
          notes: 'Duplicate URL already submitted; counted toward daily limit',
          submitterPrecheckStatus: scrapeabilityPrecheck?.status || null,
          submitterPrecheckReason: scrapeabilityPrecheck?.reason || null,
          submitterPrecheckHttpStatus: scrapeabilityPrecheck?.httpStatus || null,
        });

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
        status: 'pending',
        submitterPrecheckStatus: scrapeabilityPrecheck?.status || null,
        submitterPrecheckReason: scrapeabilityPrecheck?.reason || null,
        submitterPrecheckHttpStatus: scrapeabilityPrecheck?.httpStatus || null,
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

  const showSuggestionInfo = () => {
    Alert.alert(
      'Suggest a Facebook page',
      'Paste the public Facebook page for a local business, venue, or organizer. After review, GathR can use it to discover events and specials. You can suggest up to five pages each day.',
      [{ text: 'Got it' }]
    );
  };

  const tutorialHighlightStyle = {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 12,
    elevation: 15,
    borderWidth: 3,
    borderColor: 'transparent',
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    transform: pulseAnim ? [{ scale: pulseAnim }] : [],
  };

  return (
    <View
      ref={ref}
      collapsable={false}
      onLayout={() => {
        // Immediate measurement DISABLED - one-shot measurement system handles all measurements with padding
        // The one-shot system measures once, applies padding, and marks as stable
        // Do NOT overwrite facebookSubmissionLayout here or it will replace the padded measurement
      }}
    >
      <Animated.View style={isHighlighted ? tutorialHighlightStyle : {}}>
        <View style={submissionStyles.container}>
          <View style={submissionStyles.compactTrigger}>
            <TouchableOpacity
              style={submissionStyles.compactMainAction}
              onPress={() => setIsExpanded(true)}
              activeOpacity={0.72}
              accessibilityRole="button"
              accessibilityLabel={`Suggest a Facebook page. ${dailyCount} of 5 submissions today`}
              accessibilityHint="Opens a form to paste a local Facebook page"
            >
              <View style={submissionStyles.compactIconBadge}>
                <Ionicons name="logo-facebook" size={19} color="#1877F2" />
              </View>
              <View style={submissionStyles.compactCopy}>
                <Text style={submissionStyles.compactTitle}>Suggest a Facebook page</Text>
                <Text style={submissionStyles.compactSubtitle} numberOfLines={2}>
                  Help GathR discover local events · {dailyCount}/5 today
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={submissionStyles.infoButton}
              onPress={showSuggestionInfo}
              accessibilityRole="button"
              accessibilityLabel="What does suggesting a Facebook page mean?"
              hitSlop={8}
            >
              <Ionicons name="information-circle-outline" size={20} color={BRAND.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={submissionStyles.chevronButton}
              onPress={() => setIsExpanded(true)}
              accessibilityRole="button"
              accessibilityLabel="Open Facebook page suggestion form"
              hitSlop={8}
            >
              <Ionicons name="chevron-forward" size={17} color={BRAND.textLight} />
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>

      <Modal
        visible={isExpanded}
        transparent
        animationType="slide"
        onRequestClose={() => setIsExpanded(false)}
      >
        <TouchableWithoutFeedback onPress={() => setIsExpanded(false)}>
          <View style={submissionStyles.modalOverlay}>
            <TouchableWithoutFeedback onPress={(event) => event.stopPropagation()}>
              <View style={submissionStyles.modalSheet}>
                <View style={submissionStyles.modalHandle} />
                <View style={submissionStyles.modalHeader}>
                  <View>
                    <Text style={submissionStyles.modalTitle}>Suggest a Facebook page</Text>
                    <Text style={submissionStyles.modalSubtitle}>{dailyCount} of 5 submissions today</Text>
                  </View>
                  <TouchableOpacity
                    style={submissionStyles.modalClose}
                    onPress={() => setIsExpanded(false)}
                    accessibilityRole="button"
                    accessibilityLabel="Close page suggestion"
                  >
                    <Ionicons name="close" size={21} color={BRAND.text} />
                  </TouchableOpacity>
                </View>
                <Text style={submissionStyles.description}>
                  Know a local business or venue that should be included? Send us its Facebook page.
                </Text>
                <View style={submissionStyles.inputContainer}>
                  <Ionicons name="logo-facebook" size={20} color={BRAND.primary} style={submissionStyles.inputIcon} />
                  <TextInput
                    style={submissionStyles.input}
                    placeholder="facebook.com/pagename"
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
                    (isSubmitting || dailyCount >= 5) && submissionStyles.submitButtonDisabled,
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
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
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
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showEmailChangeModal, setShowEmailChangeModal] = useState(false);
  const [newEmailInput, setNewEmailInput] = useState('');
  const [emailChangePassword, setEmailChangePassword] = useState('');
  const [emailChangeInProgress, setEmailChangeInProgress] = useState(false);

  // Daily hotspot preference
  const showDailyHotspot = useUserPrefsStore((state) => state.showDailyHotspot);
  const setShowDailyHotspot = useUserPrefsStore((state) => state.setShowDailyHotspot);

  // Trending auto-open preference
  const showTrendingOnOpen = useUserPrefsStore((state) => state.showTrendingOnOpen);
  const setShowTrendingOnOpen = useUserPrefsStore((state) => state.setShowTrendingOnOpen);
  
  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const headerOpacity = useRef(new Animated.Value(0)).current;
  const modalAnimation = useRef(new Animated.Value(0)).current;
  
  // Tutorial awareness for Facebook submission
  const facebookSubmissionRef = useRef<View>(null);
  const facebookSubmissionPulseAnim = useRef(new Animated.Value(1)).current;
  const [facebookSubmissionHighlighted, setFacebookSubmissionHighlighted] = useState(false);
  const tutorialStepId = useTutorialUiStore((state) => state.currentStepId);
  const setTutorialFacebookSubmissionLayout = useTutorialUiStore(
    (state) => state.setFacebookSubmissionLayout,
  );
  
  // Profile container ref for modal header measurement
  const profileContainerRef = useRef<KeyboardAvoidingView>(null);
  const profileTutorialOverlayHostRef = useRef<View>(null);
  
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
      const globalFlag = tutorialStepId === 'facebook-submission';
      
      if (!globalFlag && facebookSubmissionHighlighted) {
        setFacebookSubmissionHighlighted(false);
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
        setTutorialFacebookSubmissionLayout(null);
        if (hasMeasuredRef.current) {
          hasMeasuredRef.current = false; // Reset the ref
        }
        clearInterval(interval); // ðŸ”• ensure no lingering logs
        console.log('ðŸ“ ONE-SHOT MEASUREMENT: Reset - tutorial flag off (interval cleared)');
        return;
      }
      
      // Only measure ONCE when flag is on and we haven't measured yet
      if (globalFlag && facebookSubmissionRef.current && !hasMeasuredRef.current) {
        setFacebookSubmissionHighlighted(false);
        console.log('ðŸ“ ONE-SHOT MEASUREMENT: Taking single measurement (first time only)...');
        
        // IMMEDIATELY set the flag to prevent re-measurement
        hasMeasuredRef.current = true;
        
        // Clear any stale measurements before our measurement
        console.log('ðŸ§¹ ONE-SHOT MEASUREMENT: Clearing stale data before measurement');
        (global as any).facebookSubmissionLayout = null;
        (global as any).facebookSubmissionStable = false;
        
        const measureFacebookSubmission = (rootX = 0, rootY = 0) => {
          facebookSubmissionRef.current?.measureInWindow((x: number, y: number, width: number, height: number) => {
          const rawMeasurement = { 
            x: Math.round(x), 
            y: Math.round(y), 
            width: Math.round(width), 
            height: Math.round(height) 
          };
          
          console.log('ðŸ“ ONE-SHOT MEASUREMENT: Raw measurement:', rawMeasurement);
          
          /*
  PROFILE â†’ FACEBOOK SUBMISSION: ONE-SHOT MEASUREMENT
  Coordinate normalization:
    â€¢ measureInWindow returns screen coordinates.
    â€¢ The tutorial overlay is rendered inside this profile root.
  Convert the target rect into the overlay host's coordinate space instead of using a fixed iOS offset.
*/
            const overlayOriginY = Math.round(rootY);
          console.log('📍 ONE-SHOT MEASUREMENT: Using profile overlay origin:', { rootX, rootY });
          
          const adjustedMeasurement = {
            ...rawMeasurement,
            x: Math.round(rawMeasurement.x - rootX),
            y: rawMeasurement.y - overlayOriginY
          };
          
          console.log('ðŸ“ ONE-SHOT MEASUREMENT: Adjusted for profile overlay origin:', {
            rootX,
            rootY,
            originalX: rawMeasurement.x,
            originalY: rawMeasurement.y,
            overlayOriginY,
            adjustedX: adjustedMeasurement.x,
            adjustedY: adjustedMeasurement.y
          });
          
          // The card animation scales to 1.15, and TutorialSpotlight adds
          // a final fixed 8px visual pad around this rect. The extra buffer
          // covers the highlighted shell's border/shadow without moving center.
          
          // Constrain to screen bounds with a small margin.
          const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
          const SCREEN_MARGIN = 15;
          const minX = SCREEN_MARGIN;
          const minY = SCREEN_MARGIN;
          // The overlay now supplies its own pulse ring, so keep this cutout
          // close to the action row instead of swallowing adjacent settings.
          const PULSE_SCALE = 1;
          const EXTRA_HORIZONTAL_BUFFER = 6;
          const EXTRA_VERTICAL_BUFFER = 4;
          const IOS_SPOTLIGHT_VERTICAL_NUDGE = Platform.OS === 'ios' ? 22 : 0;
          const targetCenterX = adjustedMeasurement.x + adjustedMeasurement.width / 2;
          const targetCenterY =
            adjustedMeasurement.y + adjustedMeasurement.height / 2 + IOS_SPOTLIGHT_VERTICAL_NUDGE;
          const maxSpotlightWidth = SCREEN_WIDTH - SCREEN_MARGIN * 2;
          const maxSpotlightHeight = SCREEN_HEIGHT - SCREEN_MARGIN * 2;
          const centeredSpotlightWidth = Math.min(
            adjustedMeasurement.width * PULSE_SCALE + EXTRA_HORIZONTAL_BUFFER * 2,
            maxSpotlightWidth
          );
          const centeredSpotlightHeight = Math.min(
            adjustedMeasurement.height * PULSE_SCALE + EXTRA_VERTICAL_BUFFER * 2,
            maxSpotlightHeight
          );
          const clamp = (value: number, min: number, max: number) => {
            return Math.min(Math.max(value, min), Math.max(min, max));
          };

          const constrainedMeasurement = {
            x: Math.round(clamp(targetCenterX - centeredSpotlightWidth / 2, minX, SCREEN_WIDTH - SCREEN_MARGIN - centeredSpotlightWidth)),
            y: Math.round(clamp(targetCenterY - centeredSpotlightHeight / 2, minY, SCREEN_HEIGHT - SCREEN_MARGIN - centeredSpotlightHeight)),
            width: Math.round(centeredSpotlightWidth),
            height: Math.round(centeredSpotlightHeight),
          };
          console.log('ONE-SHOT MEASUREMENT: Recentered spotlight from target center:', {
            targetCenterX,
            targetCenterY,
            pulseScale: PULSE_SCALE,
            extraHorizontalBuffer: EXTRA_HORIZONTAL_BUFFER,
            extraVerticalBuffer: EXTRA_VERTICAL_BUFFER,
            iosSpotlightVerticalNudge: IOS_SPOTLIGHT_VERTICAL_NUDGE,
            centeredSpotlightWidth,
            centeredSpotlightHeight
          });
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
          publishTutorialMeasurement('facebookSubmissionLayout', constrainedMeasurement);
          setTutorialFacebookSubmissionLayout(constrainedMeasurement);
         
          
          console.log('âœ… ONE-SHOT MEASUREMENT: Complete! Marked as stable with padded bounds');
          console.log('âœ… ONE-SHOT MEASUREMENT: hasMeasured set to true, will not measure again');
          
          // Force re-render to show overlay
          setFacebookSubmissionHighlighted(true);
        });
        };

        const captureAfterPulseStops = () => {
          const overlayHost = profileTutorialOverlayHostRef.current as any;
          const profileRoot = profileContainerRef.current as any;
          const measurementRoot =
            overlayHost && typeof overlayHost.measureInWindow === 'function'
              ? overlayHost
              : profileRoot;

          if (measurementRoot && typeof measurementRoot.measureInWindow === 'function') {
            measurementRoot.measureInWindow((rootX: number, rootY: number) => {
              measureFacebookSubmission(rootX, rootY);
            });
          } else {
            measureFacebookSubmission();
          }
        };

        requestAnimationFrame(() => {
          requestAnimationFrame(captureAfterPulseStops);
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
  }, [facebookSubmissionHighlighted, setTutorialFacebookSubmissionLayout, tutorialStepId]);

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
const isPasswordAccount = Boolean(
  currentUser?.providerData.some((provider) => provider.providerId === 'password')
);

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
    // Remove this device from account-scoped scan completion pushes before
    // Firebase clears the credential required by the registration endpoint.
    await unregisterSharedEventPushNotifications();
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

  // Toggle trending-on-open setting
  const handleToggleTrending = async () => {
    const newValue = !showTrendingOnOpen;
    setShowTrendingOnOpen(newValue);

    // Persist to Firestore
    const currentUser = auth.currentUser;
    if (currentUser) {
      try {
        await updateShowTrendingOnOpen(currentUser.uid, newValue);
      } catch (error) {
        console.error('Failed to update trending setting:', error);
      }
    }

    // Track analytics
    amplitudeTrack('trending_setting_toggled', {
      enabled: newValue,
      source: 'profile',
    });
  };

  const handleShareApp = async () => {
    const message = 'Check out GathR for finding local events and specials.';
    const shareContent = Platform.OS === 'ios'
      ? {
          title: 'GathR',
          message,
          url: APP_SHARE_URL,
        }
      : {
          title: 'GathR',
          message: `${message} ${APP_SHARE_URL}`,
        };

    try {
      amplitudeTrack('app_share_tapped', {
        source: 'profile',
        platform: Platform.OS,
      });

      const result = await Share.share(shareContent);

      if (result.action === Share.sharedAction) {
        amplitudeTrack('app_share_completed', {
          source: 'profile',
          platform: Platform.OS,
        });
      }
    } catch (error) {
      console.error('Failed to share app:', error);
      Alert.alert('Share Failed', 'Sorry, GathR could not open the share sheet.');
    }
  };

  const handleReplayTutorial = () => {
    Alert.alert(
      'Replay Tutorial',
      'Would you like to replay the GathR tutorial? This will guide you through the app features again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start Tutorial',
          onPress: () => {
            try {
              const now = Date.now();
              if (now - lastRestartClickAtRef.current >= 350) {
                lastRestartClickAtRef.current = now;
                amplitudeTrack('tutorial_restart_clicked', {
                  tutorial_id: 'main_onboarding_v1',
                  tutorial_version: 2,
                  total_steps: Array.isArray(TUTORIAL_STEPS) ? TUTORIAL_STEPS.length : 0,
                  source: 'tutorial_system',
                  from_screen: pathname || '/profile',
                  user_initiated: true,
                  launch_source: 'profile',
                  is_guest: !auth.currentUser,
                });
              }
            } catch (error) {
              console.log('[analytics] tutorial_restart_clicked failed:', error);
            }

            (global as any).tutorialLaunchUserInitiated = true;
            (global as any).tutorialLaunchSource = 'profile';
            beginProfileTutorialReplay({
              restartTutorial: (global as any).restartGathRTutorial,
              dismissProfile: () => router.back(),
            });
          },
        },
      ]
    );
  };

  const refreshAuthenticatedEmail = async () => {
    const user = auth.currentUser;
    if (!user) return;

    try {
      await reload(user);
      const refreshedEmail = user.email || '';
      if (!refreshedEmail) return;

      setEmail(refreshedEmail);
      if (cachedProfile?.email !== refreshedEmail) {
        await updateDoc(doc(firestore, 'users', user.uid), {
          email: refreshedEmail,
          lastUpdated: new Date(),
        });
      }
    } catch (error) {
      console.warn('Could not refresh the authenticated email:', error);
    }
  };

  const handleOpenAccountPrivacy = () => {
    setShowAccountModal(true);
    void refreshAuthenticatedEmail();
  };

  const handleOpenEmailChange = () => {
    setShowAccountModal(false);
    setNewEmailInput('');
    setEmailChangePassword('');
    setShowEmailChangeModal(true);
  };

  const handleEmailChangeRequest = async () => {
    const user = auth.currentUser;
    const normalizedEmail = newEmailInput.trim().toLowerCase();
    if (!user || !user.email) {
      Alert.alert('Sign in required', 'Sign in again before changing your email.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      Alert.alert('Check the email', 'Enter a valid email address.');
      return;
    }
    if (normalizedEmail === user.email.toLowerCase()) {
      Alert.alert('No change needed', 'That is already your GathR email address.');
      return;
    }
    if (isPasswordAccount && !emailChangePassword) {
      Alert.alert('Password required', 'Enter your current password to protect this account change.');
      return;
    }

    setEmailChangeInProgress(true);
    try {
      if (isPasswordAccount) {
        const credential = EmailAuthProvider.credential(user.email, emailChangePassword);
        await reauthenticateWithCredential(user, credential);
      }

      const result = await requestCurrentUserEmailChange(normalizedEmail);
      if (result.status === 'sent') {
        setShowEmailChangeModal(false);
        setEmailChangePassword('');
        amplitudeTrack('account_email_change_requested', { source: 'profile' });
        Alert.alert(
          'Check your new inbox',
          `We sent a confirmation link to ${result.pendingEmail}. Your current email stays active until you verify the new one.`
        );
        return;
      }
      if (result.status === 'email_already_in_use') {
        Alert.alert('Email already in use', 'That email is already connected to another GathR account.');
      } else if (result.status === 'email_unchanged') {
        Alert.alert('No change needed', 'That is already your GathR email address.');
      } else if (result.status === 'invalid_email') {
        Alert.alert('Check the email', 'Enter a valid email address.');
      } else if (result.status === 'rate_limited') {
        Alert.alert('Try again shortly', 'A confirmation email was sent recently. Please wait before requesting another.');
      } else if (result.status === 'requires_recent_login') {
        Alert.alert('Sign in again', 'For security, log out and sign back in before changing your email.');
      } else {
        Alert.alert('Could not change email', result.message);
      }
    } catch (error) {
      const code = typeof error === 'object' && error && 'code' in error
        ? String((error as { code?: unknown }).code || '')
        : '';
      if (['auth/wrong-password', 'auth/invalid-credential'].includes(code)) {
        Alert.alert('Incorrect password', 'Enter your current GathR password and try again.');
      } else if (code === 'auth/too-many-requests') {
        Alert.alert('Try again later', 'Firebase temporarily limited sign-in attempts for this account.');
      } else {
        Alert.alert('Could not change email', 'GathR could not verify this account right now.');
      }
    } finally {
      setEmailChangeInProgress(false);
    }
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

  const handleVersionInfoPress = () => {
    Alert.alert(
      'GathR version',
      APP_VERSION_DETAILS,
      [
        {
          text: 'Copy',
          onPress: () => Clipboard.setString(APP_VERSION_DETAILS),
        },
        { text: 'Done', style: 'cancel' },
      ]
    );
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
        contentContainerStyle={[styles.scrollContent, isEditing && styles.editScrollContent]}
        showsVerticalScrollIndicator={false}
        bounces={false}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View
          style={[
            styles.profileContainer,
            { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
          ]}
        >
          {isEditing ? (
            <View style={styles.editProfileCard}>
              <View style={styles.editHeaderRow}>
                <TouchableOpacity
                  style={styles.headerTextButton}
                  onPress={() => {
                    setIsEditing(false);
                    setEditedDisplayName(displayName);
                    setNewPhotoURI('');
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel profile editing"
                >
                  <Text style={styles.headerTextButtonLabel}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.editTitle}>Edit profile</Text>
                <TouchableOpacity
                  style={styles.headerTextButton}
                  onPress={saveChanges}
                  disabled={savingChanges}
                  accessibilityRole="button"
                  accessibilityLabel="Save profile"
                >
                  {savingChanges ? (
                    <ActivityIndicator color={BRAND.primary} size="small" />
                  ) : (
                    <Text style={[styles.headerTextButtonLabel, styles.headerSaveLabel]}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                onPress={handleProfilePictureUpdate}
                style={styles.editPhotoButton}
                accessibilityRole="button"
                accessibilityLabel="Change profile photo"
              >
                <View style={styles.editPhotoFrame}>
                  {newPhotoURI ? (
                    <Image source={{ uri: newPhotoURI }} style={styles.editPhoto} />
                  ) : photoURL ? (
                    <Image source={{ uri: photoURL }} style={styles.editPhoto} />
                  ) : (
                    <View style={styles.editPhotoPlaceholder}>
                      <Ionicons name="person" size={38} color={BRAND.textLight} />
                    </View>
                  )}
                  <View style={styles.cameraIconContainer}>
                    <Ionicons name="camera" size={16} color={BRAND.white} />
                  </View>
                </View>
                <Text style={styles.changePhotoLabel}>Change photo</Text>
              </TouchableOpacity>

              <Text style={styles.fieldLabel}>Display name</Text>
              <TextInput
                style={styles.compactNameInput}
                value={editedDisplayName}
                onChangeText={setEditedDisplayName}
                placeholder="Enter your name"
                maxLength={50}
                placeholderTextColor={BRAND.textLight}
                returnKeyType="done"
              />

              <TouchableOpacity
                style={styles.editInterestsCard}
                onPress={handleInterests}
                accessibilityRole="button"
                accessibilityLabel={`Choose interests. ${userInterests.length} selected`}
              >
                <View style={styles.sectionHeadingRow}>
                  <Text style={styles.sectionHeading}>Interests</Text>
                  <Text style={styles.sectionAction}>Choose interests</Text>
                </View>
                <View style={styles.interestChipsRow}>
                  {userInterests.slice(0, 3).map((interest) => (
                    <View key={interest} style={styles.interestChip}>
                      <Text style={styles.interestChipText} numberOfLines={1}>
                        {getCompactInterestLabel(interest)}
                      </Text>
                    </View>
                  ))}
                  <View style={[styles.interestChip, styles.interestCountChip]}>
                    <Text style={styles.interestCountChipText}>
                      {userInterests.length > 3 ? `+${userInterests.length - 3}` : `${userInterests.length} selected`}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>

              <View style={styles.editInfoRow}>
                <Ionicons name="information-circle-outline" size={20} color={BRAND.primary} />
                <Text style={styles.editInfoText}>Change and verify your email in Account & privacy</Text>
              </View>
            </View>
          ) : (
            <>
              <View style={styles.identityCard}>
                <View style={styles.compactAvatarFrame}>
                  {photoURL ? (
                    <Image source={{ uri: photoURL }} style={styles.compactAvatar} />
                  ) : (
                    <View style={styles.compactAvatarPlaceholder}>
                      <Ionicons name="person" size={30} color={BRAND.textLight} />
                    </View>
                  )}
                </View>
                <View style={styles.identityText}>
                  <Text style={styles.compactUserName} numberOfLines={1}>{displayName || 'User'}</Text>
                  <TouchableOpacity onPress={copyEmailToClipboard} activeOpacity={0.65}>
                    <Text style={styles.compactEmail} numberOfLines={1}>
                      {isEmailCopied ? 'Email copied' : email}
                    </Text>
                  </TouchableOpacity>
                  {memberSince ? (
                    <Text style={styles.compactMemberSince}>Member since {memberSince}</Text>
                  ) : null}
                </View>
                <TouchableOpacity
                  style={styles.editProfileButton}
                  onPress={() => setIsEditing(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Edit profile"
                >
                  <Ionicons name="create-outline" size={17} color={BRAND.primary} />
                  <Text style={styles.editProfileButtonText}>Edit</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.interestsCard}
                onPress={handleInterests}
                activeOpacity={0.72}
                accessibilityRole="button"
                accessibilityLabel={`Interests. ${userInterests.length} selected`}
              >
                <View style={styles.sectionHeadingRow}>
                  <Text style={styles.sectionHeading}>Interests</Text>
                  <View style={styles.sectionActionRow}>
                    <Text style={styles.sectionAction}>{userInterests.length} selected</Text>
                    <Ionicons name="chevron-forward" size={16} color={BRAND.primary} />
                  </View>
                </View>
                <View style={styles.interestChipsRow}>
                  {userInterests.length > 0 ? userInterests.slice(0, 3).map((interest) => (
                    <View key={interest} style={styles.interestChip}>
                      <Text style={styles.interestChipText} numberOfLines={1}>
                        {getCompactInterestLabel(interest)}
                      </Text>
                    </View>
                  )) : (
                    <Text style={styles.emptyInterestsText}>Choose the events and specials you care about.</Text>
                  )}
                  {userInterests.length > 3 && (
                    <View style={[styles.interestChip, styles.interestCountChip]}>
                      <Text style={styles.interestCountChipText}>+{userInterests.length - 3}</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>

              <View style={styles.featuresCard}>
                <Text style={styles.sectionHeading}>Features</Text>
                <View style={styles.featureRow}>
                  <View style={[styles.featureIcon, styles.hotspotFeatureIcon]}>
                    <HotspotCircleIcon isActive={showDailyHotspot} />
                  </View>
                  <View style={styles.featureCopy}>
                    <Text style={styles.featureTitle}>Daily Hotspot</Text>
                    <Text style={styles.featureSubtitle}>Highlight a top event each day</Text>
                  </View>
                  <Switch
                    value={showDailyHotspot}
                    onValueChange={handleToggleHotspot}
                    trackColor={{ false: '#D9E1EA', true: '#9ECFFF' }}
                    thumbColor={showDailyHotspot ? BRAND.primary : '#FFFFFF'}
                    ios_backgroundColor="#D9E1EA"
                    accessibilityLabel="Daily Hotspot"
                  />
                </View>
                <View style={styles.featureDivider} />
                <View style={styles.featureRow}>
                  <View style={[styles.featureIcon, styles.trendingFeatureIcon]}>
                    <MaterialIcons name="local-fire-department" size={20} color={BRAND.primary} />
                  </View>
                  <View style={styles.featureCopy}>
                    <Text style={styles.featureTitle}>Trending on launch</Text>
                    <Text style={styles.featureSubtitle}>Show what’s popular when GathR opens</Text>
                  </View>
                  <Switch
                    value={showTrendingOnOpen}
                    onValueChange={handleToggleTrending}
                    trackColor={{ false: '#D9E1EA', true: '#9ECFFF' }}
                    thumbColor={showTrendingOnOpen ? BRAND.primary : '#FFFFFF'}
                    ios_backgroundColor="#D9E1EA"
                    accessibilityLabel="Trending on launch"
                  />
                </View>
                <View style={styles.featureDivider} />
                <FacebookPageSubmission
                  ref={facebookSubmissionRef}
                  isHighlighted={facebookSubmissionHighlighted}
                  pulseAnim={facebookSubmissionPulseAnim}
                />
                <TouchableOpacity
                  style={styles.tutorialRow}
                  onPress={handleReplayTutorial}
                  accessibilityRole="button"
                  accessibilityLabel="Replay tutorial"
                  accessibilityHint="Starts the GathR tutorial again"
                >
                  <View style={styles.tutorialIconBadge}>
                    <Ionicons name="play" size={14} color="#52708D" />
                  </View>
                  <View style={styles.tutorialCopy}>
                    <Text style={styles.tutorialRowText}>Replay tutorial</Text>
                    <Text style={styles.tutorialRowSubtitle}>Take the quick tour again</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#8A9BAD" />
                </TouchableOpacity>
              </View>

              <View style={styles.communityRow}>
                <TouchableOpacity
                  style={styles.shareAppButton}
                  onPress={handleShareApp}
                  accessibilityRole="button"
                  accessibilityLabel="Share GathR"
                >
                  <View style={styles.shareAppIconBadge}>
                    <Ionicons name="share-social-outline" size={20} color={BRAND.primary} />
                  </View>
                  <View style={styles.shareAppTextContainer}>
                    <View style={styles.shareAppTitleRow}>
                      <Text style={styles.shareAppTitlePrefix}>Share</Text>
                      <View style={styles.shareAppWordmarkInline}>
                        <GathrWordmarkLogo width={44} height={16} color={BRAND.primary} />
                      </View>
                    </View>
                    <Text style={styles.shareAppSubtext} numberOfLines={1}>Invite a friend</Text>
                  </View>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.accountPrivacyRow}
                onPress={handleOpenAccountPrivacy}
                accessibilityRole="button"
                accessibilityLabel="Account and privacy"
              >
                <View style={styles.accountPrivacyIcon}>
                  <Ionicons name="shield-checkmark-outline" size={20} color={BRAND.primary} />
                </View>
                <View style={styles.accountPrivacyCopy}>
                  <Text style={styles.accountPrivacyTitle}>Account & privacy</Text>
                  <Text style={styles.accountPrivacySubtitle}>Email, sign out, and account controls</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={BRAND.textLight} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.versionInfoContainer}
                onPress={handleVersionInfoPress}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${APP_VERSION_SUMMARY}. ${APP_UPDATE_SUMMARY}`}
                accessibilityHint="Shows detailed app and update information"
                testID="app-version-info"
              >
                <Text style={styles.versionInfoPrimary}>{APP_VERSION_SUMMARY}</Text>
                <Text style={styles.versionInfoSecondary}>{APP_UPDATE_SUMMARY}</Text>
              </TouchableOpacity>
            </>
          )}
        </Animated.View>
      </ScrollView>
      
      {/* Native-stack Profile sits above the root overlay on iOS. */}
      <ProfileTutorialOverlayHost hostRef={profileTutorialOverlayHostRef} />

      <Modal
        visible={showAccountModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAccountModal(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowAccountModal(false)}>
          <View style={styles.accountModalOverlay}>
            <TouchableWithoutFeedback onPress={(event) => event.stopPropagation()}>
              <View style={styles.accountModalSheet}>
                <View style={styles.accountModalHandle} />
                <View style={styles.accountModalHeader}>
                  <View>
                    <Text style={styles.accountModalTitle}>Account & privacy</Text>
                    <Text style={styles.accountModalSubtitle}>Manage your GathR account</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.accountModalClose}
                    onPress={() => setShowAccountModal(false)}
                    accessibilityRole="button"
                    accessibilityLabel="Close account and privacy"
                  >
                    <Ionicons name="close" size={21} color={BRAND.text} />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.accountEmailRow}
                  onPress={handleOpenEmailChange}
                  accessibilityRole="button"
                  accessibilityLabel="Change email address"
                >
                  <View style={styles.accountModalIcon}>
                    <Ionicons name="mail-outline" size={20} color={BRAND.primary} />
                  </View>
                  <View style={styles.accountPrivacyCopy}>
                    <Text style={styles.accountModalLabel}>Email address</Text>
                    <Text style={styles.accountModalValue} numberOfLines={1}>{email}</Text>
                  </View>
                  <Text style={styles.accountEmailChangeLabel}>Change</Text>
                  <Ionicons name="chevron-forward" size={17} color={BRAND.textLight} />
                </TouchableOpacity>

                <TouchableOpacity style={styles.accountSheetAction} onPress={handleLogout}>
                  <Ionicons name="log-out-outline" size={20} color={BRAND.primary} />
                  <Text style={styles.accountSheetActionText}>Log out</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.accountSheetAction, styles.destructiveSheetAction]}
                  onPress={() => {
                    setShowAccountModal(false);
                    handleDeleteAccount();
                  }}
                >
                  <Ionicons name="trash-outline" size={20} color={BRAND.accent} />
                  <Text style={styles.destructiveSheetActionText}>Delete account</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal
        visible={showEmailChangeModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEmailChangeModal(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowEmailChangeModal(false)}>
          <View style={styles.accountModalOverlay}>
            <TouchableWithoutFeedback onPress={(event) => event.stopPropagation()}>
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <View style={styles.accountModalSheet}>
                  <View style={styles.accountModalHandle} />
                  <View style={styles.accountModalHeader}>
                    <View style={styles.emailChangeHeaderCopy}>
                      <Text style={styles.accountModalTitle}>Change email</Text>
                      <Text style={styles.accountModalSubtitle}>Verification protects your GathR account</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.accountModalClose}
                      onPress={() => setShowEmailChangeModal(false)}
                      accessibilityRole="button"
                      accessibilityLabel="Close email change"
                    >
                      <Ionicons name="close" size={21} color={BRAND.text} />
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.emailChangeDescription}>
                    We’ll send a confirmation link to your new address. Your current email remains active until you verify the new one.
                  </Text>

                  <Text style={styles.emailChangeLabel}>New email address</Text>
                  <View style={styles.emailChangeInputRow}>
                    <Ionicons name="mail-outline" size={19} color={BRAND.primary} />
                    <TextInput
                      style={styles.emailChangeInput}
                      value={newEmailInput}
                      onChangeText={setNewEmailInput}
                      placeholder="name@example.com"
                      placeholderTextColor={BRAND.textLight}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                      returnKeyType={isPasswordAccount ? 'next' : 'send'}
                      accessibilityLabel="New email address"
                    />
                  </View>

                  {isPasswordAccount ? (
                    <>
                      <Text style={styles.emailChangeLabel}>Current password</Text>
                      <View style={styles.emailChangeInputRow}>
                        <Ionicons name="lock-closed-outline" size={19} color={BRAND.primary} />
                        <TextInput
                          style={styles.emailChangeInput}
                          value={emailChangePassword}
                          onChangeText={setEmailChangePassword}
                          placeholder="Enter your password"
                          placeholderTextColor={BRAND.textLight}
                          autoCapitalize="none"
                          autoCorrect={false}
                          secureTextEntry
                          returnKeyType="send"
                          onSubmitEditing={handleEmailChangeRequest}
                          accessibilityLabel="Current password"
                        />
                      </View>
                    </>
                  ) : null}

                  <View style={styles.emailChangeSecurityNote}>
                    <Ionicons name="shield-checkmark-outline" size={18} color={BRAND.primary} />
                    <Text style={styles.emailChangeSecurityText}>
                      The new address becomes your sign-in email only after verification.
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.emailChangeButton,
                      (emailChangeInProgress || !newEmailInput.trim() || (isPasswordAccount && !emailChangePassword)) &&
                        styles.emailChangeButtonDisabled,
                    ]}
                    onPress={handleEmailChangeRequest}
                    disabled={emailChangeInProgress || !newEmailInput.trim() || (isPasswordAccount && !emailChangePassword)}
                    accessibilityRole="button"
                    accessibilityLabel="Send email change verification"
                  >
                    {emailChangeInProgress ? (
                      <ActivityIndicator color={BRAND.white} size="small" />
                    ) : (
                      <>
                        <Ionicons name="paper-plane-outline" size={18} color={BRAND.white} />
                        <Text style={styles.emailChangeButtonText}>Send verification email</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </KeyboardAvoidingView>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
      
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
    backgroundColor: 'transparent',
    minHeight: 60,
  },
  compactTrigger: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
  },
  compactMainAction: {
    flex: 1,
    minWidth: 0,
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
  },
  compactIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF8F0',
    marginRight: 10,
  },
  compactCopy: {
    flex: 1,
    minWidth: 0,
  },
  compactTitle: {
    color: BRAND.text,
    fontSize: 13,
    fontWeight: '700',
  },
  compactSubtitle: {
    color: BRAND.textLight,
    fontSize: 10,
    lineHeight: 14,
    marginTop: 2,
  },
  infoButton: {
    width: 36,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronButton: {
    width: 28,
    height: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(7, 24, 45, 0.45)',
  },
  modalSheet: {
    backgroundColor: BRAND.white,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 34 : 22,
  },
  modalHandle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D6DEE8',
    marginBottom: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    color: BRAND.text,
    fontSize: 20,
    fontWeight: '700',
  },
  modalSubtitle: {
    color: BRAND.textLight,
    fontSize: 12,
    marginTop: 3,
  },
  modalClose: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PROFILE_BUTTON_INNER_FILL,
    minHeight: 48,
    position: 'relative',
    marginBottom: 8,
  },
  expandableHeader: {
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingHorizontal: 40,
    position: 'relative',
  },
  headerLeadingIcon: {
    position: 'absolute',
    left: 0,
    top: 12,
  },
  titleContainer: {
    alignItems: 'center',
    marginLeft: 0,
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
    position: 'absolute',
    right: 0,
    top: 10,
  },
  progressContainer: {
    backgroundColor: PROFILE_BUTTON_INNER_FILL,
    marginBottom: 12,
  },
  progressBar: {
    height: 6,
    backgroundColor: Platform.OS === 'android' ? '#D6DEE8' : BRAND.lightGray,
    borderRadius: 3,
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
    paddingHorizontal: 20,
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
    flexGrow: 1,
    paddingHorizontal: 12,
    paddingBottom: 10,
    paddingTop: 10,
  },
  // FIXED: Adjusted top margin
  profileContainer: {
    flexGrow: 1,
    marginTop: 0,
    borderRadius: 0,
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
  buttonGridContainer: {
    marginHorizontal: -24
  ,
    marginBottom: 16,
  },
  buttonGrid: {
    gap: 8,
    paddingHorizontal: 8,
  },
  buttonGridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  gridButton: {
    flex: 1,
    height: 56,
    backgroundColor: PROFILE_BUTTON_FILL,
    borderWidth: 1.5,
    borderColor: BRAND.primary,
    borderRadius: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    gap: 0,
    // Shadow for iOS
    shadowColor: BRAND.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    // Shadow for Android
    elevation: 4,
  },
  gridButtonText: {
    color: BRAND.primary,
    fontWeight: '600',
    fontSize: 13,
    textAlign: 'center',
  },
  gridButtonSubtext: {
    color: BRAND.gray,
    fontSize: 9,
    textAlign: 'center',
    marginTop: 1,
  },
  buttonTextContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  buttonIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 24,
  },
  interestsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  countBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: BRAND.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: BRAND.primary,
  },
  countNumber: {
    fontSize: 11,
    fontWeight: 'bold',
    color: BRAND.primary,
  },
  hotspotIconWrapper: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hotspotCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'transparent',
    borderWidth: 2.5,
    borderColor: '#F57C00',
  },
  hotspotCircleActive: {
    borderColor: '#E65100',
    borderWidth: 3,
  },
  shareAppButton: {
    flex: 1,
    minHeight: 66,
    backgroundColor: BRAND.white,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    shadowColor: '#0B2748',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  shareAppIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E8F3FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
  },
  shareAppTextContainer: {
    flex: 1,
    paddingRight: 8,
  },
  shareAppTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  shareAppTitlePrefix: {
    color: BRAND.text,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
    marginRight: 4,
  },
  shareAppWordmarkInline: {
    height: 17,
    justifyContent: 'center',
      transform: [{ translateY: 0 }],
  },
  shareAppSubtext: {
    color: BRAND.textLight,
    fontSize: 11,
    marginTop: 2,
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
  versionInfoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 32,
    marginTop: 4,
    paddingHorizontal: 8,
  },
  versionInfoPrimary: {
    color: BRAND.gray,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  versionInfoSecondary: {
    color: BRAND.textLight,
    fontSize: 9,
    marginTop: 1,
    textAlign: 'center',
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
  editScrollContent: {
    justifyContent: 'flex-start',
  },
  identityCard: {
    minHeight: 88,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BRAND.white,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#0B2748',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  compactAvatarFrame: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: '#EAF0F7',
    overflow: 'hidden',
  },
  compactAvatar: {
    width: 66,
    height: 66,
    borderRadius: 33,
  },
  compactAvatarPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityText: {
    flex: 1,
    minWidth: 0,
    marginLeft: 12,
    marginRight: 6,
  },
  compactUserName: {
    color: BRAND.text,
    fontSize: 18,
    fontWeight: '700',
  },
  compactEmail: {
    color: BRAND.textLight,
    fontSize: 12,
    marginTop: 3,
  },
  compactMemberSince: {
    color: BRAND.textLight,
    fontSize: 11,
    marginTop: 3,
  },
  editProfileButton: {
    minWidth: 58,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  editProfileButtonText: {
    color: BRAND.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  interestsCard: {
    minHeight: 70,
    backgroundColor: BRAND.white,
    borderRadius: 16,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#0B2748',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionHeading: {
    color: BRAND.text,
    fontSize: 15,
    fontWeight: '700',
  },
  sectionActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionAction: {
    color: BRAND.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  interestChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    overflow: 'hidden',
  },
  interestChip: {
    maxWidth: 100,
    minHeight: 28,
    justifyContent: 'center',
    backgroundColor: '#F2F7FC',
    borderRadius: 14,
    paddingHorizontal: 10,
  },
  interestChipText: {
    color: BRAND.text,
    fontSize: 11,
    fontWeight: '600',
  },
  interestCountChip: {
    backgroundColor: '#E5F2FF',
  },
  interestCountChipText: {
    color: BRAND.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  emptyInterestsText: {
    color: BRAND.textLight,
    fontSize: 11,
  },
  featuresCard: {
    backgroundColor: BRAND.white,
    borderRadius: 16,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 4,
    shadowColor: '#0B2748',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  },
  featureRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
  },
  featureIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  hotspotFeatureIcon: {
    backgroundColor: '#FFF0EB',
  },
  trendingFeatureIcon: {
    backgroundColor: '#E8F3FF',
  },
  featureCopy: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  featureTitle: {
    color: BRAND.text,
    fontSize: 13,
    fontWeight: '700',
  },
  featureSubtitle: {
    color: BRAND.textLight,
    fontSize: 10,
    marginTop: 2,
  },
  featureDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E3EAF2',
    marginLeft: 44,
  },
  tutorialRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F8FC',
    borderRadius: 11,
    marginTop: 3,
    marginBottom: 1,
    paddingHorizontal: 9,
  },
  tutorialIconBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E7EEF6',
    marginRight: 9,
  },
  tutorialCopy: {
    flex: 1,
    minWidth: 0,
  },
  tutorialRowText: {
    color: '#38536F',
    fontSize: 11,
    fontWeight: '600',
  },
  tutorialRowSubtitle: {
    color: '#7A8DA1',
    fontSize: 9,
    marginTop: 1,
  },
  communityRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  facebookActionCell: {
    flex: 1,
    minWidth: 0,
  },
  accountPrivacyRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BRAND.white,
    borderRadius: 16,
    marginTop: 8,
    paddingHorizontal: 12,
    shadowColor: '#0B2748',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  },
  accountPrivacyIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F3FF',
    marginRight: 10,
  },
  accountPrivacyCopy: {
    flex: 1,
    minWidth: 0,
  },
  accountPrivacyTitle: {
    color: BRAND.text,
    fontSize: 13,
    fontWeight: '700',
  },
  accountPrivacySubtitle: {
    color: BRAND.textLight,
    fontSize: 10,
    marginTop: 2,
  },
  editProfileCard: {
    backgroundColor: BRAND.white,
    borderRadius: 20,
    padding: 16,
    shadowColor: '#0B2748',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  editHeaderRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  editTitle: {
    color: BRAND.text,
    fontSize: 18,
    fontWeight: '700',
  },
  headerTextButton: {
    minWidth: 62,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextButtonLabel: {
    color: BRAND.textLight,
    fontSize: 13,
    fontWeight: '600',
  },
  headerSaveLabel: {
    color: BRAND.primary,
    fontWeight: '700',
  },
  editPhotoButton: {
    alignSelf: 'center',
    alignItems: 'center',
    minHeight: 118,
    paddingTop: 4,
  },
  editPhotoFrame: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: '#EAF0F7',
  },
  editPhoto: {
    width: 82,
    height: 82,
    borderRadius: 41,
  },
  editPhotoPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  changePhotoLabel: {
    color: BRAND.primary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 7,
  },
  fieldLabel: {
    color: BRAND.textLight,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  compactNameInput: {
    minHeight: 48,
    color: BRAND.text,
    fontSize: 16,
    backgroundColor: '#F6F9FC',
    borderWidth: 1,
    borderColor: '#DDE5EE',
    borderRadius: 12,
    paddingHorizontal: 13,
  },
  editInterestsCard: {
    minHeight: 78,
    marginTop: 14,
    paddingTop: 2,
  },
  editInfoRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EDF6FF',
    borderRadius: 12,
    paddingHorizontal: 12,
    marginTop: 12,
  },
  editInfoText: {
    flex: 1,
    color: BRAND.textLight,
    fontSize: 11,
    marginLeft: 8,
  },
  accountModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(7, 24, 45, 0.45)',
  },
  accountModalSheet: {
    backgroundColor: BRAND.white,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 34 : 22,
  },
  accountModalHandle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D6DEE8',
    marginBottom: 16,
  },
  accountModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  accountModalTitle: {
    color: BRAND.text,
    fontSize: 20,
    fontWeight: '700',
  },
  accountModalSubtitle: {
    color: BRAND.textLight,
    fontSize: 12,
    marginTop: 3,
  },
  accountModalClose: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND.background,
  },
  accountEmailRow: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F6F9FC',
    borderRadius: 14,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  accountModalIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F3FF',
    marginRight: 10,
  },
  accountModalLabel: {
    color: BRAND.textLight,
    fontSize: 11,
  },
  accountModalValue: {
    color: BRAND.text,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  accountEmailChangeLabel: {
    color: BRAND.primary,
    fontSize: 12,
    fontWeight: '700',
    marginRight: 3,
  },
  emailChangeHeaderCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
  },
  emailChangeDescription: {
    color: BRAND.textLight,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 16,
  },
  emailChangeLabel: {
    color: BRAND.text,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  emailChangeInputRow: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: '#F6F9FC',
    borderWidth: 1,
    borderColor: '#DDE5EE',
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  emailChangeInput: {
    flex: 1,
    color: BRAND.text,
    fontSize: 15,
    paddingVertical: 12,
  },
  emailChangeSecurityNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EDF6FF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  emailChangeSecurityText: {
    flex: 1,
    color: BRAND.textLight,
    fontSize: 11,
    lineHeight: 16,
  },
  emailChangeButton: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: BRAND.primary,
    borderRadius: 14,
  },
  emailChangeButtonDisabled: {
    backgroundColor: '#A9BDD2',
  },
  emailChangeButtonText: {
    color: BRAND.white,
    fontSize: 15,
    fontWeight: '700',
  },
  accountSheetAction: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E3EAF2',
  },
  accountSheetActionText: {
    color: BRAND.text,
    fontSize: 14,
    fontWeight: '600',
  },
  destructiveSheetAction: {
    borderBottomWidth: 0,
  },
  destructiveSheetActionText: {
    color: BRAND.accent,
    fontSize: 14,
    fontWeight: '600',
  },
});
