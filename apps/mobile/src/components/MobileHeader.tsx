import React, { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useStageTheme } from '../theme/themeContext';
import { FONTS, GLASS } from '../theme/tokens';
import { BrandLockup } from './BrandLogo';
import { GlassBackdrop, GlassFadeStrip } from './Glass';

export { DemoDataNoticeBar } from './VerificationBadge';

interface MobileHeaderProps {
  originShortName: string;
  isUsingGps: boolean;
  onPressLocation?: () => void;
  onPressBrand?: () => void;
  /** Status-bar / cutout inset; the glass extends underneath it. */
  topInset?: number;
  onHeightChange?: (height: number) => void;
}

export const MobileHeader: React.FC<MobileHeaderProps> = React.memo(
  ({
    originShortName,
    isUsingGps,
    onPressLocation,
    onPressBrand,
    topInset = 0,
    onHeightChange,
  }) => {
    const { theme, mode, toggleTheme } = useStageTheme();
    const lastHeightRef = useRef(0);

    return (
      <View
        style={styles.shell}
        onLayout={(e) => {
          const h = Math.round(e.nativeEvent.layout.height);
          if (h > 0 && Math.abs(h - lastHeightRef.current) > 1) {
            lastHeightRef.current = h;
            onHeightChange?.(h);
          }
        }}
        pointerEvents="box-none"
      >
        <GlassBackdrop variant="floating" />
        <View style={[styles.row, { paddingTop: topInset + 8 }]}>
          <View style={{ gap: 4 }}>
            <Pressable
              onPress={onPressBrand}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="STAGE — Return to Home"
            >
              <BrandLockup size={26} />
            </Pressable>
            <Pressable
              onPress={onPressLocation}
              style={[styles.loc, GLASS.card(theme)]}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Change starting location"
            >
              <GlassBackdrop variant="card" />
              <Feather
                name={isUsingGps ? 'crosshair' : 'map-pin'}
                size={12}
                color={theme.accentElectric}
              />
              <Text style={[styles.locText, { color: theme.textPrimary }]}>
                {isUsingGps ? 'Live GPS' : `${originShortName} CBD`}
              </Text>
              <Feather
                name="chevron-down"
                size={13}
                color={theme.textSecondary}
              />
            </Pressable>
          </View>
          <Pressable
            onPress={toggleTheme}
            style={[styles.themeBtn, GLASS.floating(theme)]}
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
        <View style={styles.strip} pointerEvents="none">
          <GlassFadeStrip height={24} />
        </View>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  shell: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    elevation: 0,
  },
  strip: { position: 'absolute', top: '100%', left: 0, right: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  loc: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 28,
    paddingLeft: 8,
    paddingRight: 10,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
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
