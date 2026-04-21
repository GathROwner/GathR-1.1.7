import React, { useState, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Platform, PanResponder, PanResponderGestureState, Easing } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useMapStore } from '../../store';
import { TimeFilterType } from '../../types';
import TimeFilterOptions from './TimeFilterOptions';
import CategoryFilterOptions from './CategoryFilterOptions';
import { isEventNow, isEventHappeningToday } from '../../utils/dateUtils';
import { registerMapTraceSampler, traceMapEvent } from '../../utils/mapTrace';

type CurtainPeekState = {
  lastPeekTime: number;
  peekCount: number;
  isActive: boolean;
};

const INITIAL_CURTAIN_PEEK_STATE: CurtainPeekState = {
  lastPeekTime: 0,
  peekCount: 0,
  isActive: false
};

const readAnimatedValue = (value: Animated.Value): number | string =>
  typeof (value as any).__getValue === 'function' ? (value as any).__getValue() : 'unknown';

type UseCurtainPeekTimingOptions = {
  canTriggerPeek: boolean;
  enabled: boolean;
  filterSignature: string;
  firstPeekDelayMaxMs: number;
  firstPeekDelayMinMs: number;
  hidePeek: () => void;
  logLabel: string;
  onTriggerPeek: () => void;
  panelOpen: boolean;
  peekState: CurtainPeekState;
  repeatPeekDelayMaxMs: number;
  repeatPeekDelayMinMs: number;
  setPeekState: React.Dispatch<React.SetStateAction<CurtainPeekState>>;
};

const getRandomDelayMs = (minMs: number, maxMs: number) =>
  minMs + Math.random() * (maxMs - minMs);

const useCurtainPeekTiming = ({
  canTriggerPeek,
  enabled,
  filterSignature,
  firstPeekDelayMaxMs,
  firstPeekDelayMinMs,
  hidePeek,
  logLabel,
  onTriggerPeek,
  panelOpen,
  peekState,
  repeatPeekDelayMaxMs,
  repeatPeekDelayMinMs,
  setPeekState
}: UseCurtainPeekTimingOptions) => {
  const canTriggerPeekRef = useRef(canTriggerPeek);
  const lastFilterSignatureRef = useRef('');
  const onTriggerPeekRef = useRef(onTriggerPeek);
  const wasPanelOpenRef = useRef(panelOpen);

  React.useEffect(() => {
    canTriggerPeekRef.current = canTriggerPeek;
  }, [canTriggerPeek]);

  React.useEffect(() => {
    onTriggerPeekRef.current = onTriggerPeek;
  }, [onTriggerPeek]);

  const resetPeekSequence = React.useCallback(() => {
    hidePeek();
    setPeekState(INITIAL_CURTAIN_PEEK_STATE);
  }, [hidePeek, setPeekState]);

  React.useEffect(() => {
    if (!lastFilterSignatureRef.current) {
      lastFilterSignatureRef.current = filterSignature;
      return;
    }

    if (lastFilterSignatureRef.current === filterSignature) {
      return;
    }

    lastFilterSignatureRef.current = filterSignature;
    resetPeekSequence();
  }, [filterSignature, resetPeekSequence]);

  React.useEffect(() => {
    if (wasPanelOpenRef.current === panelOpen) {
      return;
    }

    wasPanelOpenRef.current = panelOpen;

    if (enabled) {
      resetPeekSequence();
    }
  }, [enabled, panelOpen, resetPeekSequence]);

  React.useEffect(() => {
    if (!enabled) {
      resetPeekSequence();
      return;
    }

    if (panelOpen || peekState.isActive) {
      return;
    }

    const nextDelay =
      peekState.peekCount === 0
        ? getRandomDelayMs(firstPeekDelayMinMs, firstPeekDelayMaxMs)
        : getRandomDelayMs(repeatPeekDelayMinMs, repeatPeekDelayMaxMs);
    const now = Date.now();
    const timeSinceLastPeek = peekState.lastPeekTime === 0 ? 0 : now - peekState.lastPeekTime;
    const remainingDelay =
      peekState.lastPeekTime === 0 ? nextDelay : Math.max(0, nextDelay - timeSinceLastPeek);

    console.log(`🎭 ${logLabel} peek timer: next in ${Math.round(remainingDelay / 1000)}s (peek #${peekState.peekCount})`);

    const peekTimer = setTimeout(() => {
      if (canTriggerPeekRef.current) {
        onTriggerPeekRef.current();
      }
    }, remainingDelay);

    return () => clearTimeout(peekTimer);
  }, [
    enabled,
    firstPeekDelayMaxMs,
    firstPeekDelayMinMs,
    logLabel,
    panelOpen,
    peekState.isActive,
    peekState.lastPeekTime,
    peekState.peekCount,
    repeatPeekDelayMaxMs,
    repeatPeekDelayMinMs,
    resetPeekSequence
  ]);

  return { resetPeekSequence };
};


const FilterPills = () => {
  // Use explicit selectors to ensure Zustand triggers re-renders when these change
  const events = useMapStore((state) => state.events);
  const filteredEvents = useMapStore((state) => state.filteredEvents);
  const filterCriteria = useMapStore((state) => state.filterCriteria);
  const setFilterCriteria = useMapStore((state) => state.setFilterCriteria);
  const setTypeFilters = useMapStore((state) => state.setTypeFilters);
  const activePanel = useMapStore((state) => state.activeFilterPanel);
  const setActivePanel = useMapStore((state) => state.setActiveFilterPanel);
  const getTimeFilterCounts = useMapStore((state) => state.getTimeFilterCounts);
  const getCategoryFilterCounts = useMapStore((state) => state.getCategoryFilterCounts);
  const onScreenEvents = useMapStore((state) => state.onScreenEvents);

  // Escape hatch: If ANY filter panel is opened while we're armed, cancel the armed state.
  React.useEffect(() => {
    if (eventsClearArmedRef.current && activePanel) {
      console.log('🧯 activePanel opened while Events clear armed → cancelling armed state');
      cancelEventsClearArmed('panel-opened');
    }
    traceMapEvent('filter_panel_changed', {
      activePanel: activePanel ?? 'none',
    });
  }, [activePanel]);
  
  // Separate opacity for each panel - both always rendered
  const eventsPanelOpacity = useRef(new Animated.Value(0)).current;
  const specialsPanelOpacity = useRef(new Animated.Value(0)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  
  // --- Hold-to-arm "Clear filters" for Events pill ---
  const EVENTS_CLEAR_HOLD_TO_ARM_MS = 850;
  const EVENTS_CLEAR_ARMED_AUTO_CANCEL_MS = 4000;

  const [eventsPillWidth, setEventsPillWidth] = React.useState(0);
  const [eventsPillLayout, setEventsPillLayout] = React.useState({ x: 0, y: 0, width: 0, height: 0 });
  const [eventsClearArmed, setEventsClearArmed] = React.useState(false);

  const eventsClearFillAnim = useRef(new Animated.Value(0)).current;
  const eventsClearHoldInProgressRef = useRef(false);
  const eventsClearSuppressNextChevronPressRef = useRef(false);
  const eventsClearAutoCancelTimeoutRef = useRef<any>(null);
  const eventsClearArmedRef = useRef(false);

  // --- Specials Clear Logic ---
  const [specialsPillWidth, setSpecialsPillWidth] = React.useState(0);
  const [specialsPillLayout, setSpecialsPillLayout] = React.useState({ x: 0, y: 0, width: 0, height: 0 });
  const [specialsClearArmed, setSpecialsClearArmed] = React.useState(false);
  const specialsClearFillAnim = useRef(new Animated.Value(0)).current;
  const specialsClearHoldInProgressRef = useRef(false);
  const specialsClearSuppressNextChevronPressRef = useRef(false);
  const specialsClearAutoCancelTimeoutRef = useRef<any>(null);
  const specialsClearArmedRef = useRef(false);
  const [specialsCurtainPeekState, setSpecialsCurtainPeekState] =
    useState<CurtainPeekState>(INITIAL_CURTAIN_PEEK_STATE);
  const specialsCurtainPeekAnimActive = useRef(false);
  const specialsCurtainSlideAnim = useRef(new Animated.Value(0)).current;
  const specialsCurtainSwipeActive = useRef(false);
  const specialsCurtainDragAnim = useRef(new Animated.Value(0)).current;
  const specialsCurtainPeekAnimationRef = useRef<Animated.CompositeAnimation | null>(null);
  const specialsCurtainClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const specialsCurtainPeekAutoHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const specialsCurtainProgressRef = useRef(0);
  const [specialsCurtainIsInteractive, setSpecialsCurtainIsInteractive] = useState(false);
  const specialsCurtainIsInteractiveRef = useRef(false);
  const specialsPillHasActiveFiltersRef = useRef(false);

  // --- Red Curtain Peek Animation ---
  const [curtainPeekState, setCurtainPeekState] = useState<CurtainPeekState>(INITIAL_CURTAIN_PEEK_STATE);
  const curtainPeekAnimActive = useRef(false);
  const curtainSlideAnim = useRef(new Animated.Value(0)).current; // 0=off-screen right, 1=fully covering

  // --- Red Curtain Swipe-to-Clear Gesture ---
  const curtainSwipeActive = useRef(false);
  const curtainDragAnim = useRef(new Animated.Value(0)).current; // Additional drag offset during swipe
  const curtainPeekAnimationRef = useRef<Animated.CompositeAnimation | null>(null);
  const curtainClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const curtainPeekAutoHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const curtainProgressRef = useRef(0);
  const [curtainIsInteractive, setCurtainIsInteractive] = useState(false); // Track if curtain accepts gestures
  const curtainIsInteractiveRef = useRef(false);
  const eventsPillHasActiveFiltersRef = useRef(false);
  const CURTAIN_HANDLE_WIDTH = 45;
  const CURTAIN_CONTENT_START_X = 12;
  const CURTAIN_CONTENT_LOCK_HALF_WIDTH = 28;
  const CURTAIN_MIN_PEEK_COVERAGE = 60;
  const CURTAIN_PEEK_FRACTION = 0.45;
  const CURTAIN_SNAP_TOLERANCE_PX = 18;
  const CURTAIN_CLEAR_HOLD_MS = 500;
  const CURTAIN_PEEK_AUTO_HIDE_MS = 1800;
  const SPECIALS_CURTAIN_TIMING_ENABLED = true;

  const setGlobalEventsClearGestureActive = (isActive: boolean) => {
    // We keep this global name so Map.tsx doesn't need to change
    (global as any).gathrEventsClearGestureActive = isActive;
  };

  const setCurtainInteractive = (isInteractive: boolean) => {
    curtainIsInteractiveRef.current = isInteractive;
    setCurtainIsInteractive(isInteractive);
  };

  const setSpecialsCurtainInteractive = (isInteractive: boolean) => {
    specialsCurtainIsInteractiveRef.current = isInteractive;
    setSpecialsCurtainIsInteractive(isInteractive);
  };

  const getCurtainMetrics = () => {
    const pillWidth = Math.max(CURTAIN_HANDLE_WIDTH, eventsPillLayout.width || 0);
    const peekCoverage = Math.min(
      pillWidth,
      Math.max(CURTAIN_MIN_PEEK_COVERAGE, pillWidth * CURTAIN_PEEK_FRACTION)
    );
    const travelDistance = Math.max(0, pillWidth - CURTAIN_HANDLE_WIDTH);
    const peekProgress = travelDistance === 0 ? 0 : (peekCoverage - CURTAIN_HANDLE_WIDTH) / travelDistance;

    return {
      pillWidth,
      peekCoverage,
      travelDistance,
      peekProgress
    };
  };

  const getSpecialsCurtainMetrics = React.useCallback(() => {
    const pillWidth = Math.max(CURTAIN_HANDLE_WIDTH, specialsPillLayout.width || 0);
    const peekCoverage = Math.min(
      pillWidth,
      Math.max(CURTAIN_MIN_PEEK_COVERAGE, pillWidth * CURTAIN_PEEK_FRACTION)
    );
    const travelDistance = Math.max(0, pillWidth - CURTAIN_HANDLE_WIDTH);
    const peekProgress = travelDistance === 0 ? 0 : (peekCoverage - CURTAIN_HANDLE_WIDTH) / travelDistance;

    return {
      pillWidth,
      peekCoverage,
      travelDistance,
      peekProgress
    };
  }, [specialsPillLayout.width]);

  const getCoverageForProgress = (progress: number, travelDistance: number) =>
    CURTAIN_HANDLE_WIDTH + (Math.max(0, Math.min(1, progress)) * travelDistance);

  const getProgressForCoverage = (coverage: number, pillWidth: number, travelDistance: number) => {
    const clampedCoverage = Math.max(CURTAIN_HANDLE_WIDTH, Math.min(pillWidth, coverage));

    if (travelDistance === 0) {
      return 0;
    }

    return (clampedCoverage - CURTAIN_HANDLE_WIDTH) / travelDistance;
  };

  const getCurtainCoverageForProgress = (progress: number) => {
    const { travelDistance } = getCurtainMetrics();
    return getCoverageForProgress(progress, travelDistance);
  };

  const getCurtainProgressForCoverage = (coverage: number) => {
    const { pillWidth, travelDistance } = getCurtainMetrics();
    return getProgressForCoverage(coverage, pillWidth, travelDistance);
  };

  const getSpecialsCurtainCoverageForProgress = (progress: number) => {
    const { travelDistance } = getSpecialsCurtainMetrics();
    return getCoverageForProgress(progress, travelDistance);
  };

  const getSpecialsCurtainProgressForCoverage = (coverage: number) => {
    const { pillWidth, travelDistance } = getSpecialsCurtainMetrics();
    return getProgressForCoverage(coverage, pillWidth, travelDistance);
  };

  const stopCurtainPeekAnimation = () => {
    if (curtainPeekAnimationRef.current) {
      curtainPeekAnimationRef.current.stop();
      curtainPeekAnimationRef.current = null;
    }
  };

  const stopSpecialsCurtainPeekAnimation = () => {
    if (specialsCurtainPeekAnimationRef.current) {
      specialsCurtainPeekAnimationRef.current.stop();
      specialsCurtainPeekAnimationRef.current = null;
    }
  };

  const clearCurtainPeekAutoHideTimeout = React.useCallback(() => {
    if (curtainPeekAutoHideTimeoutRef.current) {
      clearTimeout(curtainPeekAutoHideTimeoutRef.current);
      curtainPeekAutoHideTimeoutRef.current = null;
    }
  }, []);

  const clearSpecialsCurtainPeekAutoHideTimeout = React.useCallback(() => {
    if (specialsCurtainPeekAutoHideTimeoutRef.current) {
      clearTimeout(specialsCurtainPeekAutoHideTimeoutRef.current);
      specialsCurtainPeekAutoHideTimeoutRef.current = null;
    }
  }, []);

  const scheduleCurtainPeekAutoHide = (delayMs: number = CURTAIN_PEEK_AUTO_HIDE_MS) => {
    clearCurtainPeekAutoHideTimeout();

    curtainPeekAutoHideTimeoutRef.current = setTimeout(() => {
      curtainPeekAutoHideTimeoutRef.current = null;

      if (curtainSwipeActive.current || curtainPeekAnimActive.current) {
        return;
      }

      setCurtainInteractive(false);
      curtainDragAnim.stopAnimation();
      curtainDragAnim.setValue(0);

      Animated.timing(curtainSlideAnim, {
        toValue: 0,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false
      }).start(({ finished }) => {
        if (!finished) {
          return;
        }

        hideCurtain();
      });
    }, delayMs);
  };

  const hideCurtain = React.useCallback(() => {
    if (curtainClearTimeoutRef.current) {
      clearTimeout(curtainClearTimeoutRef.current);
      curtainClearTimeoutRef.current = null;
    }
    clearCurtainPeekAutoHideTimeout();
    curtainSlideAnim.stopAnimation();
    curtainSlideAnim.setValue(0);
    curtainDragAnim.stopAnimation();
    curtainDragAnim.setValue(0);
    curtainProgressRef.current = 0;
    curtainPeekAnimActive.current = false;
    setCurtainInteractive(false);
    setCurtainPeekState(prev => ({ ...prev, isActive: false }));
  }, [clearCurtainPeekAutoHideTimeout, curtainDragAnim, curtainSlideAnim]);

  const hideSpecialsCurtain = React.useCallback(() => {
    if (specialsCurtainClearTimeoutRef.current) {
      clearTimeout(specialsCurtainClearTimeoutRef.current);
      specialsCurtainClearTimeoutRef.current = null;
    }
    clearSpecialsCurtainPeekAutoHideTimeout();
    stopSpecialsCurtainPeekAnimation();
    specialsCurtainSlideAnim.stopAnimation();
    specialsCurtainSlideAnim.setValue(0);
    specialsCurtainDragAnim.stopAnimation();
    specialsCurtainDragAnim.setValue(0);
    specialsCurtainPeekAnimActive.current = false;
    specialsCurtainProgressRef.current = 0;
    setSpecialsCurtainInteractive(false);
    setSpecialsCurtainPeekState(prev => ({ ...prev, isActive: false }));
  }, [
    clearSpecialsCurtainPeekAutoHideTimeout,
    specialsCurtainDragAnim,
    specialsCurtainSlideAnim
  ]);

  const scheduleSpecialsCurtainPeekAutoHide = React.useCallback((delayMs: number = CURTAIN_PEEK_AUTO_HIDE_MS) => {
    clearSpecialsCurtainPeekAutoHideTimeout();

    specialsCurtainPeekAutoHideTimeoutRef.current = setTimeout(() => {
      specialsCurtainPeekAutoHideTimeoutRef.current = null;

      if (specialsCurtainSwipeActive.current || specialsCurtainPeekAnimActive.current) {
        return;
      }

      setSpecialsCurtainInteractive(false);
      specialsCurtainDragAnim.stopAnimation();
      specialsCurtainDragAnim.setValue(0);

      Animated.timing(specialsCurtainSlideAnim, {
        toValue: 0,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false
      }).start(({ finished }) => {
        if (!finished) {
          return;
        }

        hideSpecialsCurtain();
      });
    }, delayMs);
  }, [
    clearSpecialsCurtainPeekAutoHideTimeout,
    hideSpecialsCurtain,
    specialsCurtainDragAnim,
    specialsCurtainSlideAnim
  ]);

  React.useEffect(() => {
    eventsClearArmedRef.current = eventsClearArmed;
    specialsClearArmedRef.current = specialsClearArmed;
    setGlobalEventsClearGestureActive(
      eventsClearArmed || eventsClearHoldInProgressRef.current || 
      specialsClearArmed || specialsClearHoldInProgressRef.current ||
      curtainPeekState.isActive || curtainIsInteractive ||
      specialsCurtainPeekState.isActive || specialsCurtainIsInteractive
    );
  }, [
    eventsClearArmed,
    specialsClearArmed,
    curtainPeekState.isActive,
    curtainIsInteractive,
    specialsCurtainPeekState.isActive,
    specialsCurtainIsInteractive
  ]);

  React.useEffect(() => {
    const listenerId = curtainSlideAnim.addListener(({ value }) => {
      curtainProgressRef.current = value;
    });

    return () => {
      curtainSlideAnim.removeListener(listenerId);
    };
  }, [curtainSlideAnim]);

  React.useEffect(() => {
    const listenerId = specialsCurtainSlideAnim.addListener(({ value }) => {
      specialsCurtainProgressRef.current = value;
    });

    return () => {
      specialsCurtainSlideAnim.removeListener(listenerId);
    };
  }, [specialsCurtainSlideAnim]);

  const cancelEventsClearArmed = (reason: string, resetSuppressNextChevronPress: boolean = true) => {
    // Always clear the timer, even if we're not currently armed.
    if (eventsClearAutoCancelTimeoutRef.current) {
      clearTimeout(eventsClearAutoCancelTimeoutRef.current);
      eventsClearAutoCancelTimeoutRef.current = null;
    }

    if (curtainPeekAnimActive.current || curtainPeekState.isActive || curtainIsInteractiveRef.current) {
      hideCurtain();
    }

    if (!eventsClearArmedRef.current && !eventsClearHoldInProgressRef.current) {
      // Nothing to cancel, but ensure we don't leave the global flag stuck "on".
      setGlobalEventsClearGestureActive(false);

      if (resetSuppressNextChevronPress) {
        eventsClearSuppressNextChevronPressRef.current = false;
      }
      return;
    }

    console.log('↩️ Cancel Events clear (armed/hold):', reason);

    eventsClearHoldInProgressRef.current = false;
    setGlobalEventsClearGestureActive(false);

    if (resetSuppressNextChevronPress) {
      eventsClearSuppressNextChevronPressRef.current = false;
    }

    setEventsClearArmed(false);

    Animated.timing(eventsClearFillAnim, {
      toValue: 0,
      duration: 180,
      useNativeDriver: false
    }).start(() => {
      console.log('✅ Events clear overlay reset complete');
    });
  };

  // Let the map screen cancel the "armed" state using the same proven mechanism as panel close-on-map-tap.
React.useEffect(() => {
    (global as any).gathrCancelEventsClearArmed = (reason: string = 'map-press') => {
      console.log('🧯 Global cancel invoked for Filter pills:', reason);
      cancelEventsClearArmed(reason);
      cancelSpecialsClearArmed(reason);
    };

    return () => {
      if ((global as any).gathrCancelEventsClearArmed) {
        delete (global as any).gathrCancelEventsClearArmed;
      }
      if ((global as any).gathrEventsClearGestureActive !== undefined) {
        delete (global as any).gathrEventsClearGestureActive;
      }
    };
  }, []);

  const confirmClearEventsFilters = () => {
    console.log('🧹 CONFIRM: Clear Event filters');
    setTypeFilters('event', { timeFilter: TimeFilterType.TODAY, category: undefined });
    cancelEventsClearArmed('confirmed-clear');
  };

  const cancelSpecialsClearArmed = (reason: string, resetSuppressNextChevronPress: boolean = true) => {
    if (specialsClearAutoCancelTimeoutRef.current) {
      clearTimeout(specialsClearAutoCancelTimeoutRef.current);
      specialsClearAutoCancelTimeoutRef.current = null;
    }
    if (
      specialsCurtainPeekAnimActive.current ||
      specialsCurtainPeekState.isActive ||
      specialsCurtainIsInteractiveRef.current
    ) {
      hideSpecialsCurtain();
    }
    if (!specialsClearArmedRef.current && !specialsClearHoldInProgressRef.current) {
      setGlobalEventsClearGestureActive(false); // Fix: setGlobalEventsClearGestureActive
      if (resetSuppressNextChevronPress) specialsClearSuppressNextChevronPressRef.current = false;
      return;
    }
    specialsClearHoldInProgressRef.current = false;
    setGlobalEventsClearGestureActive(false); // Fix: setGlobalEventsClearGestureActive
    if (resetSuppressNextChevronPress) specialsClearSuppressNextChevronPressRef.current = false;
    setSpecialsClearArmed(false);
    Animated.timing(specialsClearFillAnim, { toValue: 0, duration: 180, useNativeDriver: false }).start();
  };

  const confirmClearSpecialsFilters = () => {
    console.log('🧹 CONFIRM: Clear Special filters');
    setTypeFilters('special', { timeFilter: TimeFilterType.TODAY, category: undefined });
    cancelSpecialsClearArmed('confirmed-clear');
  };

  const startSpecialsHoldToArmClear = () => {
    if (!specialsPillHasActiveFilters || specialsClearArmedRef.current) return;
    specialsClearHoldInProgressRef.current = true;
    setGlobalEventsClearGestureActive(true); // Fix: setGlobalEventsClearGestureActive
    specialsClearSuppressNextChevronPressRef.current = true;
    specialsClearFillAnim.setValue(0);
    Animated.timing(specialsClearFillAnim, {
      toValue: 1,
      duration: EVENTS_CLEAR_HOLD_TO_ARM_MS,
      useNativeDriver: false
    }).start(({ finished }) => {
      if (!finished || !specialsClearHoldInProgressRef.current) return;
      specialsClearHoldInProgressRef.current = false;
      setSpecialsClearArmed(true);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (specialsClearAutoCancelTimeoutRef.current) clearTimeout(specialsClearAutoCancelTimeoutRef.current);
      specialsClearAutoCancelTimeoutRef.current = setTimeout(() => {
        cancelSpecialsClearArmed('auto-timeout');
      }, EVENTS_CLEAR_ARMED_AUTO_CANCEL_MS);
    });
  };

  const triggerCurtainPeekAnimation = () => {
    if (curtainPeekAnimActive.current || eventsClearArmedRef.current) {
      console.log('⏭️ Curtain peek blocked (already active or armed)');
      return;
    }

    console.log('🎭 Triggering red curtain peek animation');
    const { peekProgress } = getCurtainMetrics();
    stopCurtainPeekAnimation();
    clearCurtainPeekAutoHideTimeout();
    curtainPeekAnimActive.current = true;
    setCurtainPeekState(prev => ({
      ...prev,
      isActive: true,
      lastPeekTime: Date.now(),
      peekCount: prev.peekCount + 1
    }));
    setCurtainInteractive(false);
    curtainSlideAnim.setValue(0);
    curtainDragAnim.setValue(0);

    // Animation sequence:
    // Elastic bounce in → settle with damping → slide out
    // Uses bezier curves for smooth, fluid bouncy-ball motion

    const peekAnimation = Animated.spring(curtainSlideAnim, {
      toValue: peekProgress,
      friction: 8,
      tension: 70,
      useNativeDriver: false
    });

    curtainPeekAnimationRef.current = peekAnimation;

    peekAnimation.start(({ finished }) => {
      curtainPeekAnimationRef.current = null;
      if (!finished) {
        return;
      }
      console.log('✅ Red curtain peek animation complete');
      curtainPeekAnimActive.current = false;
      curtainDragAnim.setValue(0);
      curtainProgressRef.current = peekProgress;
      setCurtainInteractive(true);
      scheduleCurtainPeekAutoHide();
    });

    // Mark curtain as visible after bounce completes (600ms bounce + small buffer)
    setTimeout(() => {
      if (curtainPeekAnimActive.current) {
        setCurtainInteractive(true);
        console.log('✋ Curtain now visible and ready for swipe gestures');
      }
    }, 700);

    // Light haptic feedback when curtain triggers
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const triggerSpecialsCurtainPeekAnimation = React.useCallback(() => {
    if (specialsCurtainPeekAnimActive.current || specialsClearArmedRef.current) {
      return;
    }

    const { peekProgress } = getSpecialsCurtainMetrics();
    stopSpecialsCurtainPeekAnimation();
    clearSpecialsCurtainPeekAutoHideTimeout();
    specialsCurtainPeekAnimActive.current = true;
    setSpecialsCurtainInteractive(false);
    specialsCurtainSlideAnim.setValue(0);
    specialsCurtainDragAnim.setValue(0);
    setSpecialsCurtainPeekState(prev => ({
      ...prev,
      isActive: true,
      lastPeekTime: Date.now(),
      peekCount: prev.peekCount + 1
    }));

    const peekAnimation = Animated.spring(specialsCurtainSlideAnim, {
      toValue: peekProgress,
      friction: 8,
      tension: 70,
      useNativeDriver: false
    });

    specialsCurtainPeekAnimationRef.current = peekAnimation;

    peekAnimation.start(({ finished }) => {
      specialsCurtainPeekAnimationRef.current = null;
      if (!finished) {
        return;
      }

      specialsCurtainPeekAnimActive.current = false;
      specialsCurtainDragAnim.setValue(0);
      specialsCurtainProgressRef.current = peekProgress;
      setSpecialsCurtainInteractive(true);
      scheduleSpecialsCurtainPeekAutoHide();
    });

    setTimeout(() => {
      if (specialsCurtainPeekAnimActive.current) {
        setSpecialsCurtainInteractive(true);
      }
    }, 700);

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [
    clearSpecialsCurtainPeekAutoHideTimeout,
    getSpecialsCurtainMetrics,
    scheduleSpecialsCurtainPeekAutoHide,
    specialsCurtainDragAnim,
    specialsCurtainSlideAnim
  ]);

  const handleSpecialsCurtainRelease = (gestureState: PanResponderGestureState) => {
    if (!specialsCurtainSwipeActive.current) return;

    const { pillWidth, peekProgress } = getSpecialsCurtainMetrics();
    const dragOffset = Math.max(0, -gestureState.dx);
    const baseCoverage = getSpecialsCurtainCoverageForProgress(
      specialsCurtainProgressRef.current || peekProgress
    );
    const totalCoverage = Math.max(
      CURTAIN_HANDLE_WIDTH,
      Math.min(pillWidth, baseCoverage + dragOffset)
    );
    const shouldSnapClosed = totalCoverage >= pillWidth - CURTAIN_SNAP_TOLERANCE_PX;

    if (shouldSnapClosed) {
      const snapProgress = getSpecialsCurtainProgressForCoverage(totalCoverage);

      specialsCurtainSlideAnim.setValue(snapProgress);
      specialsCurtainDragAnim.setValue(0);
      specialsCurtainProgressRef.current = snapProgress;

      Animated.spring(specialsCurtainSlideAnim, {
        toValue: 1,
        friction: 7,
        tension: 90,
        useNativeDriver: false
      }).start(({ finished }) => {
        if (!finished) {
          return;
        }

        specialsCurtainProgressRef.current = 1;
        setSpecialsCurtainInteractive(false);

        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }

        specialsCurtainClearTimeoutRef.current = setTimeout(() => {
          hideSpecialsCurtain();
          setSpecialsCurtainPeekState(INITIAL_CURTAIN_PEEK_STATE);
          setTypeFilters('special', {
            category: undefined,
            timeFilter: TimeFilterType.TODAY
          });
        }, CURTAIN_CLEAR_HOLD_MS);
      });
    } else {
      Animated.parallel([
        Animated.spring(specialsCurtainSlideAnim, {
          toValue: peekProgress,
          friction: 8,
          tension: 70,
          useNativeDriver: false
        }),
        Animated.spring(specialsCurtainDragAnim, {
          toValue: 0,
          friction: 8,
          tension: 80,
          useNativeDriver: false
        })
      ]).start(() => {
        specialsCurtainProgressRef.current = peekProgress;
        scheduleSpecialsCurtainPeekAutoHide();
      });
    }
  };

  const specialsCurtainPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () =>
        specialsCurtainIsInteractiveRef.current && specialsPillHasActiveFiltersRef.current,
      onMoveShouldSetPanResponder: (_evt, gestureState) =>
        gestureState.dx < -5 &&
        specialsCurtainIsInteractiveRef.current &&
        specialsPillHasActiveFiltersRef.current,
      onStartShouldSetPanResponderCapture: () =>
        specialsCurtainIsInteractiveRef.current && specialsPillHasActiveFiltersRef.current,
      onMoveShouldSetPanResponderCapture: (_evt, gestureState) =>
        gestureState.dx < -5 &&
        specialsCurtainIsInteractiveRef.current &&
        specialsPillHasActiveFiltersRef.current,
      onPanResponderGrant: () => {
        specialsCurtainSwipeActive.current = true;
        stopSpecialsCurtainPeekAnimation();
        clearSpecialsCurtainPeekAutoHideTimeout();

        specialsCurtainSlideAnim.stopAnimation((value) => {
          specialsCurtainProgressRef.current = value;
        });
        specialsCurtainDragAnim.stopAnimation();
        specialsCurtainDragAnim.setValue(0);
      },
      onPanResponderMove: (_evt, gestureState) => {
        if (!specialsCurtainSwipeActive.current) return;

        const dragOffset = Math.max(0, -gestureState.dx);
        specialsCurtainDragAnim.setValue(dragOffset);
      },
      onPanResponderRelease: (_evt, gestureState) => {
        if (!specialsCurtainSwipeActive.current) return;

        handleSpecialsCurtainRelease(gestureState);
        specialsCurtainSwipeActive.current = false;
      },
      onPanResponderTerminate: () => {
        Animated.spring(specialsCurtainDragAnim, {
          toValue: 0,
          friction: 8,
          tension: 80,
          useNativeDriver: false
        }).start(() => {
          scheduleSpecialsCurtainPeekAutoHide();
        });

        specialsCurtainSwipeActive.current = false;
      },
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true
    })
  ).current;

  const handleCurtainRelease = (gestureState: PanResponderGestureState) => {
    if (!curtainSwipeActive.current) return;

    const { pillWidth, peekProgress } = getCurtainMetrics();
    const dragOffset = Math.max(0, -gestureState.dx);
    const baseCoverage = getCurtainCoverageForProgress(curtainProgressRef.current || peekProgress);
    const totalCoverage = Math.max(CURTAIN_HANDLE_WIDTH, Math.min(pillWidth, baseCoverage + dragOffset));
    const shouldSnapClosed = totalCoverage >= pillWidth - CURTAIN_SNAP_TOLERANCE_PX;

    if (shouldSnapClosed) {
      const snapProgress = getCurtainProgressForCoverage(totalCoverage);

      curtainSlideAnim.setValue(snapProgress);
      curtainDragAnim.setValue(0);
      curtainProgressRef.current = snapProgress;

      Animated.spring(curtainSlideAnim, {
        toValue: 1,
        friction: 7,
        tension: 90,
        useNativeDriver: false
      }).start(({ finished }) => {
        if (!finished) {
          return;
        }

        curtainProgressRef.current = 1;
        setCurtainInteractive(false);

        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }

        curtainClearTimeoutRef.current = setTimeout(() => {
          resetEventsCurtainPeekSequence();
          setTypeFilters('event', {
            category: undefined,
            timeFilter: TimeFilterType.TODAY
          });
        }, CURTAIN_CLEAR_HOLD_MS);
      });
    } else {
      Animated.parallel([
        Animated.spring(curtainSlideAnim, {
          toValue: peekProgress,
          friction: 8,
          tension: 70,
          useNativeDriver: false
        }),
        Animated.spring(curtainDragAnim, {
          toValue: 0,
          friction: 8,
          tension: 80,
          useNativeDriver: false
        })
      ]).start(() => {
        curtainProgressRef.current = peekProgress;
        scheduleCurtainPeekAutoHide();
      });
    }
  };

  // Create PanResponder for curtain swipe-to-clear gesture
  const curtainPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => {
        // Only activate if curtain is visible and settled
        // This ensures we only capture gestures when curtain is fully visible
        const shouldActivate = curtainIsInteractiveRef.current && eventsPillHasActiveFiltersRef.current;
        if (shouldActivate) {
          console.log('👆 PanResponder START should set: YES - curtain is visible');
        }
        return shouldActivate;
      },
      onMoveShouldSetPanResponder: (_evt, gestureState) => {
        // Activate on leftward drag when curtain is visible.
        const shouldActivate = gestureState.dx < -5 && curtainIsInteractiveRef.current && eventsPillHasActiveFiltersRef.current;
        if (shouldActivate) {
          console.log('👆 PanResponder MOVE should set: YES - drag detected, dx=' + gestureState.dx);
        }
        return shouldActivate;
      },
      onStartShouldSetPanResponderCapture: () =>
        curtainIsInteractiveRef.current && eventsPillHasActiveFiltersRef.current,
      onMoveShouldSetPanResponderCapture: (_evt, gestureState) =>
        gestureState.dx < -5 && curtainIsInteractiveRef.current && eventsPillHasActiveFiltersRef.current,
      onPanResponderGrant: (_evt, _gestureState) => {
        console.log('👆 Curtain swipe started');
        curtainSwipeActive.current = true;
        stopCurtainPeekAnimation();
        clearCurtainPeekAutoHideTimeout();

        // Stop the automatic peek animation so user has full control
        curtainSlideAnim.stopAnimation((value) => {
          curtainProgressRef.current = value;
        });
        curtainDragAnim.stopAnimation();
        curtainDragAnim.setValue(0);
      },
      onPanResponderMove: (_evt, gestureState) => {
        if (!curtainSwipeActive.current) return;

        // Dragging left increases the curtain coverage across the pill.
        const dragOffset = Math.max(0, -gestureState.dx);
        curtainDragAnim.setValue(dragOffset);

        // Log every 10px to see drag progress
        if (Math.floor(dragOffset / 10) !== Math.floor((dragOffset - 1) / 10)) {
          console.log(`👉 Dragging curtain: ${Math.floor(dragOffset)}px`);
        }

      },
      onPanResponderRelease: (_evt, gestureState) => {
        if (!curtainSwipeActive.current) return;
        handleCurtainRelease(gestureState);
        curtainSwipeActive.current = false;
        return;
        /*
        console.log(`👋 Curtain swipe released: dx=${dragOffset}px, threshold=${CURTAIN_SWIPE_THRESHOLD}px`);

        if (shouldSnapClosed) {
          // User swiped far enough - CLEAR THE FILTERS
          console.log('✅ Curtain swipe successful - clearing event filters');

          // Animate curtain sliding all the way off-screen
          Animated.parallel([
            Animated.timing(curtainSlideAnim, {
              toValue: 0,
              duration: 300,
              useNativeDriver: true,
              easing: Easing.out(Easing.cubic)
            }),
            Animated.timing(curtainDragAnim, {
              toValue: 0,
              duration: 300,
              useNativeDriver: true
            })
          ]).start(() => {
            // Clear category AND reset time filter to TODAY
            console.log('🧹 Clearing event filters: category → undefined, timeFilter → TODAY');

            // Reset curtain state
            hideCurtain();
            setCurtainPeekState({ lastPeekTime: 0, peekCount: 0, isActive: false });

            setTypeFilters('event', {
              category: undefined,
              timeFilter: TimeFilterType.TODAY
            });
          });
        } else {
          // User didn't swipe far enough - snap back
          console.log('↩️ Curtain swipe cancelled - snapping back');
          Animated.spring(curtainDragAnim, {
            toValue: 0,
            friction: 8,
            tension: 80,
            useNativeDriver: true
          }).start();
        }

        curtainSwipeActive.current = false;
      },
      onPanResponderTerminate: (evt, gestureState) => {
        // Gesture was interrupted - snap back
        console.log('⚠️ Curtain swipe interrupted');
        Animated.spring(curtainDragAnim, {
          toValue: 0,
          friction: 8,
          tension: 80,
          useNativeDriver: true
        }).start();
        curtainSwipeActive.current = false;
        */
      },
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true
    })
  ).current;

  const startEventsHoldToArmClear = () => {
    if (!eventsPillHasActiveFilters) {
      console.log('⏭️ Events hold-to-arm ignored (no active event filters)');
      return;
    }
    if (eventsClearArmedRef.current) {
      console.log('⏭️ Events hold-to-arm ignored (already armed)');
      return;
    }

    console.log('🟥 Events hold-to-arm START');
    eventsClearHoldInProgressRef.current = true;
    setGlobalEventsClearGestureActive(true);
    eventsClearSuppressNextChevronPressRef.current = true;

    eventsClearFillAnim.setValue(0);

    Animated.timing(eventsClearFillAnim, {
      toValue: 1,
      duration: EVENTS_CLEAR_HOLD_TO_ARM_MS,
      useNativeDriver: false
    }).start(({ finished }) => {
      if (!finished) {
        console.log('🟡 Events hold-to-arm animation not finished (cancelled)');
        return;
      }

      if (!eventsClearHoldInProgressRef.current) {
        console.log('🟡 Events hold-to-arm finished, but hold is no longer active (likely cancelled)');
        return;
      }

      console.log('✅ Events hold-to-arm COMPLETE → ARMED');
      eventsClearHoldInProgressRef.current = false;
      setEventsClearArmed(true);

      try {
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } catch (e) {
        console.log('⚠️ Haptics failed (safe to ignore):', e);
      }

      if (eventsClearAutoCancelTimeoutRef.current) {
        clearTimeout(eventsClearAutoCancelTimeoutRef.current);
      }
      eventsClearAutoCancelTimeoutRef.current = setTimeout(() => {
        cancelEventsClearArmed('auto-timeout');
      }, EVENTS_CLEAR_ARMED_AUTO_CANCEL_MS);
    });
  };
  
  // Tutorial highlighting
  const [tutorialHighlight, setTutorialHighlight] = React.useState(false);
  
  React.useEffect(() => {
    const interval = setInterval(() => {
      const globalFlag = (global as any).tutorialHighlightFilterPills || false;
      if (globalFlag !== tutorialHighlight) {
        setTutorialHighlight(globalFlag);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [tutorialHighlight]);
  
  const tutorialPulseAnim = useRef(new Animated.Value(1)).current;
  
  React.useEffect(() => {
    if (tutorialHighlight) {
      const pulse = () => {
        Animated.sequence([
          Animated.timing(tutorialPulseAnim, {
            toValue: 1.05,
            duration: 800,
            useNativeDriver: true
          }),
          Animated.timing(tutorialPulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true
          })
        ]).start(({ finished }) => {
          if (finished && tutorialHighlight) pulse();
        });
      };
      pulse();
    } else {
      tutorialPulseAnim.stopAnimation();
      tutorialPulseAnim.setValue(1);
    }
    return () => tutorialPulseAnim.stopAnimation();
  }, [tutorialHighlight, tutorialPulseAnim]);

  // Calculate counts from ONLY viewport data - updates as viewport changes
  const eventsData = useMemo(() => {
    return onScreenEvents.filter(e => e.type === 'event');
  }, [onScreenEvents]);

  const specialsData = useMemo(() => {
    return onScreenEvents.filter(e => e.type === 'special');
  }, [onScreenEvents]);

  const totalEvents = eventsData.length;
  const totalSpecials = specialsData.length;

  // Calculate filtered counts from on-screen events only (using store's existing logic)
  // IMPORTANT: Recalculate when onScreenEvents or filterCriteria changes
  const eventFilterCounts = useMemo(() => getTimeFilterCounts('event'), [onScreenEvents, filterCriteria]);
  const specialFilterCounts = useMemo(() => getTimeFilterCounts('special'), [onScreenEvents, filterCriteria]);

  const visibleEvents = eventFilterCounts[filterCriteria.eventFilters.timeFilter];
  const visibleSpecials = specialFilterCounts[filterCriteria.specialFilters.timeFilter];

  // Debug logging for FilterPills (disabled - runs on every render)
  // console.log('[FilterPills] Counts updated:', {
  //   onScreenEventsCount: onScreenEvents.length,
  //   totalEvents,
  //   totalSpecials,
  //   visibleEvents,
  //   visibleSpecials,
  //   activeTimeFilter: filterCriteria.eventFilters.timeFilter,
  //   eventFilterCounts,
  //   specialFilterCounts
  // });
  
  // Ref to prevent map from closing during panel transitions
  const isSwitchingPanels = useRef(false);
  const switchingToPanel = useRef<'events' | 'specials' | null>(null);

  // During a transition, treat the "target" panel as active for pointerEvents/zIndex logic
  const effectivePanel =
    isSwitchingPanels.current && switchingToPanel.current ? switchingToPanel.current : activePanel;
  const showFilterOverlay = !!effectivePanel;
  const showEventsPanel = effectivePanel === 'events';
  const showSpecialsPanel = effectivePanel === 'specials';

  React.useEffect(() => {
    traceMapEvent('filter_panel_visual_state_changed', {
      activePanel: activePanel ?? 'none',
      effectivePanel: effectivePanel ?? 'none',
      eventsOpacity: readAnimatedValue(eventsPanelOpacity),
      specialsOpacity: readAnimatedValue(specialsPanelOpacity),
      overlayOpacity: readAnimatedValue(overlayOpacity),
    });

    const sampleDelays = [100, 300, 700, 1500];
    const timeouts = sampleDelays.map((delayMs) =>
      setTimeout(() => {
        traceMapEvent('filter_panel_visual_value_sampled', {
          delayMs,
          activePanel: activePanel ?? 'none',
          effectivePanel: effectivePanel ?? 'none',
          eventsOpacity: readAnimatedValue(eventsPanelOpacity),
          specialsOpacity: readAnimatedValue(specialsPanelOpacity),
          overlayOpacity: readAnimatedValue(overlayOpacity),
        });
      }, delayMs)
    );

    return () => {
      timeouts.forEach(clearTimeout);
    };
  }, [activePanel, effectivePanel, eventsPanelOpacity, specialsPanelOpacity, overlayOpacity]);

  React.useEffect(() => {
    return registerMapTraceSampler('filter_pills', () => ({
      activePanel: activePanel ?? 'none',
      effectivePanel: effectivePanel ?? 'none',
      eventsOpacity: readAnimatedValue(eventsPanelOpacity),
      specialsOpacity: readAnimatedValue(specialsPanelOpacity),
      overlayOpacity: readAnimatedValue(overlayOpacity),
      eventsClearArmed,
      specialsClearArmed,
      curtainPeekActive: curtainPeekState.isActive,
      specialsCurtainPeekActive: specialsCurtainPeekState.isActive,
      curtainInteractive: curtainIsInteractive,
      specialsCurtainInteractive: specialsCurtainIsInteractive,
      eventTimeFilter: filterCriteria.eventFilters.timeFilter,
      specialTimeFilter: filterCriteria.specialFilters.timeFilter,
      eventCategory: filterCriteria.eventFilters.category ?? 'none',
      specialCategory: filterCriteria.specialFilters.category ?? 'none',
    }));
  }, [
    activePanel,
    curtainIsInteractive,
    curtainPeekState.isActive,
    effectivePanel,
    eventsClearArmed,
    eventsPanelOpacity,
    filterCriteria.eventFilters.category,
    filterCriteria.eventFilters.timeFilter,
    filterCriteria.specialFilters.category,
    filterCriteria.specialFilters.timeFilter,
    overlayOpacity,
    specialsClearArmed,
    specialsCurtainIsInteractive,
    specialsCurtainPeekState.isActive,
    specialsPanelOpacity,
  ]);

  // Main toggle function - handles ALL scenarios
  const togglePanel = (panel: 'events' | 'specials' | null) => {
    traceMapEvent('filter_panel_toggle_requested', {
      requestedPanel: panel ?? 'none',
      currentActivePanel: activePanel ?? 'none',
    });
    console.log('🎯 togglePanel called:', { 
      requestedPanel: panel, 
      currentActivePanel: activePanel,
      timestamp: Date.now()
    });

    if (panel !== null && (eventsClearArmedRef.current || eventsClearHoldInProgressRef.current)) {
      console.log('🧯 togglePanel invoked while Events clear is armed/holding → cancelling first');
      cancelEventsClearArmed('open-panel');
    }

    if (panel === null) {
      // CLOSE ALL - from X button or background click
      console.log('❌ CLOSE ALL - Setting activePanel to null');
      setActivePanel(null);
      Animated.parallel([
        Animated.timing(eventsPanelOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(specialsPanelOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(overlayOpacity, { toValue: 0, duration: 150, useNativeDriver: true })
      ]).start(() => {
        console.log('✅ CLOSE ALL animation complete');
      });
    } else if (panel === 'events') {
      if (activePanel === 'events') {
        // CLOSE Events (clicking same chevron)
        console.log('❌ CLOSE Events - Same chevron clicked');
        setActivePanel(null);
        Animated.parallel([
          Animated.timing(eventsPanelOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
          Animated.timing(overlayOpacity, { toValue: 0, duration: 150, useNativeDriver: true })
        ]).start(() => {
          console.log('✅ CLOSE Events animation complete');
        });
      } else if (activePanel === 'specials') {
        // SWITCH from Specials to Events (overlay stays visible)
        console.log('🔄 SWITCH from Specials to Events - Setting state immediately, then cross-fading');
        isSwitchingPanels.current = true;
        switchingToPanel.current = 'events';

        setActivePanel('events');
        Animated.sequence([
          Animated.timing(specialsPanelOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
          Animated.timing(eventsPanelOpacity, { toValue: 1, duration: 150, useNativeDriver: true })
        ]).start(() => {
          console.log('✅ SWITCH to Events complete');

          // Ensure state is still correct (map might have changed it during transition)
          const currentPanel = useMapStore.getState().activeFilterPanel;
          if (currentPanel !== 'events') {
            console.log('⚠️ State was changed during transition, restoring to events');
            setActivePanel('events');
          }

          switchingToPanel.current = null;
          isSwitchingPanels.current = false;
        });

      } else {
        // OPEN Events (no panel currently open)
        console.log('✅ OPEN Events - No panel was open');

        // Cancel curtain animation if active
        if (curtainPeekAnimActive.current || curtainPeekState.isActive || curtainIsInteractiveRef.current) {
          hideCurtain();
        }

        setActivePanel('events');
        Animated.parallel([
          Animated.timing(eventsPanelOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
          Animated.timing(overlayOpacity, { toValue: 1, duration: 150, useNativeDriver: true })
        ]).start(() => {
          console.log('✅ OPEN Events animation complete');
        });
      }
    } else if (panel === 'specials') {
      if (activePanel === 'specials') {
        // CLOSE Specials (clicking same chevron)
        console.log('❌ CLOSE Specials - Same chevron clicked');
        setActivePanel(null);
        Animated.parallel([
          Animated.timing(specialsPanelOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
          Animated.timing(overlayOpacity, { toValue: 0, duration: 150, useNativeDriver: true })
        ]).start(() => {
          console.log('✅ CLOSE Specials animation complete');
        });
      } else if (activePanel === 'events') {
        // SWITCH from Events to Specials (overlay stays visible)
        console.log('🔄 SWITCH from Events to Specials - Setting state immediately, then cross-fading');
        isSwitchingPanels.current = true;
        switchingToPanel.current = 'specials';

        setActivePanel('specials');
        Animated.sequence([
          Animated.timing(eventsPanelOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
          Animated.timing(specialsPanelOpacity, { toValue: 1, duration: 150, useNativeDriver: true })
        ]).start(() => {
          console.log('✅ SWITCH to Specials complete');

          // Ensure state is still correct (map might have changed it during transition)
          const currentPanel = useMapStore.getState().activeFilterPanel;
          if (currentPanel !== 'specials') {
            console.log('⚠️ State was changed during transition, restoring to specials');
            setActivePanel('specials');
          }

          switchingToPanel.current = null;
          isSwitchingPanels.current = false;
        });

      } else {
        // OPEN Specials (no panel currently open)
        console.log('✅ OPEN Specials - No panel was open');
        setActivePanel('specials');
        Animated.parallel([
          Animated.timing(specialsPanelOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
          Animated.timing(overlayOpacity, { toValue: 1, duration: 150, useNativeDriver: true })
        ]).start(() => {
          console.log('✅ OPEN Specials animation complete');
        });
      }
    }
  };
  
  // Debug: Track activePanel changes
  React.useEffect(() => {
    console.log('📊 activePanel changed to:', activePanel);
  }, [activePanel]);
  
  // Sync animations when activePanel changes externally, but not during switches
  React.useEffect(() => {
    if (activePanel === null && !isSwitchingPanels.current) {
      console.log('🔄 activePanel set to null externally, closing animations');
      Animated.parallel([
        Animated.timing(eventsPanelOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(specialsPanelOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(overlayOpacity, { toValue: 0, duration: 150, useNativeDriver: true })
      ]).start();
    }
  }, [activePanel]);
  
  const toggleEvents = () => {
    setFilterCriteria({ showEvents: !filterCriteria.showEvents });
  };
  
  const toggleSpecials = () => {
    if (eventsClearArmedRef.current) {
      console.log('🧯 Specials pill pressed while Events clear is armed → cancel only');
      cancelEventsClearArmed('tap-elsewhere');
      return;
    }
    setFilterCriteria({ showSpecials: !filterCriteria.showSpecials });
  };

  const getTimeFilterDisplayText = (timeFilter: TimeFilterType): string => {
    switch (timeFilter) {
      case TimeFilterType.NOW: return 'Now';
      case TimeFilterType.TODAY: return 'Today';
      case TimeFilterType.TOMORROW: return 'Tomorrow';
      case TimeFilterType.UPCOMING: return 'Upcoming';
      default: return '';
    }
  };

  const getPillDisplayText = (type: 'events' | 'specials'): string => {
    const timeFilter = type === 'events' 
      ? filterCriteria.eventFilters.timeFilter
      : filterCriteria.specialFilters.timeFilter;
    const timeText = getTimeFilterDisplayText(timeFilter);
    return timeText || (type === 'events' ? 'Events' : 'Specials');
  };

  const HIDE_SENTINEL = '__FILTER_PILLS_HIDE__';

  const isVisibleCategory = (category?: string): category is string =>
    !!category && category !== HIDE_SENTINEL;

  const isSentinelCategory = (category?: string) => category === HIDE_SENTINEL;

  const getCategoryIconName = (category: string): string => {
    const categoryLower = category.toLowerCase();
    if (categoryLower.includes('live music') || categoryLower.includes('music')) return 'audiotrack';
    if (categoryLower.includes('comedy')) return 'sentiment-very-satisfied';
    if (categoryLower.includes('sport')) return 'sports-basketball';
    if (categoryLower.includes('trivia')) return 'psychology-alt';
    if (categoryLower.includes('workshop') || categoryLower.includes('class')) return 'school';
    if (categoryLower.includes('religious') || categoryLower.includes('church')) return 'church';
    if (categoryLower.includes('family')) return 'family-restroom';
    if (categoryLower.includes('gathering') || categoryLower.includes('parties') || categoryLower.includes('party')) return 'nightlife';
    if (categoryLower.includes('cinema') || categoryLower.includes('movie') || categoryLower.includes('film')) return 'theaters';
    if (categoryLower.includes('happy hour')) return 'local-bar';
    if (categoryLower.includes('food') || categoryLower.includes('wing')) return 'restaurant';
    if (categoryLower.includes('drink')) return 'wine-bar';
    return 'category';
   };
  
  // Events pill has "clearable" active filters if:
  // 1. A category is selected (any visible category), OR
  // 2. Time filter is NOT "Today" (i.e., Now, Tomorrow, or Upcoming)
  // This prevents the clear animation from showing on app startup when only "Today" is selected
  const eventsPillHasActiveFilters =
    filterCriteria.showEvents &&
    !isSentinelCategory(filterCriteria.eventFilters.category) &&
    (isVisibleCategory(filterCriteria.eventFilters.category) ||
     filterCriteria.eventFilters.timeFilter !== TimeFilterType.TODAY);

  const specialsPillHasActiveFilters =
    filterCriteria.showSpecials &&
    !isSentinelCategory(filterCriteria.specialFilters.category) &&
    (filterCriteria.specialFilters.timeFilter !== TimeFilterType.TODAY ||
      isVisibleCategory(filterCriteria.specialFilters.category));

  React.useEffect(() => {
    eventsPillHasActiveFiltersRef.current = eventsPillHasActiveFilters;
    specialsPillHasActiveFiltersRef.current = specialsPillHasActiveFilters;
  }, [eventsPillHasActiveFilters, specialsPillHasActiveFilters]);

  const eventsPeekFilterSignature = [
    filterCriteria.showEvents ? '1' : '0',
    filterCriteria.eventFilters.timeFilter,
    isSentinelCategory(filterCriteria.eventFilters.category) ? '' : (filterCriteria.eventFilters.category ?? '')
  ].join('|');
  const specialsPeekFilterSignature = [
    filterCriteria.showSpecials ? '1' : '0',
    filterCriteria.specialFilters.timeFilter,
    isSentinelCategory(filterCriteria.specialFilters.category) ? '' : (filterCriteria.specialFilters.category ?? '')
  ].join('|');
  const { resetPeekSequence: resetEventsCurtainPeekSequence } = useCurtainPeekTiming({
    canTriggerPeek:
      eventsPillHasActiveFilters &&
      !curtainPeekAnimActive.current &&
      !eventsClearArmedRef.current,
    enabled: eventsPillHasActiveFilters,
    filterSignature: eventsPeekFilterSignature,
    firstPeekDelayMaxMs: 5000,
    firstPeekDelayMinMs: 3000,
    hidePeek: hideCurtain,
    logLabel: 'Events curtain',
    onTriggerPeek: triggerCurtainPeekAnimation,
    panelOpen: activePanel === 'events',
    peekState: curtainPeekState,
    repeatPeekDelayMaxMs: 120000,
    repeatPeekDelayMinMs: 60000,
    setPeekState: setCurtainPeekState
  });
  useCurtainPeekTiming({
    canTriggerPeek:
      specialsPillHasActiveFilters &&
      !specialsCurtainPeekAnimActive.current &&
      !specialsClearArmedRef.current,
    enabled: SPECIALS_CURTAIN_TIMING_ENABLED && specialsPillHasActiveFilters,
    filterSignature: specialsPeekFilterSignature,
    firstPeekDelayMaxMs: 5000,
    firstPeekDelayMinMs: 3000,
    hidePeek: hideSpecialsCurtain,
    logLabel: 'Specials curtain',
    onTriggerPeek: triggerSpecialsCurtainPeekAnimation,
    panelOpen: activePanel === 'specials',
    peekState: specialsCurtainPeekState,
    repeatPeekDelayMaxMs: 120000,
    repeatPeekDelayMinMs: 60000,
    setPeekState: setSpecialsCurtainPeekState
  });

  React.useEffect(() => {
    if (eventsClearArmedRef.current && !eventsPillHasActiveFilters) {
      cancelEventsClearArmed('filters-cleared-externally');
    }
    if (specialsClearArmedRef.current && !specialsPillHasActiveFilters) {
      cancelSpecialsClearArmed('filters-cleared-externally');
    }
  }, [eventsPillHasActiveFilters, specialsPillHasActiveFilters]);
  
  const viewRef = useRef<View>(null);
  const {
    pillWidth: curtainPillWidth,
    travelDistance: curtainTravelDistance
  } = getCurtainMetrics();
  const {
    pillWidth: specialsCurtainPillWidth,
    travelDistance: specialsCurtainTravelDistance
  } = getSpecialsCurtainMetrics();
  const curtainContentLockLeft = Math.max(
    CURTAIN_CONTENT_START_X,
    (curtainPillWidth / 2) - CURTAIN_CONTENT_LOCK_HALF_WIDTH
  );
  const curtainContentLockCoverage = Math.min(
    curtainPillWidth - 1,
    Math.max(
      CURTAIN_HANDLE_WIDTH + 1,
      curtainPillWidth + CURTAIN_CONTENT_START_X - curtainContentLockLeft
    )
  );
  const curtainContentLockOffset = Math.max(
    0,
    curtainPillWidth - curtainContentLockCoverage
  );
  const curtainCoverageAnim = Animated.add(
    curtainSlideAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [CURTAIN_HANDLE_WIDTH, curtainPillWidth]
    }),
    curtainDragAnim
  );
  const specialsCurtainContentLockLeft = Math.max(
    CURTAIN_CONTENT_START_X,
    (specialsCurtainPillWidth / 2) - CURTAIN_CONTENT_LOCK_HALF_WIDTH
  );
  const specialsCurtainContentLockCoverage = Math.min(
    specialsCurtainPillWidth - 1,
    Math.max(
      CURTAIN_HANDLE_WIDTH + 1,
      specialsCurtainPillWidth + CURTAIN_CONTENT_START_X - specialsCurtainContentLockLeft
    )
  );
  const specialsCurtainContentLockOffset = Math.max(
    0,
    specialsCurtainPillWidth - specialsCurtainContentLockCoverage
  );
  const specialsCurtainCoverageAnim = Animated.add(
    specialsCurtainSlideAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [CURTAIN_HANDLE_WIDTH, specialsCurtainPillWidth]
    }),
    specialsCurtainDragAnim
  );
  const eventsPillTrailingContentOpacity = curtainSlideAnim.interpolate({
    inputRange: [0, 0.12, 0.28, 1],
    outputRange: [1, 1, 0, 0],
    extrapolate: 'clamp'
  });
  const specialsPillTrailingContentOpacity = specialsCurtainSlideAnim.interpolate({
    inputRange: [0, 0.12, 0.28, 1],
    outputRange: [1, 1, 0, 0],
    extrapolate: 'clamp'
  });

  return (
    <View style={[styles.container, tutorialHighlight && { zIndex: 99999 }]}>
      {(eventsClearArmed || specialsClearArmed) && (
        <TouchableOpacity
          style={styles.eventsClearArmedOverlay}
          activeOpacity={1}
          onPress={() => {
            cancelEventsClearArmed('tap-outside');
            cancelSpecialsClearArmed('tap-outside');
          }}
        />
      )}

      {/* Filter Pills */}
      <Animated.View
        ref={viewRef}
        onLayout={() => {
          if (viewRef.current) {
            viewRef.current.measure((x, y, width, height, pageX, pageY) => {
              (global as any).filterPillsLayout = { x: pageX, y: pageY, width, height };
            });
          }
        }}
        style={[
          styles.pillsContainer,
          { transform: [{ scale: tutorialPulseAnim }] }
        ]}
      >
        {/* Events Pill */}
        <TouchableOpacity
          disabled={curtainPeekState.isActive}
          style={[
            styles.pill,
            styles.eventsPill,
            !filterCriteria.showEvents && styles.inactivePill,
            activePanel === 'events' && styles.activePill,
          ]}
          onLayout={(e) => {
            const { x, y, width, height } = e.nativeEvent.layout;
            if (width && width !== eventsPillWidth) {
              setEventsPillWidth(width);
            }
            // Capture full layout for curtain positioning
            setEventsPillLayout({ x, y, width, height });
          }}
          onPress={() => {
            if (eventsClearArmed) {
              confirmClearEventsFilters();
              return;
            }
            toggleEvents();
          }}
          onLongPress={() => togglePanel('events')}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              styles.eventsClearHoldFill,
              {
                width: eventsClearFillAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, eventsPillWidth || 0],
                }),
              },
            ]}
          />
          {/* Curtain removed from here - now rendered as sibling below */}
          {eventsClearArmed ? (
            <View style={styles.clearConfirmContainer}>
              <Ionicons
                name="calendar"
                size={16}
                color="white"
                style={styles.clearConfirmIcon}
              />
              <Text numberOfLines={1} style={[styles.pillText, styles.clearConfirmText]}>
                Clear
              </Text>
            </View>
          ) : (
            <>
              <Ionicons name="calendar" size={16} color={filterCriteria.showEvents ? "white" : "#F7F7F7"} />
              <View style={styles.stackedLabelContainer}>
                <Text numberOfLines={1} style={[styles.stackedLabelTop, !filterCriteria.showEvents && styles.inactiveText]}>
                  Events
                </Text>
                <View style={[styles.stackedLabelDivider, !filterCriteria.showEvents && styles.inactiveDivider]} />
                <Text numberOfLines={1} style={[styles.stackedLabelBottom, !filterCriteria.showEvents && styles.inactiveText]}>
                  {getTimeFilterDisplayText(filterCriteria.eventFilters.timeFilter) || 'All'}
                </Text>
              </View>
              {isVisibleCategory(filterCriteria.eventFilters.category) && (
                <MaterialIcons
                  name={getCategoryIconName(filterCriteria.eventFilters.category) as any}
                  size={16}
                  color={filterCriteria.showEvents ? "white" : "#ccc"}
                  style={styles.categoryIconInPill}
                />
              )}
              <Animated.View
                style={{
                  opacity: eventsPillTrailingContentOpacity
                }}
              >
                <Text numberOfLines={1} style={[styles.pillText, !filterCriteria.showEvents && styles.inactiveText]}>
                  {filterCriteria.showEvents ? visibleEvents : 0}/{totalEvents}
                </Text>
              </Animated.View>
            </>
          )}
          <Animated.View
            style={{
              opacity: eventsPillTrailingContentOpacity
            }}
          >
            <TouchableOpacity
              style={[
                styles.filterIcon,
                styles.filterIconContainer,
                eventsPillHasActiveFilters && styles.filterIconContainerActive
              ]}
              delayLongPress={150}
              onLongPress={() => {
                if (eventsClearArmedRef.current) {
                  cancelEventsClearArmed('long-press-while-armed');
                  return;
                }
                startEventsHoldToArmClear();
              }}
              onPressOut={() => {
                if (eventsClearHoldInProgressRef.current && !eventsClearArmedRef.current) {
                  cancelEventsClearArmed('released-before-armed', false);
                }
              }}
              onPress={() => {
                if (eventsClearSuppressNextChevronPressRef.current) {
                  console.log('🛑 Suppressing Events chevron press (hold gesture consumed it)');
                  eventsClearSuppressNextChevronPressRef.current = false;
                  return;
                }

                if (eventsClearArmedRef.current) {
                  console.log('🧯 Events chevron pressed while armed → cancel + open panel');
                  cancelEventsClearArmed('open-panel');
                  togglePanel('events');
                  return;
                }

                togglePanel('events');
              }}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            >
              <Ionicons
                name={activePanel === 'events' ? "chevron-up" : "chevron-down"}
                size={14}
                color={
                  !filterCriteria.showEvents
                    ? "#ccc"
                    : (eventsPillHasActiveFilters ? "#FF3B30" : "white")
                }
              />
              {eventsPillHasActiveFilters && (
                <View pointerEvents="none" style={styles.activeFilterDot} />
              )}
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>

        {/* Specials Pill */}
        <TouchableOpacity 
          disabled={specialsCurtainPeekState.isActive}
          style={[
            styles.pill, 
            styles.specialsPill,
            !filterCriteria.showSpecials && styles.inactivePill,
            activePanel === 'specials' && styles.activePill,
          ]}
          onLayout={(e) => {
            const { x, y, width, height } = e.nativeEvent.layout;
            if (width && width !== specialsPillWidth) setSpecialsPillWidth(width);
            setSpecialsPillLayout({ x, y, width, height });
          }}
          onPress={() => {
            if (specialsClearArmed) {
              confirmClearSpecialsFilters();
              return;
            }
            toggleSpecials();
          }}
          onLongPress={() => togglePanel('specials')}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              styles.eventsClearHoldFill, // Reuse style
              {
                width: specialsClearFillAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, specialsPillWidth || 0],
                }),
              },
            ]}
          />
          {specialsClearArmed ? (
            <View style={styles.clearConfirmContainer}>
              <Ionicons name="restaurant" size={16} color="white" style={styles.clearConfirmIcon} />
              <Text numberOfLines={1} style={[styles.pillText, styles.clearConfirmText]}>Clear</Text>
            </View>
          ) : (
            <>
              <Ionicons name="restaurant" size={16} color={filterCriteria.showSpecials ? "white" : "#F7F7F7"} />
              <View style={styles.stackedLabelContainer}>
                <Text numberOfLines={1} style={[styles.stackedLabelTop, !filterCriteria.showSpecials && styles.inactiveText]}>
                  Specials
                </Text>
                <View style={[styles.stackedLabelDivider, !filterCriteria.showSpecials && styles.inactiveDivider]} />
                <Text numberOfLines={1} style={[styles.stackedLabelBottom, !filterCriteria.showSpecials && styles.inactiveText]}>
                  {getTimeFilterDisplayText(filterCriteria.specialFilters.timeFilter) || 'All'}
                </Text>
              </View>
              {isVisibleCategory(filterCriteria.specialFilters.category) && (
                <MaterialIcons
                  name={getCategoryIconName(filterCriteria.specialFilters.category) as any}
                  size={16}
                  color={filterCriteria.showSpecials ? "white" : "#ccc"}
                  style={styles.categoryIconInPill}
                />
              )}
              <Animated.View
                style={{
                  opacity: specialsPillTrailingContentOpacity
                }}
              >
                <Text numberOfLines={1} style={[styles.pillText, !filterCriteria.showSpecials && styles.inactiveText]}>
                  {filterCriteria.showSpecials ? visibleSpecials : 0}/{totalSpecials}
                </Text>
              </Animated.View>
            </>
          )}
          <Animated.View
            style={{
              opacity: specialsPillTrailingContentOpacity
            }}
          >
            <TouchableOpacity 
              style={[
                styles.filterIcon,
                styles.filterIconContainer,
                specialsPillHasActiveFilters && styles.filterIconContainerActive
              ]}
              delayLongPress={150}
              onLongPress={() => {
                if (specialsClearArmedRef.current) {
                  cancelSpecialsClearArmed('long-press-while-armed');
                  return;
                }
                startSpecialsHoldToArmClear();
              }}
              onPressOut={() => {
                if (specialsClearHoldInProgressRef.current && !specialsClearArmedRef.current) {
                  cancelSpecialsClearArmed('released-before-armed', false);
                }
              }}
              onPress={() => {
                if (specialsClearSuppressNextChevronPressRef.current) {
                  specialsClearSuppressNextChevronPressRef.current = false;
                  return;
                }
                if (specialsClearArmedRef.current) {
                  cancelSpecialsClearArmed('open-panel');
                  togglePanel('specials');
                  return;
                }
                togglePanel('specials');
              }}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            >
              <Ionicons 
                name={activePanel === 'specials' ? "chevron-up" : "chevron-down"} 
                size={14} 
                color={!filterCriteria.showSpecials ? "#ccc" : (specialsPillHasActiveFilters ? "#FF3B30" : "white")} 
              />
              {specialsPillHasActiveFilters && (
                <View pointerEvents="none" style={styles.activeFilterDot} />
              )}
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
      </Animated.View>

      {/* Red Curtain Overlay - Rendered as sibling for proper touch handling */}
      {curtainPeekState.isActive && (
        <Animated.View
          {...curtainPanResponder.panHandlers}
          pointerEvents="box-only"
          onTouchStart={() => {
            console.log('🖐️ Touch detected on curtain overlay (sibling)!');
            console.log('   curtainIsInteractive:', curtainIsInteractive);
            console.log('   curtainVisible:', curtainPeekState.isActive);
          }}
          style={[
            {
              position: 'absolute',
              zIndex: 30,
              elevation: 30,
              top: eventsPillLayout.y,
              left: eventsPillLayout.x,
              height: eventsPillLayout.height,
              width: curtainPillWidth,
              borderRadius: 16,
              overflow: 'hidden',
            }
          ]}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              styles.redCurtainOverlay,
              {
                height: eventsPillLayout.height,
                width: curtainPillWidth,
                transform: [
                  {
                    translateX: Animated.add(
                      curtainSlideAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [curtainTravelDistance, 0]
                      }),
                      Animated.multiply(curtainDragAnim, -1)
                    )
                  }
                ]
              }
            ]}
          >
            <Animated.View
              pointerEvents="none"
              style={[
                styles.curtainContentContainer,
                {
                  left: CURTAIN_CONTENT_START_X,
                  transform: [
                    {
                      translateX: curtainCoverageAnim.interpolate({
                        inputRange: [curtainContentLockCoverage, curtainPillWidth],
                        outputRange: [0, curtainContentLockOffset],
                        extrapolate: 'clamp'
                      })
                    }
                  ]
                }
              ]}
            >
              <View style={styles.grabHandle}>
                <View style={styles.grabHandleLine} />
                <View style={styles.grabHandleLine} />
                <View style={styles.grabHandleLine} />
              </View>
              <Text style={styles.curtainClearText}>Clear</Text>
            </Animated.View>
          </Animated.View>
        </Animated.View>
      )}

      {specialsCurtainPeekState.isActive && (
        <Animated.View
          {...specialsCurtainPanResponder.panHandlers}
          pointerEvents="box-only"
          style={[
            {
              position: 'absolute',
              zIndex: 30,
              elevation: 30,
              top: specialsPillLayout.y,
              left: specialsPillLayout.x,
              height: specialsPillLayout.height,
              width: specialsCurtainPillWidth,
              borderRadius: 16,
              overflow: 'hidden',
            }
          ]}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              styles.redCurtainOverlay,
              {
                height: specialsPillLayout.height,
                width: specialsCurtainPillWidth,
                transform: [
                  {
                    translateX: Animated.add(
                      specialsCurtainSlideAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [specialsCurtainTravelDistance, 0]
                      }),
                      Animated.multiply(specialsCurtainDragAnim, -1)
                    )
                  }
                ]
              }
            ]}
          >
            <Animated.View
              pointerEvents="none"
              style={[
                styles.curtainContentContainer,
                {
                  left: CURTAIN_CONTENT_START_X,
                  transform: [
                    {
                      translateX: specialsCurtainCoverageAnim.interpolate({
                        inputRange: [specialsCurtainContentLockCoverage, specialsCurtainPillWidth],
                        outputRange: [0, specialsCurtainContentLockOffset],
                        extrapolate: 'clamp'
                      })
                    }
                  ]
                }
              ]}
            >
              <View style={styles.grabHandle}>
                <View style={styles.grabHandleLine} />
                <View style={styles.grabHandleLine} />
                <View style={styles.grabHandleLine} />
              </View>
              <Text style={styles.curtainClearText}>Clear</Text>
            </Animated.View>
          </Animated.View>
        </Animated.View>
      )}

      {showFilterOverlay && (
      <Animated.View
        pointerEvents="auto"
        style={[styles.filterBackgroundOverlay, { opacity: overlayOpacity }]}
      >
        <TouchableOpacity 
          style={{ flex: 1 }} 
          activeOpacity={1} 
          onPress={() => {
            console.log('🖱️ Background overlay pressed');
            togglePanel(null);
          }} 
        />
      </Animated.View>
      )}

      {showEventsPanel && (
      <Animated.View
        pointerEvents="auto"
        style={[styles.filterPanel, { opacity: eventsPanelOpacity }]}
      >
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(230, 240, 255, 0.92)', 'rgba(200, 220, 250, 0.75)', 'rgba(180, 210, 245, 0.65)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.filterPanelGradient}
        />
        <View style={styles.panelHeader} pointerEvents="box-none">
          <Text style={styles.panelTitle}>Event Filters</Text>
          <TouchableOpacity onPress={() => {
            console.log('❎ Events X button pressed');
            togglePanel(null);
          }}>
            <Ionicons name="close" size={20} color="#333" />
          </TouchableOpacity>
        </View>
        <View style={styles.filterSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>When</Text>
            {filterCriteria.eventFilters.timeFilter !== TimeFilterType.ALL && (
              <TouchableOpacity onPress={() => setTypeFilters('event', { timeFilter: TimeFilterType.ALL })}>
                <Text style={styles.clearText}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>
          <TimeFilterOptions 
            selected={filterCriteria.eventFilters.timeFilter}
            onSelect={(timeFilter) => {
              const newFilter = filterCriteria.eventFilters.timeFilter === timeFilter ? TimeFilterType.ALL : timeFilter;
              setTypeFilters('event', { timeFilter: newFilter });
            }}
            counts={getTimeFilterCounts('event')}
          />
        </View>
        <View style={[styles.filterSection, styles.lastFilterSection]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Category</Text>
            {filterCriteria.eventFilters.category && (
              <TouchableOpacity onPress={() => setTypeFilters('event', { category: undefined })}>
                <Text style={styles.clearText}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>
          <CategoryFilterOptions type="event" counts={getCategoryFilterCounts('event')} />
        </View>
      </Animated.View>
      )}

      {showSpecialsPanel && (
      <Animated.View
        pointerEvents="auto"
        style={[styles.filterPanel, { opacity: specialsPanelOpacity }]}
      >
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(230, 240, 255, 0.92)', 'rgba(200, 220, 250, 0.75)', 'rgba(180, 210, 245, 0.65)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.filterPanelGradient}
        />
        <View style={styles.panelHeader} pointerEvents="box-none">
          <Text style={styles.panelTitle}>Special Filters</Text>
          <TouchableOpacity onPress={() => {
            console.log('❎ Specials X button pressed');
            togglePanel(null);
          }}>
            <Ionicons name="close" size={24} color="#333" />
          </TouchableOpacity>
        </View>
        <View style={styles.filterSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>When</Text>
            {filterCriteria.specialFilters.timeFilter !== TimeFilterType.TODAY && (
              <TouchableOpacity onPress={() => setTypeFilters('special', { timeFilter: TimeFilterType.TODAY })}>
                <Text style={styles.clearText}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>
          <TimeFilterOptions 
            selected={filterCriteria.specialFilters.timeFilter}
            onSelect={(timeFilter) => {
              const newFilter =
                filterCriteria.specialFilters.timeFilter === timeFilter
                  ? TimeFilterType.TODAY
                  : timeFilter;
              setTypeFilters('special', { timeFilter: newFilter });
            }}
            counts={getTimeFilterCounts('special')}
          />
        </View>
        <View style={[styles.filterSection, styles.lastFilterSection]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Category</Text>
            {filterCriteria.specialFilters.category && (
              <TouchableOpacity onPress={() => setTypeFilters('special', { category: undefined })}>
                <Text style={styles.clearText}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>
          <CategoryFilterOptions type="special" counts={getCategoryFilterCounts('special')} />
        </View>
      </Animated.View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    left: 0,
    right: 0,
    zIndex: 5,
  },
  pillsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 10,
    flex: 0,
    minWidth: 110,
    marginHorizontal: 3,
  },
  eventsPill: {
    backgroundColor: '#2196F3',
    marginLeft: 15,
  },
  specialsPill: {
    backgroundColor: '#34A853',
    marginRight: 15,
  },

  inactivePill: {
    backgroundColor: '#999',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    paddingRight: 8,
  },
  clearText: {
    fontSize: 12,
    color: '#FF3B30',
    fontWeight: '500',
  },
  inactiveText: {
    color: '#F7F7F7',
  },
  activePill: {
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 14,
  },
  pillText: {
    color: 'white',
    fontWeight: 'bold',
    marginHorizontal: 4,
    fontSize: 12,
  },
  categoryIconInPill: {
    marginLeft: 3,
    marginRight: 1,
  },
  filterIcon: {
    padding: 3,
    marginLeft: 4,
  },
  filterIconContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 8,
    padding: 2,
  },
  filterIconContainerActive: {
    backgroundColor: 'rgba(255, 59, 48, 0.20)',
  },
  activeFilterDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FF3B30',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.9)',
  },
  eventsClearHoldFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    backgroundColor: 'rgba(176, 0, 32, 0.92)',
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
  clearConfirmContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 8,
  },
  clearConfirmIcon: {
    marginRight: 6,
  },
  clearConfirmText: {
    marginHorizontal: 0,
  },
  eventsClearArmedOverlay: {
    position: 'absolute',
    top: -10,
    left: 0,
    right: 0,
    bottom: 2000,
    backgroundColor: 'rgba(0, 0, 0, 0.001)',
    zIndex: 8,
  },
  filterPanel: {
    position: 'absolute',
    top: 50,
    left: 6,
    right: 6,
    backgroundColor: 'transparent',
    borderRadius: 12,
    paddingTop: 4,
    paddingBottom: 4,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(33, 150, 243, 0.3)',
    shadowColor: '#000',
    shadowOffset: { width: -2, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    maxHeight: 350,
    zIndex: 10,
    overflow: 'hidden',
    ...(Platform.OS === 'ios' && {
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
    }),
  },
  filterPanelGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 12,
  },
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  filterBackgroundOverlay: {
    position: 'absolute',
    top: -10,
    left: 0,
    right: 0,
    bottom: 2000,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    zIndex: 9,
  },
  panelTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  filterSection: {
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  lastFilterSection: {
    marginBottom: 0,
  },
  tutorialHighlight: {
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 12,
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  stackedLabelContainer: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
    paddingLeft: 2,
  },
  stackedLabelTop: {
    color: 'white',
    fontWeight: '600',
    fontSize: 9,
    lineHeight: 10,
  },
  stackedLabelDivider: {
    width: '100%',
    height: 0.5,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    marginVertical: 1,
  },
  inactiveDivider: {
    backgroundColor: 'rgba(247, 247, 247, 0.4)',
  },
  stackedLabelBottom: {
    color: 'white',
    fontWeight: '700',
    fontSize: 10,
    lineHeight: 11,
  },
  redCurtainOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: 'rgba(176, 0, 32, 0.92)', // Same red as hold-to-clear
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
    justifyContent: 'center',
    minWidth: 80, // Ensure it covers counts + chevron area
    // Add left border to indicate separation/draggability
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(255, 255, 255, 0.3)',
  },
  curtainContentContainer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    zIndex: 2,
  },
  grabHandle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  grabHandleLine: {
    width: 2,
    height: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    borderRadius: 1,
  },
  curtainClearText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: 'white',
  },
});

export default FilterPills;
