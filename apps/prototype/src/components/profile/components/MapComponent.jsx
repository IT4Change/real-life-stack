import React from 'react';
import { Button } from '@/components/ui/button';
import { Map } from 'lucide-react';
import MapPreview from '@/components/shared/MapPreview';

const MapComponent = ({ location, onSwitchToMap }) => {
  if (!location) return null;

  return (
    <div className="relative">
      <div className="h-64 w-full rounded-lg overflow-hidden border border-white/20">
        <MapPreview location={location} />
      </div>
      {onSwitchToMap && (
        <Button
          onClick={onSwitchToMap}
          className="absolute bottom-4 right-4 bg-purple-600/90 hover:bg-purple-700 text-white backdrop-blur-sm shadow-lg z-[500] pointer-events-auto"
          size="sm"
        >
          <Map className="h-4 w-4 mr-2" />
          Zur Karte
        </Button>
      )}
    </div>
  );
};

export default MapComponent;
