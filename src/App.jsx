import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";

import L from "leaflet";
import polyline from "@mapbox/polyline";


const boardingIcon = L.divIcon({
  className: "boarding-marker",
  html: `
    <div class="boarding-marker-inner">
      <span class="boarding-dot"></span>
      <strong>BOARD HERE</strong>
    </div>
  `,
  iconSize: [130, 42],
  iconAnchor: [20, 21],
  popupAnchor: [20, -21],
});

delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const routes = {
  Juja: {
    destination: "Juja",
    routes: [
      {
        route: "125",
        operator: "Juja City Shuttle",
        stage: "Tom Mboya Street",
        landmark: "Tom Mboya Street",
        latitude: -1.284995,
        longitude: 36.826223,
        boardingInstructions:
          "Stand along Tom Mboya Street and look for vehicles heading toward Juja.",
        verificationStatus: "Needs verification",
        description:
          "Look for the Juja-bound vehicles along the Tom Mboya Street corridor.",
        stops: [
          "Pangani",
          "TRM",
          "Ruiru",
          "Juja Town",
        ],
      },

      {
        route: "11A",
        operator: "Thika Road Shuttle",
        stage: "Mfangano Street",
        landmark: "Mfangano Street",
        latitude: -1.2855,
        longitude: 36.8255,
        boardingInstructions:
          "Look for Juja-bound vehicles along the Mfangano Street area and confirm the destination before boarding.",
        verificationStatus: "Needs verification",
        description:
          "Another CBD option for Juja-bound passengers.",
        stops: [
          "Pangani",
          "Roysambu",
          "Ruiru",
          "Juja Town",
        ],
      },
    ],
  },
  Ngong: {
    destination: "Ngong",
    routes: [
    {
    route: "6",
    operator: "Ngong route",
    stage: "Kencom",
    landmark: "Kencom Bus Station",
    latitude: -1.2864,
    longitude: 36.8172,
    boardingInstructions:
      "Stand around the Kencom area and confirm with the conductor that the vehicle is heading to Ngong.",

    verificationStatus: "Needs verification",
    description:
      "Ngong-bound vehicles can be found around the Kencom area.",
    stops: [
      "Nyayo Stadium",
      "Prestige",
      "Dagoretti Corner",
      "Kiserian",
      "Ngong Town",
      ],
     },
    ],
  },

  Westlands: {
    destination: "Westlands",

    routes: [
      {
        route: "25",
        operator: "Westlands route",
        stage: "Kencom",
        landmark: "Kencom Bus Station",
        latitude: -1.2864,
        longitude: 36.8172,

        boardingInstructions:
          "Stand around the Kencom area and look for vehicles heading toward Westlands.",

        verificationStatus: "Needs verification",

        description:
          "Look for Westlands-bound vehicles around the Kencom area.",

        stops: [
          "University Way",
          "Museum Hill",
          "Westlands",
          "Sarit Centre",
        ],
      },
    ],
  },

  Kikuyu: {
    destination: "Kikuyu",

    routes: [
      {
        route: "—",
        operator: "Kikuyu route",
        stage: "CBD",
        landmark: "CBD boarding point",
        latitude: -1.2864,
        longitude: 36.8172,

        boardingInstructions:
          "Use the CBD boarding area and confirm with the conductor that the vehicle is heading toward Kikuyu.",

        verificationStatus: "Needs verification",

        description:
          "Kikuyu-bound vehicles operate along the western corridor.",

        stops: [
          "Uthiru",
          "Kangemi",
          "Kikuyu",
        ],
      },
    ],
  },
};
function App() {
  const [selectedDestination, setSelectedDestination] =
    useState(null);

  const [showBoardingPoint, setShowBoardingPoint] =
    useState(false);

  const [showDirections, setShowDirections] =
  useState(false);  

  const [selectedRouteIndex, setSelectedRouteIndex] =
  useState(0);  

  const [search, setSearch] = useState("");

  const [searchError, setSearchError] = useState("");

  useEffect(() => {
  if (!searchError) {
    return;
  }

  const timer = setTimeout(() => {
    setSearchError("");
  }, 5000);

  return () => clearTimeout(timer);
  }, [searchError]);

  const destinations = Object.keys(routes);

  const handleSearch = () => {
    const query = search.trim().toLowerCase();

    if (!query) {
      setSearchError("Please enter a destination.");
      return;
    }

    const destination = Object.keys(routes).find((name) =>
      query.includes(name.toLowerCase())
    );

    if (destination) {
      setSelectedDestination(destination);
      setSelectedRouteIndex(0);
      setSearchError("");
      setSearch("");
    } else {
      setSearchError(
        "We don't have this destination yet. We're currently covering selected Nairobi CBD routes."
      );
    }
  };

  const handleDestinationClick = (destination) => {
    setSelectedDestination(destination);
    setSelectedRouteIndex(0);
    setShowBoardingPoint(false);
  };

  const handleBackHome = () => {
    setSelectedDestination(null);
    setSelectedRouteIndex(0);
    setShowBoardingPoint(false);
    setShowDirections(false);
  };
  const selectedDestinationData = selectedDestination
  ? routes[selectedDestination]
  : null;

  return (
    <div className="app">
      <header className="header">
        <button
          className="brand"
          onClick={handleBackHome}
        >
          <div className="brand-icon">S</div>

          <div className="brand-text">
            <h1>STAGE</h1>
            <span>Nairobi transport guide</span>
          </div>
        </button>

        <button className="header-map-button">
          View map
        </button>
      </header>

      {!selectedDestinationData && (
        <Home
          search={search}
          setSearch={setSearch}
          handleSearch={handleSearch}
          handleDestinationClick={handleDestinationClick}
          searchError={searchError}

        />
      )}

      {selectedDestinationData &&
      !showBoardingPoint &&
      !showDirections && (
      <RouteResults
        destination={selectedDestinationData}
        selectedRouteIndex={selectedRouteIndex}
        onSelectRoute={setSelectedRouteIndex}
        onBack={handleBackHome}
        onViewBoardingPoint={() =>
          setShowBoardingPoint(true)
        }
        onDirections={() => {
          setShowDirections(true);
        }}
      />
      )}

      {selectedDestinationData && showBoardingPoint && (
      <BoardingPoint
        route={selectedDestinationData.routes[selectedRouteIndex]}
        onBack={() => setShowBoardingPoint(false)}
      />
      )}

      {selectedDestinationData && showDirections && (
        <Directions
          route={selectedDestinationData.routes[selectedRouteIndex]}
          onBack={() => setShowDirections(false)}
        />
      )}

      <footer className="footer">
        <strong>STAGE</strong>

        <span>
          Nairobi CBD transport guide
        </span>
      </footer>
    </div>
  );
}


/* =========================
   HOME
========================= */

function Home({
  search,
  setSearch,
  handleSearch,
  handleDestinationClick,
  searchError,
}) {
  return (
    <main>
      <section className="hero">
        <div className="hero-content">
          <div className="eyebrow">
            NAIROBI CBD
          </div>

          <h2>
            Find where to
            <br />
            <span>board.</span>
          </h2>

          <p>
            Search your destination and we'll show you
            the route, stage and where to stand.
          </p>

          <div className="search-container">
              <div className="search-row">
            <div className="search-input-area">
              <span className="search-symbol">⌕</span>

              <input
                type="text"
                placeholder="Where are you going?"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSearch();
                  }
                }}
              />

            </div>

            

            <button
              className="search-button"
              onClick={handleSearch}
            >
              Search
            </button>
          </div>
            </div> 

              {searchError && (
                <div className="search-error">
                  {searchError}
                </div>
              )}

          <div className="search-hint">
            Try Juja, Ngong, Westlands or Kikuyu
          </div>
        </div>

        <div className="hero-map">
          <div className="map-label">
            <span className="map-dot"></span>
            Nairobi CBD
          </div>

          <div className="map-road road-one"></div>
          <div className="map-road road-two"></div>
          <div className="map-road road-three"></div>
          <div className="map-road road-four"></div>

          <div className="map-pin pin-one">
            <span></span>
          </div>

          <div className="map-pin pin-two">
            <span></span>
          </div>

          <div className="map-pin pin-three">
            <span></span>
          </div>

          <div className="map-cbd-label">
            CBD
          </div>
        </div>
      </section>

      <section className="popular-section">
        <div className="section-title">
          <div>
            <span>QUICK SEARCH</span>
            <h3>Popular destinations</h3>
          </div>

          <p>Start here</p>
        </div>

        <div className="destination-list">
          {Object.keys(routes).map((destination) => {
            const route = routes[destination];

            return (
              <button
                className="destination"
                key={destination}
                onClick={() =>
                  handleDestinationClick(destination)
                }
              >
                <div className="destination-main">
                  <strong>{destination}</strong>

                  <span>
                    Board at {route.stage}
                  </span>
                </div>

                <div className="destination-route">
                  <span>
                    Route {route.route}
                  </span>

                  <b>→</b>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}


/* =========================
   ROUTE RESULTS
========================= */

function RouteResults({
  destination,
  selectedRouteIndex,
  onSelectRoute,
  onBack,
  onViewBoardingPoint,
  onDirections,
}) {
    const route = destination.routes[selectedRouteIndex];

  return (
    <main className="results-page">
      <button
        className="back-button"
        onClick={onBack}
      >
        ← Back to search
      </button>

      <section className="results-heading">
        <span className="eyebrow">
          ROUTE FOUND
        </span>

        <h2>
          Going to <span>{route.destination}</span>
        </h2>

        <p>
          Here's where to board in Nairobi CBD.
        </p>
      </section>

      {destination.routes.length > 1 && (
        <section className="route-options">
          <span className="card-label">
            AVAILABLE ROUTES
          </span>

          <div className="route-options-list">
              {destination.routes.map((availableRoute, index) => (
                <button
                  className={
                    index === selectedRouteIndex
                      ? "route-option active"
                      : "route-option"
                  }
                  key={`${availableRoute.route}-${index}`}
                  onClick={() => onSelectRoute(index)}
                >
                <span>
                  Route {availableRoute.route}
                </span>

                <strong>
                  {availableRoute.stage}
                </strong>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="route-card">

        {/* ROUTE INFORMATION */}

        <div className="route-card-top">
          <div>
            <span className="card-label">
              ROUTE
            </span>

            <div className="route-number">
              {route.route}
            </div>
          </div>

          <div className="operator">
            <span className="card-label">
              OPERATOR
            </span>

            <strong>{route.operator}</strong>
          </div>
        </div>

        <div className="route-divider"></div>

        {/* BOARDING INFORMATION */}

        <div className="boarding-block">
          <span className="card-label">
            BOARD HERE
          </span>

          <h3>{route.stage}</h3>

          <p className="boarding-landmark">
            Near <strong>{route.landmark}</strong>
          </p>

          <p className="boarding-description">
            {route.boardingInstructions}
          </p>

          <div className="boarding-actions">
            <button
              className="primary-action"
              onClick={onViewBoardingPoint}
            >
              View exact point
            </button>

            <button
              className="secondary-action"
              onClick={() => onDirections(route)}
            >
              Directions
            </button>
          </div>
        </div>

        <div className="route-divider"></div>

        {/* STOPS */}

        <div className="stops-block">
          <span className="card-label">
            STOPS ALONG THE WAY
          </span>

          <div className="stops">
            {route.stops.map((stop, index) => (
              <div
                className="stop"
                key={stop}
              >
                <div className="stop-marker">
                  <span
                    className={
                      index === 0
                        ? "start-marker"
                        : ""
                    }
                  ></span>
                </div>

                <div className="stop-name">
                  {stop}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="verification-note">
        <div className="verification-icon">
          ✓
        </div>

        <div>
          <strong>Route information</strong>

          <p>
            Stage information will be verified and
            updated as we collect more information
            from commuters and operators.
          </p>
        </div>
      </section>
    </main>
  );
}


/* =========================
   BOARDING POINT
========================= */

function BoardingPoint({ route, onBack }) {
  return (
    <main className="boarding-page">
      <button
        className="back-button"
        onClick={onBack}
      >
        ← Back to {route.destination}
      </button>

      <section className="boarding-heading">
        <span className="eyebrow">
          BOARDING POINT
        </span>

        <h2>
          Where to <span>stand.</span>
        </h2>

        <p>
          Find the boarding point for the
          {` ${route.destination}`} route.
        </p>
      </section>

      <section className="location-card">
        <div className="location-map">
          <MapContainer
             center={[route.latitude, route.longitude]}
            zoom={16}
            scrollWheelZoom={true}
            className="real-map"
          >
            <TileLayer
              attribution='&copy; OpenStreetMap contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <Marker
              position={[route.latitude, route.longitude]}
              icon={boardingIcon}
            >
            <Popup>
              <div className="map-popup">
                <strong>{route.stage}</strong>

                <span>
                  Boarding point for {route.destination}
                </span>

                <small>
                  Route {route.route}
                </small>
              </div>
            </Popup>
            </Marker>
          </MapContainer>

          
        </div>

        <div className="location-details">
          <span className="card-label">
            BOARD HERE
          </span>

          <h3>{route.stage}</h3>

          <div className="landmark">
            <span className="landmark-icon">
              L
            </span>

            <div>
              <strong>{route.landmark}</strong>

              <p>
                Recognizable landmark
              </p>
            </div>
          </div>

          <p className="location-description">
            {route.description}
          </p>

          <div className="boarding-instructions">
            <h3>Where to stand</h3>
            <p>{route.boardingInstructions}</p>
          </div>

          <div className="verification-note">
            <span>●</span>
            <div>
              <strong>{route.verificationStatus}</strong>
              <p>
                Stage information is being verified and may change.
              </p>
            </div>
          </div>

          <div className="location-buttons">
            <a
              className="primary-button"
              href={`https://www.google.com/maps/search/?api=1&query=${route.latitude},${route.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in Google Maps
            </a>

            <button className="secondary-action">
              Share Location
            </button>
          </div>
        </div>
      </section>

      <section className="important-note">
        <strong>Before you board</strong>

        <p>
          Confirm the vehicle is going to{" "}
          <strong>{route.destination}</strong>{" "}
          before getting in.
        </p>
      </section>
    </main>
  );
}

function WalkingRoute({
  userLocation,
  route,
  setRouteCoordinates,
  setWalkingDirections,
}) {
  useEffect(() => {
    const getWalkingRoute = async () => {
      try {
        const response = await fetch(
          "https://valhalla1.openstreetmap.de/route",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              locations: [
                {
                  lat: userLocation.latitude,
                  lon: userLocation.longitude,
                },
                {
                  lat: route.latitude,
                  lon: route.longitude,
                },
              ],
              costing: "pedestrian",
              units: "kilometers",
            }),
          }
        );

        if (!response.ok) {
          throw new Error("Route request failed");
        }

        const data = await response.json();

        console.log("VALHALLA RESPONSE:", data);

        const encodedShape = data.trip.legs[0].shape;

        const decodedCoordinates =
          polyline.decode(encodedShape, 6);

        const leafletCoordinates =
          decodedCoordinates.map(([lat, lng]) => [
            lat,
            lng,
          ]);

        setRouteCoordinates(leafletCoordinates);

        const maneuvers = data.trip.legs[0].maneuvers;

        setWalkingDirections({
          distance: data.trip.summary.length,
          time: data.trip.summary.time,
          maneuvers: maneuvers,
          routeCoordinates: leafletCoordinates,
        });

        console.log("FIRST MANEUVER:", maneuvers[0]);

          console.log(
            "ALL MANEUVER INDEXES:",
            maneuvers.map((maneuver, index) => ({
              instruction: index + 1,
              shapeIndex: maneuver.begin_shape_index,
              text: maneuver.instruction,
            }))
          );

        console.log(
          "FIRST MANEUVER LOCATION INDEX:",
          maneuvers[0].begin_shape_index
        );
        console.log("ALL MANEUVERS:", maneuvers);

      } catch (error) {
        console.error(
          "Walking route error:",
          error
        );

        setRouteCoordinates([]);
        setWalkingDirections(null);
      }
    };

    getWalkingRoute();
    }, [route, setRouteCoordinates, setWalkingDirections]);

  return null;
}

function DirectionsMapView({
  userLocation,
  route,
}) {
  const map = useMap();

  useEffect(() => {
    const bounds = [
      [
        userLocation.latitude,
        userLocation.longitude,
      ],
      [
        route.latitude,
        route.longitude,
      ],
    ];

    map.fitBounds(bounds, {
      padding: [60, 60],
    });
  }, [map, userLocation, route]);

  return null;
}

function Directions({ route, onBack }) {
  const [userLocation, setUserLocation] =
    useState(null);

  const [routeCoordinates, setRouteCoordinates] =
  useState([]);
  
  const [walkingDirections, setWalkingDirections] =
  useState(null);

  const [voiceNavigation, setVoiceNavigation] = useState(false);

const [currentManeuver, setCurrentManeuver] = useState(0);

  console.log(
  "WALKING DIRECTIONS STATE:",
  walkingDirections
  );

  const [locationError, setLocationError] =
    useState("");

  const speakInstruction = (text) => {
  if (!("speechSynthesis" in window)) {
    alert("Voice navigation is not supported by this browser.");
    return;
  }

  window.speechSynthesis.cancel();

  const speech = new SpeechSynthesisUtterance(text);

  speech.lang = "en-KE";
  speech.rate = 0.95;
  speech.pitch = 1;

  window.speechSynthesis.speak(speech);
  };  

useEffect(() => {
  if (!navigator.geolocation) {
    setLocationError(
      "Location is not supported by this browser."
    );
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      setUserLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
    },
    (error) => {
      console.error("LOCATION ERROR:", error);

      setLocationError(
        "We couldn't access your location. Please allow location access."
      );
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    }
  );
}, []);

useEffect(() => {
  if (!voiceNavigation) {
    return;
  }

  if (!navigator.geolocation) {
    return;
  }

  const watchId = navigator.geolocation.watchPosition(
    (position) => {
      setUserLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
    },
    (error) => {
      console.error("Live location error:", error);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 2000,
      timeout: 10000,
    }
  );

  return () => {
    navigator.geolocation.clearWatch(watchId);
  };
}, [voiceNavigation]);

useEffect(() => {
  if (walkingDirections) {
    setCurrentManeuver(0);
  }
}, [walkingDirections]);

useEffect(() => {
  if (
    !voiceNavigation ||
    !userLocation ||
    !walkingDirections
  ) {
    return;
  }

  const maneuvers = walkingDirections.maneuvers;
  const coordinates = walkingDirections.routeCoordinates;

  const nextManeuver = maneuvers[currentManeuver];

  if (!nextManeuver || !coordinates) {
    return;
  }

  const targetCoordinate =
    coordinates[nextManeuver.begin_shape_index];

  if (!targetCoordinate) {
    return;
  }

  const distance = calculateDistance(
    userLocation.latitude,
    userLocation.longitude,
    targetCoordinate[0],
    targetCoordinate[1]
  );

  console.log(
    "Distance to next maneuver:",
    distance,
    "meters"
  );

  if (distance <= 35) {
    speakInstruction(nextManeuver.instruction);

    setCurrentManeuver((previous) => previous + 1);
  }
}, [
  voiceNavigation,
  userLocation,
  walkingDirections,
  currentManeuver,
]);

const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371;

  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c * 1000;
};

  return (
    <main className="directions-page">
      <button
        className="back-button"
        onClick={onBack}
      >
        ← Back to route
      </button>

      <section className="results-heading">
        <span className="eyebrow">
          DIRECTIONS
        </span>

        <h2>
          Getting to <span>{route.destination}</span>
        </h2>

        <p>
          Directions to your boarding stage.
        </p>
      </section>

      <section className="directions-map">
        {locationError && (
          <div className="location-error">
            {locationError}
          </div>
        )}

        {!userLocation && !locationError && (
          <div className="location-loading">
            <strong>Finding your location...</strong>
            <p>
              Allow location access to get directions
              to the boarding stage.
            </p>
          </div>
        )}

        {userLocation && (
           <MapContainer
              key={`${userLocation.latitude}-${userLocation.longitude}-${route.latitude}-${route.longitude}`}
              center={[
                userLocation.latitude,
                userLocation.longitude,
              ]}
              zoom={15}
              scrollWheelZoom={true}
              className="directions-real-map"
              style={{
                width: "100%",
                height: "550px",
              }}
            >
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

              <DirectionsMapView
                userLocation={userLocation}
                route={route}
              />

              <WalkingRoute
                userLocation={userLocation}
                route={route}
                setRouteCoordinates={setRouteCoordinates}
                setWalkingDirections={setWalkingDirections}
              />

              {routeCoordinates.length > 0 && (
                <Polyline
                  positions={routeCoordinates}
                  pathOptions={{
                    color: "#173c2a",
                    weight: 6,
                    opacity: 0.8,
                  }}
                />
              )}

            <Marker
              position={[
                userLocation.latitude,
                userLocation.longitude,
              ]}
            >
              <Popup>
                <strong>You are here</strong>
              </Popup>
            </Marker>

            <Marker
              position={[
                route.latitude,
                route.longitude,
              ]}
              icon={boardingIcon}
            >
              <Popup>
                <div className="map-popup">
                  <strong>{route.stage}</strong>
                  <span>
                    Boarding point for {route.destination}
                  </span>
                  <small>
                    Route {route.route}
                  </small>
                </div>
              </Popup>
            </Marker>
          </MapContainer>

          
        )}
        {walkingDirections && (
          <section className="walking-directions">

        <div className="voice-navigation">
          {!voiceNavigation ? (
            <button
              className="voice-navigation-button"
              onClick={() => {
                setVoiceNavigation(true);
                setCurrentManeuver(1);

                if (walkingDirections?.maneuvers?.length > 0) {
                  speakInstruction(
                    walkingDirections.maneuvers[0].instruction
                  );
                }
              }}
            >
              🔊 Start Voice Navigation
            </button>
          ) : (
            <button
              className="voice-navigation-button stop"
              onClick={() => {
                setVoiceNavigation(false);
                window.speechSynthesis.cancel();
              }}
            >
              ⏹ Stop Voice Navigation
            </button>
          )}
        </div>

            <div className="walking-summary">

              <div>
                <span>WALKING TIME</span>
                <strong>
                  {Math.ceil(walkingDirections.time / 60)} min
                </strong>
              </div>

              <div>
                <span>DISTANCE</span>
                <strong>
                  {walkingDirections.distance.toFixed(2)} km
                </strong>
              </div>

            </div>

            <div className="walking-steps">

              <span className="card-label">
                WALKING DIRECTIONS
              </span>

              {walkingDirections.maneuvers.map((maneuver, index) => (
                <div
                  className="walking-step"
                  key={index}
                >

                  <div className="walking-step-number">
                    {index + 1}
                  </div>

                  <div className="walking-step-content">

                    <strong>
                      {maneuver.instruction}
                    </strong>

                    {maneuver.length > 0 && (
                      <span>
                        {maneuver.length.toFixed(2)} km
                      </span>
                    )}

                  </div>

                </div>
              ))}

            </div>

          </section>
        )}
      </section>
    </main>
  );
}

export default App;