import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  ScrollView,
  StatusBar,
  Text,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import {
  getOriginById,
  NAIROBI_CBD_ORIGINS,
  NAIROBI_DEMO_ROUTES,
  SearchMatchResult,
  searchRoutesAndStages,
  StageViewMode,
} from '@stage/shared';
import { StageThemeProvider, useStageTheme } from './src/theme/themeContext';
import { useUserLocation } from './src/hooks/useUserLocation';
import { useSavedRoutes } from './src/hooks/useSavedRoutes';
import { DemoDataNoticeBar, MobileHeader } from './src/components/MobileHeader';
import { MobileLandingScreen } from './src/components/MobileLandingScreen';
import { MobileHomeScreen } from './src/components/MobileHomeScreen';
import { MobileSearchCard } from './src/components/MobileSearchCard';
import { MobileRouteCard } from './src/components/MobileRouteCard';
import { MobileStageDetailAndNav } from './src/components/MobileStageDetailAndNav';
import { MobileMapScreen } from './src/components/MobileMapScreen';
import { MobileSavedScreen } from './src/components/MobileSavedScreen';
import { BottomNavBar } from './src/components/BottomNavBar';
import { OriginPicker } from './src/components/OriginPicker';
import { FadeIn } from './src/components/Motion';
import { TYPE } from './src/theme/tokens';

function StageMobileShell() {
  const { theme } = useStageTheme();
  const insets = useSafeAreaInsets();

  const [showLanding, setShowLanding] = useState(true);
  const [query, setQuery] = useState('');
  const [selectedOriginId, setSelectedOriginId] = useState(
    NAIROBI_CBD_ORIGINS[0].id
  );
  const [selectedRouteId, setSelectedRouteId] = useState(
    NAIROBI_DEMO_ROUTES[0].id
  );
  const [activeMode, setActiveMode] = useState<StageViewMode>('overview');
  const [prevMode, setPrevMode] = useState<StageViewMode>('overview');

  const {
    status: locationStatus,
    coordinates: userCoords,
    statusMessage: locationMessage,
    permissionBlocked,
    requestCurrentLocation,
    clearCurrentLocation,
    openSystemSettings,
  } = useUserLocation();
  const [showOriginPicker, setShowOriginPicker] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const { savedRouteIds, isRouteSaved, toggleSaveRoute } = useSavedRoutes();

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [activeMode]);

  const go = useCallback(
    (next: StageViewMode) => {
      setPrevMode(activeMode);
      setActiveMode(next);
    },
    [activeMode]
  );

  const results = useMemo(
    () => searchRoutesAndStages(query, selectedOriginId, 'ALL', userCoords),
    [query, selectedOriginId, userCoords]
  );
  const allMatches = useMemo(
    () => searchRoutesAndStages('', selectedOriginId, 'ALL', userCoords),
    [selectedOriginId, userCoords]
  );
  const activeMatch: SearchMatchResult =
    allMatches.find((m) => m.route.id === selectedRouteId) ?? allMatches[0];
  const savedMatches = useMemo(
    () => allMatches.filter((m) => savedRouteIds.includes(m.route.id)),
    [allMatches, savedRouteIds]
  );

  const isGpsActive = locationStatus === 'granted' && userCoords !== null;
  const origin = getOriginById(selectedOriginId);

  const handleBack = useCallback(() => {
    if (showLanding) return false;
    if (activeMode === 'walking-nav') {
      setActiveMode('stage-details');
      return true;
    }
    if (activeMode === 'stage-details') {
      setActiveMode(prevMode === 'stage-details' ? 'overview' : prevMode);
      return true;
    }
    if (activeMode !== 'overview') {
      setActiveMode('overview');
      return true;
    }
    return false;
  }, [showLanding, activeMode, prevMode]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      return handleBack();
    });
    return () => sub.remove();
  }, [handleBack]);

  const canGoBack = !showLanding && activeMode !== 'overview';

  // Scoped left-edge swipe gesture for returning to the previous screen
  const edgeSwipeResponder = useMemo(() => {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        if (!canGoBack) return false;
        // Must start within 26px of the left screen edge
        const startX = evt.nativeEvent.pageX - gestureState.dx;
        const startedAtEdge = startX <= 26;
        return (
          startedAtEdge &&
          gestureState.dx > 15 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.5
        );
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx > 45 || (gestureState.dx > 20 && gestureState.vx > 0.4)) {
          handleBack();
        }
      },
    });
  }, [canGoBack, handleBack]);

  const openRoute = (m: SearchMatchResult) => {
    setSelectedRouteId(m.route.id);
    go('stage-details');
  };

  if (showLanding) {
    return <MobileLandingScreen onEnterApp={() => setShowLanding(false)} />;
  }

  const gpsProblem =
    locationStatus === 'denied' ||
    locationStatus === 'disabled' ||
    locationStatus === 'error'
      ? locationMessage
      : undefined;
  const picker = (
    <OriginPicker
      visible={showOriginPicker}
      onClose={() => setShowOriginPicker(false)}
      selectedOriginId={selectedOriginId}
      usingGps={isGpsActive}
      gpsLoading={locationStatus === 'loading'}
      gpsProblem={gpsProblem}
      permissionBlocked={permissionBlocked}
      onOpenSettings={openSystemSettings}
      onUseGps={async () => {
        const fix = await requestCurrentLocation();
        if (fix) setShowOriginPicker(false);
      }}
      onSelectOrigin={(id) => {
        clearCurrentLocation();
        setSelectedOriginId(id);
        setShowOriginPicker(false);
      }}
    />
  );

  const barStyle = theme.isDark ? 'light-content' : 'dark-content';

  if (activeMode === 'walking-nav') {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <StatusBar barStyle={barStyle} backgroundColor={theme.background} />
        <MobileMapScreen
          selectedMatch={activeMatch}
          userCoords={userCoords}
          onBack={() => setActiveMode('stage-details')}
          locationStatus={locationStatus}
          locationMessage={locationMessage}
          permissionBlocked={permissionBlocked}
          onOpenSettings={openSystemSettings}
          onChangeOrigin={() => setShowOriginPicker(true)}
          onRequestLocation={() => {
            requestCurrentLocation();
          }}
        />
        {picker}
        {canGoBack && (
          <View
            {...edgeSwipeResponder.panHandlers}
            style={{
              position: 'absolute',
              top: insets.top,
              bottom: insets.bottom,
              left: 0,
              width: 24,
              zIndex: 9999,
            }}
          />
        )}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: insets.top }}>
      <StatusBar barStyle={barStyle} backgroundColor={theme.background} />

      {activeMode === 'overview' && (
        <MobileHeader
          originShortName={origin.shortName}
          isUsingGps={isGpsActive}
          onPressLocation={() => setShowOriginPicker(true)}
        />
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <FadeIn key={activeMode}>
          {activeMode === 'overview' && (
            <MobileHomeScreen
              query={query}
              onQueryChange={setQuery}
              onSubmitSearch={() => go('search')}
              allMatches={allMatches}
              nearby={allMatches.slice(0, 3)}
              onSelectDestination={(name) => {
                setQuery(name);
                go('search');
              }}
              onSelectRoute={openRoute}
              onSeeAll={() => go('results')}
              isGpsActive={isGpsActive}
              isGpsLoading={locationStatus === 'loading'}
              gpsMessage={locationMessage}
              gpsFailed={
                locationStatus === 'denied' ||
                locationStatus === 'disabled' ||
                locationStatus === 'error'
              }
              onUseLocation={requestCurrentLocation}
              isSaved={isRouteSaved}
              onToggleSave={toggleSaveRoute}
            />
          )}

          {activeMode === 'search' && (
            <MobileSearchCard
              query={query}
              onQueryChange={setQuery}
              results={results}
              selectedOriginId={selectedOriginId}
              userCoords={userCoords}
              onSelectRoute={openRoute}
              onBack={() => setActiveMode('overview')}
              isSaved={isRouteSaved}
              onToggleSave={toggleSaveRoute}
            />
          )}

          {activeMode === 'results' && (
            <View style={{ gap: 10 }}>
              <Text style={[TYPE.title, { color: theme.textPrimary }]}>
                All routes
              </Text>
              {allMatches.map((m, i) => (
                <MobileRouteCard
                  key={m.route.id}
                  index={i}
                  selected={m.route.id === selectedRouteId}
                  match={m}
                  variant="result"
                  onPress={() => openRoute(m)}
                  saved={isRouteSaved(m.route.id)}
                  onToggleSave={() => toggleSaveRoute(m.route.id)}
                />
              ))}
            </View>
          )}

          {activeMode === 'saved' && (
            <MobileSavedScreen
              matches={savedMatches}
              onSelectRoute={openRoute}
              onToggleSave={toggleSaveRoute}
            />
          )}

          {activeMode === 'stage-details' && activeMatch && (
            <MobileStageDetailAndNav
              selectedMatch={activeMatch}
              onOpenMapAndDirections={() => go('walking-nav')}
              onBack={() =>
                setActiveMode(prevMode === 'stage-details' ? 'overview' : prevMode)
              }
              saved={isRouteSaved(activeMatch.route.id)}
              onToggleSave={() => toggleSaveRoute(activeMatch.route.id)}
            />
          )}

          </FadeIn>
          <DemoDataNoticeBar />
        </ScrollView>
      </KeyboardAvoidingView>

      {canGoBack && (
        <View
          {...edgeSwipeResponder.panHandlers}
          style={{
            position: 'absolute',
            top: insets.top,
            bottom: insets.bottom,
            left: 0,
            width: 24,
            zIndex: 9999,
          }}
        />
      )}
      {picker}
      <BottomNavBar
        activeMode={activeMode}
        onSelectMode={go}
        bottomInset={insets.bottom}
      />
    </View>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <StageThemeProvider>
        <StageMobileShell />
      </StageThemeProvider>
    </SafeAreaProvider>
  );
}
