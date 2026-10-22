import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Pressable,
  PressableProps,
  StyleProp,
  View,
  ViewStyle,
} from 'react-native';
import { useStageTheme } from '../theme/themeContext';
import { MOTION } from '../theme/tokens';

/** Fade + short rise on mount; staggered via `index`. Honors reduced motion. */
export const FadeIn: React.FC<{
  index?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}> = ({ index = 0, style, children }) => {
  const { reduceMotion } = useStageTheme();
  const v = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  useEffect(() => {
    if (reduceMotion) return;
    Animated.timing(v, {
      toValue: 1,
      duration: MOTION.normal,
      delay: Math.min(index, 8) * MOTION.stagger,
      easing: MOTION.easing,
      useNativeDriver: true,
    }).start();
  }, [index, reduceMotion, v]);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: v,
          transform: [
            { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
};

/** Pressable with a quick scale-down press feedback. */
export const PressableScale: React.FC<
  PressableProps & { style?: StyleProp<ViewStyle>; scaleTo?: number }
> = ({ style, scaleTo = 0.975, onPressIn, onPressOut, children, ...rest }) => {
  const { reduceMotion } = useStageTheme();
  const s = useRef(new Animated.Value(1)).current;
  const to = (val: number) =>
    !reduceMotion &&
    Animated.timing(s, {
      toValue: val,
      duration: 90,
      useNativeDriver: true,
    }).start();
  return (
    <Pressable
      {...rest}
      onPressIn={(e) => {
        to(scaleTo);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        to(1);
        onPressOut?.(e);
      }}
    >
      {(state) => (
        <Animated.View style={[style, { transform: [{ scale: s }] }]}>
          {typeof children === 'function' ? children(state) : children}
        </Animated.View>
      )}
    </Pressable>
  );
};

export const Divider: React.FC<{ color: string }> = ({ color }) => (
  <View style={{ height: 1, backgroundColor: color }} />
);

/** Pulsing skeleton block for loading states. */
export const Skeleton: React.FC<{ height: number; radius?: number }> = ({
  height,
  radius = 14,
}) => {
  const { theme, reduceMotion } = useStageTheme();
  const v = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, v]);
  return (
    <Animated.View
      style={{
        height,
        borderRadius: radius,
        backgroundColor: theme.surfaceSecondary,
        opacity: v,
      }}
    />
  );
};

