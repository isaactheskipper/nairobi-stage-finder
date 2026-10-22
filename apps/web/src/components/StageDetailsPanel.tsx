import React from 'react';
import {
  Clock,
  ExternalLink,
  Info,
  MapPin,
  Navigation,
  ShieldCheck,
  Users,
} from 'lucide-react';
import {
  buildGoogleMapsWalkingUrl,
  SearchMatchResult,
} from '@stage/shared';

interface StageDetailsPanelProps {
  selectedMatch: SearchMatchResult;
  onStartWalkingNav: () => void;
}

export const StageDetailsPanel: React.FC<StageDetailsPanelProps> = ({
  selectedMatch,
  onStartWalkingNav,
}) => {
  const { stage, route, walking, origin } = selectedMatch;
  const googleMapsUrl = buildGoogleMapsWalkingUrl(
    origin.coordinates,
    stage.coordinates,
    stage.name
  );

  return (
    <section
      className="detail-sheet"
      aria-label={`Boarding Stage Details for ${stage.name}`}
    >
      <div className="detail-sheet__header">
        <div>
          <span className="detail-sheet__code">
            STAGE CODE: {stage.code} · ROUTE {route.routeNumber}
          </span>
          <h2 className="detail-sheet__title">{stage.name}</h2>
          <p className="detail-sheet__subtitle">
            <MapPin
              size={14}
              color="#00B84C"
              style={{ verticalAlign: 'text-bottom', marginRight: 4 }}
            />
            {stage.streetAddress} — {stage.nearestLandmark}
          </p>
        </div>

        <button
          type="button"
          className="btn-stage-action"
          onClick={onStartWalkingNav}
        >
          <Navigation size={14} />
          Start Walking Guide
        </button>
      </div>

      <div className="detail-grid">
        <div className="detail-stat">
          <div className="detail-stat__label">
            Walking Distance from {origin.shortName}
          </div>
          <div className="detail-stat__value">
            {walking.totalDistanceMeters}m ({walking.estimatedMinutes} min ·{' '}
            {walking.compassBearing})
          </div>
        </div>

        <div className="detail-stat">
          <div className="detail-stat__label">Estimated Demo Fare</div>
          <div className="detail-stat__value">
            {route.estimatedFareKes.offPeak} (Peak {route.estimatedFareKes.peak})
          </div>
        </div>

        <div className="detail-stat">
          <div className="detail-stat__label">
            <Clock
              size={12}
              style={{ verticalAlign: 'middle', marginRight: 4 }}
            />
            Typical Stage Hours
          </div>
          <div className="detail-stat__value">{stage.operatingHours}</div>
        </div>

        <div className="detail-stat">
          <div className="detail-stat__label">
            <Users
              size={12}
              style={{ verticalAlign: 'middle', marginRight: 4 }}
            />
            Bay Turnover &amp; Shelter
          </div>
          <div className="detail-stat__value">
            {stage.crowdLevelTypical} ·{' '}
            {stage.shelterAvailable ? 'Covered Shelter' : 'Open Curbside Bay'}
          </div>
        </div>
      </div>

      <div className="detail-callout">
        <div className="detail-callout__title">
          Physical Boarding Bay &amp; Queue Cue
        </div>
        <p>{stage.bayDescription}</p>
        <p style={{ marginTop: 6, fontWeight: 600 }}>{route.boardingTip}</p>
      </div>

      <div
        className="detail-callout"
        style={{ borderLeftColor: 'var(--stage-amber-border)' }}
      >
        <div className="detail-callout__title">
          <ShieldCheck
            size={14}
            style={{ verticalAlign: 'text-bottom', marginRight: 4 }}
          />
          Street Safety, Lighting &amp; Verification Note
        </div>
        <p>{stage.lightingAndSafetyNote}</p>
        <p
          style={{
            marginTop: 6,
            fontSize: 12,
            color: 'var(--stage-ink-muted)',
          }}
        >
          <Info
            size={12}
            style={{ verticalAlign: 'middle', marginRight: 4 }}
          />
          {route.verificationNote}
        </p>
      </div>

      <div>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--stage-ink-secondary)',
            marginBottom: 6,
          }}
        >
          Key Stops Along {route.corridorName}:
        </div>
        <div className="route-card__meta-tags">
          {route.popularStops.map((stop) => (
            <span key={stop} className="meta-tag">
              {stop}
            </span>
          ))}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          paddingTop: 8,
          borderTop: '1px solid var(--stage-border-subtle)',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--stage-font-mono)',
            fontSize: 11.5,
            color: 'var(--stage-ink-muted)',
          }}
        >
          GPS: {stage.coordinates.lat.toFixed(4)},{' '}
          {stage.coordinates.lng.toFixed(4)}
        </span>

        <a
          href={googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-gmaps"
        >
          Open Stage in Google Maps
          <ExternalLink size={14} />
        </a>
      </div>
    </section>
  );
};

