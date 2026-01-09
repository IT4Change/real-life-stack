import React from 'react';
import { motion } from 'framer-motion';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isToday,
  isSameDay,
  parseISO,
} from 'date-fns';
import { de } from 'date-fns/locale';
import EventIndicator from './EventIndicator';

const MonthView = ({ currentDate, events, onEventClick, onDateClick, selectedEventId }) => {
  // Get all days to display in the calendar grid
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 }); // Monday
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  // Group events by date
  const eventsByDate = events.reduce((acc, event) => {
    // Skip events without startTime
    if (!event.startTime) return acc;

    try {
      const dateKey = format(parseISO(event.startTime), 'yyyy-MM-dd');
      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push(event);
    } catch (error) {
      console.error('Invalid date in event:', event.id, error);
    }
    return acc;
  }, {});

  // Week day headers
  const weekDays = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

  return (
    <div className="flex flex-col h-full">
      {/* Week day headers */}
      <div className="grid grid-cols-7 gap-px bg-white/10 border-b border-white/20">
        {weekDays.map((day) => (
          <div
            key={day}
            className="bg-slate-900/30 p-2 text-center text-xs font-semibold text-white/70"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="flex-1 grid grid-cols-7 gap-px bg-white/10 overflow-auto">
        {days.map((day, idx) => {
          const dateKey = format(day, 'yyyy-MM-dd');
          const dayEvents = eventsByDate[dateKey] || [];
          const isCurrentMonth = isSameMonth(day, currentDate);
          const isTodayDate = isToday(day);

          return (
            <motion.div
              key={day.toISOString()}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.01 }}
              onClick={() => onDateClick && onDateClick(day, dayEvents)}
              className={`bg-slate-900/20 p-2 min-h-[100px] cursor-pointer transition-colors hover:bg-slate-800/40 ${
                !isCurrentMonth ? 'opacity-40' : ''
              } ${isTodayDate ? 'ring-2 ring-purple-400 ring-inset' : ''}`}
            >
              {/* Date number */}
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`text-sm font-semibold ${
                    isTodayDate
                      ? 'bg-purple-500 text-white rounded-full h-6 w-6 flex items-center justify-center'
                      : 'text-white/90'
                  }`}
                >
                  {format(day, 'd')}
                </span>
                {dayEvents.length > 0 && (
                  <span className="text-xs text-purple-400 font-medium">
                    {dayEvents.length}
                  </span>
                )}
              </div>

              {/* Event indicators */}
              <EventIndicator
                events={dayEvents}
                onClick={onEventClick}
                compact={dayEvents.length > 2}
                selectedEventId={selectedEventId}
              />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default MonthView;
