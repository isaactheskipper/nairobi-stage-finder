import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useStageTheme } from '../theme/themeContext';
import { FONTS, GLASS } from '../theme/tokens';
import { BrandLockup } from './BrandLogo';
import { GlassBackdrop } from './Glass';

export { DemoDataNoticeBar } from './VerificationBadge';

interface MobileHeaderProps {
  originShortName: string;
  isUsingGps: boolean;
  onPressLocation?: () => void;
}

export const MobileHeader: React.FC<MobileHeaderProps> = ({
  originShortName,
  isUsingGps,
  onPressLocation,
}) => {
  const { theme, mode, toggleTheme } = useStageTheme();
  return (
    <View style={styles.row}>
      <View style={{ gap: 4 }}>
        <BrandLockup size={26} />
        <Pressable
          onPress={onPressLocation}
          style={styles.loc}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Change starting location"
        >
          <Feather
            name={isUsingGps ? 'crosshair' : 'map-pin'}
            size={12}
            color={theme.accentElectric}
          />
          <Text style={[styles.locText, { color: theme.textPrimary }]}>
            {isUsingGps ? 'Live GPS' : `${originShortName} CBD`}
          </Text>
          <Feather name="chevron-down" size={13} color={theme.textSecondary} />
        </Pressable>
      </View>
      <Pressable
        onPress={toggleTheme}
        style={[
          styles.themeBtn,
          GLASS.floating(theme),
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Switch to ${mode === 'dark' ? 'light' : 'dark'} theme`}
      >
        <GlassBackdrop variant="floating" />
        <Feather
          name={mode === 'dark' ? 'sun' : 'moon'}
          size={18}
          color={theme.textPrimary}
        />
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 6,
  },
  loc: { flexDirection: 'row', alignItems: 'center', gap: 5, marginLeft: 2 },
  locText: { fontFamily: FONTS.semiBold, fontSize: 13, fontWeight: '600' },
  themeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
