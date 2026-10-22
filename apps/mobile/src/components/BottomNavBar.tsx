import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { StageViewMode } from '@stage/shared';
import { useStageTheme } from '../theme/themeContext';

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

export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  activeMode,
  onSelectMode,
  bottomInset = 0,
}) => {
  const { theme } = useStageTheme();
  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: theme.surfaceElevated,
          borderTopColor: theme.borderSubtle,
          paddingBottom: Math.max(bottomInset, Platform.OS === 'android' ? 8 : 10),
        },
      ]}
      accessibilityRole="tablist"
    >
      {NAV_ITEMS.map((item) => {
        const active = item.matches.includes(activeMode);
        const color = active ? theme.accentElectric : theme.textSecondary;
        return (
          <Pressable
            key={item.id}
            onPress={() => onSelectMode(item.id)}
            style={styles.tab}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${item.label} tab`}
          >
            <View
              style={[
                styles.iconPill,
                active && { backgroundColor: theme.accentTint },
              ]}
            >
              <Feather name={item.icon} size={21} color={color} />
            </View>
            <Text
              style={[
                styles.label,
                { color, fontWeight: active ? '800' : '600' },
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: 8,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
  tab: { flex: 1, alignItems: 'center', gap: 2, minHeight: 52 },
  label: { fontSize: 11.5 },
  iconPill: {
    width: 56,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
