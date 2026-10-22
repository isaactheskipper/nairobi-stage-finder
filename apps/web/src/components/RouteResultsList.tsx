import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowUpRight,
  Bus,
  Footprints,
  MapPin,
  Navigation,
  ShieldAlert,
} from 'lucide-react';
import { SearchMatchResult } from '@stage/shared';

interface RouteResultsListProps {
  results: SearchMatchResult[];
  selectedRouteId: string;
  onSelectRoute: (result: SearchMatchResult) => void;
  onInspectStage: (result: SearchMatchResult) => void;
  onStartWalking: (result: SearchMatchResult) => void;
  onResetSearch: () => void;
}

export const RouteResultsList: React.FC<RouteResultsListProps> = ({
  results,
  selectedRouteId,
  onSelectRoute,
  onInspectStage,
  onStartWalking,
  onResetSearch,
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
          <Bus size={18} color="#00B84C" />
          Recommended Boarding Stages &amp; Routes
        </h2>
        <span className="section-header__count">
          {results.length} {results.length === 1 ? 'MATCH' : 'MATCHES'}
        </span>
      </div>

      <ul className="route-list">
        {results.map((item, idx) => {
          const isSelected = item.route.id === selectedRouteId;
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
                  <div className="route-badge" aria-label={`Route ${item.route.routeNumber}`}>
                    <span className="route-badge__prefix">ROUTE</span>
                    <span className="route-badge__number">
                      {item.route.routeNumber}
                    </span>
                  </div>
                  <div>
                    <h3 className="route-card__title">
                      {item.route.destinationName}
                    </h3>
                    <p className="route-card__corridor">
                      {item.matchReason} · via {item.route.corridorName}
                    </p>
                  </div>
                </div>

                <span
                  className="route-card__walk-pill"
                  title={`Walk ${item.walking.totalDistanceMeters}m ${item.walking.compassBearing} from ${item.origin.shortName}`}
                >
                  <Footprints size={14} />
                  {item.walking.estimatedMinutes} min ({item.walking.totalDistanceMeters}m{' '}
                  {item.walking.compassBearing})
                </span>
              </div>

              <div className="route-card__stage-box">
                <div className="route-card__stage-info">
                  <MapPin size={18} color="#00B84C" />
                  <div>
                    <div className="route-card__stage-name">
                      Board at: {item.stage.name}
                    </div>
                    <div className="route-card__stage-street">
                      {item.stage.streetAddress} ({item.stage.nearestLandmark})
                    </div>
                  </div>
                </div>

                <span className="meta-tag meta-tag--demo">
                  <ShieldAlert size={12} />
                  UNVERIFIED DEMO
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
                    SACCOs: {item.route.saccoExamples.join(', ')}
                  </span>
                </div>

                <div
                  className="route-card__actions"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    className="btn-stage-secondary"
                    onClick={() => onInspectStage(item)}
                  >
                    Stage Details
                    <ArrowUpRight size={14} />
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

