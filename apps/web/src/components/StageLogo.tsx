import React from 'react';

interface StageLogoProps {
  onClick?: () => void;
}

export const StageLogo: React.FC<StageLogoProps> = ({ onClick }) => {
  return (
    <button
      type="button"
      className="stage-logo"
      onClick={onClick}
      aria-label="STAGE — Return to Home Overview"
    >
      <span className="stage-logo__mark" aria-hidden="true">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Boarding bay architectural bracket */}
          <path
            d="M4 7.5C4 5.567 5.567 4 7.5 4H16.5C18.433 4 20 5.567 20 7.5V10"
            stroke="#F7F8F6"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <path
            d="M20 16.5C20 18.433 18.433 20 16.5 20H7.5C5.567 20 4 18.433 4 16.5V14"
            stroke="#9CA69F"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          {/* Transit route vector & signal green boarding node */}
          <path
            d="M7.5 12H14.5"
            stroke="#16E065"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <circle cx="16.5" cy="12" r="3" fill="#16E065" />
        </svg>
      </span>
      <span className="stage-logo__wordmark">
        <span className="stage-logo__title">
          STAGE
          <span className="stage-logo__dot" />
        </span>
        <span className="stage-logo__subtitle">NAIROBI STAGE FINDER</span>
      </span>
    </button>
  );
};

