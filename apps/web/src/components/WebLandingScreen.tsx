import React, { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { StageBrandMark } from './StageLogo';
import '../styles/landing.css';

interface Props {
  surfaceTheme: 'daylight' | 'night';
  onEnterApp: () => void;
}

const SKYLINE = [38, 70, 52, 96, 60, 120, 74, 50, 88, 44, 66];

// Guard so animation only plays once on first startup, exactly matching mobile
let hasPlayedSplashAnimation = false;

export const WebLandingScreen: React.FC<Props> = ({
  surfaceTheme,
  onEnterApp,
}) => {
  const isDark = surfaceTheme === 'night';
  const shouldReduceMotion = useReducedMotion();
  const [entered, setEntered] = useState<boolean>(
    Boolean(shouldReduceMotion || hasPlayedSplashAnimation)
  );

  useEffect(() => {
    if (shouldReduceMotion || hasPlayedSplashAnimation) {
      hasPlayedSplashAnimation = true;
      onEnterApp();
      return;
    }

    // Exact 2,500 ms duration matching the original mobile animation
    const timer = window.setTimeout(() => {
      hasPlayedSplashAnimation = true;
      setEntered(true);
      onEnterApp();
    }, 2500);

    return () => clearTimeout(timer);
  }, [shouldReduceMotion, onEnterApp]);

  const handlePressEnter = () => {
    hasPlayedSplashAnimation = true;
    setEntered(true);
    onEnterApp();
  };

  if (entered) {
    return null;
  }

  const skyColor = isDark ? '#0B1B16' : '#DDEFE6';
  const buildingColor = isDark ? '#10241D' : '#B9D3C6';
  const roadColor = isDark ? '#0F1A16' : '#9DB5A8';

  return (
    <div
      className={`matatu-splash ${isDark ? 'matatu-splash--dark' : ''}`}
      onClick={handlePressEnter}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handlePressEnter();
        }
      }}
      aria-label="Enter STAGE"
    >
      <div className="matatu-splash__sky" style={{ backgroundColor: skyColor }} />

      {/* Brand Header */}
      <div className="matatu-splash__center">
        <StageBrandMark size={84} />
        <h1 className="matatu-splash__word">STAGE</h1>
        <div className="matatu-splash__sub">Nairobi Stage Finder</div>
        <p className="matatu-splash__tag">
          Find your matatu.<br />Reach your destination.
        </p>
      </div>

      {/* Original Wireframe Scene */}
      <div className="matatu-splash__art">
        {/* Skyline */}
        <div className="matatu-splash__skyline">
          {SKYLINE.map((h, i) => (
            <div
              key={i}
              className="matatu-splash__building"
              style={{
                height: `${h}px`,
                backgroundColor: buildingColor,
              }}
            />
          ))}
        </div>

        {/* Original Wireframe matatu travelling smoothly along the road */}
        <div className="matatu-splash__unit">
          <div className="matatu-splash__bus">
            <div className="matatu-splash__windows">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="matatu-splash__win" />
              ))}
            </div>
            <div className="matatu-splash__stripe" />
          </div>

          <div className="matatu-splash__wheels">
            <div className="matatu-splash__wheel">
              <div className="matatu-splash__spoke-v" />
              <div className="matatu-splash__spoke-h" />
            </div>
            <div className="matatu-splash__wheel">
              <div className="matatu-splash__spoke-v" />
              <div className="matatu-splash__spoke-h" />
            </div>
          </div>
        </div>

        <div className="matatu-splash__road" style={{ backgroundColor: roadColor }} />
      </div>

      {/* Footer & Progress Bar */}
      <div className="matatu-splash__footer">
        Nairobi • Matatus • Your Way
      </div>

      <div className="matatu-splash__track">
        <div className="matatu-splash__fill" />
      </div>
    </div>
  );
};
