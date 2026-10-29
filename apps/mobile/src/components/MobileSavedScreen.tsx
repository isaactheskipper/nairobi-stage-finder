import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SearchMatchResult } from '@stage/shared';
import { useStageTheme } from '../theme/themeContext';
import { FONTS, GLASS } from '../theme/tokens';
import { MobileRouteCard } from './MobileRouteCard';
import { GlassBackdrop } from './Glass';

interface Props {
  matches: SearchMatchResult[];
  onSelectRoute: (m: SearchMatchResult) => void;
  onToggleSave: (routeId: string) => void;
}

export const MobileSavedScreen: React.FC<Props> = ({
  matches,
  onSelectRoute,
  onToggleSave,
}) => {
  const { theme } = useStageTheme();
  return (
    <View style={{ gap: 12 }}>
      <Text style={[styles.h1, { color: theme.textPrimary }]}>Saved</Text>
      {matches.length === 0 ? (
        <View
          style={[
            styles.empty,
            GLASS.card(theme),
          ]}
        >
          <GlassBackdrop variant="card" />
          <Feather name="bookmark" size={26} color={theme.textMuted} />
          <Text style={{ fontFamily: FONTS.bold, color: theme.textPrimary, fontWeight: '700', fontSize: 16 }}>
            Nothing saved yet
          </Text>
          <Text style={{ fontFamily: FONTS.regular, color: theme.textSecondary, textAlign: 'center', fontSize: 13 }}>
            Tap the bookmark on any route to keep it here for quick access.
          </Text>
        </View>
      ) : (
        matches.map((m, i) => (
          <MobileRouteCard
            key={m.route.id}
            index={i}
            match={m}
            onPress={() => onSelectRoute(m)}
            saved
            onToggleSave={() => onToggleSave(m.route.id)}
          />
        ))
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  h1: { fontFamily: FONTS.extraBold, fontSize: 22, lineHeight: 28, fontWeight: '800', letterSpacing: -0.4 },
  empty: {
    alignItems: 'center',
    gap: 8,
    padding: 28,
    borderRadius: 16,
    borderWidth: 1,
  },
});

