import React from 'react';
import { motion } from 'framer-motion';
import {
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isToday,
  parseISO,
  getHours,
  getMinutes,
  isValid,
} from 'date-fns';
import { de } from 'date-fns/locale';

const WeekView = ({ currentDate, events, onEventClick, onSlotClick, selectedEventId }) => {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  // Time slots (6 AM to 11 PM)
  const hours = Array.from({ length: 18 }, (_, i) => i + 6);

  // Group events by day and hour
  const eventsByDayAndHour = events.reduce((acc, event) => {
    // Skip events without startTime
    if (!event.startTime) return acc;

    try {
      const startTime = parseISO(event.startTime);
      const dateKey = format(startTime, 'yyyy-MM-dd');
      const hour = getHours(startTime);

      if (!acc[dateKey]) acc[dateKey] = {};
      if (!acc[dateKey][hour]) acc[dateKey][hour] = [];
      acc[dateKey][hour].push(event);
    } catch (error) {
      console.error('Invalid date in event:', event.id, error);
    }
    return acc;
  }, {});

  // Get event type color
  const getEventColor = (type, isSelected) => {
    if (isSelected) {
      return 'bg-cyan-400 hover:bg-cyan-500 ring-2 ring-cyan-300';
    }
    switch (type) {
      case 'event':
        return 'bg-purple-500 hover:bg-purple-600';
      case 'project':
        return 'bg-blue-500 hover:bg-blue-600';
      case 'offer':
        return 'bg-green-500 hover:bg-green-600';
      default:
        return 'bg-gray-500 hover:bg-gray-600';
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-8 gap-px bg-white/10 border-b border-white/20 flex-shrink-0">
        <div className="bg-slate-900/30 p-2 text-center text-xs font-semibold text-white/50">
          Zeit
        </div>
        {weekDays.map((day) => {
          const isTodayDate = isToday(day);
          return (
            <div
              key={day.toISOString()}
              className={`bg-slate-900/30 p-2 text-center ${
                isTodayDate ? 'bg-purple-500/20' : ''
              }`}
            >
              <div className="text-xs font-semibold text-white/70">
                {format(day, 'EEE', { locale: de })}
              </div>
              <div
                className={`text-lg font-bold ${
                  isTodayDate ? 'text-purple-400' : 'text-white'
                }`}
              >
                {format(day, 'd')}
              </div>
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-8 gap-px bg-white/10">
          {hours.map((hour) => (
            <React.Fragment key={hour}>
              {/* Hour label */}
              <div className="bg-slate-900/20 p-2 text-center text-xs text-white/50 border-t border-white/5">
                {hour}:00
              </div>

              {/* Day cells */}
              {weekDays.map((day) => {
                const dateKey = format(day, 'yyyy-MM-dd');
                const hourEvents = eventsByDayAndHour[dateKey]?.[hour] || [];

                return (
                  <div
                    key={`${day.toISOString()}-${hour}`}
                    onClick={() => onSlotClick && onSlotClick(day, hour)}
                    className="bg-slate-900/10 p-1 min-h-[60px] cursor-pointer hover:bg-slate-800/30 transition-colors border-t border-white/5"
                  >
                    {hourEvents.map((event, idx) => {
                      let startTime, minutes;
                      try {
                        startTime = parseISO(event.startTime);
                        if (!isValid(startTime)) {
                          console.error('Invalid startTime in event render:', event.id);
                          return null;
                        }
                        minutes = getMinutes(startTime);
                      } catch (error) {
                        console.error('Invalid date in event render:', event.id, error);
                        return null;
                      }

                      const isSelected = event.id === selectedEventId;
                      return (
                        <motion.button
                          key={event.id}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: idx * 0.05 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onEventClick(event);
                          }}
                          className={`w-full text-left px-2 py-1 rounded text-xs font-medium text-white mb-1 transition-colors ${getEventColor(
                            event.type,
                            isSelected
                          )} ${isSelected ? 'shadow-lg shadow-cyan-400/50 scale-[1.03]' : ''}`}
                          style={{ marginTop: `${(minutes / 60) * 40}px` }}
                        >
                          <div className="truncate">{event.title}</div>
                        </motion.button>
                      );
                    })}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
};

export default WeekView;
