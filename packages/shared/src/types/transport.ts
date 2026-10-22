/**
 * STAGE — Shared Transport Domain Models
 * Keeps transport data strictly separate from presentation across Web and Android.
 */

export type VerificationStatus = 'UNVERIFIED_DEMO';

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface SpatialOffset3D {
  /** Relative east-west offset in scene units from CBD center */
  x: number;
  /** Relative elevation in scene units */
  y: number;
  /** Relative north-south offset in scene units from CBD center */
  z: number;
}

export interface OriginLandmark {
  id: string;
  name: string;
  shortName: string;
  streetContext: string;
  coordinates: Coordinates;
  spatialOffset3D: SpatialOffset3D;
}

export interface BoardingStage {
  id: string;
  code: string;
  name: string;
  streetAddress: string;
  nearestLandmark: string;
  bayDescription: string;
  coordinates: Coordinates;
  spatialOffset3D: SpatialOffset3D;
  operatingHours: string;
  lightingAndSafetyNote: string;
  activeRoutesCount: number;
  crowdLevelTypical: 'Moderate' | 'Busy' | 'High-Turnover';
  shelterAvailable: boolean;
  signageCue: string;
  verificationStatus: VerificationStatus;
}

export type TurnDirection = 'start' | 'straight' | 'left' | 'right' | 'cross' | 'arrive';

export interface WalkingStep {
  stepNumber: number;
  instruction: string;
  streetName: string;
  landmarkCue: string;
  distanceMeters: number;
  durationSeconds: number;
  compassBearing: string;
  turnDirection: TurnDirection;
}

export interface WalkingRoute {
  originId: string;
  stageId: string;
  totalDistanceMeters: number;
  estimatedMinutes: number;
  compassBearing: string;
  compassDegrees: number;
  summary: string;
  steps: WalkingStep[];
}

export type VehicleType =
  | 'City Bus (33–60 Seater)'
  | 'Matatu (14-Seater)'
  | 'Express Shuttle';

export interface TransitRoute {
  id: string;
  routeNumber: string;
  destinationName: string;
  destinationArea: string;
  corridorName: string;
  corridors: string[];
  popularStops: string[];
  boardingStageId: string;
  saccoExamples: string[];
  vehicleType: VehicleType;
  estimatedFareKes: {
    offPeak: string;
    peak: string;
  };
  frequencySummary: string;
  travelTimeSummary: string;
  boardingTip: string;
  verificationStatus: VerificationStatus;
  verificationNote: string;
}

export interface SearchMatchResult {
  route: TransitRoute;
  stage: BoardingStage;
  walking: WalkingRoute;
  origin: OriginLandmark;
  matchReason: string;
  relevanceScore: number;
}

