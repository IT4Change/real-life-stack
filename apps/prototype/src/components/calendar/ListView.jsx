import React from 'react';
import { motion } from 'framer-motion';
import { format, parseISO, isSameDay, isValid } from 'date-fns';
import { de } from 'date-fns/locale';
import { Calendar, MapPin, Clock } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

const ListView = ({ events, onEventClick, selectedEventId }) => {
  // Group events by date
  const eventsByDate = events.reduce((acc, event) => {
    // Skip events with invalid startTime
    if (!event.startTime) return acc;

    try {
      const dateKey = format(parseISO(event.startTime), 'yyyy-MM-dd');
      if (!acc[dateKey]) {
        acc[dateKey] = {
          date: parseISO(event.startTime),
          events: [],
        };
      }
      acc[dateKey].events.push(event);
    } catch (error) {
      console.error('Invalid date in event:', event.id, error);
    }
    return acc;
  }, {});

  // Sort dates
  const sortedDates = Object.values(eventsByDate).sort(
    (a, b) => a.date - b.date
  );

  // Get author info
  const getAuthorInfo = (authorId) => {
    const users = JSON.parse(localStorage.getItem('users') || '{}');
    return users[authorId] || { name: 'Unknown', avatar: null };
  };

  // Get event type color
  const getEventTypeColor = (type) => {
    switch (type) {
      case 'event':
        return 'text-purple-400 bg-purple-500/10 border-purple-500/30';
      case 'project':
        return 'text-blue-400 bg-blue-500/10 border-blue-500/30';
      case 'offer':
        return 'text-green-400 bg-green-500/10 border-green-500/30';
      default:
        return 'text-gray-400 bg-gray-500/10 border-gray-500/30';
    }
  };

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-white/50 p-8">
        <Calendar className="h-16 w-16 mb-4 opacity-40" />
        <p className="text-lg">Keine Events gefunden</p>
        <p className="text-sm">Versuche andere Filter oder erstelle ein neues Event</p>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto h-full">
      {sortedDates.map((dateGroup, groupIdx) => (
        <div key={format(dateGroup.date, 'yyyy-MM-dd')} className="mb-6">
          {/* Date Header */}
          <div className="sticky top-0 z-10 bg-slate-900/80 backdrop-blur-lg border-b border-white/10 px-4 py-3">
            <h3 className="text-white font-semibold">
              {format(dateGroup.date, 'EEEE, d. MMMM yyyy', { locale: de })}
            </h3>
            <p className="text-white/50 text-sm">
              {dateGroup.events.length} Event{dateGroup.events.length !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Events for this date */}
          <div className="px-4 py-2 space-y-3">
            {dateGroup.events.map((event, eventIdx) => {
              const author = getAuthorInfo(event.authorId);

              // Parse dates safely
              let startTime, endTime;
              try {
                startTime = parseISO(event.startTime);
                // Validate that startTime is a valid date
                if (!isValid(startTime)) {
                  console.error('Invalid startTime in event:', event.id);
                  return null;
                }

                // Parse and validate endTime if it exists
                if (event.endTime) {
                  endTime = parseISO(event.endTime);
                  if (!isValid(endTime)) {
                    console.warn('Invalid endTime in event:', event.id, '- will skip end time');
                    endTime = null;
                  }
                } else {
                  endTime = null;
                }
              } catch (error) {
                console.error('Invalid date format in event:', event.id, error);
                return null;
              }

              const isSelected = event.id === selectedEventId;

              return (
                <motion.button
                  key={event.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: (groupIdx * 0.1) + (eventIdx * 0.05) }}
                  onClick={() => onEventClick(event)}
                  className={`w-full text-left p-4 rounded-lg border transition-all hover:scale-[1.02] ${
                    isSelected
                      ? 'bg-cyan-400/20 border-cyan-300 ring-2 ring-cyan-300 shadow-lg shadow-cyan-400/50'
                      : getEventTypeColor(event.type)
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Author Avatar */}
                    <Avatar className="h-10 w-10 flex-shrink-0">
                      <AvatarImage src={author.avatar} />
                      <AvatarFallback>
                        {author.name.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      {/* Event Title */}
                      <h4 className="text-white font-semibold mb-1">{event.title}</h4>

                      {/* Time */}
                      <div className="flex items-center gap-2 text-sm text-white/70 mb-2">
                        <Clock className="h-4 w-4 flex-shrink-0" />
                        <span>
                          {format(startTime, 'HH:mm', { locale: de })}
                          {endTime && (
                            <>
                              {' '}-{' '}
                              {format(endTime, 'HH:mm', { locale: de })}
                            </>
                          )}
                        </span>
                      </div>

                      {/* Location */}
                      {event.location && (
                        <div className="flex items-center gap-2 text-sm text-white/70 mb-2">
                          <MapPin className="h-4 w-4 flex-shrink-0" />
                          <span className="truncate">{event.location.name}</span>
                        </div>
                      )}

                      {/* Content Preview */}
                      <p className="text-sm text-white/60 line-clamp-2">{event.content}</p>

                      {/* Reactions */}
                      {event.reactions && Object.keys(event.reactions).length > 0 && (
                        <div className="flex items-center gap-2 mt-2">
                          {Object.entries(event.reactions).map(([emoji, count]) => (
                            <span key={emoji} className="text-xs bg-white/10 px-2 py-1 rounded-full">
                              {emoji} {count}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

export default ListView;
