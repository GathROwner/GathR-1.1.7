/**
 * HotspotHighlight - Daily Hotspot Visual Component
 *
 * Displays a pulsing highlight around the target cluster with a
 * floating tooltip showing time-urgency messaging.
 *
 * Features:
 * - Pulsing ring animation around cluster position
 * - Floating tooltip with dismiss (X) and "Don't show again" option
 * - Tap tooltip to open cluster callout
 * - Auto-dismisses after 5 seconds
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useHotspotHighlight } from '../../hooks/useHotspotHighlight';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const HIGHLIGHT_SIZE = 140;
const PULSE_MAX_SCALE = 1.4;
const POSITION_POLL_MS = 100;
const ANDROID_HOTSPOT_OVERLAY_DIAGNOSTICS = Platform.OS === 'android';

const logAndroidHotspotOverlayTiming = (label: string, details?: Record<string, unknown>) => {
  if (!ANDROID_HOTSPOT_OVERLAY_DIAGNOSTICS) {
    return;
  }

  console.warn('[GathRHotspotOverlay]', label, JSON.stringify(details ?? {}));
};

// Marker icons have their anchor at the bottom, so the visual center
// of the icon is above the geographic coordinate. Offset upward to
// center the circle on the icon rather than the coordinate point.
const MARKER_ICON_OFFSET_Y = -20;

// Colors
const BRAND_PRIMARY = '#1E90FF';
const NOW_COLOR = '#FF5722';
const TODAY_COLOR = '#F57C00';

interface HotspotHighlightProps {
  ignoreProgrammaticCameraRef: React.MutableRefObject<boolean>;
}

export const HotspotHighlight: React.FC<HotspotHighlightProps> = ({ ignoreProgrammaticCameraRef }) => {
  const {
    shouldShow,
    targetCluster,
    tooltipText,
    tooltipSubtext,
    isAnimating,
    targetCoordinates,
    dismiss,
    disablePermanently,
    onClusterTap,
    onOverlayPositionReady,
  } = useHotspotHighlight(ignoreProgrammaticCameraRef);

  // Track screen position of the cluster
  const [highlightPosition, setHighlightPosition] = useState<{ x: number; y: number } | null>(null);

  // Track if the position has been calculated after centroid is ready
  // This prevents the spotlight from appearing at the wrong position during zoom
  const [positionReady, setPositionReady] = useState(false);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const tooltipSlideAnim = useRef(new Animated.Value(-50)).current;
  const positionLogRef = useRef(false);
  const positionUnavailableLogRef = useRef(false);

  // Use Mapbox's getPointInView to convert geo coordinates to screen position
  const updatePosition = useCallback(async () => {
    const mapViewRef = (global as any).mapViewRef;
    if (!mapViewRef?.current || !targetCoordinates) {
      if (shouldShow && !positionUnavailableLogRef.current) {
        logAndroidHotspotOverlayTiming('position_unavailable', {
          hasMapViewRef: !!mapViewRef,
          hasMapViewCurrent: !!mapViewRef?.current,
          hasTargetCoordinates: !!targetCoordinates,
        });
        if (__DEV__) {
          console.log('[HotspotOverlay] position unavailable', {
            hasMapViewRef: !!mapViewRef,
            hasMapViewCurrent: !!mapViewRef?.current,
            hasTargetCoordinates: !!targetCoordinates,
          });
        }
        positionUnavailableLogRef.current = true;
      }
      return;
    }

    try {
      // getPointInView converts [longitude, latitude] to [x, y] coordinates
      // relative to the MapView. React Native styles also use layout units, so
      // do not multiply by PixelRatio here.
      let screenPoint = await mapViewRef.current.getPointInView([
        targetCoordinates.longitude,
        targetCoordinates.latitude,
      ]);

      if (screenPoint && Array.isArray(screenPoint) && screenPoint.length === 2) {
        const [rawX, rawY] = screenPoint;
        let x = rawX;
        let y = rawY;

        // The overlay is rendered in the same screen content container as the
        // MapView, so Mapbox's MapView-relative projection already matches this
        // absolute overlay. Adding measureInWindow().absoluteY double-counts
        // the tab header on Android and pushes the ring below the marker.

        // Apply marker icon offset to center on the visual icon rather than the coordinate
        y += MARKER_ICON_OFFSET_Y;

        setHighlightPosition({ x, y });
        if (shouldShow && !positionLogRef.current) {
          const layout = (global as any).mapViewLayout;
          logAndroidHotspotOverlayTiming('position_ready', {
            rawX,
            rawY,
            x,
            y,
            screenWidth: SCREEN_WIDTH,
            screenHeight: SCREEN_HEIGHT,
            layout,
            targetCoordinates,
            positionReady,
            isAnimating,
          });
          if (__DEV__) {
            console.log('[HotspotOverlay] position ready', {
              rawX,
              rawY,
              x,
              y,
              screenWidth: SCREEN_WIDTH,
              screenHeight: SCREEN_HEIGHT,
              layout,
              targetCoordinates,
              positionReady,
            });
          }
          positionLogRef.current = true;
        }

        // Mark position as ready once we have a valid position and shouldShow is true
        // This ensures the spotlight doesn't appear until after the centroid is calculated
        if (shouldShow && !positionReady) {
          setPositionReady(true);
          onOverlayPositionReady();
        }
      }
    } catch (e) {
      if (shouldShow && !positionLogRef.current) {
        logAndroidHotspotOverlayTiming('position_projection_failed', {
          error: e instanceof Error ? e.message : String(e),
          targetCoordinates,
        });
        if (__DEV__) {
          console.log('[HotspotOverlay] position projection failed', {
            error: e instanceof Error ? e.message : String(e),
            targetCoordinates,
          });
        }
        positionLogRef.current = true;
      }
      // Fallback to screen center if projection fails
      const layout = (global as any).mapViewLayout;
      if (layout) {
        const centerY = (layout.absoluteY || 0) + (layout.height / 2);
        setHighlightPosition({ x: SCREEN_WIDTH / 2, y: centerY });
      }
    }
  }, [targetCoordinates, shouldShow, positionReady, isAnimating, onOverlayPositionReady]);

  // Reset positionReady when the spotlight is hidden
  useEffect(() => {
    if (!shouldShow) {
      setPositionReady(false);
      positionLogRef.current = false;
      positionUnavailableLogRef.current = false;
    }
  }, [shouldShow]);

  // Update position only after the hotspot is actually visible. On slower
  // Android devices, polling Mapbox projection during the camera animation can
  // backlog the JS/native bridge and delay the refinement timer by many seconds.
  useEffect(() => {
    if (!shouldShow) {
      return;
    }

    // Initial position update
    updatePosition();

    // Poll only until the first valid projection, or while a camera animation is
    // active. Keeping this at 50ms for the full tooltip lifetime adds JS/native
    // bridge work exactly when the startup trace is already JS-saturated.
    if (positionReady && !isAnimating) {
      return;
    }

    const interval = setInterval(updatePosition, POSITION_POLL_MS);

    return () => clearInterval(interval);
  }, [shouldShow, isAnimating, positionReady, updatePosition]);

  // Fade in/out effect
  useEffect(() => {
    if (shouldShow) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();

      // Slide in tooltip
      Animated.spring(tooltipSlideAnim, {
        toValue: 0,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [shouldShow, fadeAnim, tooltipSlideAnim]);

  // Pulse animation loop
  useEffect(() => {
    if (shouldShow) {
      const pulse = Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: PULSE_MAX_SCALE,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ]);
      const looping = Animated.loop(pulse);
      looping.start();

      return () => {
        looping.stop();
        pulseAnim.stopAnimation();
      };
    }
  }, [shouldShow, pulseAnim]);

  // Don't render during animation (wait for centroid to be calculated)
  // Don't render until position is ready (prevents jumping from wrong position to correct position)
  if (!shouldShow || !positionReady || !highlightPosition) {
    return null;
  }

  // Determine accent color based on time status
  const accentColor =
    targetCluster?.timeStatus === 'now'
      ? NOW_COLOR
      : targetCluster?.timeStatus === 'today'
      ? TODAY_COLOR
      : BRAND_PRIMARY;

  const highlightCenterX = highlightPosition.x;
  const highlightCenterY = highlightPosition.y;

  return (
    <Animated.View
      style={[styles.container, { opacity: fadeAnim }]}
      pointerEvents="box-none"
    >
      {/* Pulsing ring highlight */}
      <View
        style={[
          styles.highlightContainer,
          {
            left: highlightCenterX - HIGHLIGHT_SIZE / 2,
            top: highlightCenterY - HIGHLIGHT_SIZE / 2,
          }
        ]}
        pointerEvents="none"
      >
        {/* Outer pulse ring */}
        <Animated.View
          style={[
            styles.pulseRing,
            {
              backgroundColor: accentColor,
              transform: [{ scale: pulseAnim }],
              opacity: pulseAnim.interpolate({
                inputRange: [1, PULSE_MAX_SCALE],
                outputRange: [0.4, 0],
              }),
            },
          ]}
        />
        {/* Inner solid ring */}
        <View
          style={[
            styles.innerRing,
            { borderColor: accentColor },
          ]}
        />
      </View>

      {/* Floating tooltip */}
      <Animated.View
        style={[
          styles.tooltipContainer,
          {
            top: highlightCenterY - HIGHLIGHT_SIZE / 2 - 130,
            transform: [{ translateY: tooltipSlideAnim }],
          },
        ]}
      >
        <TouchableOpacity
          style={[styles.tooltip, { borderColor: accentColor }]}
          onPress={onClusterTap}
          activeOpacity={0.9}
        >
          {/* Time status indicator */}
          {targetCluster?.timeStatus === 'now' && (
            <View style={[styles.liveIndicator, { backgroundColor: NOW_COLOR }]}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE:</Text>
            </View>
          )}

          {/* Main tooltip content */}
          <View style={styles.tooltipContent}>
            <Text style={styles.tooltipTitle}>{tooltipText}</Text>
            <Text style={styles.tooltipSubtext}>{tooltipSubtext}</Text>
          </View>

          {/* Close button */}
          <TouchableOpacity
            style={styles.closeButton}
            onPress={dismiss}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={20} color="#666" />
          </TouchableOpacity>
        </TouchableOpacity>

        {/* Don't show again link */}
        <TouchableOpacity
          style={styles.disableButton}
          onPress={disablePermanently}
        >
          <Text style={styles.disableText}>Don't show this again</Text>
        </TouchableOpacity>

        {/* Arrow pointing down to cluster */}
        <View style={[styles.tooltipArrow, { borderTopColor: '#fff' }]} />
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 1000,
  },
  highlightContainer: {
    position: 'absolute',
    width: HIGHLIGHT_SIZE,
    height: HIGHLIGHT_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: HIGHLIGHT_SIZE,
    height: HIGHLIGHT_SIZE,
    borderRadius: HIGHLIGHT_SIZE / 2,
  },
  innerRing: {
    width: HIGHLIGHT_SIZE * 0.7,
    height: HIGHLIGHT_SIZE * 0.7,
    borderRadius: (HIGHLIGHT_SIZE * 0.7) / 2,
    borderWidth: 3,
    backgroundColor: 'transparent',
  },
  tooltipContainer: {
    position: 'absolute',
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  tooltip: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    maxWidth: 380,
    borderWidth: 2,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 10,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
    marginRight: 4,
  },
  liveText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  tooltipContent: {
    flex: 1,
  },
  tooltipTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 2,
  },
  tooltipSubtext: {
    fontSize: 13,
    color: '#666',
  },
  closeButton: {
    padding: 4,
    marginLeft: 8,
  },
  disableButton: {
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 6,
  },
  disableText: {
    fontSize: 12,
    color: '#1a1a1a',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  tooltipArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
});

export default HotspotHighlight;
