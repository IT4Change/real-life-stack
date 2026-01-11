import React, { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import { MapPin } from 'lucide-react';

const MapPicker = ({ position, onPositionChange, onConfirm }) => {
  const [markerPosition, setMarkerPosition] = useState(position);

  function LocationMarker() {
    useMapEvents({
      click(e) {
        setMarkerPosition(e.latlng);
        onPositionChange(e.latlng);
      },
    });
    return markerPosition ? <Marker position={markerPosition}></Marker> : null;
  }

  return (
    <div className="space-y-3 mt-2">
      <div className="h-64 w-full rounded-lg overflow-hidden border border-slate-600">
        <MapContainer center={position || [51.505, -0.09]} zoom={13} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <LocationMarker />
        </MapContainer>
      </div>
      <Button onClick={onConfirm} size="sm" className="w-full bg-purple-600 hover:bg-purple-700 text-white">Ort bestätigen</Button>
    </div>
  );
};

const LocationWidget = ({ value = { isOnline: false, location: '', position: null, address: '' }, onChange, label }) => {
  const [showMap, setShowMap] = useState(false);
  const [addressInput, setAddressInput] = useState(value.address || '');

  const handleChange = (field, fieldValue) => {
    onChange({ ...value, [field]: fieldValue });
  };

  const handleMapConfirm = async () => {
    if (!value.position) return;
    let address = `Lat: ${value.position.lat.toFixed(4)}, Lng: ${value.position.lng.toFixed(4)}`;
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${value.position.lat}&lon=${value.position.lng}`);
      const data = await response.json();
      if (data && data.display_name) {
        address = data.display_name;
      }
    } catch (error) {
      console.error("Error fetching address:", error);
    }
    handleChange('address', address);
    setAddressInput(address);
    setShowMap(false);
  };
  
  const handleAddressSearch = async () => {
      if (!addressInput) return;
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addressInput)}&format=json&limit=1`);
        const data = await response.json();
        if (data && data.length > 0) {
            const { lat, lon, display_name } = data[0];
            onChange({ ...value, position: { lat: parseFloat(lat), lng: parseFloat(lon) }, address: display_name });
            setAddressInput(display_name);
        }
      } catch(e) {
        console.error("Error geocoding address", e);
      }
  }

  return (
    <div className="p-4 bg-slate-800/60 rounded-lg border border-slate-700 space-y-4 relative">
      <p className="font-medium text-slate-200">{label}</p>
      <div className="flex items-center space-x-2">
        <Checkbox id="online-event" checked={value.isOnline} onCheckedChange={(checked) => { handleChange('isOnline', checked); setShowMap(false); }} />
        <Label htmlFor="online-event" className="text-sm font-medium text-slate-300 cursor-pointer">Online-Veranstaltung</Label>
      </div>
      {value.isOnline ? (
        <div>
          <Label htmlFor="event-link" className="text-xs text-slate-400">Link</Label>
          <input
            id="event-link"
            type="text"
            value={value.location || ''}
            onChange={(e) => handleChange('location', e.target.value)}
            placeholder="https://example.com/meeting"
            className="w-full mt-1 bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-sm focus:ring-purple-500 focus:border-purple-500 text-white"
          />
        </div>
      ) : (
        <div>
          <Label htmlFor="location-address" className="text-xs text-slate-400">Adresse oder Ort</Label>
          <div className="flex items-center space-x-2 mt-1">
            <input
              id="location-address"
              type="text"
              value={addressInput}
              onChange={(e) => setAddressInput(e.target.value)}
              onBlur={handleAddressSearch}
              placeholder="Adresse eingeben..."
              className="flex-grow bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-sm focus:ring-purple-500 focus:border-purple-500 text-white"
            />
            <Button variant="outline" size="icon" className="bg-slate-700 border-slate-600 hover:bg-slate-600" onClick={() => setShowMap(!showMap)}>
              <MapPin className="w-4 h-4 text-slate-300" />
            </Button>
          </div>
          {showMap && (
            <MapPicker
              position={value.position}
              onPositionChange={(pos) => handleChange('position', pos)}
              onConfirm={handleMapConfirm}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default LocationWidget;