/**
 * STAGE — Shared Visual Identity & Design Token System
 * Built for high-contrast outdoor legibility on Nairobi streets across Web and Android.
 */

export const STAGE_COLORS = {
  // Architectural Neutral Light Surfaces (Low-glare limestone & concrete)
  canvas: '#F5F4F0',
  surfacePrimary: '#FFFFFF',
  surfaceSecondary: '#EAE8E1',
  surfaceRecessed: '#E0DDD4',
  borderSubtle: '#D6D3C9',
  borderStrong: '#111513',

  // Deep Tarmac & Ink Typography
  inkPrimary: '#111513',
  inkSecondary: '#474D49',
  inkMuted: '#6E7570',
  inkOnDark: '#F7F8F6',
  inkMutedOnDark: '#9CA69F',

  // Dark / Night & Signage Surfaces (Inspired by Nairobi bus destination boards)
  nightCanvas: '#0C100E',
  nightSurface: '#141A17',
  nightSurfaceElevated: '#1C2420',
  nightBorder: '#28332D',

  // Distinctive STAGE Signal Green Accent
  signalGreen: '#00B84C',
  signalGreenHover: '#009E40',
  signalGreenBright: '#16E065',
  signalGreenTint: '#E5F7EC',
  signalGreenDarkTint: '#0D2B19',

  // Honest Status & Wayfinding Accents
  demoAmber: '#D97706',
  demoAmberBg: '#FEF3C7',
  demoAmberBorder: '#F59E0B',
  routeBlue: '#1D4ED8',
  routeBlueBg: '#DBEAFE',
  dangerRed: '#DC2626',
} as const;

export const STAGE_TYPOGRAPHY = {
  fontFamilyWeb: {
    sans: "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    mono: "'JetBrains Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
  },
  fontFamilyNative: {
    sans: 'System',
    mono: 'monospace',
  },
  scale: {
    heroDisplay: { size: 36, lineHeight: 42, letterSpacing: -1.1, weight: '800' as const },
    titleLarge: { size: 26, lineHeight: 32, letterSpacing: -0.6, weight: '700' as const },
    titleMedium: { size: 20, lineHeight: 26, letterSpacing: -0.4, weight: '700' as const },
    titleSmall: { size: 16, lineHeight: 22, letterSpacing: -0.2, weight: '600' as const },
    bodyLarge: { size: 16, lineHeight: 24, letterSpacing: 0, weight: '400' as const },
    bodyMedium: { size: 14, lineHeight: 21, letterSpacing: 0, weight: '400' as const },
    caption: { size: 12, lineHeight: 17, letterSpacing: 0.1, weight: '500' as const },
    telemetryMono: { size: 13, lineHeight: 18, letterSpacing: 0.4, weight: '600' as const },
  },
} as const;

export const STAGE_SPACING = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  section: 64,
} as const;

export const STAGE_RADIUS = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  pill: 999,
} as const;

export const STAGE_MOTION = {
  fastMs: 150,
  normalMs: 240,
  slowMs: 380,
  easingStandard: 'cubic-bezier(0.22, 1, 0.36, 1)',
} as const;

export type StageViewMode =
  | 'overview'
  | 'search'
  | 'results'
  | 'stage-details'
  | 'walking-nav'
  | 'saved';


