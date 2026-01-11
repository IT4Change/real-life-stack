import React from 'react';
import { motion } from 'framer-motion';
import { format, parseISO, getHours, getMinutes, differenceInMinutes, isValid } from 'date-fns';
import { de } from 'date-fns/locale';
import { Clock, MapPin } from 'lucide-react';

const DayView = ({ currentDate, events, onEventClick, onSlotClick, selectedEventId }) => {
  // Time slots (6 AM to 11 PM, 30 min intervals)
  const timeSlots = Array.from({ length: 36 }, (_, i) => {
    const hour = Math.floor(i / 2) + 6;
    const minute = (i % 2) * 30;
    return { hour, minute };
  });

  // Filter events for selected day
  const dayEvents = events.filter((event) => {
    // Skip events without startTime
    if (!event.startTime) return false;

    try {
      const eventDate = format(parseISO(event.startTime), 'yyyy-MM-dd');
      const selectedDate = format(currentDate, 'yyyy-MM-dd');
      return eventDate === selectedDate;
    } catch (error) {
      console.error('Invalid date in event:', event.id, error);
      return false;
    }
  });

  // Group events by start time slot
  const eventsBySlot = dayEvents.reduce((acc, event) => {
    try {
      const startTime = parseISO(event.startTime);
      const hour = getHours(startTime);
      const minute = getMinutes(startTime);
      const slotIndex = (hour - 6) * 2 + (minute >= 30 ? 1 : 0);

      if (!acc[slotIndex]) acc[slotIndex] = [];
      acc[slotIndex].push(event);
    } catch (error) {
      console.error('Error parsing event time:', event.id, error);
    }
    return acc;
  }, {});

  // Get event type color
  const getEventColor = (type, isSelected) => {
    if (isSelected) {
      return 'bg-cyan-400/90 hover:bg-cyan-500 border-cyan-300 ring-2 ring-cyan-300';
    }
    switch (type) {
      case 'event':
        return 'bg-purple-500/90 hover:bg-purple-600 border-purple-400';
      case 'project':
        return 'bg-blue-500/90 hover:bg-blue-600 border-blue-400';
      case 'offer':
        return 'bg-green-500/90 hover:bg-green-600 border-green-400';
      default:
        return 'bg-gray-500/90 hover:bg-gray-600 border-gray-400';
    }
  };

  // Calculate event height based on duration
  const getEventHeight = (event) => {
    try {
      const start = parseISO(event.startTime);
      if (!isValid(start)) return 60; // Default if invalid startTime
      if (!event.endTime) return 60; // Default 1 hour if no endTime

      const end = parseISO(event.endTime);
      if (!isValid(end)) return 60; // Default if invalid endTime

      const duration = differenceInMinutes(end, start);
      return Math.max((duration / 30) * 60, 60); // Min 60px
    } catch (error) {
      console.error('Error calculating event height:', event.id, error);
      return 60; // Default height
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Day header */}
      <div className="bg-slate-900/50 backdrop-blur-lg border-b border-white/20 p-4 flex-shrink-0">
        <h3 className="text-white font-semibold text-lg">
          {format(currentDate, 'EEEE, d. MMMM yyyy', { locale: de })}
        </h3>
        <p className="text-white/50 text-sm">
          {dayEvents.length} Event{dayEvents.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Time slots */}
      <div className="flex-1 overflow-y-auto">
        {timeSlots.map((slot, idx) => {
          const slotEvents = eventsBySlot[idx] || [];
          const timeLabel = `${slot.hour.toString().padStart(2, '0')}:${slot.minute
            .toString()
            .padStart(2, '0')}`;

          return (
            <div
              key={idx}
              onClick={() => onSlotClick && onSlotClick(currentDate, slot.hour, slot.minute)}
              className="flex border-t border-white/5 hover:bg-slate-800/30 transition-colors cursor-pointer"
              style={{ minHeight: '60px' }}
            >
              {/* Time label */}
              <div className="w-20 flex-shrink-0 p-2 text-right text-xs text-white/50 bg-slate-900/20">
                {timeLabel}
              </div>

              {/* Events */}
              <div className="flex-1 p-2 relative">
                {slotEvents.map((event, eventIdx) => {
                  let startTime, endTime;
                  try {
                    startTime = parseISO(event.startTime);
                    if (!isValid(startTime)) {
                      console.error('Invalid startTime in event render:', event.id);
                      return null;
                    }

                    if (event.endTime) {
                      endTime = parseISO(event.endTime);
                      if (!isValid(endTime)) {
                        console.warn('Invalid endTime in event:', event.id);
                        endTime = null;
                      }
                    } else {
                      endTime = null;
                    }
                  } catch (error) {
                    console.error('Invalid date in event render:', event.id, error);
                    return null;
                  }
                  const eventHeight = getEventHeight(event);
                  const isSelected = event.id === selectedEventId;

                  return (
                    <motion.button
                      key={event.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: eventIdx * 0.05 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick(event);
                      }}
                      className={`w-full text-left p-3 rounded-lg border-l-4 transition-all mb-2 ${getEventColor(
                        event.type,
                        isSelected
                      )} ${isSelected ? 'shadow-lg shadow-cyan-400/50 scale-[1.03]' : ''}`}
                      style={{ height: `${eventHeight}px` }}
                    >
                      <div className="flex flex-col h-full">
                        <h4 className="text-white font-semibold mb-1">{event.title}</h4>

                        <div className="flex items-center gap-2 text-sm text-white/80 mb-2">
                          <Clock className="h-3 w-3 flex-shrink-0" />
                          <span>
                            {format(startTime, 'HH:mm')}
                            {endTime && (
                              <>
                                {' '}- {format(endTime, 'HH:mm')}
                              </>
                            )}
                          </span>
                        </div>

                        {event.location && (
                          <div className="flex items-center gap-2 text-sm text-white/70 mb-2">
                            <MapPin className="h-3 w-3 flex-shrink-0" />
                            <span className="truncate">{event.location.name}</span>
                          </div>
                        )}

                        <p className="text-sm text-white/60 line-clamp-2 flex-1">
                          {event.content}
                        </p>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DayView;
