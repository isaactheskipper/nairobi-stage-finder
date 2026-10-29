import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowUpRight,
  Bookmark,
  Bus,
  Footprints,
  MapPin,
  Navigation,
} from 'lucide-react';
import { SearchMatchResult } from '@stage/shared';

interface RouteResultsListProps {
  results: SearchMatchResult[];
  selectedRouteId: string | null;
  onSelectRoute: (result: SearchMatchResult) => void;
  onInspectStage: (result: SearchMatchResult) => void;
  onStartWalking: (result: SearchMatchResult) => void;
  onResetSearch: () => void;
  isRouteSaved?: (routeId: string) => boolean;
  onToggleSaveRoute?: (routeId: string) => void;
}

export const RouteResultsList: React.FC<RouteResultsListProps> = ({
  results,
  selectedRouteId,
  onSelectRoute,
  onInspectStage,
  onStartWalking,
  onResetSearch,
  isRouteSaved,
  onToggleSaveRoute,
}) => {
  const shouldReduceMotion = useReducedMotion();

  if (results.length === 0) {
    return (
      <div className="detail-sheet" role="region" aria-label="No matching routes">
        <div className="detail-sheet__title">
          No demo route matches that search yet
        </div>
        <p className="detail-sheet__subtitle">
          Try searching for a major Nairobi corridor or town such as Kikuyu,
          Westlands, Karen, Rongai, Thika Road, Embakasi, or JKIA Airport.
        </p>
        <div>
          <button
            type="button"
            className="btn-stage-action"
            onClick={onResetSearch}
          >
            Show all demo routes
          </button>
        </div>
      </div>
    );
  }

  return (
    <section aria-label="Matching Routes and Boarding Stages">
      <div className="section-header" style={{ marginBottom: 12 }}>
        <h2 className="section-header__title">
          <Bus size={18} color="var(--stage-green-bright, #1ED777)" />
          Recommended Boarding Stages &amp; Routes
        </h2>
        <span className="section-header__count">
          {results.length} {results.length === 1 ? 'MATCH' : 'MATCHES'}
        </span>
      </div>

      <ul className="route-list">
        {results.map((item, idx) => {
          const isSelected =
            selectedRouteId !== null && item.route.id === selectedRouteId;
          const stageCleanName = item.stage.name.replace(' (Demo)', '');

          return (
            <motion.li
              key={item.route.id}
              initial={
                shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 10 }
              }
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: shouldReduceMotion ? 0 : 0.22,
                delay: shouldReduceMotion ? 0 : idx * 0.03,
              }}
              className={`route-card ${
                isSelected ? 'route-card--selected' : ''
              }`}
              onClick={() => onSelectRoute(item)}
            >
              <div className="route-card__top">
                <div className="route-card__identity">
                  {/* Route Number Square Badge matching Mobile RouteNumberBadge */}
                  <div className="route-badge-square" aria-label={`Route ${item.route.routeNumber}`}>
                    <span className="route-badge-square__number">
                      {item.route.routeNumber}
                    </span>
                  </div>

                  <div className="route-card__headers">
                    {/* Prominent BOARD HERE callout matching MobileRouteCard */}
                    <div className="route-card__board-callout">
                      <MapPin size={12} color="var(--stage-accent-electric, #1ED777)" />
                      <span className="route-card__board-label">BOARD HERE</span>
                      <span className="route-card__board-place">{stageCleanName}</span>
                    </div>

                    <h3 className="route-card__title">
                      {item.route.destinationName}
                    </h3>

                    <p className="route-card__corridor">
                      {item.origin.shortName} → {item.route.destinationName} · via {item.route.corridorName}
                    </p>
                  </div>
                </div>

                <div className="route-card__top-pills">
                  <span
                    className="route-card__walk-pill"
                    title={`Walk ${item.walking.totalDistanceMeters}m ${item.walking.compassBearing} from ${item.origin.shortName}`}
                  >
                    <Footprints size={13} />
                    {item.walking.estimatedMinutes} min walk ({item.walking.totalDistanceMeters}m)
                  </span>
                  <span className="verification-pill-compact" title="Unverified demo route data">
                    <AlertTriangle size={10} />
                    Needs verification
                  </span>
                </div>
              </div>

              {/* Landmark strip */}
              <div className="route-card__landmark-strip">
                <MapPin size={13} color="var(--stage-accent-electric, #1ED777)" />
                <span className="route-card__landmark-text">
                  Board at {stageCleanName} · {item.stage.streetAddress} ({item.stage.nearestLandmark})
                </span>
              </div>

              <div className="route-card__meta-row">
                <div className="route-card__meta-tags">
                  <span className="meta-tag">{item.route.vehicleType}</span>
                  <span className="meta-tag">
                    Off-peak {item.route.estimatedFareKes.offPeak} · Peak{' '}
                    {item.route.estimatedFareKes.peak}
                  </span>
                  <span className="meta-tag">
                    Operators: {item.route.saccoExamples.slice(0, 2).join(' · ')}
                  </span>
                </div>

                <div
                  className="route-card__actions"
                  onClick={(e) => e.stopPropagation()}
                >
                  {onToggleSaveRoute && (
                    <button
                      type="button"
                      className="btn-stage-secondary"
                      onClick={() => onToggleSaveRoute(item.route.id)}
                      aria-label={
                        isRouteSaved?.(item.route.id)
                          ? 'Remove from saved'
                          : 'Save route'
                      }
                      style={{
                        color: isRouteSaved?.(item.route.id)
                          ? 'var(--stage-accent-electric)'
                          : undefined,
                      }}
                    >
                      <Bookmark
                        size={13}
                        fill={
                          isRouteSaved?.(item.route.id)
                            ? 'currentColor'
                            : 'none'
                        }
                      />
                      {isRouteSaved?.(item.route.id) ? 'Saved' : 'Save'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-stage-secondary"
                    onClick={() => onInspectStage(item)}
                  >
                    Stage Details
                    <ArrowUpRight size={13} />
                  </button>
                  <button
                    type="button"
                    className="btn-stage-action"
                    onClick={() => onStartWalking(item)}
                  >
                    <Navigation size={13} />
                    Walk to Stage
                  </button>
                </div>
              </div>
            </motion.li>
          );
        })}
      </ul>
    </section>
  );
};

