import React from 'react';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';

const icon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const MapPreview = ({ location, className = '' }) => {
  if (!location || !location.lat || !location.lon) {
    return null;
  }

  return (
    <div className={`rounded-lg overflow-hidden h-full w-full ${className}`}>
      <MapContainer
        center={[location.lat, location.lon]}
        zoom={14}
        scrollWheelZoom={false}
        dragging={false}
        zoomControl={false}
        doubleClickZoom={false}
        attributionControl={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <Marker position={[location.lat, location.lon]} icon={icon} />
      </MapContainer>
    </div>
  );
};

export default MapPreview;
