import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useStageTheme } from '../theme/themeContext';
import { FONTS } from '../theme/tokens';
import { BrandMark } from './BrandLogo';

interface Props {
  onEnterApp: () => void;
}

const SKYLINE = [38, 70, 52, 96, 60, 120, 74, 50, 88, 44, 66];

// Guard so animation only plays on first startup and does not restart if user returns
let hasPlayedSplashAnimation = false;

/** Splash screen: features the existing wireframe matatu travelling left to right. */
export const MobileLandingScreen: React.FC<Props> = ({ onEnterApp }) => {
  const { theme, reduceMotion } = useStageTheme();
  const { width } = useWindowDimensions();

  const progress = useRef(
    new Animated.Value(reduceMotion || hasPlayedSplashAnimation ? 1 : 0)
  ).current;
  const fade = useRef(
    new Animated.Value(reduceMotion || hasPlayedSplashAnimation ? 1 : 0)
  ).current;
  const matatuAnim = useRef(
    new Animated.Value(reduceMotion || hasPlayedSplashAnimation ? 1 : 0)
  ).current;

  useEffect(() => {
    if (reduceMotion || hasPlayedSplashAnimation) {
      hasPlayedSplashAnimation = true;
      return;
    }

    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(matatuAnim, {
        toValue: 1,
        duration: 2500,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        useNativeDriver: true,
      }),
      Animated.timing(progress, {
        toValue: 1,
        duration: 2500,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    ]).start(({ finished }) => {
      hasPlayedSplashAnimation = true;
      if (finished) onEnterApp();
    });
  }, [reduceMotion, fade, matatuAnim, progress, onEnterApp]);

  const dark = theme.isDark;
  const line = dark ? theme.accentElectric : theme.accentPrimary;
  const skyColor = dark ? '#0B1B16' : '#DDEFE6';
  const buildingColor = dark ? '#10241D' : '#B9D3C6';

  // Matatu travels smoothly across the road from left to right
  const travelRange = Math.max(140, width * 0.45);
  const matatuTranslateX = matatuAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-travelRange, travelRange * 0.45],
  });

  // Wheel rotation in sync with forward travel
  const wheelRotation = matatuAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '1080deg'],
  });

  const handlePressEnter = () => {
    hasPlayedSplashAnimation = true;
    onEnterApp();
  };

  return (
    <Pressable
      onPress={handlePressEnter}
      style={[styles.root, { backgroundColor: dark ? theme.background : '#EAF4EE' }]}
      accessibilityRole="button"
      accessibilityLabel="Enter STAGE"
    >
      <View style={[styles.sky, { backgroundColor: skyColor }]} />
      <Animated.View style={[styles.center, { opacity: fade }]}>
        <BrandMark size={84} />
        <Text style={[styles.word, { color: theme.textPrimary }]}>STAGE</Text>
        <Text style={[styles.sub, { color: theme.accentPrimary }]}>
          Nairobi Stage Finder
        </Text>
        <Text style={[styles.tag, { color: theme.textSecondary }]}>
          Find your matatu.{'\n'}Reach your destination.
        </Text>
      </Animated.View>

      <View style={styles.art}>
        <View style={styles.skyline}>
          {SKYLINE.map((h, i) => (
            <View
              key={i}
              style={{
                width: 22,
                height: h,
                backgroundColor: buildingColor,
                borderTopLeftRadius: 3,
                borderTopRightRadius: 3,
              }}
            />
          ))}
        </View>

        {/* Existing Wireframe matatu drawing travelling smoothly along the road */}
        <Animated.View
          style={[
            styles.matatuUnit,
            {
              transform: [{ translateX: matatuTranslateX }],
            },
          ]}
        >
          <View style={[styles.bus, { borderColor: line }]}>
            <View style={styles.windows}>
              {[0, 1, 2, 3].map((i) => (
                <View key={i} style={[styles.win, { borderColor: line }]} />
              ))}
            </View>
            <View style={[styles.stripe, { backgroundColor: line }]} />
          </View>
          <View style={styles.wheels}>
            <Animated.View
              style={[
                styles.wheel,
                {
                  borderColor: line,
                  transform: [{ rotate: wheelRotation }],
                },
              ]}
            >
              <View style={[styles.wheelSpokeVertical, { backgroundColor: line }]} />
              <View style={[styles.wheelSpokeHorizontal, { backgroundColor: line }]} />
            </Animated.View>

            <Animated.View
              style={[
                styles.wheel,
                {
                  borderColor: line,
                  transform: [{ rotate: wheelRotation }],
                },
              ]}
            >
              <View style={[styles.wheelSpokeVertical, { backgroundColor: line }]} />
              <View style={[styles.wheelSpokeHorizontal, { backgroundColor: line }]} />
            </Animated.View>
          </View>
        </Animated.View>

        <View style={[styles.road, { backgroundColor: dark ? '#0F1A16' : '#9DB5A8' }]} />
      </View>

      <Text style={[styles.footer, { color: theme.textSecondary }]}>
        Nairobi  •  Matatus  •  Your Way
      </Text>
      <View style={[styles.track, { backgroundColor: theme.borderStrong }]}>
        <Animated.View
          style={[
            styles.fill,
            {
              backgroundColor: theme.accentElectric,
              width: progress.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        />
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', paddingTop: 90, paddingBottom: 36 },
  sky: { ...StyleSheet.absoluteFill, opacity: 0.55 },
  center: { alignItems: 'center', gap: 8 },
  word: {
    fontFamily: FONTS.extraBold,
    fontSize: 44,
    fontWeight: '800',
    letterSpacing: 2,
    marginTop: 6,
  },
  sub: { fontFamily: FONTS.bold, fontSize: 16, fontWeight: '700' },
  tag: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
    marginTop: 10,
  },
  art: {
    flex: 1,
    width: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
    overflow: 'hidden',
  },
  skyline: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginBottom: 0 },
  matatuUnit: {
    alignItems: 'center',
    zIndex: 2,
  },
  bus: {
    width: 230,
    height: 78,
    borderWidth: 2,
    borderRadius: 14,
    padding: 8,
    marginTop: -6,
  },
  windows: { flexDirection: 'row', gap: 6 },
  win: { flex: 1, height: 28, borderWidth: 1.5, borderRadius: 5 },
  stripe: { height: 3, borderRadius: 2, marginTop: 14, width: '70%' },
  wheels: {
    flexDirection: 'row',
    gap: 100,
    marginTop: -12,
  },
  wheel: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2.5,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelSpokeVertical: {
    position: 'absolute',
    width: 1.5,
    height: 18,
    borderRadius: 1,
  },
  wheelSpokeHorizontal: {
    position: 'absolute',
    width: 18,
    height: 1.5,
    borderRadius: 1,
  },
  road: { width: '100%', height: 26, marginTop: -8 },
  footer: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    letterSpacing: 0.8,
    marginTop: 18,
  },
  track: {
    width: 70,
    height: 4,
    borderRadius: 2,
    marginTop: 14,
    overflow: 'hidden',
  },
  fill: { height: 4, borderRadius: 2 },
});
