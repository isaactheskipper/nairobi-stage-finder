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
        <View style={styles.badgeCol}>
          <RouteNumberBadge value={route.routeNumber} />
        </View>

        <View style={styles.body}>
          <View style={styles.headerArea}>
            <Text
              style={[TYPE.routeName, styles.titleText, { color: theme.textPrimary }]}
              numberOfLines={2}
            >
              {route.destinationName}
            </Text>
            <Text
              style={[TYPE.detail, styles.originText, { color: theme.textSecondary }]}
              numberOfLines={1}
            >
              {origin.shortName} → {route.destinationName}
            </Text>
          </View>

          <View style={styles.boardingSection}>
            <Feather
              name="map-pin"
              size={13}
              color={theme.accentElectric}
              style={styles.pinIcon}
            />
            <Text style={[TYPE.detail, styles.boardingText, { color: theme.textPrimary }]}>
              <Text style={{ fontWeight: '700', color: theme.accentElectric }}>Board at </Text>
              <Text style={{ fontWeight: '600' }}>{stageShort}</Text>
              {variant === 'nearby' && stage.streetAddress ? ` · ${stage.streetAddress}` : ''}
            </Text>
          </View>

          {variant === 'result' && operators.length > 0 && (
            <Text style={[TYPE.meta, styles.operatorText, { color: theme.textMuted }]}>
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

        <View style={styles.actionCol}>
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
        </View>
      </PressableScale>
    </FadeIn>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: RADIUS.lg,
    width: '100%',
  },
  badgeCol: {
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  body: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    gap: 5,
  },
  headerArea: {
    flexShrink: 1,
    minWidth: 0,
    gap: 2,
  },
  titleText: {
    flexShrink: 1,
    minWidth: 0,
  },
  originText: {
    flexShrink: 1,
    minWidth: 0,
  },
  boardingSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    flexShrink: 1,
    minWidth: 0,
    marginTop: 2,
  },
  pinIcon: {
    marginTop: 2,
    flexShrink: 0,
  },
  boardingText: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    lineHeight: 18,
  },
  operatorText: {
    flexShrink: 1,
    minWidth: 0,
    marginTop: 2,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: 10,
    rowGap: 6,
    marginTop: 3,
  },
  actionCol: {
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingLeft: 2,
  },
  save: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
