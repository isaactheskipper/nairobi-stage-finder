import React from 'react';

interface StageLogoProps {
  onClick?: () => void;
  size?: number;
}

/** Two-blade emerald ribbon "S" mark matching Mobile BrandMark geometry */
export const StageBrandMark: React.FC<{ size?: number; color?: string }> = ({
  size = 32,
  color,
}) => {
  const bladeW = size * 0.95;
  const bladeH = size * 0.42;
  const fill = color ?? 'var(--stage-accent-electric, #1ED777)';

  return (
    <div
      style={{
        width: size,
        height: size,
        position: 'relative',
        display: 'inline-block',
        flexShrink: 0,
      }}
      aria-hidden="true"
    >
      <div
        style={{
          position: 'absolute',
          top: size * 0.04,
          left: size * 0.12,
          width: bladeW,
          height: bladeH,
          backgroundColor: fill,
          borderTopLeftRadius: bladeH * 0.9,
          borderBottomRightRadius: bladeH * 0.9,
          borderTopRightRadius: bladeH * 0.2,
          borderBottomLeftRadius: bladeH * 0.2,
          transform: 'skewX(-18deg)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: size * 0.04,
          right: size * 0.12,
          width: bladeW,
          height: bladeH,
          backgroundColor: fill,
          opacity: 0.88,
          borderTopLeftRadius: bladeH * 0.9,
          borderBottomRightRadius: bladeH * 0.9,
          borderTopRightRadius: bladeH * 0.2,
          borderBottomLeftRadius: bladeH * 0.2,
          transform: 'skewX(-18deg) rotate(180deg)',
        }}
      />
    </div>
  );
};

export const StageLogo: React.FC<StageLogoProps> = ({ onClick, size = 28 }) => {
  return (
    <button
      type="button"
      className="stage-logo"
      onClick={onClick}
      aria-label="STAGE — Return to Home Overview"
    >
      <StageBrandMark size={size} />
      <span className="stage-logo__wordmark">
        <span className="stage-logo__title">
          STAGE
        </span>
        <span className="stage-logo__subtitle">Nairobi public transport</span>
      </span>
    </button>
  );
};

