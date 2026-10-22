import { Easing } from 'react-native';

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
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 2,
  },
  sheet: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 12,
  },
} as const;
