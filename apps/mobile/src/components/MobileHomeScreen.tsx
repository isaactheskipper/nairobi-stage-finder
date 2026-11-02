import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SearchMatchResult } from '@stage/shared';
import { useStageTheme } from '../theme/themeContext';
import { FONTS, GLASS, RADIUS, TYPE } from '../theme/tokens';
import { MobileRouteCard } from './MobileRouteCard';
import { Divider, PressableScale } from './Motion';
import { countRoutesFor, POPULAR_DESTINATIONS } from '../utils/destinations';
import { GlassBackdrop } from './Glass';

interface Props {
  query: string;
  onQueryChange: (q: string) => void;
  onSubmitSearch: () => void;
  allMatches: SearchMatchResult[];
  nearby: SearchMatchResult[];
  selectedRouteId?: string | null;
  onSelectDestination: (name: string) => void;
  onSelectRoute: (m: SearchMatchResult) => void;
  onSeeAll: () => void;
  isGpsActive: boolean;
  isGpsLoading: boolean;
  gpsMessage?: string;
  gpsFailed?: boolean;
  onUseLocation: () => void;
  isSaved: (routeId: string) => boolean;
  onToggleSave: (routeId: string) => void;
}

/** Muted, distinct tones per destination so the cards feel curated, not neon. */
const TONES: Record<string, { bg: string; fg: string }> = {
  Juja: { bg: '#24463A', fg: '#7FD1AC' },
  Ngong: { bg: '#2B3F52', fg: '#8FB8DA' },
  Kikuyu: { bg: '#4A3F28', fg: '#D9BC7A' },
  Westlands: { bg: '#3F3350', fg: '#B9A0DC' },
};

interface PopularDestinationItem {
  name: string;
  count: number;
}

export const MobileHomeScreen: React.FC<Props> = React.memo(
  ({
    query,
    onQueryChange,
    onSubmitSearch,
    allMatches,
    nearby,
    selectedRouteId,
    onSelectDestination,
    onSelectRoute,
    onSeeAll,
    isGpsActive,
    isGpsLoading,
    gpsMessage,
    gpsFailed,
    onUseLocation,
    isSaved,
    onToggleSave,
  }) => {
    const { theme } = useStageTheme();
    const [focused, setFocused] = useState(false);

    const popularItems = useMemo<PopularDestinationItem[]>(
      () =>
        POPULAR_DESTINATIONS.map((name) => ({
          name,
          count: countRoutesFor(allMatches, name),
        })),
      [allMatches]
    );

    return (
      <View style={{ gap: 20 }}>
        <View style={{ gap: 4 }}>
          <Text style={[TYPE.display, { color: theme.textPrimary }]}>
            Where to?
          </Text>
          <Text style={[TYPE.body, { color: theme.textSecondary }]}>
            Find a place, route or stage
          </Text>
        </View>

        <View style={{ gap: 10 }}>
          <View style={[styles.search, GLASS.panel(theme, focused)]}>
            <GlassBackdrop variant="panel" active={Boolean(focused)} />
            <Feather
              name="search"
              size={19}
              color={focused ? theme.accentElectric : theme.textSecondary}
            />
            <TextInput
              style={[styles.input, { color: theme.textPrimary }]}
              value={query}
              onChangeText={onQueryChange}
              onSubmitEditing={onSubmitSearch}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="e.g. Ngong, Westlands, 25…"
              placeholderTextColor={theme.textMuted}
              returnKeyType="search"
              autoCorrect={false}
              accessibilityLabel="Search destination, corridor, route or stage"
            />
            {query.length > 0 && (
              <Pressable
                onPress={() => onQueryChange('')}
                hitSlop={12}
                accessibilityLabel="Clear search"
              >
                <Feather name="x-circle" size={18} color={theme.textMuted} />
              </Pressable>
            )}
          </View>

          <PressableScale
            onPress={onUseLocation}
            style={[styles.locBtn, GLASS.card(theme, isGpsActive)]}
            accessibilityRole="button"
            accessibilityLabel="My location"
          >
            <GlassBackdrop variant="card" active={Boolean(isGpsActive)} />
            {isGpsLoading ? (
              <ActivityIndicator size="small" color={theme.accentElectric} />
            ) : (
              <Feather
                name="crosshair"
                size={17}
                color={isGpsActive ? theme.accentElectric : theme.textSecondary}
              />
            )}
            <Text
              style={[TYPE.detail, styles.flex, { color: theme.textPrimary }]}
            >
              {isGpsLoading
                ? 'Finding location…'
                : isGpsActive
                  ? 'Live GPS active'
                  : 'My location'}
            </Text>
            {!isGpsActive && !isGpsLoading && (
              <Feather name="chevron-right" size={17} color={theme.textMuted} />
            )}
          </PressableScale>
          {gpsFailed && gpsMessage ? (
            <Text style={[TYPE.meta, { color: theme.warningText }]}>
              {gpsMessage} Using selected landmark.
            </Text>
          ) : null}
        </View>

        <Divider color={theme.borderSubtle} />

        <View style={{ gap: 12 }}>
          <View style={styles.sectionRow}>
            <Text
              style={[TYPE.title, { color: theme.textPrimary, fontSize: 18 }]}
            >
              Popular
            </Text>
            <Pressable onPress={onSeeAll} hitSlop={12}>
              <Text
                style={[
                  TYPE.detail,
                  { color: theme.accentElectric, fontWeight: '700' },
                ]}
              >
                See all
              </Text>
            </Pressable>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.popularListContent}
          >
            {popularItems.map(({ name, count: n }) => {
              const tone = TONES[name] ?? TONES.Juja;
              return (
                <PressableScale
                  key={name}
                  onPress={() => onSelectDestination(name)}
                  style={[styles.destCard, GLASS.card(theme)]}
                  accessibilityRole="button"
                  accessibilityLabel={`${name}, ${n} ${n === 1 ? 'route' : 'routes'}`}
                >
                  <GlassBackdrop variant="card" />
                  <View
                    style={[
                      styles.destArt,
                      {
                        backgroundColor: `${tone.bg}${theme.isDark ? '8C' : '59'}`,
                      },
                    ]}
                  >
                    <LinearGradient
                      colors={[
                        'rgba(255,255,255,0.16)',
                        'rgba(255,255,255,0)',
                        'rgba(6,12,10,0.25)',
                      ]}
                      locations={[0, 0.5, 1]}
                      style={StyleSheet.absoluteFill}
                    />
                    <View style={[styles.arc, { borderColor: tone.fg }]} />
                    <View style={[styles.arc2, { borderColor: tone.fg }]} />
                    <View style={[styles.pin, { backgroundColor: tone.fg }]} />
                  </View>
                  <View style={{ padding: 10, gap: 2 }}>
                    <Text
                      style={[TYPE.routeName, { color: theme.textPrimary }]}
                    >
                      {name}
                    </Text>
                    <Text style={[TYPE.meta, { color: theme.textSecondary }]}>
                      {n} {n === 1 ? 'route' : 'routes'}
                    </Text>
                  </View>
                </PressableScale>
              );
            })}
          </ScrollView>
        </View>

        <Divider color={theme.borderSubtle} />

        <View style={{ gap: 12 }}>
          <View style={styles.sectionRow}>
            <Text
              style={[TYPE.title, { color: theme.textPrimary, fontSize: 18 }]}
            >
              Nearby
            </Text>
            <Pressable onPress={onSeeAll} hitSlop={12}>
              <Text
                style={[
                  TYPE.detail,
                  { color: theme.accentElectric, fontWeight: '700' },
                ]}
              >
                All {allMatches.length} routes
              </Text>
            </Pressable>
          </View>
          <View style={{ gap: 10 }}>
            {nearby.map((m) => (
              <MobileRouteCard
                key={m.route.id}
                match={m}
                selected={
                  selectedRouteId !== null &&
                  selectedRouteId !== undefined &&
                  m.route.id === selectedRouteId
                }
                onSelectMatch={onSelectRoute}
                saved={isSaved(m.route.id)}
                onToggleSaveRoute={onToggleSave}
              />
            ))}
          </View>
        </View>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    height: 54,
    borderRadius: RADIUS.lg,
  },
  input: {
    flex: 1,
    fontFamily: FONTS.regular,
    fontSize: 15,
    paddingVertical: 0,
  },
  locBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    minHeight: 46,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  popularListContent: {
    gap: 10,
    paddingRight: 20,
    alignItems: 'flex-start',
  },
  destCard: {
    width: 136,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  destArt: { height: 74, overflow: 'hidden' },
  arc: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 2,
    opacity: 0.35,
    right: -50,
    top: 6,
  },
  arc2: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    opacity: 0.55,
    right: -22,
    top: 30,
  },
  pin: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    left: 16,
    bottom: 16,
  },
});
