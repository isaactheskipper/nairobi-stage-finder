import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  GestureResponderEvent,
  Pressable,
  PressableProps,
  StyleProp,
  View,
  ViewStyle,
} from 'react-native';
import { useStageTheme } from '../theme/themeContext';
import { MOTION } from '../theme/tokens';

/** Fade + short rise on mount; staggered via `index`. Honors reduced motion and runs once on mount. */
export const FadeIn: React.FC<{
  index?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}> = ({ index = 0, style, children }) => {
  const { reduceMotion } = useStageTheme();
  const v = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const didRunRef = useRef(false);

  useEffect(() => {
    if (reduceMotion || didRunRef.current) {
      v.setValue(1);
      return;
    }
    didRunRef.current = true;
    const anim = Animated.timing(v, {
      toValue: 1,
      duration: MOTION.normal,
      delay: Math.min(index, 5) * 30,
      easing: MOTION.easing,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [index, reduceMotion, v]);

  const animStyle = useMemo(
    () => ({
      opacity: v,
      transform: [
        {
          translateY: v.interpolate({
            inputRange: [0, 1],
            outputRange: [8, 0],
          }),
        },
      ],
    }),
    [v]
  );

  return <Animated.View style={[style, animStyle]}>{children}</Animated.View>;
};

/**
 * Pressable with a quick scale-down press feedback on the UI thread.
 * Avoids render-prop closures when `children` is a ReactNode so pressing never re-renders the card tree.
 */
export const PressableScale: React.FC<
  PressableProps & { style?: StyleProp<ViewStyle>; scaleTo?: number }
> = ({ style, scaleTo = 0.975, onPressIn, onPressOut, children, ...rest }) => {
  const { reduceMotion } = useStageTheme();
  const s = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(
    (e: GestureResponderEvent) => {
      if (!reduceMotion) {
        Animated.timing(s, {
          toValue: scaleTo,
          duration: 85,
          useNativeDriver: true,
        }).start();
      }
      onPressIn?.(e);
    },
    [onPressIn, reduceMotion, s, scaleTo]
  );

  const handlePressOut = useCallback(
    (e: GestureResponderEvent) => {
      if (!reduceMotion) {
        Animated.timing(s, {
          toValue: 1,
          duration: 95,
          useNativeDriver: true,
        }).start();
      }
      onPressOut?.(e);
    },
    [onPressOut, reduceMotion, s]
  );

  const scaleStyle = useMemo(() => ({ transform: [{ scale: s }] }), [s]);

  return (
    <Pressable {...rest} onPressIn={handlePressIn} onPressOut={handlePressOut}>
      {typeof children === 'function' ? (
        (state) => (
          <Animated.View style={[style, scaleStyle]}>
            {children(state)}
          </Animated.View>
        )
      ) : (
        <Animated.View style={[style, scaleStyle]}>{children}</Animated.View>
      )}
    </Pressable>
  );
};

export const Divider: React.FC<{ color: string }> = React.memo(({ color }) => (
  <View style={{ height: 1, backgroundColor: color }} />
));

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
