import React from 'react';
import { motion } from 'framer-motion';

const EventIndicator = ({ events, onClick, compact = false, selectedEventId }) => {
  if (!events || events.length === 0) return null;

  // Get event type colors
  const getEventColor = (type, isSelected) => {
    if (isSelected) {
      return 'bg-cyan-400 ring-2 ring-cyan-300';
    }
    switch (type) {
      case 'event':
        return 'bg-purple-500';
      case 'project':
        return 'bg-blue-500';
      case 'offer':
        return 'bg-green-500';
      default:
        return 'bg-gray-500';
    }
  };

  // Compact mode: just dots
  if (compact || events.length > 3) {
    return (
      <div className="flex flex-wrap gap-1 mt-1">
        {events.slice(0, 3).map((event, idx) => {
          const isSelected = event.id === selectedEventId;
          return (
            <motion.div
              key={event.id}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: idx * 0.05 }}
              className={`h-1.5 w-1.5 rounded-full ${getEventColor(event.type, isSelected)} ${
                isSelected ? 'h-2 w-2 shadow-lg shadow-cyan-400/60' : ''
              }`}
            />
          );
        })}
        {events.length > 3 && (
          <span className="text-[10px] text-white/50 ml-1">+{events.length - 3}</span>
        )}
      </div>
    );
  }

  // Expanded mode: show event titles
  return (
    <div className="mt-1 space-y-1">
      {events.map((event, idx) => {
        const isSelected = event.id === selectedEventId;
        return (
          <motion.button
            key={event.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.05 }}
            onClick={(e) => {
              e.stopPropagation();
              onClick(event);
            }}
            className={`w-full text-left px-2 py-1 rounded text-xs truncate transition-colors ${getEventColor(
              event.type,
              isSelected
            )} hover:brightness-110 ${isSelected ? 'shadow-lg shadow-cyan-400/50 scale-[1.03]' : ''}`}
          >
            <span className="font-medium text-white">
              {new Date(event.startTime).toLocaleTimeString('de-DE', {
                hour: '2-digit',
                minute: '2-digit',
              })}{' '}
              {event.title}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
};

export default EventIndicator;
