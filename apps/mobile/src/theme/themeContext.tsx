import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AccessibilityInfo, Appearance, useColorScheme } from 'react-native';

export type ThemeMode = 'dark' | 'light';

export interface StageThemeColors {
  mode: ThemeMode;
  isDark: boolean;
  // Core surfaces (matching reference colour palette)
  background: string;
  surfaceElevated: string;
  surfaceSecondary: string;
  surfaceRecessed: string;
  surfaceGlass: string;
  surfaceGlassStrong: string;
  glassHighlight: string;
  accentGlow: string;
  ambientGlowPrimary: string;
  ambientGlowSecondary: string;
  // Secondary button / Location CTA surface
  heroSurface: string;
  heroBorder: string;
  heroText: string;
  heroSubtext: string;
  // Typography
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textOnAccent: string;
  // Accents
  accentPrimary: string;
  accentElectric: string;
  accentTint: string;
  accentBorder: string;
  // Route square badge
  badgeBg: string;
  badgeText: string;
  badgeSubtext: string;
  // Borders & dividers
  borderSubtle: string;
  borderStrong: string;
  // Verification & status ("Needs verification" amber pill)
  warningBg: string;
  warningBorder: string;
  warningText: string;
  dangerBg: string;
  dangerText: string;
  infoBlue: string;
  infoBlueBg: string;
  // Map specific
  mapCanvas: string;
  mapGridLine: string;
  mapCorridorStroke: string;
  mapStreetLabel: string;
  mapStageInactive: string;
  mapStageInactiveText: string;
  mapFooterBg: string;
}

/**
 * Dark Theme Tokens directly from the STAGE Design Reference Sheet:
 * - Dark BG: #080D0C
 * - Dark Surface 1: #101916
 * - Dark Surface 2: #162521
 * - Green Accent: #20F58A
 */
export const DARK_THEME_COLORS: StageThemeColors = {
  mode: 'dark',
  isDark: true,
  background: '#0A0F0D',
  surfaceElevated: 'rgba(20, 29, 26, 0.76)',
  surfaceSecondary: 'rgba(28, 40, 35, 0.68)',
  surfaceRecessed: '#070B09',
  surfaceGlass: 'rgba(18, 26, 23, 0.85)',
  surfaceGlassStrong: 'rgba(14, 21, 18, 0.91)',
  glassHighlight: 'rgba(255, 255, 255, 0.12)',
  accentGlow: 'rgba(43, 217, 133, 0.22)',
  ambientGlowPrimary: 'rgba(43, 217, 133, 0.075)',
  ambientGlowSecondary: 'rgba(31, 168, 104, 0.05)',
  heroSurface: 'rgba(20, 43, 34, 0.78)',
  heroBorder: 'rgba(43, 217, 133, 0.34)',
  heroText: '#ECF0EE',
  heroSubtext: '#9AA6A0',
  textPrimary: '#ECF0EE',
  textSecondary: '#9AA6A0',
  textMuted: '#68746E',
  textOnAccent: '#05140C',
  accentPrimary: '#2BD985',
  accentElectric: '#2BD985',
  accentTint: 'rgba(43, 217, 133, 0.14)',
  accentBorder: 'rgba(43, 217, 133, 0.38)',
  badgeBg: '#1FA868',
  badgeText: '#FFFFFF',
  badgeSubtext: '#A7F3D0',
  borderSubtle: 'rgba(255, 255, 255, 0.10)',
  borderStrong: 'rgba(255, 255, 255, 0.18)',
  warningBg: 'rgba(51, 36, 11, 0.78)',
  warningBorder: 'rgba(245, 183, 59, 0.36)',
  warningText: '#F5B73B',
  dangerBg: 'rgba(239, 68, 68, 0.16)',
  dangerText: '#F87171',
  infoBlue: '#3B82F6',
  infoBlueBg: 'rgba(59, 130, 246, 0.16)',
  mapCanvas: '#0A110F',
  mapGridLine: '#14221E',
  mapCorridorStroke: '#1E352E',
  mapStreetLabel: '#60786E',
  mapStageInactive: 'rgba(28, 40, 35, 0.85)',
  mapStageInactiveText: '#D5E2DC',
  mapFooterBg: 'rgba(14, 21, 18, 0.90)',
};

/**
 * Light Theme Tokens directly from the STAGE Design Reference Sheet:
 * - Light BG: #F5F7F4
 * - Light Surface: #FFFFFF
 * - Text Primary: #121816
 * - Text Secondary: #6B7280
 * - Deep Green Buttons/Badges: #107F4C
 * - Bright Green Brand Logo/Highlights: #1ED777
 */
export const LIGHT_THEME_COLORS: StageThemeColors = {
  mode: 'light',
  isDark: false,
  background: '#F3F6F4',
  surfaceElevated: 'rgba(255, 255, 255, 0.80)',
  surfaceSecondary: 'rgba(235, 241, 237, 0.76)',
  surfaceRecessed: '#DFE7E1',
  surfaceGlass: 'rgba(255, 255, 255, 0.88)',
  surfaceGlassStrong: 'rgba(255, 255, 255, 0.93)',
  glassHighlight: 'rgba(255, 255, 255, 0.82)',
  accentGlow: 'rgba(14, 117, 68, 0.18)',
  ambientGlowPrimary: 'rgba(30, 215, 119, 0.10)',
  ambientGlowSecondary: 'rgba(14, 117, 68, 0.06)',
  heroSurface: 'rgba(229, 245, 236, 0.84)',
  heroBorder: 'rgba(14, 117, 68, 0.36)',
  heroText: '#111613',
  heroSubtext: '#4B5563',
  textPrimary: '#111613',
  textSecondary: '#5F6B66',
  textMuted: '#88938E',
  textOnAccent: '#FFFFFF',
  accentPrimary: '#0E7544',
  accentElectric: '#1ED777',
  accentTint: 'rgba(14, 117, 68, 0.11)',
  accentBorder: 'rgba(14, 117, 68, 0.38)',
  badgeBg: '#0E7544',
  badgeText: '#FFFFFF',
  badgeSubtext: '#D1FAE5',
  borderSubtle: 'rgba(17, 22, 19, 0.085)',
  borderStrong: 'rgba(17, 22, 19, 0.16)',
  warningBg: 'rgba(254, 243, 199, 0.85)',
  warningBorder: 'rgba(245, 158, 11, 0.45)',
  warningText: '#B45309',
  dangerBg: '#FEE2E2',
  dangerText: '#B91C1C',
  infoBlue: '#2563EB',
  infoBlueBg: '#DBEAFE',
  mapCanvas: '#E7EFEA',
  mapGridLine: '#D5E2DA',
  mapCorridorStroke: '#B8CEC1',
  mapStreetLabel: '#4D6155',
  mapStageInactive: 'rgba(255, 255, 255, 0.90)',
  mapStageInactiveText: '#111613',
  mapFooterBg: 'rgba(255, 255, 255, 0.92)',
};

const THEME_STORAGE_KEY = 'stage.mobile.theme.v4';
let memoryCachedTheme: ThemeMode | null = null;

function readInitialTheme(systemScheme: string | null | undefined): ThemeMode {
  if (memoryCachedTheme) {
    return memoryCachedTheme;
  }
  try {
    const g = globalThis as unknown as {
      localStorage?: { getItem: (k: string) => string | null };
    };
    const saved = g.localStorage?.getItem(THEME_STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') {
      memoryCachedTheme = saved;
      return saved;
    }
  } catch {
    // Ignore storage read errors in restricted runtimes
  }
  if (systemScheme === 'light') {
    return 'light';
  }
  return 'dark';
}

function persistThemePreference(mode: ThemeMode): void {
  memoryCachedTheme = mode;
  try {
    const g = globalThis as unknown as {
      localStorage?: { setItem: (k: string, v: string) => void };
    };
    g.localStorage?.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Ignore storage write errors
  }
}

interface StageThemeContextValue {
  theme: StageThemeColors;
  mode: ThemeMode;
  toggleTheme: () => void;
  setThemeMode: (mode: ThemeMode) => void;
  reduceMotion: boolean;
}

const StageThemeContext = createContext<StageThemeContextValue>({
  theme: DARK_THEME_COLORS,
  mode: 'dark',
  toggleTheme: () => undefined,
  setThemeMode: () => undefined,
  reduceMotion: false,
});

export const StageThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const systemColorScheme = useColorScheme() ?? Appearance.getColorScheme();
  const [userSelectedMode, setUserSelectedMode] = useState<ThemeMode | null>(
    () => {
      try {
        const g = globalThis as unknown as {
          localStorage?: { getItem: (k: string) => string | null };
        };
        const saved = g.localStorage?.getItem(THEME_STORAGE_KEY);
        if (saved === 'dark' || saved === 'light') {
          memoryCachedTheme = saved;
          return saved;
        }
      } catch {
        // Fallback to memory cache
      }
      return memoryCachedTheme;
    }
  );
  const [reduceMotion, setReduceMotion] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduceMotion(Boolean(enabled));
      })
      .catch(() => undefined);

    const sub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (enabled) => {
        if (mounted) setReduceMotion(Boolean(enabled));
      }
    );
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  const effectiveMode: ThemeMode = useMemo(() => {
    if (userSelectedMode) return userSelectedMode;
    return readInitialTheme(systemColorScheme);
  }, [userSelectedMode, systemColorScheme]);

  const setThemeMode = useCallback((nextMode: ThemeMode) => {
    setUserSelectedMode(nextMode);
    persistThemePreference(nextMode);
  }, []);

  const toggleTheme = useCallback(() => {
    setUserSelectedMode((prev) => {
      const current = prev ?? readInitialTheme(systemColorScheme);
      const next: ThemeMode = current === 'dark' ? 'light' : 'dark';
      persistThemePreference(next);
      return next;
    });
  }, [systemColorScheme]);

  const theme =
    effectiveMode === 'dark' ? DARK_THEME_COLORS : LIGHT_THEME_COLORS;

  const value = useMemo(
    () => ({
      theme,
      mode: effectiveMode,
      toggleTheme,
      setThemeMode,
      reduceMotion,
    }),
    [theme, effectiveMode, toggleTheme, setThemeMode, reduceMotion]
  );

  return (
    <StageThemeContext.Provider value={value}>
      {children}
    </StageThemeContext.Provider>
  );
};

export function useStageTheme(): StageThemeContextValue {
  return useContext(StageThemeContext);
}
