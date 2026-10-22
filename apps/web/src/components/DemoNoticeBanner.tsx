import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { UNVERIFIED_DEMO_BANNER } from '@stage/shared';

export const DemoNoticeBanner: React.FC = () => {
  return (
    <div className="demo-banner" role="status" aria-live="polite">
      <div className="demo-banner__content">
        <span className="demo-banner__pill">
          <AlertTriangle size={12} />
          UNVERIFIED DEMO DATA
        </span>
        <span className="demo-banner__text">{UNVERIFIED_DEMO_BANNER}</span>
      </div>
    </div>
  );
};

