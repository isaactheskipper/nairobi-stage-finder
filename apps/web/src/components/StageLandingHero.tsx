import React, { useState } from 'react';
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'framer-motion';
import { ArrowRight, Compass, Moon, Search, Sun } from 'lucide-react';

import stageChromeBalloonUrl from '../assets/landing/stage_chrome_balloon.png';
import floatingCoffeeUrl from '../assets/landing/floating_coffee.png';
import floatingDiscoUrl from '../assets/landing/floating_disco.png';
import floatingSushiUrl from '../assets/landing/floating_sushi_token.png';
import floatingPastryUrl from '../assets/landing/floating_pastry.png';
import skyCloudsUrl from '../assets/landing/sky_clouds.png';

interface StageLandingHeroProps {
  surfaceTheme: 'daylight' | 'night';
  onToggleSurfaceTheme: () => void;
  onEnterWorkspace: (initialQuery?: string) => void;
}

const QUICK_DESTINATIONS = [
  'Kikuyu',
  'Westlands',
  'Ngong',
  'Rongai',
  'Thika Road',
  'JKIA',
];

export const StageLandingHero: React.FC<StageLandingHeroProps> = ({
  surfaceTheme,
  onToggleSurfaceTheme,
  onEnterWorkspace,
}) => {
  const [draftQuery, setDraftQuery] = useState<string>('');
  const shouldReduceMotion = useReducedMotion();

  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);

  const springX = useSpring(pointerX, { stiffness: 90, damping: 22 });
  const springY = useSpring(pointerY, { stiffness: 90, damping: 22 });

  const balloonParallaxX = useTransform(springX, [-0.5, 0.5], [-16, 16]);
  const balloonParallaxY = useTransform(springY, [-0.5, 0.5], [-14, 14]);

  const peripheryParallaxX = useTransform(springX, [-0.5, 0.5], [22, -22]);
  const peripheryParallaxY = useTransform(springY, [-0.5, 0.5], [18, -18]);

  const handleMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    if (shouldReduceMotion) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width - 0.5;
    const ny = (e.clientY - rect.top) / rect.height - 0.5;
    pointerX.set(nx);
    pointerY.set(ny);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onEnterWorkspace(draftQuery.trim());
  };

  const isNight = surfaceTheme === 'night';

  return (
    <section
      className={`stage-sky-landing ${
        isNight ? 'stage-sky-landing--night' : ''
      }`}
      onMouseMove={handleMouseMove}
      aria-label="STAGE 3D Chrome Sky Landing Screen"
    >
      <div className="stage-sky-landing__glow" />

      {/* Drifting Volumetric Cumulus Clouds */}
      <motion.img
        src={skyCloudsUrl}
        alt=""
        aria-hidden="true"
        className="stage-sky-landing__clouds"
        animate={
          shouldReduceMotion
            ? undefined
            : {
                x: [0, -24, 0],
                y: [0, 6, 0],
              }
        }
        transition={{
          duration: 16,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Top Overlay Bar */}
      <header className="stage-sky-landing__topbar">
        <div className="stage-sky-pill">
          <span className="stage-sky-pill__dot" />
          <span>NAIROBI CBD · STAGE FINDER</span>
        </div>

        <div className="stage-sky-landing__top-actions">
          <button
            type="button"
            className="stage-sky-btn-ghost"
            onClick={onToggleSurfaceTheme}
            aria-label="Toggle sky atmosphere mode"
          >
            {isNight ? <Sun size={14} /> : <Moon size={14} />}
            <span>{isNight ? 'Daylight Sky' : 'Dusk Sky'}</span>
          </button>

          <button
            type="button"
            className="stage-sky-btn-ghost"
            onClick={() => onEnterWorkspace()}
          >
            <Compass size={14} />
            <span>Open Stage Finder</span>
          </button>
        </div>
      </header>

      {/* Top-Left Floating 3D Rounded Token Block */}
      <motion.img
        src={floatingSushiUrl}
        alt=""
        aria-hidden="true"
        className="stage-floating-obj stage-floating-obj--sushi"
        style={{
          x: peripheryParallaxX,
          y: peripheryParallaxY,
        }}
        animate={
          shouldReduceMotion
            ? undefined
            : {
                y: [0, 14, 0],
                rotate: [0, -5, 0],
              }
        }
        transition={{
          duration: 6.2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Centerpiece: Liquid-Chrome 3D Inflated Balloon 'STA / GE' Sculpture */}
      <div className="stage-sky-landing__center">
        <motion.button
          type="button"
          className="stage-chrome-balloon-btn"
          onClick={() => onEnterWorkspace()}
          style={{
            x: balloonParallaxX,
            y: balloonParallaxY,
          }}
          initial={
            shouldReduceMotion
              ? { opacity: 1, scale: 1 }
              : { opacity: 0, scale: 0.88, y: 18 }
          }
          animate={{ opacity: 1, scale: 1, y: 0 }}
          whileHover={shouldReduceMotion ? undefined : { scale: 1.03 }}
          whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
          transition={{
            type: 'spring',
            stiffness: 190,
            damping: 20,
          }}
          aria-label="STAGE 3D Chrome Balloon Logo — Click to enter Nairobi Stage Finder"
        >
          <motion.img
            src={stageChromeBalloonUrl}
            alt="STAGE 3D Liquid Chrome Balloon Typography"
            className="stage-chrome-balloon-img"
            animate={
              shouldReduceMotion
                ? undefined
                : {
                    y: [0, -14, 0],
                    rotate: [-1.2, 1.2, -1.2],
                  }
            }
            transition={{
              duration: 5.8,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        </motion.button>
      </div>

      {/* Mid-Left Floating 3D Pastry */}
      <motion.img
        src={floatingPastryUrl}
        alt=""
        aria-hidden="true"
        className="stage-floating-obj stage-floating-obj--pastry"
        style={{
          x: peripheryParallaxX,
          y: peripheryParallaxY,
        }}
        animate={
          shouldReduceMotion
            ? undefined
            : {
                y: [0, -16, 0],
                rotate: [0, 6, 0],
              }
        }
        transition={{
          duration: 7.1,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Bottom-Left Floating 3D Takeaway Coffee Cup with 'STA/GE' Kraft Sleeve */}
      <motion.img
        src={floatingCoffeeUrl}
        alt=""
        aria-hidden="true"
        className="stage-floating-obj stage-floating-obj--coffee"
        style={{
          x: peripheryParallaxX,
          y: peripheryParallaxY,
        }}
        animate={
          shouldReduceMotion
            ? undefined
            : {
                y: [0, 12, 0],
                rotate: [0, -4, 0],
              }
        }
        transition={{
          duration: 6.6,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Bottom-Right Floating 3D Faceted Mirror Disco/Radar Sphere */}
      <motion.img
        src={floatingDiscoUrl}
        alt=""
        aria-hidden="true"
        className="stage-floating-obj stage-floating-obj--disco"
        style={{
          x: balloonParallaxX,
          y: peripheryParallaxY,
        }}
        animate={
          shouldReduceMotion
            ? undefined
            : {
                y: [0, -15, 0],
                rotate: [-4, 6, -4],
              }
        }
        transition={{
          duration: 7.4,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Interactive Bottom Glass Search & Launch Console */}
      <div className="stage-sky-landing__dock-wrap">
        <motion.div
          className="stage-sky-dock"
          initial={
            shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 20 }
          }
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <p className="stage-sky-dock__subtitle">
            Find your exact Nairobi CBD matatu or bus boarding stage
          </p>

          <form className="stage-sky-dock__form" onSubmit={handleFormSubmit}>
            <Search size={17} color="#35F58A" />
            <input
              type="text"
              className="stage-sky-dock__input"
              value={draftQuery}
              onChange={(e) => setDraftQuery(e.target.value)}
              placeholder="Where are you heading? (e.g. Kikuyu, Westlands, 105)..."
              aria-label="Search destination, corridor, or route number"
            />
            <button type="submit" className="stage-sky-dock__submit">
              <span>Find Your Stage</span>
              <ArrowRight size={15} />
            </button>
          </form>

          <div className="stage-sky-dock__chips">
            {QUICK_DESTINATIONS.map((dest) => (
              <button
                key={dest}
                type="button"
                className="stage-sky-chip"
                onClick={() => onEnterWorkspace(dest)}
              >
                {dest}
              </button>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
};

