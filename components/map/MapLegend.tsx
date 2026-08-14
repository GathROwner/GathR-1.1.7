import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { useMapStore } from '../../store';
import { registerMapTraceSampler, traceMapEvent } from '../../utils/mapTrace';

export type MapStyleChoice = 'current' | 'standard' | 'gathr';
export type MapLightPreset = 'day' | 'dusk' | 'night';
export type MapPerspective = '2d' | '3d';
type MapLegendProps = {
  containerStyle?: ViewStyle;
  rightOffset?: number;
  topOffset?: number;
  bottomOffset?: number;
  mapStyle?: MapStyleChoice;
  mapStyleChanging?: boolean;
  onMapStyleChange?: (style: MapStyleChoice) => void;
  mapLightPreset?: MapLightPreset;
  onMapLightPresetChange?: (preset: MapLightPreset) => void;
  mapPerspective?: MapPerspective;
  onMapPerspectiveChange?: (perspective: MapPerspective) => void;
};

const readAnimatedValue = (value: Animated.Value): number | string =>
  typeof (value as any).__getValue === 'function' ? (value as any).__getValue() : 'unknown';

const PulseRing: React.FC<{ color: string; size: number }> = ({ color, size }) => {
  const [animations] = useState([new Animated.Value(0), new Animated.Value(0)]);

  useEffect(() => {
    const sequences = animations.map((anim, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 500),
          Animated.timing(anim, { toValue: 1, duration: 1400, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      )
    );

    Animated.parallel(sequences).start();
    return () => {
      animations.forEach((anim) => anim.stopAnimation());
    };
  }, [animations]);

  return (
    <View style={styles.pulseContainer}>
      {animations.map((anim, index) => {
        const opacity = anim.interpolate({
          inputRange: [0, 0.4, 1],
          outputRange: [0.55, 0.35, 0],
          extrapolate: 'clamp',
        });

        const scale = anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.7, 1.9],
          extrapolate: 'clamp',
        });

        return (
          <Animated.View
            key={`pulse-${index}`}
            style={[
              styles.pulseRing,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                borderColor: color,
                opacity,
                transform: [{ scale }],
              },
            ]}
          />
        );
      })}
    </View>
  );
};

const LegendTree: React.FC<{ color: string; showPulse?: boolean; beacon?: boolean }> = ({ color, showPulse, beacon }) => (
  <View style={styles.treeWrapper}>
    {showPulse && <PulseRing color={color} size={18} />}
    <View style={[styles.treeTop, beacon && styles.beaconTop, { backgroundColor: color }]} />
    <View style={[beacon ? styles.beaconTip : styles.treeTrunk, { backgroundColor: color }]} />
  </View>
);

const LegendBadge: React.FC<{ label: string; bg: string }> = ({ label, bg }) => (
  <View style={[styles.badge, { backgroundColor: bg }]}>
    <Text style={styles.badgeText}>{label}</Text>
  </View>
);

const LegendRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <View style={styles.row}>
    <View style={styles.rowIcon}>{children}</View>
    <Text style={styles.rowLabel}>{label}</Text>
  </View>
);

const NewContentDot: React.FC = () => {
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseScale, {
            toValue: 1.15,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseOpacity, {
            toValue: 1.0,
            duration: 1000,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(pulseScale, {
            toValue: 1.0,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseOpacity, {
            toValue: 0.6,
            duration: 1000,
            useNativeDriver: true,
          }),
        ]),
      ])
    );

    pulseAnimation.start();
    return () => {
      pulseAnimation.stop();
    };
  }, [pulseOpacity, pulseScale]);

  return (
    <Animated.View
      style={[
        styles.newDot,
        {
          opacity: pulseOpacity,
          transform: [{ scale: pulseScale }],
        },
      ]}
    />
  );
};

const MapLegend: React.FC<MapLegendProps> = ({
  containerStyle,
  rightOffset = 12,
  topOffset,
  bottomOffset = 140,
  mapStyle = 'current',
  mapStyleChanging = false,
  onMapStyleChange,
  mapLightPreset = 'day',
  onMapLightPresetChange,
  mapPerspective = '2d',
  onMapPerspectiveChange,
}) => {
  const [open, setOpen] = useState(false);
  const panelAnim = useRef(new Animated.Value(0)).current;
  const isFocused = useIsFocused();
  const activeFilterPanel = useMapStore((state) => state.activeFilterPanel);
  const visibilityAnim = useRef(new Animated.Value(1)).current;
  const visibilityTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPanelStateRef = useRef<string | null>(null);
  const isHiddenRef = useRef(false);

  useEffect(() => {
    Animated.timing(panelAnim, {
      toValue: open ? 1 : 0,
      duration: 160,
      useNativeDriver: true,
    }).start();
  }, [open, panelAnim]);

  useEffect(() => {
    traceMapEvent('map_legend_open_changed', {
      open,
      activeFilterPanel: activeFilterPanel ?? 'none',
    });
  }, [activeFilterPanel, open]);

  useEffect(() => {
    traceMapEvent('map_legend_visual_state_changed', {
      open,
      activeFilterPanel: activeFilterPanel ?? 'none',
      panelValue: readAnimatedValue(panelAnim),
      visibilityValue: readAnimatedValue(visibilityAnim),
      isFocused,
      isHidden: isHiddenRef.current,
      lastPanelState: lastPanelStateRef.current ?? 'none',
    });

    const sampleDelays = [100, 300, 700, 1500];
    const timeouts = sampleDelays.map((delayMs) =>
      setTimeout(() => {
        traceMapEvent('map_legend_visual_value_sampled', {
          delayMs,
          open,
          activeFilterPanel: activeFilterPanel ?? 'none',
          panelValue: readAnimatedValue(panelAnim),
          visibilityValue: readAnimatedValue(visibilityAnim),
          isFocused,
          isHidden: isHiddenRef.current,
          lastPanelState: lastPanelStateRef.current ?? 'none',
        });
      }, delayMs)
    );

    return () => {
      timeouts.forEach(clearTimeout);
    };
  }, [activeFilterPanel, isFocused, open, panelAnim, visibilityAnim]);

  useEffect(() => {
    return registerMapTraceSampler('map_legend', () => ({
      open,
      activeFilterPanel: activeFilterPanel ?? 'none',
      panelValue: readAnimatedValue(panelAnim),
      visibilityValue: readAnimatedValue(visibilityAnim),
      isFocused,
      isHidden: isHiddenRef.current,
      lastPanelState: lastPanelStateRef.current ?? 'none',
    }));
  }, [activeFilterPanel, isFocused, open, panelAnim, visibilityAnim]);

  useEffect(() => {
    if (!isFocused && open) setOpen(false);
  }, [isFocused, open]);

  useEffect(() => {
    if (activeFilterPanel && open) setOpen(false);
  }, [activeFilterPanel, open]);

  // Animate visibility when filter panel opens/closes
  // Debounce to prevent flickering during panel switches when activePanel briefly becomes null
  useEffect(() => {
    // If any panel is open, hide immediately and clear any pending show timeout
    if (activeFilterPanel) {
      if (visibilityTimeoutRef.current) {
        clearTimeout(visibilityTimeoutRef.current);
        visibilityTimeoutRef.current = null;
      }
      lastPanelStateRef.current = activeFilterPanel;
      if (!isHiddenRef.current) {
        isHiddenRef.current = true;
        Animated.timing(visibilityAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }).start();
      }
    }
    // If panel is null and we were previously showing a panel, wait before showing
    else if (!activeFilterPanel && lastPanelStateRef.current) {
      // Don't clear existing timeout - let it continue
      // Only start a new timeout if one isn't already running
      if (!visibilityTimeoutRef.current) {
        visibilityTimeoutRef.current = setTimeout(() => {
          lastPanelStateRef.current = null;
          isHiddenRef.current = false;
          visibilityTimeoutRef.current = null;
          Animated.timing(visibilityAnim, {
            toValue: 1,
            duration: 150,
            useNativeDriver: true,
          }).start();
        }, 500);
      }
    }
  }, [activeFilterPanel, visibilityAnim]);

  const panelStyle = {
    opacity: panelAnim,
    transform: [
      {
        translateY: panelAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [8, 0],
        }),
      },
      {
        translateX: panelAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [24, 0],
        }),
      },
    ],
  };

  const verticalStyle = typeof topOffset === 'number' ? { top: topOffset } : { bottom: bottomOffset };
  const panelPlacement = typeof topOffset === 'number' ? { top: 48 } : { bottom: 48 };
  const buttonPlacement = typeof topOffset === 'number' ? { top: 54 } : { bottom: 54 };
  const isGathrStandard = mapStyle === 'gathr';

  return (
    <Animated.View style={[styles.container, containerStyle, { opacity: visibilityAnim }]} pointerEvents={activeFilterPanel ? 'none' : 'box-none'}>
      {open && (
        <Pressable style={styles.scrim} onPress={() => setOpen(false)} />
      )}
      <View style={[styles.anchor, { right: rightOffset }, verticalStyle]} pointerEvents="box-none">
        <Animated.View
          pointerEvents={open ? 'auto' : 'none'}
          style={[styles.panel, panelPlacement, panelStyle]}
        >
        <View style={styles.panelHeader}>
          <View style={styles.panelHeaderText}>
            <Text style={styles.panelTitle}>Map</Text>
            <Text style={styles.panelSubtitle}>Style, markers & signals</Text>
          </View>
        </View>

        <View style={[styles.sectionCard, styles.sectionCardMapStyle]}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionPill, styles.sectionPillMapStyle]}>
              <MaterialIcons name="map" size={12} color="#155D86" />
            </View>
            <Text style={styles.sectionTitle}>Map Style</Text>
          </View>
          <View style={styles.styleSwitcher} accessibilityRole="radiogroup">
            {(['current', 'standard', 'gathr'] as MapStyleChoice[]).map((styleChoice) => {
              const selected = mapStyle === styleChoice;
              const label = styleChoice === 'current'
                ? 'Current'
                : styleChoice === 'standard'
                  ? 'Standard'
                  : 'GathR';
              return (
                <Pressable
                  key={styleChoice}
                  testID={`map-style-${styleChoice}`}
                  accessibilityRole="radio"
                  accessibilityLabel={`${label} map style`}
                  accessibilityState={{ selected, disabled: mapStyleChanging }}
                  disabled={mapStyleChanging}
                  onPress={() => onMapStyleChange?.(styleChoice)}
                  style={({ pressed }) => [
                    styles.styleChoice,
                    selected && styles.styleChoiceSelected,
                    pressed && !mapStyleChanging && styles.styleChoicePressed,
                    mapStyleChanging && styles.styleChoiceDisabled,
                  ]}
                >
                  <Text style={[styles.styleChoiceText, selected && styles.styleChoiceTextSelected]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {isGathrStandard ? (
            <View style={styles.lightingRow}>
              <Text style={styles.lightingLabel}>LIGHT</Text>
              <View style={styles.lightingSwitcher} accessibilityRole="radiogroup">
                {(['day', 'dusk', 'night'] as MapLightPreset[]).map((preset) => {
                  const selected = mapLightPreset === preset;
                  return (
                    <Pressable
                      key={preset}
                      testID={`map-light-${preset}`}
                      accessibilityRole="radio"
                      accessibilityLabel={`${preset} map lighting`}
                      accessibilityState={{ selected }}
                      onPress={() => onMapLightPresetChange?.(preset)}
                      style={({ pressed }) => [
                        styles.lightingChoice,
                        selected && styles.lightingChoiceSelected,
                        pressed && styles.styleChoicePressed,
                      ]}
                    >
                      <Text style={[styles.lightingChoiceText, selected && styles.lightingChoiceTextSelected]}>
                        {preset[0].toUpperCase() + preset.slice(1)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : (
            <Text testID="map-style-status" style={styles.styleStatus} numberOfLines={2}>
              {mapStyleChanging
                ? 'Switching basemap...'
                : mapStyle === 'standard'
                  ? 'Faded day style | low-density POIs | 3D enabled'
                  : 'Mapbox Streets v12'}
            </Text>
          )}
        </View>

        <View style={[styles.sectionCard, styles.sectionCardGreen]}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionPill, styles.sectionPillGreen]}>
              <MaterialIcons name="schedule" size={12} color="#0E5E2E" />
            </View>
            <Text style={styles.sectionTitle}>Event Timing</Text>
          </View>
          <View style={styles.sectionDivider} />
          <View style={styles.sectionGrid}>
            <LegendRow label="Happening Now">
              <View style={styles.rowCombo}>
                <LegendTree color="#34A853" showPulse beacon={isGathrStandard} />
                <LegendBadge label="NOW" bg="#34A853" />
              </View>
            </LegendRow>
            <View style={styles.rowDivider} />
            <LegendRow label="Today">
              <View style={styles.rowCombo}>
                <LegendTree color="#FBBC05" beacon={isGathrStandard} />
              </View>
            </LegendRow>
            <View style={styles.rowDivider} />
            <LegendRow label="Upcoming">
              <LegendTree color="#9AA0A6" beacon={isGathrStandard} />
            </LegendRow>
          </View>
        </View>

        <View style={[styles.sectionCard, styles.sectionCardBlue]}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionPill, styles.sectionPillBlue]}>
              <MaterialIcons name="list-alt" size={12} color="#1E3A8A" />
            </View>
            <Text style={styles.sectionTitle}>Counts</Text>
          </View>
          <View style={styles.sectionDivider} />
          <View style={styles.sectionGrid}>
            <LegendRow label="Events">
              <MaterialIcons name="event" size={18} color="#2196F3" />
            </LegendRow>
            <View style={styles.rowDivider} />
            <LegendRow label="Specials">
              <MaterialIcons name="restaurant" size={18} color="#34A853" />
            </LegendRow>
            <View style={styles.rowDivider} />
            <LegendRow label="Venues">
              <MaterialIcons name="home" size={18} color="#333" />
            </LegendRow>
          </View>
        </View>

        <View style={[styles.sectionCard, styles.sectionCardSand, styles.sectionCardLast]}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionPill, styles.sectionPillSand]}>
              <MaterialIcons name="visibility" size={12} color="#6B4E16" />
            </View>
            <Text style={styles.sectionTitle}>Indicators</Text>
          </View>
          <View style={styles.sectionDivider} />
          <View style={styles.sectionGrid}>
            <LegendRow label="New content">
              <View style={styles.newDotWrapper}>
                <NewContentDot />
              </View>
            </LegendRow>
            <View style={styles.rowDivider} />
            <LegendRow label="Your interests">
              <MaterialIcons name="thumb-up" size={18} color="#4A90E2" />
            </LegendRow>
            <View style={styles.rowDivider} />
            <LegendRow label="City-wide event">
              <View style={styles.cityEventSwatch}>
                <PulseRing color="#FFC400" size={16} />
                <View style={styles.cityEventSwatchBadge}>
                  <MaterialIcons name="festival" size={10} color="#4E342E" />
                </View>
              </View>
            </LegendRow>
            <View style={styles.rowDivider} />
            <LegendRow label="You are here">
              <View style={styles.userDotWrapper}>
                <PulseRing color="#4285F4" size={16} />
                <View style={styles.userDot} />
              </View>
            </LegendRow>
          </View>
        </View>
      </Animated.View>

        <TouchableOpacity
          style={[styles.button, styles.buttonFloating, buttonPlacement, open && styles.buttonActive]}
          onPress={() => {
            traceMapEvent('map_legend_button_pressed', {
              nextOpen: !open,
              activeFilterPanel: activeFilterPanel ?? 'none',
            });
            setOpen((prev) => !prev);
          }}
        >
          <MaterialIcons name="layers" size={18} color="#333" />
        </TouchableOpacity>
        <TouchableOpacity
          testID="map-perspective-toggle"
          accessibilityRole="button"
          accessibilityLabel={`Switch to ${mapPerspective === '3d' ? '2D' : '3D'} map view`}
          style={[
            styles.button,
            styles.buttonFloating,
            styles.perspectiveButton,
            buttonPlacement,
            mapPerspective === '3d' && styles.perspectiveButtonActive,
          ]}
          onPress={() => onMapPerspectiveChange?.(mapPerspective === '3d' ? '2d' : '3d')}
        >
          <MaterialIcons
            name={mapPerspective === '3d' ? 'view-in-ar' : 'layers'}
            size={15}
            color={mapPerspective === '3d' ? '#FFFFFF' : '#155D86'}
          />
          <Text style={[styles.perspectiveButtonText, mapPerspective === '3d' && styles.perspectiveButtonTextActive]}>
            {mapPerspective === '3d' ? '3D' : '2D'}
          </Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 12,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    zIndex: 1,
  },
  anchor: {
    position: 'absolute',
    alignItems: 'flex-end',
    zIndex: 2,
  },
  button: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E6E2D6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 5,
  },
  buttonFloating: {
    position: 'absolute',
    right: 6,
    zIndex: 14,
  },
  panel: {
    position: 'absolute',
    right: 0,
    width: 210,
    backgroundColor: '#FBF9F3',
    borderRadius: 16,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: '#E6E2D6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 8,
    overflow: 'hidden',
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    paddingRight: 26,
  },
  panelHeaderText: {
    flexDirection: 'column',
  },
  panelTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2B2A27',
    letterSpacing: 0.2,
  },
  panelSubtitle: {
    fontSize: 9,
    color: '#7A7469',
    marginTop: 2,
  },
  buttonActive: {
    borderColor: '#D7D2C7',
    shadowOpacity: 0.22,
  },
  sectionCard: {
    borderRadius: 12,
    padding: 5,
    marginBottom: 4,
    borderWidth: 1,
  },
  sectionCardLast: {
    marginBottom: 0,
  },
  sectionCardGreen: {
    backgroundColor: '#F3FBF6',
    borderColor: '#D6F1DF',
  },
  perspectiveButton: {
    right: 48,
    minWidth: 44,
    height: 36,
    paddingHorizontal: 8,
    paddingVertical: 0,
    justifyContent: 'center',
    gap: 3,
  },
  perspectiveButtonActive: {
    backgroundColor: '#155D86',
    borderColor: '#155D86',
  },
  perspectiveButtonText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#155D86',
  },
  perspectiveButtonTextActive: {
    color: '#FFFFFF',
  },
  sectionCardMapStyle: {
    backgroundColor: '#F0F8FC',
    borderColor: '#CFE7F4',
  },
  sectionCardBlue: {
    backgroundColor: '#F2F6FF',
    borderColor: '#D9E5FF',
  },
  sectionCardSand: {
    backgroundColor: '#FAF2F9',
    borderColor: '#EAD7E7',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 2,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#E8E2D6',
    borderStyle: 'dashed',
    marginBottom: 2,
  },
  sectionPill: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionPillGreen: {
    backgroundColor: '#DDF3E6',
  },
  sectionPillMapStyle: {
    backgroundColor: '#D7EDF8',
  },
  sectionPillBlue: {
    backgroundColor: '#DDE7FF',
  },
  sectionPillSand: {
    backgroundColor: '#F1D7EC',
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4C473D',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  sectionGrid: {
    gap: 2,
  },
  styleSwitcher: {
    flexDirection: 'row',
    padding: 2,
    borderRadius: 9,
    backgroundColor: '#DFEAF0',
  },
  styleChoice: {
    flex: 1,
    minHeight: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  styleChoiceSelected: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
  },
  styleChoicePressed: {
    opacity: 0.72,
  },
  styleChoiceDisabled: {
    opacity: 0.68,
  },
  styleChoiceText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#52636D',
  },
  styleChoiceTextSelected: {
    color: '#155D86',
    fontWeight: '700',
  },
  styleStatus: {
    marginTop: 5,
    minHeight: 22,
    fontSize: 8.5,
    lineHeight: 11,
    color: '#5F6E76',
    textAlign: 'center',
  },
  lightingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  lightingLabel: {
    fontSize: 7.5,
    fontWeight: '800',
    letterSpacing: 0.4,
    color: '#687A84',
  },
  lightingSwitcher: {
    flex: 1,
    flexDirection: 'row',
    padding: 2,
    borderRadius: 7,
    backgroundColor: '#DFEAF0',
  },
  lightingChoice: {
    flex: 1,
    minHeight: 22,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightingChoiceSelected: {
    backgroundColor: '#155D86',
  },
  lightingChoiceText: {
    fontSize: 7.5,
    fontWeight: '700',
    color: '#52636D',
  },
  lightingChoiceTextSelected: {
    color: '#FFFFFF',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowIcon: {
    width: 46,
    alignItems: 'center',
    paddingLeft: 12,
  },
  rowLabel: {
    fontSize: 11,
    color: '#3D3A33',
    flex: 1,
    textAlign: 'right',
  },
  rowCombo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rowDivider: {
    height: 1,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#ECE7DD',
    borderStyle: 'dashed',
    marginVertical: 2,
  },
  treeWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 22,
  },
  pulseRing: {
    position: 'absolute',
    borderWidth: 2,
  },
  pulseContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  treeTop: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  beaconTop: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2.5,
    zIndex: 2,
  },
  treeTrunk: {
    width: 6,
    height: 4,
    marginTop: -1,
  },
  beaconTip: {
    width: 7,
    height: 7,
    marginTop: -4,
    transform: [{ rotate: '45deg' }],
    borderRightWidth: 1.5,
    borderBottomWidth: 1.5,
    borderColor: '#FFFFFF',
    zIndex: 1,
  },
  badge: {
    minWidth: 20,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 6,
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 9,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  newDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF3B30',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  newDotWrapper: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4285F4',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  userDotWrapper: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cityEventSwatch: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cityEventSwatchBadge: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FFC400',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default MapLegend;
