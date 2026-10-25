import React from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { buildGoogleMapsWalkingUrl, SearchMatchResult } from '@stage/shared';
import { useStageTheme } from '../theme/themeContext';
import { FONTS, RADIUS, TYPE } from '../theme/tokens';
import { VerificationBadge } from './VerificationBadge';
import { RouteNumberBadge } from './MobileRouteCard';
import { formatWalkDistance } from '../utils/destinations';

interface Props {
  selectedMatch: SearchMatchResult;
  onOpenMapAndDirections: () => void;
  onBack: () => void;
  saved: boolean;
  onToggleSave: () => void;
}

export const MobileStageDetailAndNav: React.FC<Props> = ({
  selectedMatch,
  onOpenMapAndDirections,
  onBack,
  saved,
  onToggleSave,
}) => {
  const { theme } = useStageTheme();
  const { route, stage, walking, origin } = selectedMatch;

  const openGoogle = async () => {
    try {
      await Linking.openURL(
        buildGoogleMapsWalkingUrl(origin.coordinates, stage.coordinates, stage.name)
      );
    } catch {
      Alert.alert(
        'Maps unavailable',
        `Walk toward ${stage.name} (${stage.streetAddress}).`
      );
    }
  };

  const card = {
    backgroundColor: theme.surfaceElevated,
    borderColor: theme.borderSubtle,
  };

  return (
    <View style={{ gap: 16 }}>
      <View style={styles.top}>
        <Pressable onPress={onBack} hitSlop={10} accessibilityLabel="Back">
          <Feather name="arrow-left" size={22} color={theme.textPrimary} />
        </Pressable>
        <Text style={[styles.topTitle, { color: theme.textPrimary }]}>
          Route Details
        </Text>
        <Pressable
          onPress={onToggleSave}
          hitSlop={10}
          accessibilityLabel={saved ? 'Remove from saved' : 'Save route'}
        >
          <Feather
            name="bookmark"
            size={21}
            color={saved ? theme.accentElectric : theme.textPrimary}
          />
        </Pressable>
      </View>

      <View style={[styles.card, card, { flexDirection: 'row', gap: 14, alignItems: 'center' }]}>
        <RouteNumberBadge value={route.routeNumber} size={58} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[styles.dest, { color: theme.textPrimary }]}>
            {route.destinationName}
          </Text>
          <Text style={[styles.subText, { color: theme.textSecondary }]}>
            {origin.shortName} → {route.destinationName}
          </Text>
          <VerificationBadge status={route.verificationStatus} />
        </View>
      </View>

      <Text style={[styles.h, { color: theme.textPrimary }]}>Boarding stage</Text>
      <View style={[styles.card, card, { gap: 12 }]}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
          <Feather name="map-pin" size={22} color={theme.accentElectric} style={{ marginTop: 2 }} />
          <View style={{ flex: 1, minWidth: 0, flexShrink: 1 }}>
            <Text style={[styles.stageName, { color: theme.textPrimary }]}>
              {stage.name.replace(' (Demo)', '')}
            </Text>
            <Text style={[styles.subText, { color: theme.textSecondary }]}>
              {stage.streetAddress}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Feather name="user" size={14} color={theme.textSecondary} />
          <Text style={[styles.walkText, { color: theme.textPrimary }]}>
            {walking.totalDistanceMeters > 2500
              ? `${formatWalkDistance(walking.totalDistanceMeters)} away`
              : `About ${walking.estimatedMinutes} min (${formatWalkDistance(walking.totalDistanceMeters)})`}
          </Text>
        </View>
        <Text style={[styles.descText, { color: theme.textSecondary }]}>
          {stage.bayDescription}
        </Text>
        <Pressable
          onPress={onOpenMapAndDirections}
          style={[
            styles.outlineBtn,
            { backgroundColor: theme.heroSurface, borderColor: theme.heroBorder },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Show map"
        >
          <Feather name="globe" size={16} color={theme.accentElectric} />
          <Text style={[styles.btnText, { color: theme.textPrimary }]}>Show map</Text>
        </Pressable>
      </View>

      <Text style={[styles.h, { color: theme.textPrimary }]}>About this route</Text>
      <Text style={[styles.descText, { color: theme.textSecondary }]}>
        {route.boardingTip} Via {route.corridorName}.
      </Text>
      <Text style={[styles.warnText, { color: theme.warningText }]}>
        {route.verificationNote}
      </Text>

      <Text style={[styles.h, { color: theme.textPrimary }]}>Stops</Text>
      <View>
        {route.popularStops.map((stop, i) => {
          const last = i === route.popularStops.length - 1;
          return (
            <View key={stop} style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ alignItems: 'center', width: 12 }}>
                <View
                  style={[styles.dot, { backgroundColor: theme.accentElectric }]}
                />
                {!last && (
                  <View
                    style={{ width: 2, flex: 1, backgroundColor: theme.borderStrong }}
                  />
                )}
              </View>
              <Text
                style={[
                  styles.stopText,
                  {
                    color: theme.textPrimary,
                    paddingBottom: last ? 0 : 14,
                  },
                ]}
              >
                {stop}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={{ gap: 10, marginTop: 4 }}>
        <Pressable
          onPress={openGoogle}
          style={[
            styles.outlineBtn,
            { backgroundColor: 'transparent', borderColor: theme.accentElectric },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Open Maps"
        >
          <Feather name="compass" size={16} color={theme.accentElectric} />
          <Text style={[styles.btnText, { color: theme.textPrimary }]}>
            Open Maps
          </Text>
        </Pressable>
        <Pressable
          onPress={onOpenMapAndDirections}
          style={[styles.solidBtn, { backgroundColor: theme.accentPrimary }]}
          accessibilityRole="button"
          accessibilityLabel="Walk there"
        >
          <Feather name="navigation" size={16} color={theme.textOnAccent} />
          <Text style={[styles.btnText, { color: theme.textOnAccent }]}>
            Walk there
          </Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topTitle: {
    fontFamily: FONTS.bold,
    fontSize: 17,
    fontWeight: '700',
  },
  card: { borderRadius: RADIUS.lg, borderWidth: 1, padding: 14 },
  dest: {
    fontFamily: FONTS.extraBold,
    fontSize: 20,
    fontWeight: '800',
  },
  subText: {
    fontFamily: FONTS.regular,
    fontSize: 13,
  },
  h: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    fontWeight: '700',
  },
  stageName: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    fontWeight: '700',
  },
  walkText: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    fontWeight: '700',
  },
  descText: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  warnText: {
    fontFamily: FONTS.medium,
    fontSize: 12.5,
    lineHeight: 17,
  },
  stopText: {
    fontFamily: FONTS.semiBold,
    fontSize: 14,
    marginTop: -3,
    fontWeight: '600',
  },
  outlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  solidBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: RADIUS.md,
  },
  btnText: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    fontWeight: '700',
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
