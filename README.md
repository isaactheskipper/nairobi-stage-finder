# STAGE — Nairobi Public Transport & Boarding-Stage Discovery

**STAGE** is an urban mobility and street-level wayfinding application built for Nairobi commuters. It helps people standing in Nairobi CBD immediately identify the right matatu or city bus boarding stage for their destination, inspect the physical boarding bay, and follow turn-by-turn or spoken walking directions to the stage without mandatory registration.

---

## Project Architecture

```text
stage-app/
├── apps/
│   ├── web/                    # Responsive Web App (React 19, TypeScript, Vite, Framer Motion, Three.js)
│   │   ├── src/
│   │   │   ├── components/     # StageLogo,DestinationSearchConsole,RouteResultsList,StageDetailsPanel,WalkingNavigationView,StageBeacon3D
│   │   │   ├── styles/         # Modular CSS (tokens.css, layout.css, components.css — no Tailwind)
│   │   │   ├── App.tsx
│   │   │   └── main.tsx
│   │   ├── index.html
│   │   ├── package.json
│   │   └── vite.config.ts
│   └── mobile/                 # Android Mobile App (React Native, Expo, TypeScript)
│       ├── src/
│       │   ├── components/     # MobileHeader, MobileSearchCard, MobileRouteCard, MobileStageDetailAndNav
│       │   └── theme/          # Shared React Native StyleSheet tokens (mobileStyles.ts)
│       ├── App.tsx
│       ├── app.json
│       ├── metro.config.js
│       └── package.json
├── packages/
│   └── shared/                 # Shared TypeScript domain models, design tokens, demo data & wayfinding logic
│       └── src/
│           ├── data/           # Unverified demo Nairobi CBD origins, stages, routes, and walking paths
│           ├── logic/          # Search ranking, Haversine distance, compass bearings, Google Maps URLs, voice scripts
│           ├── tokens/         # STAGE_COLORS, STAGE_TYPOGRAPHY, STAGE_SPACING, STAGE_RADIUS, STAGE_MOTION
│           └── types/          # Strict TypeScript interfaces for routes, stages, and walking steps
├── package.json
├── tsconfig.base.json
└── README.md
```

### Why Isolated App Dependencies + Linked `@stage/shared`?
`apps/web` (React 19 + Vite) and `apps/mobile` (React Native 0.76 + Expo 52 + React 18) maintain separate `node_modules` directories to prevent React version hoisting conflicts while sharing 100% of their transport domain models, design tokens, and wayfinding logic via `@stage/shared` (`file:../../packages/shared`).

---

## Visual System (`@stage/shared/tokens`)

- **Limestone & Warm Concrete Surfaces** (`#F5F4F0` / `#EAE8E1`): Engineered for low-glare outdoor legibility under bright Nairobi equatorial sunlight.
- **Tarmac Ink & Signage Surfaces** (`#111513` / `#141A17`): High-contrast dark panels inspired by Nairobi physical bus destination boards, with a one-tap **Night Contrast** surface mode.
- **STAGE Signal Green** (`#00B84C` / `#16E065`): Unmistakable transit beacon accent for active boarding bays, walking vectors, and primary wayfinding actions.
- **Honest Demo Data Labelling** (`#D97706` / `#FEF3C7`): Every sample route and boarding stage is explicitly marked as `UNVERIFIED DEMO DATA` so example routes are never mistaken for live verified schedules.

---

## Environment Requirements

The system includes Node.js via NVM (`v22.23.2` and `v20.17.0`). Make sure Node 20+ is active in your shell before running commands:

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"
node -v   # v22.23.2
```

---

## Running the Applications

### 1. Web Application (`apps/web`)

```bash
# From the repository root (/home/isaac/stage-app):
npm run dev:web

# Or directly inside apps/web:
cd apps/web
npm run dev
```
- Opens on `http://localhost:5173`.
- Production build & typecheck:
  ```bash
  npm run typecheck:web
  npm run build:web
  ```

### 2. Android Mobile Application (`apps/mobile`)

```bash
# From the repository root (/home/isaac/stage-app):
npm run start:mobile

# Launch directly on a connected Android device or emulator:
npm run android:mobile
```
- Typecheck the mobile project:
  ```bash
  npm run typecheck:mobile
  ```

---

## Maps, GPS, Search & Directions ($0 / No API Key Stack)

- **Map Styles (OpenFreeMap)**: Configured in `packages/shared/src/config/mapConfig.ts` with OpenFreeMap MapLibre vector style URLs:
  - Light: `https://tiles.openfreemap.org/styles/positron`
  - Standard: `https://tiles.openfreemap.org/styles/liberty`
  - Dark: `https://tiles.openfreemap.org/styles/dark`
- **Native vs. Expo Go Rendering**:
  - In an **Expo Development Build / Production APK** (`npx expo run:android`), `@maplibre/maplibre-react-native` renders OpenFreeMap vector tiles natively.
  - In **Expo Go** (`npx expo start -c`), `react-native-webview` renders an interactive MapLibre GL JS canvas using the same OpenFreeMap vector styles (`positron`, `liberty`, `dark`), with an offline vector street-grid fallback if network connectivity is unavailable.
- **Routing & Geocoding**: Uses Project-OSRM (`https://router.project-osrm.org`) for road routing and OpenStreetMap Nominatim (`https://nominatim.openstreetmap.org/search`, 1 req/sec rate-limited, triggered on explicit search submission) for Kenya place search.
- **Attribution**: Displays `OpenFreeMap © OpenMapTiles Data from OpenStreetMap` visibly across all map themes.


