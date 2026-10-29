import { Easing, Platform, ViewStyle } from 'react-native';
import type { StageThemeColors } from './themeContext';

/** Shared layout/typography/motion tokens for the mobile app. */
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;
export const RADIUS = { sm: 10, md: 14, lg: 18, xl: 24, pill: 999 } as const;

export const FONTS = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semiBold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extraBold: 'Inter_800ExtraBold',
} as const;

export const TYPE = {
  display: {
    fontFamily: FONTS.extraBold,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800' as const,
    letterSpacing: -0.8,
  },
  title: {
    fontFamily: FONTS.extraBold,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800' as const,
    letterSpacing: -0.4,
  },
  section: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700' as const,
    letterSpacing: 0.6,
  },
  routeName: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '700' as const,
    letterSpacing: -0.2,
  },
  body: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400' as const,
  },
  detail: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500' as const,
  },
  meta: {
    fontFamily: FONTS.semiBold,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600' as const,
  },
} as const;

export const MOTION = {
  fast: 140,
  normal: 240,
  slow: 360,
  easing: Easing.out(Easing.cubic),
  stagger: 45,
} as const;

export const SHADOW = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 3,
  },
  floating: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 6,
  },
  sheet: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.24,
    shadowRadius: 18,
    elevation: 12,
  },
  glow: {
    shadowColor: '#2BD985',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 4,
  },
} as const;

/**
 * Reusable React Native glassmorphism surface helpers.
 * Uses translucent fills, thin semi-transparent borders, top specular rim highlights,
 * and restrained shadows/glows without heavy per-row native blur passes on scrolling lists.
 */
/**
 * The fill and blur are painted by <GlassBackdrop /> (components/Glass.tsx), which must be the
 * first child of every surface using these styles. These styles supply only the border rim,
 * clipping (so the blur takes the corner radius) and a restrained shadow.
 *
 * Android: `elevation` is omitted on purpose. Elevation shadows are drawn from the view's
 * outline and show through translucent fills as a dark smudge, which kills the glass look.
 */
const glassShadow = (shadow: ViewStyle): ViewStyle => {
  if (Platform.OS === 'android') return {};
  return shadow;
};

export const GLASS = {
  card: (theme: StageThemeColors, selected = false): ViewStyle => ({
    backgroundColor: 'transparent',
    overflow: 'hidden',
    borderColor: selected ? theme.accentElectric : theme.borderStrong,
    borderTopColor: selected ? theme.accentElectric : theme.glassHighlight,
    borderWidth: selected ? 1.5 : 1,
    ...glassShadow(selected ? SHADOW.glow : SHADOW.card),
  }),
  panel: (theme: StageThemeColors, active = false): ViewStyle => ({
    backgroundColor: 'transparent',
    overflow: 'hidden',
    borderColor: active ? theme.accentElectric : theme.borderStrong,
    borderTopColor: active ? theme.accentElectric : theme.glassHighlight,
    borderWidth: active ? 1.5 : 1,
    ...glassShadow(active ? SHADOW.glow : SHADOW.card),
  }),
  floating: (theme: StageThemeColors): ViewStyle => ({
    backgroundColor: 'transparent',
    overflow: 'hidden',
    borderColor: theme.borderStrong,
    borderTopColor: theme.glassHighlight,
    borderWidth: 1,
    ...glassShadow(SHADOW.floating),
  }),
  sheet: (theme: StageThemeColors): ViewStyle => ({
    backgroundColor: 'transparent',
    overflow: 'hidden',
    borderColor: theme.borderStrong,
    borderTopColor: theme.glassHighlight,
    borderWidth: 1,
    ...glassShadow(SHADOW.sheet),
  }),
} as const;
