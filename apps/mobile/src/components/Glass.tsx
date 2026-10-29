import React, {
  createContext,
  useContext,
  useRef,
  useState,
} from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { BlurTargetView, BlurView } from 'expo-blur';
import { useStageTheme } from '../theme/themeContext';

/**
 * Real frosted glass for the native app.
 *
 * Plain translucent `backgroundColor` never blurs anything. On Android, expo-blur's
 * `BlurView` only blurs the contents of a sibling `BlurTargetView` (Android 12 / SDK 31+),
 * so the architecture is:
 *
 *   <GlassProvider background={<GlassAmbient />}>     // BlurTargetView = ambient backdrop
 *     ...screens... <GlassBackdrop />                  // BlurView inside every glass surface
 *   </GlassProvider>
 *
 * The BlurView must NOT be a descendant of its BlurTargetView, which is why only the
 * ambient background (and, on the map screen, the map) lives inside the target.
 * On Android < 12 or before the target is laid out we fall back to a denser tint so
 * text stays readable.
 */

interface GlassContextValue {
  targetRef: React.RefObject<View | null>;
  ready: boolean;
}

const GlassContext = createContext<GlassContextValue | null>(null);

const ANDROID_BLUR_SUPPORTED =
  Platform.OS !== 'android' || (typeof Platform.Version === 'number' && Platform.Version >= 31);

interface GlassProviderProps {
  style?: StyleProp<ViewStyle>;
  /** Content rendered inside the BlurTargetView (what the glass blurs). */
  background: React.ReactNode;
  children?: React.ReactNode;
}

interface GlassScopeContextValue extends GlassContextValue {
  setReady: (ready: boolean) => void;
}

const GlassScopeContext = createContext<GlassScopeContextValue | null>(null);

/** Owns a blur target. Glass surfaces rendered below it blur whatever its `GlassTarget` holds. */
export const GlassScope: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const targetRef = useRef<View | null>(null);
  const [ready, setReady] = useState(false);
  const scoped = React.useMemo(
    () => ({ targetRef, ready, setReady }),
    [ready]
  );
  return (
    <GlassScopeContext.Provider value={scoped}>
      <GlassContext.Provider value={scoped}>{children}</GlassContext.Provider>
    </GlassScopeContext.Provider>
  );
};

/** The content that glass surfaces blur. Must NOT contain any GlassBackdrop itself. */
export const GlassTarget: React.FC<{
  style?: StyleProp<ViewStyle>;
  pointerEvents?: 'none' | 'auto' | 'box-none' | 'box-only';
  children?: React.ReactNode;
}> = ({ style, pointerEvents, children }) => {
  const scope = useContext(GlassScopeContext);
  if (!scope) return <View style={style}>{children}</View>;
  return (
    <BlurTargetView
      ref={scope.targetRef}
      style={style}
      pointerEvents={pointerEvents}
      onLayout={() => scope.setReady(true)}
    >
      {children}
    </BlurTargetView>
  );
};

export const GlassProvider: React.FC<GlassProviderProps> = ({
  style,
  background,
  children,
}) => (
  <GlassScope>
    <View style={style}>
      <GlassTarget style={StyleSheet.absoluteFill} pointerEvents="none">
        {background}
      </GlassTarget>
      {children}
    </View>
  </GlassScope>
);

/** Emerald/teal ambient light that the glass visibly blurs. Soft falloff via stacked discs. */
export const GlassAmbient: React.FC = () => {
  const { theme } = useStageTheme();
  const dark = theme.isDark;
  const emerald = dark ? '43, 217, 133' : '30, 215, 119';
  const teal = dark ? '20, 184, 166' : '14, 150, 120';
  const disc = (
    key: string,
    cx: number,
    cy: number,
    size: number,
    rgb: string,
    alpha: number
  ) => (
    <View
      key={key}
      style={{
        position: 'absolute',
        left: cx - size / 2,
        top: cy - size / 2,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: `rgba(${rgb}, ${alpha})`,
      }}
    />
  );
  const a = dark ? 1 : 0.7;
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.background }]}>
      {[420, 320, 220, 130].map((s, i) =>
        disc(`e${i}`, 330, 70, s, emerald, 0.07 * a)
      )}
      {[460, 340, 220].map((s, i) => disc(`t${i}`, 30, 380, s, teal, 0.065 * a))}
      {[380, 260, 150].map((s, i) => disc(`b${i}`, 300, 700, s, emerald, 0.06 * a))}
    </View>
  );
};

export type GlassVariant = 'card' | 'panel' | 'floating' | 'sheet';

interface GlassBackdropProps {
  variant?: GlassVariant;
  /** Stronger emerald tint for selected/active surfaces. */
  active?: boolean;
}

const INTENSITY: Record<GlassVariant, number> = {
  card: 55,
  panel: 65,
  floating: 70,
  sheet: 80,
};

/**
 * Drop this as the FIRST child of any surface that uses a GLASS.* style.
 * The parent must clip (GLASS styles set overflow: 'hidden') so the blur takes its radius.
 */
export const GlassBackdrop: React.FC<GlassBackdropProps> = ({
  variant = 'card',
  active = false,
}) => {
  const { theme } = useStageTheme();
  const ctx = useContext(GlassContext);
  const dark = theme.isDark;
  const blurred = Boolean(ctx?.ready) && ANDROID_BLUR_SUPPORTED;

  // Tint sits ON TOP of the blur: light enough to keep the frosted backdrop visible.
  const base = dark ? '14, 24, 20' : '255, 255, 255';
  const strength: Record<GlassVariant, [number, number]> = {
    //            blurred, fallback
    card: [0.38, 0.78],
    panel: [0.46, 0.82],
    floating: [0.5, 0.86],
    sheet: [0.58, 0.9],
  };
  const alpha = strength[variant][blurred ? 0 : 1] + (dark ? 0 : 0.1);
  const tint = `rgba(${base}, ${Math.min(alpha, 0.96)})`;
  const emerald = dark ? 'rgba(43, 217, 133, 0.14)' : 'rgba(14, 117, 68, 0.12)';

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {blurred && ctx ? (
        <BlurView
          blurTarget={ctx.targetRef}
          blurMethod="dimezisBlurViewSdk31Plus"
          intensity={INTENSITY[variant]}
          tint={dark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: tint }]} />
      {active ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: emerald }]} />
      ) : null}
      {/* Fine reflective top rim */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 14,
          right: 14,
          height: StyleSheet.hairlineWidth * 2,
          backgroundColor: theme.glassHighlight,
        }}
      />
    </View>
  );
};

/**
 * Use inside a React Native <Modal>: it is a separate native window, so it cannot sample a
 * BlurTargetView that lives outside it. Surfaces fall back to the denser frosted tint.
 */
export const GlassNoBlur: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <GlassContext.Provider value={null}>{children}</GlassContext.Provider>
);
