import React from 'react';
import { Clock, Crosshair, User, X } from 'lucide-react';
import {
  Coordinates,
  NAIROBI_CBD_ORIGINS,
  OriginLandmark,
  QUICK_DESTINATION_SUGGESTIONS,
  VehicleType,
} from '@stage/shared';

interface DestinationSearchConsoleProps {
  query: string;
  onQueryChange: (val: string) => void;
  selectedOriginId: string;
  onSelectOrigin: (originId: string) => void;
  vehicleFilter: VehicleType | 'ALL';
  onSelectVehicleFilter: (filter: VehicleType | 'ALL') => void;
  totalResultsCount: number;
  userGpsCoords?: Coordinates | null;
  onRequestGps?: () => void;
  onClearGps?: () => void;
}

const VEHICLE_FILTERS: Array<{ label: string; value: VehicleType | 'ALL' }> = [
  { label: 'All Vehicles', value: 'ALL' },
  { label: 'City Bus', value: 'City Bus (33–60 Seater)' },
  { label: '14-Seater Matatu', value: 'Matatu (14-Seater)' },
];

export const DestinationSearchConsole: React.FC<
  DestinationSearchConsoleProps
> = ({
  query,
  onQueryChange,
  selectedOriginId,
  onSelectOrigin,
  vehicleFilter,
  onSelectVehicleFilter,
  totalResultsCount,
  userGpsCoords,
  onRequestGps,
  onClearGps,
}) => {
  const currentOrigin: OriginLandmark =
    NAIROBI_CBD_ORIGINS.find((o) => o.id === selectedOriginId) ??
    NAIROBI_CBD_ORIGINS[0];

  const isGpsActive = Boolean(userGpsCoords);

  const cycleVehicle = () => {
    const idx = VEHICLE_FILTERS.findIndex((v) => v.value === vehicleFilter);
    const next = VEHICLE_FILTERS[(idx + 1) % VEHICLE_FILTERS.length];
    onSelectVehicleFilter(next.value);
  };

  const currentVehicleLabel =
    VEHICLE_FILTERS.find((v) => v.value === vehicleFilter)?.label ??
    'All Vehicles';

  return (
    <section
      className="search-console"
      aria-label="Plan your stage — Uber-style destination search"
      style={{ padding: 20, gap: 14 }}
    >
      {/* Top Row: Clean Title + Uber-style Pills ("Pickup now ▾", "Vehicle ▾") */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1
            className="search-console__headline"
            style={{ fontSize: '1.35rem', margin: 0 }}
          >
            Plan your stage
          </h1>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--stage-ink-secondary)',
              background: 'var(--stage-surface-secondary)',
              padding: '4px 9px',
              borderRadius: 999,
            }}
          >
            {totalResultsCount} {totalResultsCount === 1 ? 'stage' : 'stages'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="origin-pill"
            onClick={isGpsActive ? onClearGps : onRequestGps}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              borderRadius: 999,
              padding: '7px 13px',
            }}
          >
            <Clock size={13} />
            {isGpsActive ? 'Live GPS now' : `From ${currentOrigin.shortName}`}
          </button>

          <button
            type="button"
            className="origin-pill"
            onClick={cycleVehicle}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              borderRadius: 999,
              padding: '7px 13px',
            }}
          >
            <User size={13} />
            {currentVehicleLabel} ▾
          </button>
        </div>
      </div>

      {/* Signature Uber Dual-Input Box (● Origin / GPS ─── ■ Where to?) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            border: '2px solid var(--stage-ink-primary)',
            borderRadius: 14,
            padding: '8px 14px',
            background: 'var(--stage-surface-primary)',
          }}
        >
          {/* Left Vertical ●───■ Connector */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              width: 14,
            }}
            aria-hidden="true"
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                border: '2.5px solid var(--stage-ink-primary)',
                display: 'inline-block',
              }}
            />
            <span
              style={{
                width: 2,
                height: 22,
                background: 'var(--stage-ink-primary)',
                margin: '2px 0',
              }}
            />
            <span
              style={{
                width: 9,
                height: 9,
                background: 'var(--stage-ink-primary)',
                display: 'inline-block',
              }}
            />
          </div>

          {/* Right 2-Row Stack */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {/* Top Row: User Geological Position / CBD Landmark */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBottom: 6,
                borderBottom: '1px solid var(--stage-border-subtle)',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>
                {isGpsActive && userGpsCoords
                  ? `My Live GPS (${userGpsCoords.lat.toFixed(4)}, ${userGpsCoords.lng.toFixed(4)})`
                  : `${currentOrigin.name}, Nairobi CBD`}
              </span>

              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {NAIROBI_CBD_ORIGINS.map((origin) => {
                  const active = !isGpsActive && origin.id === currentOrigin.id;
                  return (
                    <button
                      key={origin.id}
                      type="button"
                      onClick={() => {
                        onClearGps?.();
                        onSelectOrigin(origin.id);
                      }}
                      style={{
                        border: 'none',
                        borderRadius: 999,
                        padding: '3px 8px',
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                        background: active
                          ? 'var(--stage-ink-primary)'
                          : 'var(--stage-surface-secondary)',
                        color: active
                          ? 'var(--stage-surface-primary)'
                          : 'var(--stage-ink-secondary)',
                      }}
                    >
                      {origin.shortName}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bottom Row: Focused "Where to?" Input */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                paddingTop: 6,
                gap: 8,
              }}
            >
              <input
                type="search"
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder="Where to? (e.g. Kikuyu, Westlands, Ngong, JKIA, 105)..."
                aria-label="Where to? Search destination or route number"
                style={{
                  flex: 1,
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  fontSize: 15.5,
                  fontWeight: 700,
                  color: 'var(--stage-ink-primary)',
                }}
              />
              {query.trim().length > 0 && (
                <button
                  type="button"
                  onClick={() => onQueryChange('')}
                  className="search-box__clear"
                  aria-label="Clear search"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Circular GPS Button (matches the right circular button in Uber screenshot) */}
        {onRequestGps && (
          <button
            type="button"
            onClick={isGpsActive ? onClearGps : onRequestGps}
            title="Use my live geological GPS position"
            aria-label="Use my live geological GPS position"
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              border: '1px solid var(--stage-border-subtle)',
              background: isGpsActive
                ? '#00B84C'
                : 'var(--stage-surface-secondary)',
              color: isGpsActive ? '#FFFFFF' : 'var(--stage-ink-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <Crosshair size={18} />
          </button>
        )}
      </div>

      {/* Compact Quick Destination Chips */}
      <div
        className="quick-destinations"
        role="group"
        aria-label="Quick destination suggestions"
      >
        {QUICK_DESTINATION_SUGGESTIONS.map((suggestion) => {
          const isSelected =
            query.trim().toLowerCase() === suggestion.toLowerCase();
          return (
            <button
              key={suggestion}
              type="button"
              className={`dest-chip ${isSelected ? 'dest-chip--active' : ''}`}
              onClick={() => onQueryChange(isSelected ? '' : suggestion)}
            >
              {suggestion}
            </button>
          );
        })}
      </div>
    </section>
  );
};
