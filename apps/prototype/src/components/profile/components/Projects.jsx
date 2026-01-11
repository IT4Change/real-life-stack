
import React from 'react';
import { Briefcase, Users, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';

const Projects = ({ projects }) => {
  const mockProjects = projects || [
    {
      id: 1,
      title: 'Urban Farming Initiative',
      description: 'Aufbau von Hochbeeten in der Nachbarschaft',
      status: 'Aktiv',
      members: 15,
      progress: 75,
      deadline: '2024-06-30'
    },
    {
      id: 2,
      title: 'Nachbarschafts-App',
      description: 'Entwicklung einer App für lokale Vernetzung',
      status: 'Planung',
      members: 8,
      progress: 25,
      deadline: '2024-08-15'
    },
    {
      id: 3,
      title: 'Repair Café',
      description: 'Monatliches Reparatur-Café im Kiez',
      status: 'Abgeschlossen',
      members: 12,
      progress: 100,
      deadline: '2024-02-28'
    }
  ];

  const handleProjectClick = (projectId) => {
    toast({
      title: "📋 Projekt öffnen",
      description: "🚧 Diese Funktion ist noch nicht implementiert—aber keine Sorge! Du kannst sie in deinem nächsten Prompt anfordern! 🚀"
    });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Aktiv': return 'bg-green-100 text-green-800';
      case 'Planung': return 'bg-yellow-100 text-yellow-800';
      case 'Abgeschlossen': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('de-DE');
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Briefcase className="h-5 w-5 text-purple-400" />
        <h3 className="text-lg font-semibold text-white">Projekte</h3>
      </div>

      <div className="space-y-4">
        {mockProjects.map((project) => (
          <div
            key={project.id}
            className="p-4 border border-white/20 rounded-lg hover:border-purple-400/50 hover:bg-white/10 transition-colors cursor-pointer backdrop-blur-sm"
            onClick={() => handleProjectClick(project.id)}
          >
            <div className="flex justify-between items-start mb-2">
              <h4 className="font-medium text-white">{project.title}</h4>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(project.status)}`}>
                {project.status}
              </span>
            </div>

            <p className="text-sm text-white/70 mb-3">{project.description}</p>

            {/* Progress Bar */}
            <div className="mb-3">
              <div className="flex justify-between text-xs text-white/60 mb-1">
                <span>Fortschritt</span>
                <span>{project.progress}%</span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${project.progress}%` }}
                ></div>
              </div>
            </div>

            <div className="flex justify-between items-center text-sm text-white/70">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  <span>{project.members} Mitglieder</span>
                </div>
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span>{formatDate(project.deadline)}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Button 
        variant="outline" 
        className="w-full mt-4"
        onClick={() => toast({
          title: "📋 Alle Projekte anzeigen",
          description: "🚧 Diese Funktion ist noch nicht implementiert—aber keine Sorge! Du kannst sie in deinem nächsten Prompt anfordern! 🚀"
        })}
      >
        Alle Projekte anzeigen
      </Button>
    </div>
  );
};

export default Projects;
