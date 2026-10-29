import { Platform, StyleSheet } from 'react-native';
import {
  STAGE_COLORS,
  STAGE_RADIUS,
  STAGE_SPACING,
  STAGE_TYPOGRAPHY,
} from '@stage/shared';
import { StageThemeColors } from './themeContext';

export const MONO_FONT = Platform.select({
  android: 'monospace',
  ios: 'Menlo',
  default: 'monospace',
});

export function createThemedStyles(theme: StageThemeColors) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.background,
    },
    screenContainer: {
      flex: 1,
      backgroundColor: theme.background,
    },
    scrollContent: {
      paddingHorizontal: STAGE_SPACING.md,
      paddingTop: STAGE_SPACING.sm,
      paddingBottom: 112,
      gap: STAGE_SPACING.md,
    },
    cardElevated: {
      backgroundColor: theme.surfaceElevated,
      borderRadius: STAGE_RADIUS.lg,
      padding: STAGE_SPACING.md,
      borderWidth: 1,
      borderColor: theme.borderSubtle,
      borderTopColor: theme.glassHighlight,
      gap: STAGE_SPACING.sm,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: theme.isDark ? 0.34 : 0.06,
      shadowRadius: 14,
      elevation: theme.isDark ? 4 : 2,
    },
    cardSelected: {
      borderColor: theme.accentPrimary,
      borderTopColor: theme.accentPrimary,
      borderWidth: 1.5,
      shadowColor: theme.accentElectric,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.24,
      shadowRadius: 12,
    },
    cardSecondary: {
      backgroundColor: theme.surfaceSecondary,
      borderRadius: STAGE_RADIUS.md,
      padding: STAGE_SPACING.sm,
      borderWidth: 1,
      borderColor: theme.borderSubtle,
      borderTopColor: theme.glassHighlight,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 2,
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.textPrimary,
      letterSpacing: -0.2,
    },
    sectionCountBadge: {
      backgroundColor: theme.surfaceSecondary,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: STAGE_RADIUS.xs,
      borderWidth: 1,
      borderColor: theme.borderSubtle,
    },
    sectionCountText: {
      fontFamily: MONO_FONT,
      fontSize: 11,
      fontWeight: '700',
      color: theme.textSecondary,
    },
    primaryActionBtn: {
      backgroundColor: theme.accentPrimary,
      borderRadius: STAGE_RADIUS.sm,
      paddingVertical: 12,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      minHeight: 46,
    },
    primaryActionText: {
      color: theme.textOnAccent,
      fontSize: 13.5,
      fontWeight: '800',
      letterSpacing: -0.1,
    },
    secondaryActionBtn: {
      backgroundColor: theme.surfaceSecondary,
      borderRadius: STAGE_RADIUS.sm,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor: theme.borderStrong,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      minHeight: 46,
    },
    secondaryActionText: {
      color: theme.textPrimary,
      fontSize: 13.5,
      fontWeight: '700',
    },
  });
}

export const mobileStyles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: STAGE_COLORS.nightCanvas,
  },
  screenCanvas: {
    flex: 1,
    backgroundColor: STAGE_COLORS.canvas,
  },
  screenCanvasNight: {
    backgroundColor: STAGE_COLORS.nightCanvas,
  },
  scrollContent: {
    padding: STAGE_SPACING.md,
    paddingBottom: STAGE_SPACING.xxl,
    gap: STAGE_SPACING.md,
  },
  card: {
    backgroundColor: STAGE_COLORS.surfacePrimary,
    borderRadius: STAGE_RADIUS.lg,
    padding: STAGE_SPACING.md,
    borderWidth: 1,
    borderColor: STAGE_COLORS.borderSubtle,
    gap: STAGE_SPACING.sm,
  },
  headline: {
    fontSize: STAGE_TYPOGRAPHY.scale.titleLarge.size,
    fontWeight: '800',
    color: STAGE_COLORS.inkPrimary,
    letterSpacing: -0.5,
  },
  subheadline: {
    fontSize: STAGE_TYPOGRAPHY.scale.bodyMedium.size,
    color: STAGE_COLORS.inkSecondary,
    lineHeight: 20,
  },
});
