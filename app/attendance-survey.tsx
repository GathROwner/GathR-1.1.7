// Option C: Bold & Trendy (Full Redesign)
// Effects used: Glassmorphism, Animated Gradients, Particle Burst on success, Haptics
// Dependencies (Expo):
//   expo install expo-linear-gradient expo-blur expo-haptics

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  Platform,
  Animated,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { amplitudeTrack } from '../lib/amplitudeAnalytics';
import { useMapStore } from '../store';
import { format, parseISO } from 'date-fns';
import FallbackImage from '../components/common/FallbackImage';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const BRAND = {
  primary: '#6C5CE7',       // vibrant purple
  secondary: '#00D2FF',     // cyan
  accent: '#FF6B6B',        // coral red
  success: '#00E676',       // neon green
  white: '#FFFFFF',
  text: '#0F1226',
  glass: 'rgba(255,255,255,0.08)',
  glassBorder: 'rgba(255,255,255,0.24)',
};

const GRADIENTS = [
  ['#1D2B64', '#F8CDDA'] as const, // deep blue → soft pink
  ['#0F2027', '#203A43', '#2C5364'] as const, // dark teal trio
  ['#834D9B', '#D04ED6'] as const, // purple → magenta
] as const;

export default function AttendanceSurveyScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const eventId = params.eventId as string;

  const events = useMapStore((state) => state.events);
  const event = useMemo(() => events.find((e) => String(e.id) === String(eventId)), [events, eventId]);

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Animated background: crossfade between gradient layers
  const bgAnim = useRef(new Animated.Value(0)).current;
  const gradientIndex = useRef(0);
const [frontGrad, setFrontGrad] = useState<(typeof GRADIENTS)[number]>(GRADIENTS[0]);
const [backGrad, setBackGrad] = useState<(typeof GRADIENTS)[number]>(GRADIENTS[1]);


  useEffect(() => {
    let isMounted = true;
    const loop = () => {
      Animated.sequence([
        Animated.timing(bgAnim, { toValue: 1, duration: 5000, useNativeDriver: true }),
        Animated.timing(bgAnim, { toValue: 0, duration: 5000, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (!isMounted) return;
        // rotate gradients for the next cycle
        gradientIndex.current = (gradientIndex.current + 1) % GRADIENTS.length;
        setFrontGrad(GRADIENTS[gradientIndex.current]);
        setBackGrad(GRADIENTS[(gradientIndex.current + 1) % GRADIENTS.length]);
        loop();
      });
    };
    loop();
    return () => {
      isMounted = false;
      bgAnim.stopAnimation();
    };
  }, [bgAnim]);

  // Button shimmer
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.timing(shimmer, { toValue: 1, duration: 2200, useNativeDriver: true })
    ).start();
  }, [shimmer]);

  // Format event date/time
  const eventDateTime = useMemo(() => {
    if (!event?.startDate) return '';
    try {
      const date = parseISO(event.startDate);
      const dayOfWeek = format(date, 'EEEE');
      const monthDay = format(date, 'MMM d');
      let timeStr = '';
      if (event.startTime && event.startTime !== 'N/A') {
        const timeParts = event.startTime.match(/(\d+):(\d+):?(\d+)?\s*(AM|PM)?/i);
        if (timeParts) {
          const hour = parseInt(timeParts[1]);
          const minute = timeParts[2];
          const ampm = timeParts[4] || (hour >= 12 ? 'PM' : 'AM');
          const hour12 = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
          timeStr = ` at ${hour12}:${minute} ${ampm}`;
        }
      }
      return `${dayOfWeek}, ${monthDay}${timeStr}`;
    } catch (e) {
      return event.startDate;
    }
  }, [event]);

  // ---- Particle system for success ----
  type Particle = {
    x: Animated.Value;
    y: Animated.Value;
    scale: Animated.Value;
    opacity: Animated.Value;
    rotate: Animated.Value;
    hue: number;
  };

  const NUM_PARTICLES = Platform.OS === 'ios' ? 28 : 22;
  const particlesRef = useRef<Particle[]>(
    Array.from({ length: NUM_PARTICLES }).map(() => ({
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      scale: new Animated.Value(0.3),
      opacity: new Animated.Value(0),
      rotate: new Animated.Value(0),
      hue: Math.floor(Math.random() * 360),
    }))
  );

  const triggerParticles = () => {
    const animations = particlesRef.current.map((p, i) => {
      const angle = (2 * Math.PI * i) / NUM_PARTICLES + Math.random() * 0.6;
      const distance = 90 + Math.random() * 140;
      const dx = Math.cos(angle) * distance;
      const dy = Math.sin(angle) * distance;
      return Animated.parallel([
        Animated.timing(p.opacity, { toValue: 1, duration: 80, useNativeDriver: true }),
        Animated.timing(p.scale, { toValue: 1, duration: 320, useNativeDriver: true }),
        Animated.timing(p.x, { toValue: dx, duration: 700, useNativeDriver: true }),
        Animated.timing(p.y, { toValue: dy, duration: 700, useNativeDriver: true }),
        Animated.timing(p.rotate, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]);
    });

    Animated.stagger(10, animations).start(() => {
      // fade out all
      Animated.stagger(
        6,
        particlesRef.current.map((p) =>
          Animated.parallel([
            Animated.timing(p.opacity, { toValue: 0, duration: 320, useNativeDriver: true }),
            Animated.timing(p.scale, { toValue: 0.3, duration: 320, useNativeDriver: true }),
            Animated.timing(p.x, { toValue: 0, duration: 0, useNativeDriver: true }),
            Animated.timing(p.y, { toValue: 0, duration: 0, useNativeDriver: true }),
            Animated.timing(p.rotate, { toValue: 0, duration: 0, useNativeDriver: true }),
          ])
        )
      ).start();
    });
  };

  // Handle response
  const handleResponse = async (attended: boolean) => {
    if (submitting || submitted) return;
    setSubmitting(true);

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      amplitudeTrack('post_event_attendance_response', {
        event_id: String(eventId),
        attended,
        response_method: 'in_app_survey',
        event_title: event?.title,
        event_venue: event?.venue,
      });

      setSubmitted(true);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      triggerParticles();

      setTimeout(() => {
        router.back();
      }, 1800);
    } catch (error) {
      console.error('[attendance-survey] Error submitting response:', error);
      setSubmitting(false);
      setTimeout(() => router.back(), 500);
    }
  };

  // If event not found, provide minimal shell
  if (!event) {
    return (
      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text>No event found.</Text>
          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
            <Text>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Animated opacities for gradient layers
  const frontOpacity = bgAnim;
  const backOpacity = bgAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  // Shimmer translate for buttons
  const shimmerTranslate = shimmer.interpolate({ inputRange: [0, 1], outputRange: [-SCREEN_W, SCREEN_W] });

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Animated layered gradients */}
      <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: backOpacity }]}> 
        <LinearGradient colors={backGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: frontOpacity }]}> 
        <LinearGradient colors={frontGrad} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
      </Animated.View>

      {/* Decorative gradient blobs */}
      <LinearGradient colors={[BRAND.secondary + 'AA', 'transparent'] as const} style={[styles.blob, { top: -80, left: -60 }]} />
      <LinearGradient colors={[BRAND.accent + '99', 'transparent'] as const} style={[styles.blob, { bottom: -100, right: -90 }]} />

      {/* Main content card with glassmorphism */}
      <View style={styles.root}>
        <BlurView intensity={50} tint={Platform.OS === 'ios' ? 'light' : 'default'} style={styles.glassCard}>
          {/* Close */}
{/* Header (no image, keeps close out of the photo) */}
<View style={styles.headerBar}>
  <TouchableOpacity
    style={styles.headerClose}
    onPress={() => router.back()}
    disabled={submitting}
    accessibilityLabel="Close survey"
  >
    <MaterialIcons name="close" size={20} color={BRAND.white} />
  </TouchableOpacity>
</View>


          {(event.imageUrl || event.profileUrl) && (
            <View style={styles.heroImageWrap}>
              <FallbackImage
                imageUrl={event.imageUrl || event.profileUrl}
                category={event.category}
                type={event.type}
                style={styles.heroImage}
                fallbackType={event.imageUrl ? 'post' : 'profile'}
                resizeMode="cover"
              />
              <View style={styles.heroOverlay} />
              <View style={styles.savedPill}>
                <MaterialIcons name="bookmark" size={16} color={BRAND.text} />
                <Text style={styles.savedPillText}>You saved this event</Text>
              </View>
            </View>
          )}

          {/* Event Details */}
          <View style={styles.details}>
            <Text style={styles.title}>{event.title}</Text>

            <View style={styles.detailRow}>
              <View style={styles.iconChip}><MaterialIcons name="place" size={18} color={BRAND.white} /></View>
              <Text style={styles.detailText}>{event.venue}</Text>
            </View>

            {eventDateTime ? (
              <View style={styles.detailRow}>
                <View style={styles.iconChip}><MaterialIcons name="access-time" size={18} color={BRAND.white} /></View>
                <Text style={styles.detailText}>{eventDateTime}</Text>
              </View>
            ) : null}
          </View>

          {/* Question */}
          {!submitted ? (
            <>
              <View style={styles.qWrap}>
                <Text style={styles.qTitle}>Did you attend?</Text>
                <Text style={styles.qSub}>Your feedback helps us recommend better events</Text>
              </View>

              {/* Buttons */}
              <View style={styles.actions}>
                <TouchableOpacity
                  activeOpacity={0.9}
                  disabled={submitting}
                  onPress={() => handleResponse(true)}
                  style={[styles.actionBtn, styles.yesBtn]}
                >
                  {submitting ? (
                    <ActivityIndicator color={BRAND.white} />
                  ) : (
                    <>
                      <MaterialIcons name="check" size={22} color={BRAND.white} />
                      <Text style={styles.btnText}>Yes, I went</Text>
                      {/* shimmer */}
                      <Animated.View
                        pointerEvents="none"
                        style={[styles.shimmer, { transform: [{ translateX: shimmerTranslate }] }]}
                      />
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.9}
                  disabled={submitting}
                  onPress={() => handleResponse(false)}
                  style={[styles.actionBtn, styles.noBtn]}
                >
                  {submitting ? (
                    <ActivityIndicator color={BRAND.white} />
                  ) : (
                    <>
                      <MaterialIcons name="close" size={22} color={BRAND.white} />
                      <Text style={styles.btnText}>No, I didn't</Text>
                      <Animated.View
                        pointerEvents="none"
                        style={[styles.shimmer, { transform: [{ translateX: shimmerTranslate }] }]}
                      />
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </>
          ) : (
            // Success state with particle effects
            <View style={styles.successWrap}>
              {/* particles */}
              <View style={styles.particleLayer} pointerEvents="none">
                {particlesRef.current.map((p, idx) => {
                  const rotate = p.rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
                  return (
                    <Animated.View
                      key={`p-${idx}`}
                      style={[
                        styles.particle,
                        {
                          backgroundColor: `hsl(${p.hue}, 85%, 60%)`,
                          opacity: p.opacity,
                          transform: [
                            { translateX: p.x },
                            { translateY: p.y },
                            { scale: p.scale },
                            { rotate },
                          ],
                        },
                      ]}
                    />
                  );
                })}
              </View>

              <View style={styles.successCircle}>
                <MaterialIcons name="check" size={64} color={BRAND.white} />
              </View>
              <Text style={styles.successText}>Thanks for your feedback!</Text>
            </View>
          )}
        </BlurView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#000' },
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },

  // soft glowing blobs
  blob: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    opacity: 0.6,
  },

  glassCard: {
    width: Math.min(560, SCREEN_W - 24),
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: BRAND.glassBorder,
    backgroundColor: BRAND.glass,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 32,
    elevation: 14,
  },

headerBar: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'flex-end',
  paddingHorizontal: 8,
  paddingVertical: 6,
},

headerClose: {
  width: 32,
  height: 32,
  borderRadius: 16,
  backgroundColor: 'rgba(0,0,0,0.35)',
  justifyContent: 'center',
  alignItems: 'center',
},


  heroImageWrap: { width: '100%', height: 190, position: 'relative' },
  heroImage: { width: '100%', height: '100%' },
  heroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.15)' },

  savedPill: {
    position: 'absolute',
    top: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: BRAND.white,
    opacity: 0.9,
  },
  savedPillText: { color: BRAND.text, fontWeight: '700', fontSize: 12, marginLeft: 6 },

  details: { padding: 20 },
  title: { color: BRAND.white, fontSize: 24, fontWeight: '800', letterSpacing: 0.2, marginBottom: 12 },

  detailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 },
  iconChip: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  detailText: { color: 'rgba(255,255,255,0.92)', fontSize: 15, flex: 1 },

  qWrap: { paddingHorizontal: 20, paddingBottom: 6, alignItems: 'center' },
  qTitle: { fontSize: 28, color: BRAND.white, fontWeight: '900', letterSpacing: 0.5 },
  qSub: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 6, textAlign: 'center' },

  actions: { padding: 20, gap: 14 },
  actionBtn: {
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  yesBtn: { backgroundColor: 'rgba(0,0,0,0.25)' },
  noBtn: { backgroundColor: 'rgba(0,0,0,0.2)' },
  btnText: { color: BRAND.white, fontSize: 18, fontWeight: '700', marginLeft: 10 },

  shimmer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: SCREEN_W * 0.6,
    opacity: 0.35,
    transform: [{ translateX: 0 }],
    backgroundColor: 'rgba(255,255,255,0.25)',
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 24,
  },

  successWrap: { alignItems: 'center', justifyContent: 'center', padding: 28 },
  particleLayer: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  particle: { width: 10, height: 10, borderRadius: 5 },

  successCircle: {
    width: 130,
    height: 130,
    borderRadius: 65,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    shadowColor: BRAND.success,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
  },
  successText: { color: BRAND.white, fontSize: 22, fontWeight: '800', marginTop: 20 },
});
