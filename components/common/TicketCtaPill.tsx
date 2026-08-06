import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  GestureResponderEvent,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { useReduceMotion } from '../../hooks/useReduceMotion';
import { getBuyTicketsLabel } from '../../utils/ticketCta';

interface TicketCtaPillProps {
  onPress: (event: GestureResponderEvent) => void;
  price?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const TicketCtaPill: React.FC<TicketCtaPillProps> = ({
  onPress,
  price,
  disabled = false,
  style,
  testID,
}) => {
  const shimmerProgress = useRef(new Animated.Value(0)).current;
  const isReduceMotionEnabled = useReduceMotion();
  const label = useMemo(() => getBuyTicketsLabel(price), [price]);

  useEffect(() => {
    shimmerProgress.stopAnimation();
    shimmerProgress.setValue(0);

    if (disabled || isReduceMotionEnabled) {
      return;
    }

    const shimmerAnimation = Animated.loop(
      Animated.sequence([
        Animated.delay(900),
        Animated.timing(shimmerProgress, {
          toValue: 1,
          duration: 900,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(shimmerProgress, {
          toValue: 0,
          duration: 1,
          useNativeDriver: true,
        }),
        Animated.delay(3600),
      ])
    );

    shimmerAnimation.start();

    return () => {
      shimmerAnimation.stop();
      shimmerProgress.stopAnimation();
      shimmerProgress.setValue(0);
    };
  }, [disabled, isReduceMotionEnabled, shimmerProgress]);

  const shimmerTranslateX = shimmerProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-64, 240],
  });

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      activeOpacity={disabled ? 1 : 0.78}
      disabled={disabled}
      onPress={onPress}
      style={[styles.pill, disabled && styles.disabledPill, style]}
      testID={testID}
    >
      {!isReduceMotionEnabled && !disabled && (
        <View pointerEvents="none" style={styles.shimmerClip}>
          <Animated.View
            style={[
              styles.shimmer,
              { transform: [{ translateX: shimmerTranslateX }] },
            ]}
          >
            <LinearGradient
              colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.62)', 'rgba(255,255,255,0)']}
              end={{ x: 1, y: 0.5 }}
              start={{ x: 0, y: 0.5 }}
              style={styles.shimmerGradient}
            />
          </Animated.View>
        </View>
      )}

      <MaterialIcons
        color={disabled ? '#777064' : '#3B2A00'}
        name="confirmation-number"
        size={14}
        style={styles.icon}
      />
      <Text style={[styles.label, disabled && styles.disabledLabel]}>{label}</Text>
      {disabled && <MaterialIcons color="#777064" name="lock" size={12} />}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  pill: {
    position: 'relative',
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#E9B949',
    borderWidth: 1,
    borderColor: '#FFE29A',
  },
  disabledPill: {
    backgroundColor: '#C8B98F',
    borderColor: '#D8CBA9',
    opacity: 0.72,
  },
  shimmerClip: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  shimmer: {
    position: 'absolute',
    top: -8,
    bottom: -8,
    left: 0,
    width: 48,
  },
  shimmerGradient: {
    flex: 1,
  },
  icon: {
    marginRight: 5,
  },
  label: {
    color: '#3B2A00',
    fontSize: 12,
    fontWeight: '700',
  },
  disabledLabel: {
    color: '#777064',
    marginRight: 4,
  },
});

export default TicketCtaPill;
