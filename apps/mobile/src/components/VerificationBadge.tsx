import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { UNVERIFIED_DEMO_BANNER, VerificationStatus } from '@stage/shared';
import { useStageTheme } from '../theme/themeContext';
import { FONTS } from '../theme/tokens';
import { MONO_FONT } from '../theme/mobileStyles';

interface VerificationBadgeProps {
  status: VerificationStatus;
  compact?: boolean;
}

/** Amber "Needs verification" pill shown on every unverified demo route. */
export const VerificationBadge: React.FC<VerificationBadgeProps> = ({
  compact = false,
}) => {
  const { theme } = useStageTheme();
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: theme.warningBg, borderColor: theme.warningBorder },
        compact ? styles.badgeCompact : null,
      ]}
      accessibilityRole="text"
      accessibilityLabel="Needs verification: unverified demo route data"
    >
      <Feather
        name="alert-triangle"
        size={compact ? 10 : 12}
        color={theme.warningText}
      />
      <Text
        style={[
          styles.badgeText,
          { color: theme.warningText },
          compact ? styles.badgeTextCompact : null,
        ]}
      >
        Needs verification
      </Text>
    </View>
  );
};

export const DemoDataNoticeBar: React.FC = () => {
  const { theme } = useStageTheme();
  const [expanded, setExpanded] = useState(false);
  return (
    <Pressable
      onPress={() => setExpanded((p) => !p)}
      style={[
        styles.noticeBar,
        {
          backgroundColor: theme.warningBg,
          borderColor: theme.warningBorder,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel="Unverified demo data notice. Tap to expand."
    >
      <Feather name="shield" size={12} color={theme.warningText} />
      <Text
        style={[styles.noticeText, { color: theme.warningText }]}
        numberOfLines={expanded ? undefined : 2}
      >
        {UNVERIFIED_DEMO_BANNER}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  badgeCompact: { paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontFamily: FONTS.bold, fontSize: 12, fontWeight: '700' },
  badgeTextCompact: { fontFamily: FONTS.bold, fontSize: 10.5 },
  noticeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
  },
  noticeText: { flex: 1, fontFamily: MONO_FONT, fontSize: 10, lineHeight: 14 },
});
