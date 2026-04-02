// \app\index.tsx

import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Pressable, 
  TextInput, 
  ScrollView, 
  KeyboardAvoidingView, 
  Platform, 
  ActivityIndicator, 
  Alert,
  Image,
  TouchableOpacity
} from 'react-native';
import { useRouter } from 'expo-router';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth, firestore, storage } from '../config/firebaseConfig';
import { setDoc, doc } from 'firebase/firestore';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { amplitudeMarkManualLogin } from '../lib/amplitudeAnalytics';
// Import analytics hook
import useAnalytics from '../hooks/useAnalytics';

export default function Index() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [photoURI, setPhotoURI] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const router = useRouter();
  
  // Initialize analytics
  const analytics = useAnalytics();

  // AdMob SDK initialization moved to _layout.tsx to ensure it runs regardless of auth state

  // Separate useEffect for tracking screen view changes
  useEffect(() => {
    // Track screen view when component mounts or mode changes
    analytics.trackScreenView('authentication', {
      auth_mode: isLogin ? 'login' : 'registration'
    });
  }, [analytics, isLogin]);



  const handleSelectImage = async () => {
    try {
      // Track image selection attempt
      analytics.trackUserAction('profile_image_selection_start');
      
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        // Track permission denial
        analytics.logEvent('permission_denied', {
          permission_type: 'media_library',
          context: 'profile_image_selection'
        });
        
        Alert.alert('Permission Denied', 'Sorry, we need camera roll permissions to select a profile picture.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setPhotoURI(result.assets[0].uri);
        
        // Track successful image selection
        analytics.trackUserAction('profile_image_selected', {
          image_size: result.assets[0].fileSize || 'unknown',
          image_width: result.assets[0].width || 'unknown',
          image_height: result.assets[0].height || 'unknown'
        });
      } else {
        // Track image selection cancellation
        analytics.trackUserAction('profile_image_selection_cancelled');
      }
    } catch (error) {
      console.error('Error selecting image:', error);
      
      // Track image selection error
      analytics.trackError('profile_image_selection', error instanceof Error ? error.message : 'Unknown error', {
        context: 'image_picker'
      });
      
      Alert.alert('Error', 'Failed to select an image.');
    }
  };

  const uploadImageToFirebase = async (uri: string, userId: string): Promise<string> => {
    try {
      // Track image upload start
      analytics.trackUserAction('profile_image_upload_start', {
        user_id: userId
      });
      
      const response = await fetch(uri);
      const blob = await response.blob();
      
      const storageRef = ref(storage, `profilePictures/${userId}`);
      const uploadTask = uploadBytesResumable(storageRef, blob);
      
      return new Promise<string>((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            // Track upload progress
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            if (progress === 100) {
              analytics.trackUserAction('profile_image_upload_complete', {
                user_id: userId,
                file_size: snapshot.totalBytes
              });
            }
          },
          (error) => {
            // Track upload error
            analytics.trackError('profile_image_upload', error.message, {
              user_id: userId,
              error_code: error.code
            });
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
      
      // Track upload error
      analytics.trackError('profile_image_upload', error instanceof Error ? error.message : 'Unknown error', {
        user_id: userId
      });
      
      throw error;
    }
  };

  const handleAuth = async () => {
    const startTime = Date.now();
    
    if (isLogin) {
      // Handle login
      if (!email || !password) {
        // Track validation error
        analytics.trackError('form_validation', 'Missing required fields', {
          auth_mode: 'login',
          missing_fields: [!email ? 'email' : '', !password ? 'password' : ''].filter(Boolean).join(',')
        });
        
        Alert.alert('Error', 'Please fill in all required fields');
        return;
      }

      setLoading(true);
      
      // Track login attempt
      analytics.trackUserAction('login_attempt', {
        method: 'email',
        timestamp: new Date().toISOString()
      });

      try {
        await amplitudeMarkManualLogin();
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const duration = Date.now() - startTime;

        // Track successful login
        analytics.trackUserLogin('email');
        analytics.initializeUser(userCredential.user.uid, {
          email: userCredential.user.email || 'unknown',
          login_method: 'email',
          is_guest: false
        });

        analytics.trackUserAction('login_success', {
          duration_ms: duration,
          user_id: userCredential.user.uid
        });

        // Navigation is handled by _layout.tsx once onAuthStateChanged fires
      } catch (error: any) {
        const duration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        
        // Track login failure
        analytics.trackError('authentication', errorMessage, {
          auth_mode: 'login',
          duration_ms: duration,
          error_code: error.code || 'unknown'
        });
        
        Alert.alert('Authentication Error', errorMessage);
        console.log('Authentication error:', error);
      } finally {
        setLoading(false);
      }
    } else {
      // Handle registration
      if (!email || !password || !displayName) {
        // Track validation error
        analytics.trackError('form_validation', 'Missing required fields', {
          auth_mode: 'registration',
          missing_fields: [!email ? 'email' : '', !password ? 'password' : '', !displayName ? 'displayName' : ''].filter(Boolean).join(',')
        });
        
        Alert.alert('Error', 'Please fill in all required fields');
        return;
      }

      if (password !== confirmPassword) {
        // Track password mismatch
        analytics.trackError('form_validation', 'Password confirmation mismatch', {
          auth_mode: 'registration'
        });
        
        Alert.alert('Error', 'Passwords do not match');
        return;
      }

      setLoading(true);
      
      // Track registration attempt
      analytics.trackUserAction('registration_attempt', {
        method: 'email',
        has_profile_image: !!photoURI,
        timestamp: new Date().toISOString()
      });

      try {
        // Register the user
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const userId = userCredential.user.uid;
        const duration = Date.now() - startTime;
        
        // Upload profile picture if selected
        let photoURL = '';
        if (photoURI) {
          photoURL = await uploadImageToFirebase(photoURI, userId);
        }
        
        // Create user document in Firestore
        await setDoc(doc(firestore, 'users', userId), {
          email: email,
          displayName: displayName,
          photoURL: photoURL,
          createdAt: new Date(),
          lastLogin: new Date(),
          userInterests: [],
          savedEvents: [],
          likedEvents: [],
        });

        
        // Track successful registration
        analytics.trackUserRegistration('email');
        analytics.initializeUser(userId, {
          email: email || 'unknown',
          display_name: displayName || 'unknown',
          has_profile_image: !!photoURL,
          registration_method: 'email',
          is_guest: false
        });
        
        analytics.trackUserAction('registration_success', {
          duration_ms: duration,
          user_id: userId,
          has_profile_image: !!photoURL
        });
        
        // Direct the user to the interest selection screen
        router.push('/interest-selection');
      } catch (error: any) {
        const duration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        
        // Track registration failure
        analytics.trackError('authentication', errorMessage, {
          auth_mode: 'registration',
          duration_ms: duration,
          error_code: error.code || 'unknown',
          has_profile_image: !!photoURI
        });
        
        Alert.alert('Registration Error', errorMessage);
        console.log('Registration error:', error);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      // Track validation error
      analytics.trackError('form_validation', 'Email required for password reset', {
        context: 'forgot_password'
      });
      
      Alert.alert('Error', 'Please enter your email address');
      return;
    }

    try {
      // Track password reset attempt
      analytics.trackUserAction('password_reset_attempt', {
        email: email
      });
      
      await sendPasswordResetEmail(auth, email);
      
      // Track password reset success
      analytics.trackUserAction('password_reset_sent', {
        email: email
      });
      
      Alert.alert('Password Reset', 'Password reset email has been sent to your email address');
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      
      // Track password reset error
      analytics.trackError('password_reset', errorMessage, {
        email: email,
        error_code: error.code || 'unknown'
      });
      
      Alert.alert('Error', errorMessage);
    }
  };

  // Track guest mode selection
  const handleGuestMode = () => {
    analytics.trackUserAction('guest_mode_selected', {
      from_screen: 'authentication'
    });
    
    // Set guest user properties
    analytics.initializeUser('guest_' + Date.now(), {
      is_guest: true,
      guest_session_start: new Date().toISOString()
    });
    
    router.replace('/(tabs)/map');
  };

  // Track mode switching
  const handleModeSwitch = () => {
    const newMode = !isLogin;
    
    analytics.trackUserAction('auth_mode_switch', {
      from_mode: isLogin ? 'login' : 'registration',
      to_mode: newMode ? 'login' : 'registration'
    });
    
    setIsLogin(newMode);
  };

  // Registration content with optimized layout
  const renderRegistrationForm = () => (
    <>
      {/* Profile Picture */}
      <Text style={[styles.inputLabel, {textAlign: 'center', width: '100%'}]}>Profile Picture (Optional)</Text>
      <TouchableOpacity 
        style={styles.imagePickerButton} 
        onPress={handleSelectImage}
        testID="image-picker"
      >
        {photoURI ? (
          <Image source={{ uri: photoURI }} style={styles.profileImage} />
        ) : (
          <View style={styles.profileImagePlaceholder}>
            <Ionicons name="person" size={32} color="#CCCCCC" />
            <Text style={styles.imagePickerText}>Select Image</Text>
          </View>
        )}
      </TouchableOpacity>
      
      {/* Display Name */}
      <Text style={styles.inputLabel}>Display Name</Text>
      <TextInput
        style={styles.input}
        placeholder="Enter your name"
        value={displayName}
        onChangeText={setDisplayName}
        autoCorrect={false}
        testID="displayName-input"
        placeholderTextColor="#7AA3CC"
      />
      
      {/* Email Address */}
      <Text style={styles.inputLabel}>Email Address</Text>
      <TextInput
        style={styles.input}
        placeholder="Enter your email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        testID="email-input"
        placeholderTextColor="#7AA3CC"
      />
      
      {/* Password */}
      <Text style={styles.inputLabel}>Password</Text>
      <View style={styles.passwordContainer}>
        <TextInput
          style={styles.passwordInput}
          placeholder="Enter your password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          testID="password-input"
          placeholderTextColor="#7AA3CC"
        />
        <TouchableOpacity 
          style={styles.eyeIcon} 
          onPress={() => {
            setShowPassword(!showPassword);
            analytics.trackUserAction('password_visibility_toggle', {
              auth_mode: 'registration',
              action: !showPassword ? 'show' : 'hide'
            });
          }}
        >
          <Ionicons 
            name={showPassword ? "eye-off" : "eye"} 
            size={22} 
            color="#7AA3CC" 
          />
        </TouchableOpacity>
      </View>
      
      {/* Confirm Password */}
      <Text style={styles.inputLabel}>Confirm Password</Text>
      <View style={styles.passwordContainer}>
        <TextInput
          style={styles.passwordInput}
          placeholder="Re-enter your password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry={!showConfirmPassword}
          autoCapitalize="none"
          testID="confirm-password-input"
          placeholderTextColor="#7AA3CC"
        />
        <TouchableOpacity 
          style={styles.eyeIcon} 
          onPress={() => {
            setShowConfirmPassword(!showConfirmPassword);
            analytics.trackUserAction('password_visibility_toggle', {
              auth_mode: 'registration',
              field: 'confirm_password',
              action: !showConfirmPassword ? 'show' : 'hide'
            });
          }}
        >
          <Ionicons 
            name={showConfirmPassword ? "eye-off" : "eye"} 
            size={22} 
            color="#7AA3CC" 
          />
        </TouchableOpacity>
      </View>
    </>
  );

  // Login content
  const renderLoginForm = () => (
    <>
      <Text style={styles.inputLabel}>Email Address</Text>
      <TextInput
        style={styles.input}
        placeholder="Enter your email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        testID="email-input"
        placeholderTextColor="#7AA3CC"
      />
      
      <Text style={styles.inputLabel}>Password</Text>
      <View style={styles.passwordContainer}>
        <TextInput
          style={styles.passwordInput}
          placeholder="Enter your password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          testID="password-input"
          placeholderTextColor="#7AA3CC"
        />
        <TouchableOpacity 
          style={styles.eyeIcon} 
          onPress={() => {
            setShowPassword(!showPassword);
            analytics.trackUserAction('password_visibility_toggle', {
              auth_mode: 'login',
              action: !showPassword ? 'show' : 'hide'
            });
          }}
        >
          <Ionicons 
            name={showPassword ? "eye-off" : "eye"} 
            size={22} 
            color="#7AA3CC" 
          />
        </TouchableOpacity>
      </View>
      
      <Pressable
        style={styles.forgotPasswordButton}
        onPress={handleForgotPassword}
        testID="forgot-password-button"
      >
        <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
      </Pressable>
    </>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={50}
    >
      <ScrollView
        contentContainerStyle={isLogin ? styles.loginScrollContent : styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo and Tagline - Compressed */}
        <View style={isLogin ? styles.loginLogoContainer : styles.logoContainer}>
          <Image 
            source={require('../assets/splash.png')} 
            style={isLogin ? styles.loginLogo : styles.logo} 
            resizeMode="contain"
          />
          {isLogin ? (
            <Text style={styles.loginSubtitle}>Your Cities Secrets at your Finger tips</Text>
          ) : (
            <Text style={styles.subtitle}>Your Cities Secrets at your Finger tips</Text>
          )}
        </View>

        <View style={styles.formContainer}>
          {/* Conditionally render login or signup form */}
          {isLogin ? renderLoginForm() : renderRegistrationForm()}

          {/* Action Button */}
          <Pressable
            style={styles.authButton}
            onPress={handleAuth}
            disabled={loading}
            testID="auth-button"
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.authButtonText}>
                {isLogin ? 'Log In' : 'Sign Up'}
              </Text>
            )}
          </Pressable>

          {/* Mode Switch */}
          <Pressable
            style={styles.switchModeButton}
            onPress={handleModeSwitch}
            testID="switch-mode-button"
          >
            <Text style={styles.switchModeText}>
              {isLogin ? 'Need an account? Sign Up' : 'Already have an account? Log In'}
            </Text>
          </Pressable>

          {/* Cancel Button - only shown during registration */}
          {!isLogin && (
            <Pressable
              style={styles.cancelButton}
              onPress={() => {
                analytics.trackUserAction('registration_cancelled');
                router.replace('/');
              }}
              testID="cancel-button"
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
          )}
          
          {/* Guest Button - only shown during login */}
          {isLogin && (
            <Pressable
              style={styles.guestButton}
              onPress={handleGuestMode}
              testID="guest-button"
            >
              <Text style={styles.guestButtonText}>Continue as Guest</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  passwordContainer: {
    flexDirection: 'row',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    height: 44,
  },
  passwordInput: {
    flex: 1,
    padding: 12,
    fontSize: 16,
    color: '#333333',
  },
  eyeIcon: {
    padding: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    flex: 1,
    backgroundColor: '#4A90E2',
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  loginScrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    paddingHorizontal: 10,
  },
  loginLogoContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logo: {
    width: 100,
    height: 100,
  },
  loginLogo: {
    width: 160,
    height: 160,
    marginBottom: 16,
  },
  subtitle: {
    flex: 1,
    fontSize: 16,
    color: '#FFFFFF',
    textAlign: 'center',
    fontWeight: '500',
    paddingLeft: 10,
  },
  loginSubtitle: {
    fontSize: 18,
    color: '#FFFFFF',
    textAlign: 'center',
    fontWeight: '500',
    marginHorizontal: 20,
  },
  formContainer: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
    color: '#333333',
  },
  input: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    color: '#333333',
    height: 44,
  },
  imagePickerButton: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  profileImage: {
    width: 90,
    height: 90,
    borderRadius: 45,
  },
  profileImagePlaceholder: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderStyle: 'dashed',
  },
  imagePickerText: {
    color: '#999999',
    marginTop: 2,
    fontSize: 12,
  },
  authButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  authButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  forgotPasswordButton: {
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 8,
    padding: 4,
  },
  forgotPasswordText: {
    color: '#007AFF',
    fontSize: 14,
  },
  switchModeButton: {
    alignSelf: 'center',
    marginTop: 12,
    padding: 4,
  },
  switchModeText: {
    color: '#007AFF',
    fontSize: 14,
  },
  cancelButton: {
    alignSelf: 'center',
    marginTop: 16,
    padding: 8,
  },
  cancelButtonText: {
    color: '#666666',
    fontSize: 14,
  },
  guestButton: {
    alignSelf: 'center',
    marginTop: 16,
    padding: 8,
  },
  guestButtonText: {
    color: '#666666',
    fontSize: 14,
  },
});