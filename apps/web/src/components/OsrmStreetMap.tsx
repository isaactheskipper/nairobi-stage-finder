import React, { useEffect, useMemo, useState } from 'react';
import { Crosshair, ExternalLink, Layers } from 'lucide-react';
import {
  BoardingStage,
  buildGoogleMapsWalkingUrl,
  buildOpenFreeMapHtml,
  fetchOsrmWalkingRoute,
  getOpenFreeMapStyleUrl,
  NAIROBI_DEMO_STAGES,
  OpenFreeMapStylePreset,
  OriginLandmark,
  OsrmResolvedWalkRoute,
  STAGE_MAP_CONFIG,
  WalkingRoute,
} from '@stage/shared';

interface OsrmStreetMapProps {
  origin: OriginLandmark;
  selectedStage: BoardingStage;
  walking: WalkingRoute;
  onSelectStageById?: (stageId: string) => void;
  onRequestLiveGps?: () => void;
  isLiveGpsActive?: boolean;
}

export const OsrmStreetMap: React.FC<OsrmStreetMapProps> = ({
  origin,
  selectedStage,
  walking,
  onSelectStageById,
  onRequestLiveGps,
  isLiveGpsActive = false,
}) => {
  const [osrmRoute, setOsrmRoute] = useState<OsrmResolvedWalkRoute | null>(
    null
  );
  const [loadingOsrm, setLoadingOsrm] = useState<boolean>(false);
  const [stylePreset, setStylePreset] =
    useState<OpenFreeMapStylePreset>('liberty');

  useEffect(() => {
    let cancelled = false;
    setLoadingOsrm(true);
    fetchOsrmWalkingRoute(
      origin.coordinates,
      selectedStage.coordinates,
      selectedStage.name,
      walking.steps
    )
      .then((res) => {
        if (!cancelled) {
          setOsrmRoute(res);
          setLoadingOsrm(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadingOsrm(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    origin.coordinates.lat,
    origin.coordinates.lng,
    selectedStage.coordinates.lat,
    selectedStage.coordinates.lng,
    selectedStage.name,
    walking.steps,
  ]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (typeof event.data !== 'string') return;
      try {
        const parsed = JSON.parse(event.data) as {
          type?: string;
          stageId?: string;
        };
        if (parsed.type === 'SELECT_STAGE' && parsed.stageId) {
          onSelectStageById?.(parsed.stageId);
        }
      } catch {
        // Ignore unrelated postMessage events
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onSelectStageById]);

  const activeMinutes =
    osrmRoute?.estimatedMinutes ?? walking.estimatedMinutes;
  const activeDistance =
    osrmRoute?.totalDistanceMeters ?? walking.totalDistanceMeters;
  const formattedDistance =
    activeDistance >= 1000
      ? `${(activeDistance / 1000).toFixed(2)} km`
      : `${activeDistance} m`;

  const styleUrl = useMemo(
    () => getOpenFreeMapStyleUrl(stylePreset),
    [stylePreset]
  );

  const mapHtml = useMemo(
    () =>
      buildOpenFreeMapHtml({
        styleUrl,
        originCoords: origin.coordinates,
        originLabel: isLiveGpsActive ? 'My GPS' : origin.shortName,
        selectedStage,
        allStages: NAIROBI_DEMO_STAGES,
        routePolyline:
          osrmRoute && osrmRoute.polyline.length >= 2
            ? osrmRoute.polyline
            : [origin.coordinates, selectedStage.coordinates],
        activeMinutes,
        formattedDistance,
        routeNumber: 'CBD',
        isDark: stylePreset === 'dark',
      }),
    [
      styleUrl,
      origin.coordinates,
      origin.shortName,
      isLiveGpsActive,
      selectedStage,
      osrmRoute,
      activeMinutes,
      formattedDistance,
      stylePreset,
    ]
  );

  const cyclePreset = () => {
    setStylePreset((prev) =>
      prev === 'liberty' ? 'positron' : prev === 'positron' ? 'dark' : 'liberty'
    );
  };

  const googleMapsUrl = buildGoogleMapsWalkingUrl(
    origin.coordinates,
    selectedStage.coordinates,
    selectedStage.name
  );

  return (
    <div
      className="spatial-card"
      style={{
        overflow: 'hidden',
        position: 'relative',
        borderRadius: 20,
        border: '1px solid var(--stage-border-subtle)',
      }}
    >
      {/* Top OSRM & OpenFreeMap Telemetry Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          background: 'var(--stage-surface-elevated)',
          borderBottom: '1px solid var(--stage-border-subtle)',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: '50%',
              background: '#00B84C',
              display: 'inline-block',
            }}
          />
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11.5,
              fontWeight: 800,
            }}
          >
            {loadingOsrm
              ? 'ROUTING VIA PROJECT-OSRM…'
              : osrmRoute?.source === 'osrm-live'
              ? `OPENFREEMAP + OSRM LIVE ROUTE · ${activeMinutes} MIN (${formattedDistance})`
              : `OPENFREEMAP + CBD GRID · ${activeMinutes} MIN (${formattedDistance})`}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={cyclePreset}
            className="origin-pill"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <Layers size={13} />
            Style: {stylePreset}
          </button>

          {onRequestLiveGps && (
            <button
              type="button"
              onClick={onRequestLiveGps}
              className="origin-pill"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                background: isLiveGpsActive
                  ? '#00B84C'
                  : 'var(--stage-surface-secondary)',
                color: isLiveGpsActive ? '#FFFFFF' : 'var(--stage-ink-primary)',
              }}
            >
              <Crosshair size={13} />
              {isLiveGpsActive ? 'GPS Active' : 'Use My GPS'}
            </button>
          )}
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="origin-pill"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              textDecoration: 'none',
            }}
          >
            Google Maps
            <ExternalLink size={12} />
          </a>
        </div>
      </div>

      {/* Interactive OpenFreeMap + MapLibre GL JS Viewport */}
      <div
        style={{
          position: 'relative',
          height: 320,
          background: stylePreset === 'dark' ? '#0B0F0D' : '#E5ECF0',
          overflow: 'hidden',
        }}
      >
        <iframe
          key={`web-ofm-${stylePreset}-${selectedStage.id}-${origin.coordinates.lat.toFixed(4)}`}
          title={`OpenFreeMap Nairobi stage map for ${selectedStage.name}`}
          srcDoc={mapHtml}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            display: 'block',
          }}
        />

        {/* Visible Map Attribution */}
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            left: 10,
            zIndex: 25,
            background:
              stylePreset === 'dark'
                ? 'rgba(13, 19, 16, 0.88)'
                : 'rgba(255, 255, 255, 0.92)',
            color: stylePreset === 'dark' ? '#E2E8E4' : '#1E2622',
            fontFamily: 'var(--font-mono)',
            fontSize: 9.5,
            fontWeight: 700,
            padding: '3px 8px',
            borderRadius: 6,
            border: '1px solid rgba(128,128,128,0.25)',
            pointerEvents: 'none',
          }}
        >
          {STAGE_MAP_CONFIG.attributionText}
        </div>
      </div>
    </div>
  );
};
