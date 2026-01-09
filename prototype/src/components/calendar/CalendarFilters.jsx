import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar, MapPin, User } from 'lucide-react';
import { Button } from '@/components/ui/button';

const CalendarFilters = ({ isOpen, onClose, filters, onFiltersChange }) => {
  const handleEventTypeToggle = (type) => {
    const newTypes = filters.eventTypes.includes(type)
      ? filters.eventTypes.filter((t) => t !== type)
      : [...filters.eventTypes, type];

    onFiltersChange({ ...filters, eventTypes: newTypes });
  };

  const handleLocationChange = (value) => {
    onFiltersChange({ ...filters, location: value });
  };

  const handleMyEventsToggle = () => {
    onFiltersChange({ ...filters, myEventsOnly: !filters.myEventsOnly });
  };

  const handleReset = () => {
    onFiltersChange({
      eventTypes: ['event', 'project', 'offer'],
      location: 'all',
      myEventsOnly: false,
    });
  };

  const eventTypes = [
    { id: 'event', label: 'Events', color: 'text-purple-400 bg-purple-500/20 border-purple-500/50' },
    { id: 'project', label: 'Projekte', color: 'text-blue-400 bg-blue-500/20 border-blue-500/50' },
    { id: 'offer', label: 'Angebote', color: 'text-green-400 bg-green-500/20 border-green-500/50' },
  ];

  const locationOptions = [
    { id: 'all', label: 'Alle' },
    { id: 'with', label: 'Mit Ort' },
    { id: 'without', label: 'Ohne Ort' },
  ];

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        className="bg-slate-900/80 backdrop-blur-lg border-b border-white/20 overflow-hidden"
      >
        <div className="p-4 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h3 className="text-white font-semibold flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Filter
            </h3>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="text-white/70 hover:text-white hover:bg-white/10 h-8"
              >
                Zurücksetzen
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="text-white/70 hover:text-white hover:bg-white/10 h-8 w-8"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Event Type Filter */}
          <div>
            <label className="block text-white/70 text-sm font-medium mb-2">
              Event-Typ
            </label>
            <div className="flex flex-wrap gap-2">
              {eventTypes.map((type) => (
                <button
                  key={type.id}
                  onClick={() => handleEventTypeToggle(type.id)}
                  className={`px-3 py-2 rounded-lg border transition-all ${
                    filters.eventTypes.includes(type.id)
                      ? type.color
                      : 'text-white/50 bg-slate-800/40 border-white/10 hover:bg-slate-800'
                  }`}
                >
                  <span className="text-sm font-medium">{type.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Location Filter */}
          <div>
            <label className="block text-white/70 text-sm font-medium mb-2 flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Standort
            </label>
            <div className="flex gap-2">
              {locationOptions.map((option) => (
                <button
                  key={option.id}
                  onClick={() => handleLocationChange(option.id)}
                  className={`flex-1 px-3 py-2 rounded-lg border transition-all ${
                    filters.location === option.id
                      ? 'bg-purple-500/20 text-purple-400 border-purple-500/50'
                      : 'text-white/50 bg-slate-800/40 border-white/10 hover:bg-slate-800'
                  }`}
                >
                  <span className="text-sm font-medium">{option.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* My Events Filter */}
          <div>
            <label className="flex items-center justify-between cursor-pointer group">
              <span className="text-white/70 text-sm font-medium flex items-center gap-2">
                <User className="h-4 w-4" />
                Nur meine Events
              </span>
              <button
                onClick={handleMyEventsToggle}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  filters.myEventsOnly ? 'bg-purple-500' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    filters.myEventsOnly ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </label>
          </div>

          {/* Active Filters Count */}
          <div className="pt-2 border-t border-white/10">
            <p className="text-xs text-white/50">
              {filters.eventTypes.length === 3 &&
              filters.location === 'all' &&
              !filters.myEventsOnly
                ? 'Alle Events werden angezeigt'
                : `Aktive Filter: ${
                    (3 - filters.eventTypes.length) +
                    (filters.location !== 'all' ? 1 : 0) +
                    (filters.myEventsOnly ? 1 : 0)
                  }`}
            </p>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default CalendarFilters;
