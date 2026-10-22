import React from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SearchMatchResult } from '@stage/shared';
import { useStageTheme } from '../theme/themeContext';
import { RADIUS, SHADOW, TYPE } from '../theme/tokens';
import { VerificationBadge } from './VerificationBadge';
import { FadeIn, PressableScale } from './Motion';

interface MobileRouteCardProps {
  match: SearchMatchResult;
  onPress: () => void;
  /** 'result' adds the operator line; 'nearby' is the compact home variant. */
  variant?: 'nearby' | 'result';
  selected?: boolean;
  index?: number;
  saved?: boolean;
  onToggleSave?: () => void;
}

export const RouteNumberBadge: React.FC<{ value: string; size?: number }> = ({
  value,
  size = 48,
}) => {
  const { theme } = useStageTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        backgroundColor: theme.badgeBg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        allowFontScaling={false}
        style={{
          color: theme.badgeText,
          fontSize: size * (value.length > 3 ? 0.3 : value.length > 2 ? 0.36 : 0.46),
          fontWeight: '800',
          letterSpacing: -0.5,
        }}
      >
        {value}
      </Text>
    </View>
  );
};

export const MobileRouteCard: React.FC<MobileRouteCardProps> = ({
  match,
  onPress,
  variant = 'nearby',
  selected,
  index = 0,
  saved,
  onToggleSave,
}) => {
  const { theme } = useStageTheme();
  const { route, stage, walking, origin } = match;
  const stageShort = stage.name.replace(' (Demo)', '');
  // Straight-line distance from the start point; far-away starts are shown as
  // distance, not as a (misleading) walking time.
  const farAway = walking.totalDistanceMeters > 2500;
  const proximity = farAway
    ? `${(walking.totalDistanceMeters / 1000).toFixed(1)} km away`
    : `${walking.estimatedMinutes} min walk`;
  const operators = route.saccoExamples.slice(0, 2).join(' · ');

  return (
    <FadeIn index={index}>
      <PressableScale
        onPress={onPress}
        style={[
          styles.card,
          SHADOW.card,
          {
            backgroundColor: theme.surfaceElevated,
            borderColor: selected ? theme.accentElectric : theme.borderSubtle,
            borderWidth: selected ? 1.5 : 1,
            shadowOpacity: theme.isDark ? 0.25 : 0.05,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Route ${route.routeNumber} to ${route.destinationName}, board at ${stageShort}, ${proximity}`}
      >
        <RouteNumberBadge value={route.routeNumber} />
        <View style={styles.body}>
          <Text style={[TYPE.routeName, { color: theme.textPrimary }]}>
            {route.destinationName}
          </Text>
          <Text style={[TYPE.detail, { color: theme.textSecondary }]}>
            {origin.shortName} → {route.destinationName}
          </Text>
          <View style={styles.line}>
            <Feather name="map-pin" size={12} color={theme.accentElectric} />
            <Text
              style={[TYPE.detail, styles.flex, { color: theme.textPrimary }]}
            >
              Board at {stageShort}
              {variant === 'nearby' ? ` · ${stage.streetAddress}` : ''}
            </Text>
          </View>
          {variant === 'result' && operators.length > 0 && (
            <Text style={[TYPE.meta, { color: theme.textMuted }]}>
              Operators: {operators}
            </Text>
          )}
          <View style={styles.meta}>
            <View style={styles.line}>
              <Feather name="user" size={12} color={theme.textSecondary} />
              <Text style={[TYPE.meta, { color: theme.textSecondary }]}>
                {proximity}
              </Text>
            </View>
            <VerificationBadge status={route.verificationStatus} compact />
          </View>
        </View>
        {onToggleSave ? (
          <Pressable
            onPress={onToggleSave}
            hitSlop={12}
            style={styles.save}
            accessibilityRole="button"
            accessibilityLabel={saved ? 'Remove from saved' : 'Save route'}
          >
            <Feather
              name="bookmark"
              size={20}
              color={saved ? theme.accentElectric : theme.textMuted}
            />
          </Pressable>
        ) : (
          <Feather name="chevron-right" size={18} color={theme.textMuted} />
        )}
      </PressableScale>
    </FadeIn>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    padding: 14,
    borderRadius: RADIUS.lg,
  },
  body: { flex: 1, gap: 4 },
  flex: { flex: 1 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: 10,
    rowGap: 6,
    marginTop: 4,
  },
  save: { width: 32, height: 32, alignItems: 'flex-end', justifyContent: 'flex-start' },
});
