
import React from 'react';
import { Calendar, Clock, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';

const ComingEvents = ({ events }) => {
  const mockEvents = events || [
    {
      id: 1,
      title: 'Pflanzworkshop',
      date: '2024-03-20',
      time: '15:00',
      location: 'Community Garden',
      participants: 8
    },
    {
      id: 2,
      title: 'Ernte-Festival',
      date: '2024-04-15',
      time: '11:00',
      location: 'Volkspark Friedrichshain',
      participants: 25
    },
    {
      id: 3,
      title: 'Kompost Workshop',
      date: '2024-05-10',
      time: '14:00',
      location: 'Community Garden',
      participants: 12
    }
  ];

  const handleEventClick = (eventId) => {
    toast({
      title: "📅 Event öffnen",
      description: "🚧 Diese Funktion ist noch nicht implementiert—aber keine Sorge! Du kannst sie in deinem nächsten Prompt anfordern! 🚀"
    });
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit'
    });
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Calendar className="h-5 w-5 text-purple-400" />
        <h3 className="text-lg font-semibold text-white">Kommende Events</h3>
      </div>

      <div className="space-y-3">
        {mockEvents.map((event) => (
          <div
            key={event.id}
            className="p-3 border border-white/20 rounded-lg hover:border-purple-400/50 hover:bg-white/10 transition-colors cursor-pointer backdrop-blur-sm"
            onClick={() => handleEventClick(event.id)}
          >
            <div className="flex justify-between items-start mb-2">
              <h4 className="font-medium text-white">{event.title}</h4>
              <span className="text-sm font-medium text-purple-400">
                {formatDate(event.date)}
              </span>
            </div>
            
            <div className="space-y-1 text-sm text-white/70">
              <div className="flex items-center gap-2">
                <Clock className="h-3 w-3" />
                <span>{event.time}</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-3 w-3" />
                <span>{event.location}</span>
              </div>
            </div>

            <div className="mt-2 text-xs text-gray-500">
              {event.participants} Teilnehmer
            </div>
          </div>
        ))}
      </div>

      <Button 
        variant="outline" 
        className="w-full mt-4"
        onClick={() => toast({
          title: "📅 Alle Events anzeigen",
          description: "🚧 Diese Funktion ist noch nicht implementiert—aber keine Sorge! Du kannst sie in deinem nächsten Prompt anfordern! 🚀"
        })}
      >
        Alle Events anzeigen
      </Button>
    </div>
  );
};

export default ComingEvents;
