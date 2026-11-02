import React, {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { BlurTargetView, BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useStageTheme } from '../theme/themeContext';

/**
 * Performance-first glassmorphism system for Android & iOS.
 *
 * Why this architecture:
 * - On Android, every native `expo-blur` `<BlurView>` attaches a pre-draw listener that
 *   re-renders its target view tree on every frame. Mounting BlurViews inside scrolling
 *   cards, multi-band header strips, or over a live MapLibre WebView causes severe frame
 *   drops during scroll and map gestures.
 * - Instead, we keep a SINGLE static `<BlurTargetView>` holding the ambient emerald/teal
 *   background, and allow at most ONE lightweight `<BlurView>` for the floating bottom
 *   navigation dock (`enableBlur`).
 * - Cards, search bars, headers, and map controls use GPU-accelerated translucent fills,
 *   multi-stop diagonal `LinearGradient` sheens, and fine specular top rims — delivering
 *   the exact dark-emerald frosted aesthetic at a constant 60fps.
 */

interface GlassContextValue {
  targetRef: React.RefObject<View | null>;
  ready: boolean;
}

const GlassContext = createContext<GlassContextValue | null>(null);

const ANDROID_BLUR_SUPPORTED =
  Platform.OS !== 'android' ||
  (typeof Platform.Version === 'number' && Platform.Version >= 31);

interface GlassProviderProps {
  style?: StyleProp<ViewStyle>;
  /** Static ambient background rendered inside the single BlurTargetView. */
  background: React.ReactNode;
  children?: React.ReactNode;
}

export const GlassProvider: React.FC<GlassProviderProps> = ({
  style,
  background,
  children,
}) => {
  const targetRef = useRef<View | null>(null);
  const [ready, setReady] = useState(false);
  const ctx = useMemo(() => ({ targetRef, ready }), [ready]);

  return (
    <GlassContext.Provider value={ctx}>
      <View style={style}>
        <BlurTargetView
          ref={targetRef}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          onLayout={() => {
            if (!ready) setReady(true);
          }}
        >
          {background}
        </BlurTargetView>
        {children}
      </View>
    </GlassContext.Provider>
  );
};

/**
 * Emerald & teal ambient background matching the web reference (`--stage-ambient-gradient`).
 * Memoized so it never re-renders when screen state changes.
 */
export const GlassAmbient: React.FC = React.memo(() => {
  const { theme } = useStageTheme();
  const dark = theme.isDark;
  const k = dark ? 1 : 0.7;
  const ring = dark ? 'rgba(110,242,178,0.09)' : 'rgba(14,117,68,0.08)';

  return (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: dark ? '#070D0B' : theme.background },
      ]}
    >
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="ambTopRight" cx="88%" cy="8%" r="68%">
            <Stop offset={0} stopColor="rgb(43,217,133)" stopOpacity={0.34 * k} />
            <Stop offset={0.45} stopColor="rgb(16,185,129)" stopOpacity={0.13 * k} />
            <Stop offset={1} stopColor="rgb(16,185,129)" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="ambMidLeft" cx="10%" cy="42%" r="64%">
            <Stop offset={0} stopColor="rgb(20,184,166)" stopOpacity={0.25 * k} />
            <Stop offset={0.5} stopColor="rgb(43,217,133)" stopOpacity={0.08 * k} />
            <Stop offset={1} stopColor="rgb(43,217,133)" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="ambBottomRight" cx="82%" cy="84%" r="60%">
            <Stop offset={0} stopColor="rgb(43,217,133)" stopOpacity={0.2 * k} />
            <Stop offset={1} stopColor="rgb(43,217,133)" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        {/* Scoped regions instead of 4 full-screen overlapping rects */}
        <Rect x="0" y="0" width="100%" height="58%" fill="url(#ambTopRight)" />
        <Rect x="0" y="14%" width="100%" height="66%" fill="url(#ambMidLeft)" />
        <Rect x="0" y="48%" width="100%" height="52%" fill="url(#ambBottomRight)" />
        <Circle cx="88%" cy="14%" r="145" stroke={ring} strokeWidth="1.5" fill="none" />
        <Circle cx="88%" cy="14%" r="92" stroke={ring} strokeWidth="1.5" fill="none" />
      </Svg>
    </View>
  );
});

export type GlassVariant = 'card' | 'panel' | 'floating' | 'sheet';

interface GlassBackdropProps {
  variant?: GlassVariant;
  /** Stronger emerald tint for selected/active surfaces. */
  active?: boolean;
  /**
   * Opt-in native BlurView. Reserved strictly for the single floating bottom dock
   * so cards, headers, and map controls never incur per-frame BlurView passes.
   */
  enableBlur?: boolean;
}

/**
 * First child of any surface using a `GLASS.*` style.
 * By default (`enableBlur = false`), renders a zero-blur, GPU-composited frosted surface
 * with translucent dark-emerald tint, diagonal sheen gradient, and top specular rim.
 */
export const GlassBackdrop: React.FC<GlassBackdropProps> = React.memo(
  ({ variant = 'card', active = false, enableBlur = false }) => {
    const { theme } = useStageTheme();
    const ctx = useContext(GlassContext);
    const dark = theme.isDark;
    const useNativeBlur =
      enableBlur && Boolean(ctx?.ready) && ANDROID_BLUR_SUPPORTED;

    // Translucent frosted base that lets ambient emerald light show through without needing per-card BlurView
    const baseAlpha: Record<GlassVariant, number> = {
      card: dark ? 0.52 : 0.82,
      panel: dark ? 0.62 : 0.86,
      floating: dark ? 0.78 : 0.9,
      sheet: useNativeBlur ? (dark ? 0.56 : 0.78) : dark ? 0.88 : 0.94,
    };
    const a = baseAlpha[variant];
    const tint = dark
      ? `rgba(14, 28, 22, ${a})`
      : `rgba(255, 255, 255, ${a})`;

    const sheen: {
      colors: [string, string, string];
      locations: [number, number, number];
      vertical: boolean;
    } = active
      ? dark
        ? {
            colors: [
              'rgba(43,217,133,0.24)',
              'rgba(255,255,255,0.09)',
              'rgba(10,22,17,0.52)',
            ],
            locations: [0, 0.42, 1],
            vertical: false,
          }
        : {
            colors: [
              'rgba(30,215,119,0.20)',
              'rgba(255,255,255,0.55)',
              'rgba(255,255,255,0.35)',
            ],
            locations: [0, 0.42, 1],
            vertical: false,
          }
      : variant === 'floating' || variant === 'sheet'
        ? dark
          ? {
              colors: [
                'rgba(32,56,46,0.50)',
                'rgba(18,33,27,0.36)',
                'rgba(10,19,15,0.58)',
              ],
              locations: [0, 0.5, 1],
              vertical: true,
            }
          : {
              colors: [
                'rgba(255,255,255,0.85)',
                'rgba(246,251,248,0.65)',
                'rgba(238,246,241,0.55)',
              ],
              locations: [0, 0.5, 1],
              vertical: true,
            }
        : dark
          ? {
              colors: [
                variant === 'panel'
                  ? 'rgba(255,255,255,0.14)'
                  : 'rgba(43,217,133,0.13)',
                'rgba(255,255,255,0.07)',
                'rgba(10,21,16,0.46)',
              ],
              locations: [0, 0.42, 1],
              vertical: false,
            }
          : {
              colors: [
                'rgba(255,255,255,0.84)',
                'rgba(236,250,242,0.45)',
                'rgba(255,255,255,0.4)',
              ],
              locations: [0, 0.4, 1],
              vertical: false,
            };

    return (
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {useNativeBlur && ctx ? (
          <BlurView
            blurTarget={ctx.targetRef}
            blurMethod="dimezisBlurViewSdk31Plus"
            intensity={45}
            blurReductionFactor={6}
            tint={dark ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: tint }]} />
        <LinearGradient
          colors={sheen.colors}
          locations={sheen.locations}
          start={{ x: 0, y: 0 }}
          end={sheen.vertical ? { x: 0, y: 1 } : { x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {/* Fine reflective top rim, fading out toward the corners */}
        <LinearGradient
          colors={[
            'rgba(255,255,255,0)',
            active ? theme.accentElectric : theme.glassHighlight,
            'rgba(255,255,255,0)',
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1.25 }}
        />
      </View>
    );
  }
);

/**
 * Used inside a React Native `<Modal>` so child surfaces never attempt to sample
 * a BlurTargetView outside the modal window.
 */
export const GlassNoBlur: React.FC<{ children?: React.ReactNode }> = ({
  children,
}) => <GlassContext.Provider value={null}>{children}</GlassContext.Provider>;

/**
 * Lightweight header-to-content fade transition using a single GPU LinearGradient
 * (replaces the old 3-BlurView stack so scrolling under the header costs zero blur passes).
 */
export const GlassFadeStrip: React.FC<{ height?: number }> = React.memo(
  ({ height = 24 }) => {
    const { theme } = useStageTheme();
    const colors: [string, string, string] = theme.isDark
      ? ['rgba(7, 13, 11, 0.78)', 'rgba(7, 13, 11, 0.34)', 'rgba(7, 13, 11, 0)']
      : [
          'rgba(243, 246, 244, 0.82)',
          'rgba(243, 246, 244, 0.38)',
          'rgba(243, 246, 244, 0)',
        ];
    return (
      <LinearGradient
        pointerEvents="none"
        colors={colors}
        locations={[0, 0.52, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={{ height, width: '100%' }}
      />
    );
  }
);

/** Subtle emerald (left) / teal (right) edge lighting; memoized and pointer-events-none. */
export const GlassEdgeLight: React.FC = React.memo(() => {
  const { theme } = useStageTheme();
  const k = theme.isDark ? 1 : 0.55;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={[
          `rgba(43,217,133,${0.12 * k})`,
          `rgba(43,217,133,${0.03 * k})`,
          'rgba(43,217,133,0)',
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 28 }}
      />
      <LinearGradient
        colors={[
          `rgba(20,184,166,${0.12 * k})`,
          `rgba(20,184,166,${0.03 * k})`,
          'rgba(20,184,166,0)',
        ]}
        start={{ x: 1, y: 0 }}
        end={{ x: 0, y: 0 }}
        style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: 28 }}
      />
    </View>
  );
});
