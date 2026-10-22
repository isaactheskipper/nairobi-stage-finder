import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  matchPlaceToStageDatabase,
  NominatimPlaceResult,
  NominatimSearchOutcome,
  searchNominatimPlacesKenya,
  SearchMatchResult,
} from '@stage/shared';
import { useStageTheme } from '../theme/themeContext';
import { MobileRouteCard } from './MobileRouteCard';
import { FadeIn, Skeleton } from './Motion';
import { FONTS } from '../theme/tokens';

type Filter = 'All' | 'Routes' | 'Stages' | 'Destinations';
const FILTERS: Filter[] = ['All', 'Routes', 'Stages', 'Destinations'];

interface Props {
  query: string;
  onQueryChange: (q: string) => void;
  results: SearchMatchResult[];
  selectedOriginId: string;
  userCoords?: { lat: number; lng: number } | null;
  onSelectRoute: (m: SearchMatchResult) => void;
  onBack?: () => void;
  isSaved: (routeId: string) => boolean;
  onToggleSave: (routeId: string) => void;
}

export const MobileSearchCard: React.FC<Props> = ({
  query,
  onQueryChange,
  results,
  selectedOriginId,
  userCoords,
  onSelectRoute,
  onBack,
  isSaved,
  onToggleSave,
}) => {
  const { theme } = useStageTheme();
  const [filter, setFilter] = useState<Filter>('All');
  const [osm, setOsm] = useState<NominatimSearchOutcome | null>(null);
  const [loading, setLoading] = useState(false);

  const requestIdRef = useRef(0);
  const lastQueryRef = useRef<string | null>(null);

  const submit = useCallback(async () => {
    const q = query.trim();
    if (q.length < 2) {
      requestIdRef.current += 1;
      lastQueryRef.current = null;
      setOsm(null);
      setLoading(false);
      return;
    }
    // Skip duplicate submissions of the query that is already loading/shown.
    if (lastQueryRef.current === q.toLowerCase() && (loading || osm?.status === 'ok')) {
      return;
    }
    lastQueryRef.current = q.toLowerCase();
    const id = ++requestIdRef.current;
    setLoading(true);
    try {
      const outcome = await searchNominatimPlacesKenya(q);
      if (id === requestIdRef.current) setOsm(outcome); // drop stale responses
    } catch {
      if (id === requestIdRef.current) {
        lastQueryRef.current = null;
        setOsm({
          status: 'error',
          places: [],
          fromCache: false,
          errorMessage: 'Check your connection and try again.',
        });
      }
    } finally {
      if (id === requestIdRef.current) setLoading(false);
    }
  }, [query, loading, osm]);

  const destinations = useMemo(() => {
    const map = new Map<string, number>();
    results.forEach((m) =>
      map.set(m.route.destinationArea, (map.get(m.route.destinationArea) ?? 0) + 1)
    );
    return Array.from(map.entries());
  }, [results]);

  const stages = useMemo(() => {
    const map = new Map<string, { addr: string; n: number }>();
    results.forEach((m) => {
      const cur = map.get(m.stage.name);
      map.set(m.stage.name, {
        addr: m.stage.streetAddress,
        n: (cur?.n ?? 0) + 1,
      });
    });
    return Array.from(map.entries());
  }, [results]);

  const show = (f: Filter) => filter === 'All' || filter === f;

  const placeRow = (place: NominatimPlaceResult) => {
    const { matchedRoutes } = matchPlaceToStageDatabase(
      place,
      selectedOriginId,
      userCoords ?? null
    );
    const first = matchedRoutes[0];
    return (
      <Pressable
        key={place.placeId}
        disabled={!first}
        onPress={() => first && onSelectRoute(first)}
        style={[
          styles.row,
          {
            backgroundColor: theme.surfaceElevated,
            borderColor: theme.borderSubtle,
            opacity: first ? 1 : 0.65,
          },
        ]}
      >
        <Feather name="globe" size={18} color={theme.accentElectric} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowTitle, { color: theme.textPrimary }]} numberOfLines={1}>
            {place.title}
          </Text>
          <Text style={[styles.rowSub, { color: theme.textSecondary }]} numberOfLines={2}>
            {first
              ? `Place on the map. ${matchedRoutes.length} unverified demo route(s) mention it.`
              : 'Place found on the map, but it is not a confirmed boarding stage. STAGE has no route data for it yet.'}
          </Text>
        </View>
        {first && <Feather name="chevron-right" size={18} color={theme.textSecondary} />}
      </Pressable>
    );
  };

  const header = (t: string) => (
    <Text style={[styles.section, { color: theme.textSecondary }]}>{t}</Text>
  );

  const nothing = results.length === 0;

  return (
    <View style={{ gap: 14 }}>
      <View
        style={[
          styles.bar,
          { backgroundColor: theme.surfaceElevated, borderColor: theme.borderStrong },
        ]}
      >
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={8} accessibilityLabel="Back">
            <Feather name="arrow-left" size={20} color={theme.textPrimary} />
          </Pressable>
        ) : (
          <Feather name="search" size={18} color={theme.textSecondary} />
        )}
        <TextInput
          style={[styles.input, { color: theme.textPrimary }]}
          value={query}
          onChangeText={(t) => {
            onQueryChange(t);
            requestIdRef.current += 1; // invalidate in-flight lookups
            lastQueryRef.current = null;
            setLoading(false);
            setOsm(null);
          }}
          onSubmitEditing={submit}
          placeholder="Find a place, route or stage"
          placeholderTextColor={theme.textMuted}
          returnKeyType="search"
          autoCorrect={false}
          autoFocus
        />
        {query.length > 0 && (
          <Pressable
            onPress={() => {
              onQueryChange('');
              requestIdRef.current += 1;
              lastQueryRef.current = null;
              setLoading(false);
              setOsm(null);
            }}
            hitSlop={8}
            accessibilityLabel="Clear search"
          >
            <Feather name="x" size={18} color={theme.textMuted} />
          </Pressable>
        )}
      </View>

      <View style={styles.pills}>
        {FILTERS.map((f) => {
          const active = f === filter;
          return (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              style={[
                styles.pill,
                {
                  backgroundColor: active ? theme.accentElectric : theme.surfaceElevated,
                  borderColor: active ? theme.accentElectric : theme.borderStrong,
                },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text
                style={{
                  color: active ? theme.textOnAccent : theme.textPrimary,
                  fontWeight: '700',
                  fontSize: 13,
                }}
              >
                {f}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {show('Destinations') && destinations.length > 0 && (
        <View style={{ gap: 8 }}>
          {header('Destinations')}
          {destinations.map(([name, n]) => (
            <Pressable
              key={name}
              onPress={() => onQueryChange(name)}
              style={[
                styles.row,
                { backgroundColor: theme.surfaceElevated, borderColor: theme.borderSubtle },
              ]}
            >
              <Feather name="map-pin" size={18} color={theme.accentElectric} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: theme.textPrimary }]} numberOfLines={1}>
                  {name}
                </Text>
                <Text style={[styles.rowSub, { color: theme.textSecondary }]}>
                  {n} {n === 1 ? 'route' : 'routes'}
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color={theme.textSecondary} />
            </Pressable>
          ))}
        </View>
      )}

      {show('Stages') && stages.length > 0 && (
        <View style={{ gap: 8 }}>
          {header('Stages')}
          {stages.map(([name, s]) => (
            <Pressable
              key={name}
              onPress={() => onQueryChange(name.replace(' (Demo)', ''))}
              style={[
                styles.row,
                { backgroundColor: theme.surfaceElevated, borderColor: theme.borderSubtle },
              ]}
            >
              <Feather name="flag" size={18} color={theme.accentElectric} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: theme.textPrimary }]} numberOfLines={1}>
                  {name}
                </Text>
                <Text style={[styles.rowSub, { color: theme.textSecondary }]} numberOfLines={1}>
                  {s.addr} · {s.n} {s.n === 1 ? 'route' : 'routes'}
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color={theme.textSecondary} />
            </Pressable>
          ))}
        </View>
      )}

      {show('Routes') && results.length > 0 && (
        <View style={{ gap: 8 }}>
          {header('Routes')}
          {results.map((m, i) => (
            <MobileRouteCard
              key={m.route.id}
              index={i}
              match={m}
              variant="result"
              onPress={() => onSelectRoute(m)}
              saved={isSaved(m.route.id)}
              onToggleSave={() => onToggleSave(m.route.id)}
            />
          ))}
        </View>
      )}

      {loading && (
        <View style={{ gap: 8 }}>
          {header('Places · OpenStreetMap')}
          <Skeleton height={58} />
          <Skeleton height={58} />
        </View>
      )}

      {osm && osm.status === 'ok' && osm.places.length > 0 && (
        <View style={{ gap: 8 }}>
          {header('Places · OpenStreetMap (not boarding stages)')}
          {osm.places.slice(0, 5).map(placeRow)}
        </View>
      )}

      {osm && osm.status !== 'ok' && !loading && (
        <FadeIn
          style={[
            styles.empty,
            { backgroundColor: theme.surfaceElevated, borderColor: theme.borderSubtle },
          ]}
        >
          <Feather
            name={osm.status === 'empty' ? 'map' : 'wifi-off'}
            size={20}
            color={theme.textMuted}
          />
          <Text style={[styles.rowTitle, { color: theme.textPrimary }]}>
            {osm.status === 'empty'
              ? 'No places found'
              : 'Search unavailable'}
          </Text>
          <Text style={[styles.rowSub, { color: theme.textSecondary }]}>
            {osm.errorMessage ?? 'Try another place or landmark.'}
          </Text>
          {osm.status !== 'empty' && (
            <Pressable
              onPress={submit}
              style={[styles.retry, { borderColor: theme.accentElectric }]}
              accessibilityRole="button"
            >
              <Text style={{ fontFamily: FONTS.bold, color: theme.textPrimary, fontWeight: '700' }}>
                Try again
              </Text>
            </Pressable>
          )}
        </FadeIn>
      )}

      {nothing && !loading && (
        <View
          style={[
            styles.empty,
            { backgroundColor: theme.surfaceElevated, borderColor: theme.borderSubtle },
          ]}
        >
          <Feather name="compass" size={22} color={theme.textMuted} />
          <Text style={[styles.rowTitle, { color: theme.textPrimary }]}>
            No places found
          </Text>
          <Text style={[styles.rowSub, { color: theme.textSecondary }]}>
            Try another place or landmark.
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
  },
  input: { flex: 1, fontFamily: FONTS.regular, fontSize: 15, paddingVertical: 0 },
  pills: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  section: { fontFamily: FONTS.bold, fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  rowTitle: { fontFamily: FONTS.bold, fontSize: 15, fontWeight: '700' },
  rowSub: { fontFamily: FONTS.regular, fontSize: 12.5, marginTop: 2, lineHeight: 17 },
  retry: {
    marginTop: 6,
    paddingHorizontal: 16,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    alignItems: 'flex-start',
    gap: 6,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
});
