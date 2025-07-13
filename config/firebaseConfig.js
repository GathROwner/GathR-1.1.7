import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAnalytics, isSupported } from 'firebase/analytics';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyDlTVz1oAxaYgBQVupUFmhgWd1CLAmu2Xs",
  authDomain: "gathr-m1.firebaseapp.com",
  projectId: "gathr-m1",
  storageBucket: "gathr-m1.firebasestorage.app",
  messagingSenderId: "234071683975",
  appId: "1:234071683975:ios:49809a6cf3e62989869922"
  // measurementId is NOT needed for React Native/mobile apps
};

// Initialize Firebase app
const app = initializeApp(firebaseConfig);

// Initialize Firebase auth with AsyncStorage persistence
const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});

// Initialize other Firebase services
const firestore = getFirestore(app);
const storage = getStorage(app);

// Initialize Firebase Analytics with platform support check
let analytics = null;

const initializeAnalytics = async () => {
  try {
    console.log('🔍 FIREBASE DEBUG: Starting analytics initialization...');
    
    // Check if Analytics is supported (mainly for web platform)
    const supported = await isSupported();
    console.log('🔍 FIREBASE DEBUG: Analytics isSupported() result:', supported);
    
    if (supported) {
      analytics = getAnalytics(app);
      console.log('✅ FIREBASE DEBUG: Analytics initialized successfully');
      console.log('🔍 FIREBASE DEBUG: Analytics instance:', analytics);
      console.log('🔍 FIREBASE DEBUG: Analytics type:', typeof analytics);
    } else {
      console.log('❌ FIREBASE DEBUG: Analytics is not supported on this platform');
      analytics = null;
    }
  } catch (error) {
    console.error('❌ FIREBASE DEBUG: Failed to initialize Firebase Analytics:', error.message);
    console.error('❌ FIREBASE DEBUG: Full error:', error);
    analytics = null;
    // Don't throw error - app should continue to work without analytics
  }
};

// Initialize analytics
initializeAnalytics();

// Add debug logs after initialization
setTimeout(() => {
  console.log('🔍 FIREBASE DEBUG: Final analytics instance:', analytics);
  console.log('🔍 FIREBASE DEBUG: Final analytics type:', typeof analytics);
  console.log('🔍 FIREBASE DEBUG: Analytics is null?', analytics === null);
  console.log('🔍 FIREBASE DEBUG: Analytics is undefined?', analytics === undefined);
}, 2000);

export { auth, firestore, storage, analytics };