import {
  CURATED_WALKING_ROUTES,
  NAIROBI_CBD_ORIGINS,
  NAIROBI_DEMO_ROUTES,
  NAIROBI_DEMO_STAGES,
} from '../data/nairobiDemoData';
import {
  BoardingStage,
  Coordinates,
  OriginLandmark,
  SearchMatchResult,
  TransitRoute,
  VehicleType,
  WalkingRoute,
} from '../types/transport';

const COMPASS_SECTORS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

export function calculateDistanceMeters(a: Coordinates, b: Coordinates): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  // Multiply straight-line distance by 1.28 street-grid factor for realistic CBD walking
  return Math.max(25, Math.round(R * c * 1.28));
}

export function calculateCompassDegrees(a: Coordinates, b: Coordinates): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return Math.round((toDeg(Math.atan2(y, x)) + 360) % 360);
}

export function degreesToCompassLabel(degrees: number): string {
  const idx = Math.round(degrees / 22.5) % 16;
  return COMPASS_SECTORS[idx] ?? 'N';
}

export function getOriginById(originId: string): OriginLandmark {
  return (
    NAIROBI_CBD_ORIGINS.find((o) => o.id === originId) ?? NAIROBI_CBD_ORIGINS[0]
  );
}

export function getStageById(stageId: string): BoardingStage {
  return (
    NAIROBI_DEMO_STAGES.find((s) => s.id === stageId) ?? NAIROBI_DEMO_STAGES[0]
  );
}

export function getWalkingRoute(originId: string, stageId: string): WalkingRoute {
  const curated = CURATED_WALKING_ROUTES.find(
    (w) => w.originId === originId && w.stageId === stageId
  );
  if (curated) {
    return curated;
  }

  const origin = getOriginById(originId);
  const stage = getStageById(stageId);
  const totalDistanceMeters = calculateDistanceMeters(
    origin.coordinates,
    stage.coordinates
  );
  const compassDegrees = calculateCompassDegrees(
    origin.coordinates,
    stage.coordinates
  );
  const compassBearing = degreesToCompassLabel(compassDegrees);
  const estimatedMinutes = Math.max(1, Math.round(totalDistanceMeters / 72));

  const step1Dist = Math.round(totalDistanceMeters * 0.35);
  const step2Dist = Math.round(totalDistanceMeters * 0.45);
  const step3Dist = Math.max(15, totalDistanceMeters - step1Dist - step2Dist);

  return {
    originId: origin.id,
    stageId: stage.id,
    totalDistanceMeters,
    estimatedMinutes,
    compassBearing,
    compassDegrees,
    summary: `${estimatedMinutes}-minute walk (${totalDistanceMeters}m ${compassBearing}) from ${origin.shortName} to ${stage.name}.`,
    steps: [
      {
        stepNumber: 1,
        instruction: `Start at ${origin.shortName} (${origin.streetContext}) and orient ${compassBearing}.`,
        streetName: origin.streetContext,
        landmarkCue: `Depart from ${origin.name}`,
        distanceMeters: step1Dist,
        durationSeconds: Math.round(step1Dist / 1.2),
        compassBearing,
        turnDirection: 'start',
      },
      {
        stepNumber: 2,
        instruction: `Walk along the main pedestrian walkway toward ${stage.streetAddress}.`,
        streetName: stage.streetAddress,
        landmarkCue: `Approach ${stage.nearestLandmark}`,
        distanceMeters: step2Dist,
        durationSeconds: Math.round(step2Dist / 1.2),
        compassBearing,
        turnDirection: 'straight',
      },
      {
        stepNumber: 3,
        instruction: `Locate the ${stage.name} boarding bay and verify your route number before boarding.`,
        streetName: stage.name,
        landmarkCue: stage.signageCue,
        distanceMeters: step3Dist,
        durationSeconds: Math.round(step3Dist / 1.2),
        compassBearing,
        turnDirection: 'arrive',
      },
    ],
  };
}

export function getWalkingRouteFromCoordinates(
  userCoords: Coordinates,
  stageId: string,
  originLabel = 'Current GPS Location'
): WalkingRoute {
  const stage = getStageById(stageId);
  const totalDistanceMeters = calculateDistanceMeters(
    userCoords,
    stage.coordinates
  );
  const compassDegrees = calculateCompassDegrees(
    userCoords,
    stage.coordinates
  );
  const compassBearing = degreesToCompassLabel(compassDegrees);
  const estimatedMinutes = Math.max(1, Math.round(totalDistanceMeters / 72));

  const step1Dist = Math.round(totalDistanceMeters * 0.35);
  const step2Dist = Math.round(totalDistanceMeters * 0.45);
  const step3Dist = Math.max(15, totalDistanceMeters - step1Dist - step2Dist);

  return {
    originId: 'origin-gps',
    stageId: stage.id,
    totalDistanceMeters,
    estimatedMinutes,
    compassBearing,
    compassDegrees,
    summary: `${estimatedMinutes}-minute walk (${totalDistanceMeters}m ${compassBearing}) from ${originLabel} to ${stage.name}.`,
    steps: [
      {
        stepNumber: 1,
        instruction: `Head ${compassBearing} from your current location toward ${stage.streetAddress}.`,
        streetName: stage.streetAddress,
        landmarkCue: `Toward ${stage.nearestLandmark}`,
        distanceMeters: step1Dist,
        durationSeconds: Math.round(step1Dist / 1.2),
        compassBearing,
        turnDirection: 'start',
      },
      {
        stepNumber: 2,
        instruction: `Continue along the main pedestrian walkway toward ${stage.nearestLandmark}.`,
        streetName: stage.streetAddress,
        landmarkCue: stage.nearestLandmark,
        distanceMeters: step2Dist,
        durationSeconds: Math.round(step2Dist / 1.2),
        compassBearing,
        turnDirection: 'straight',
      },
      {
        stepNumber: 3,
        instruction: `Arrive at ${stage.name} and verify your route number with the stage marshal.`,
        streetName: stage.name,
        landmarkCue: stage.signageCue,
        distanceMeters: step3Dist,
        durationSeconds: Math.round(step3Dist / 1.2),
        compassBearing,
        turnDirection: 'arrive',
      },
    ],
  };
}

export function searchRoutesAndStages(
  rawQuery: string,
  originId: string,
  vehicleFilter?: VehicleType | 'ALL',
  customOriginCoords?: Coordinates | null
): SearchMatchResult[] {
  const query = rawQuery.trim().toLowerCase();
  const baseOrigin = getOriginById(originId);
  const origin: OriginLandmark = customOriginCoords
    ? {
        id: 'origin-gps',
        name: 'Current GPS Location',
        shortName: 'My Location',
        streetContext: `GPS (${customOriginCoords.lat.toFixed(4)}, ${customOriginCoords.lng.toFixed(4)})`,
        coordinates: customOriginCoords,
        spatialOffset3D: baseOrigin.spatialOffset3D,
      }
    : baseOrigin;

  const results: SearchMatchResult[] = [];

  for (const route of NAIROBI_DEMO_ROUTES) {
    if (vehicleFilter && vehicleFilter !== 'ALL' && route.vehicleType !== vehicleFilter) {
      continue;
    }

    const stage = getStageById(route.boardingStageId);
    const walking = customOriginCoords
      ? getWalkingRouteFromCoordinates(customOriginCoords, stage.id)
      : getWalkingRoute(origin.id, stage.id);

    if (!query) {
      results.push({
        route,
        stage,
        walking,
        origin,
        matchReason: `Direct route via ${route.corridorName}`,
        relevanceScore: 100 - walking.estimatedMinutes,
      });
      continue;
    }

    let score = 0;
    let matchReason = `Serves ${route.destinationName}`;

    if (route.destinationName.toLowerCase().includes(query)) {
      score += 90;
      matchReason = `Direct destination match: ${route.destinationName}`;
    }
    if (route.routeNumber.toLowerCase() === query || `rt ${route.routeNumber.toLowerCase()}` === query) {
      score += 100;
      matchReason = `Exact route number match: Route ${route.routeNumber}`;
    } else if (route.routeNumber.toLowerCase().includes(query)) {
      score += 65;
    }

    const matchedStop = route.popularStops.find((s) =>
      s.toLowerCase().includes(query)
    );
    if (matchedStop) {
      score += 75;
      if (score < 90) {
        matchReason = `Stops at ${matchedStop}`;
      }
    }

    const matchedCorridor = route.corridors.find((c) =>
      c.toLowerCase().includes(query)
    );
    if (matchedCorridor) {
      score += 60;
      if (score < 75) {
        matchReason = `Passes through ${matchedCorridor}`;
      }
    }

    if (
      route.destinationArea.toLowerCase().includes(query) ||
      route.corridorName.toLowerCase().includes(query)
    ) {
      score += 45;
    }

    if (
      stage.name.toLowerCase().includes(query) ||
      stage.streetAddress.toLowerCase().includes(query)
    ) {
      score += 50;
      if (score < 60) {
        matchReason = `Boards at ${stage.name}`;
      }
    }

    const matchedSacco = route.saccoExamples.find((s) =>
      s.toLowerCase().includes(query)
    );
    if (matchedSacco) {
      score += 40;
      if (score < 50) {
        matchReason = `Operated by ${matchedSacco}`;
      }
    }

    if (score > 0) {
      results.push({
        route,
        stage,
        walking,
        origin,
        matchReason,
        relevanceScore: score - walking.estimatedMinutes * 0.5,
      });
    }
  }

  return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
}

export function buildGoogleMapsWalkingUrl(
  origin: Coordinates,
  destination: Coordinates,
  destinationName?: string
): string {
  const originParam = `${origin.lat},${origin.lng}`;
  const destParam = `${destination.lat},${destination.lng}`;
  const queryLabel = destinationName
    ? `&destination_place_id=${encodeURIComponent(destinationName)}`
    : '';
  return `https://www.google.com/maps/dir/?api=1&origin=${originParam}&destination=${destParam}&travelmode=walking${queryLabel}`;
}

export function formatSpokenWalkingScript(
  stage: BoardingStage,
  route: TransitRoute,
  walking: WalkingRoute
): string {
  const stepLines = walking.steps
    .map(
      (step) =>
        `Step ${step.stepNumber}: ${step.instruction} (${step.distanceMeters} meters).`
    )
    .join(' ');
  return `STAGE walking briefing for Route ${route.routeNumber} to ${route.destinationName}. Board at ${stage.name}, ${walking.totalDistanceMeters} meters ${walking.compassBearing}, about ${walking.estimatedMinutes} minutes on foot. ${stepLines} Note: this is unverified demo data; please confirm the route number on site.`;
}

