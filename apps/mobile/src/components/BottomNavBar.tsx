import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { StageViewMode } from '@stage/shared';
import { useStageTheme } from '../theme/themeContext';
import { FONTS, GLASS } from '../theme/tokens';
import { GlassBackdrop } from './Glass';

interface BottomNavBarProps {
  activeMode: StageViewMode;
  onSelectMode: (mode: StageViewMode) => void;
  bottomInset?: number;
}

interface NavItem {
  id: StageViewMode;
  label: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  matches: StageViewMode[];
}

const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Home', icon: 'home', matches: ['overview'] },
  { id: 'search', label: 'Search', icon: 'search', matches: ['search'] },
  {
    id: 'results',
    label: 'Routes',
    icon: 'layers',
    matches: ['results', 'stage-details'],
  },
  { id: 'saved', label: 'Saved', icon: 'bookmark', matches: ['saved'] },
];

export const BottomNavBar: React.FC<BottomNavBarProps> = React.memo(
  ({ activeMode, onSelectMode, bottomInset = 0 }) => {
    const { theme } = useStageTheme();
    return (
      <View
        style={[
          styles.bar,
          GLASS.floating(theme),
          {
            borderColor: theme.borderStrong,
            borderTopColor: theme.glassHighlight,
            bottom: Math.max(bottomInset, 10),
          },
        ]}
        accessibilityRole="tablist"
      >
        <GlassBackdrop variant="sheet" enableBlur />
        {/* Subtle emerald glow along the dock */}
        <LinearGradient
          pointerEvents="none"
          colors={[
            'rgba(43,217,133,0)',
            'rgba(43,217,133,0.12)',
            'rgba(20,184,166,0)',
          ]}
          start={{ x: 0, y: 1 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
        {NAV_ITEMS.map((item) => {
          const active = item.matches.includes(activeMode);
          const color = active ? theme.accentElectric : theme.textSecondary;
          return (
            <Pressable
              key={item.id}
              onPress={() => onSelectMode(item.id)}
              style={({ pressed }) => [
                styles.tab,
                pressed && { transform: [{ scale: 0.94 }] },
              ]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${item.label} tab`}
            >
              <View
                style={[
                  styles.iconPill,
                  active && styles.iconPillActive,
                ]}
              >
                {active && (
                  <LinearGradient
                    colors={[
                      'rgba(43,217,133,0.28)',
                      'rgba(43,217,133,0.10)',
                    ]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                )}
                <Feather name={item.icon} size={21} color={color} />
              </View>
              <Text
                allowFontScaling={false}
                numberOfLines={1}
                style={[
                  styles.label,
                  {
                    color,
                    fontFamily: active ? FONTS.bold : FONTS.semiBold,
                    fontWeight: active ? '700' : '600',
                  },
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  }
);

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 12,
    right: 12,
    alignSelf: 'center',
    maxWidth: 524,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 30,
    borderRadius: 24,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  // Equal-width slots: flexBasis 0 + flexGrow 1 ignores content width (active label is bolder).
  tab: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    minHeight: 52,
  },
  label: {
    fontSize: 11.5,
    lineHeight: 15,
    textAlign: 'center',
    includeFontPadding: false,
  },
  iconPill: {
    width: 56,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'transparent',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPillActive: {
    borderColor: 'rgba(43, 217, 133, 0.42)',
  },
});
