
import React from 'react';
import { MessageCircle } from 'lucide-react';

const Comments = ({ comments: initialComments }) => {
  
  const mockComments = initialComments || [
    {
      id: 1,
      author: { name: 'Max Müller', avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop&crop=face' },
      time: '2h ago',
      text: 'Tolle Idee! Bin gespannt, wie sich das Projekt entwickelt.'
    },
    {
      id: 2,
      author: { name: 'Lisa Weber', avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=100&h=100&fit=crop&crop=face' },
      time: '1h ago',
      text: 'Ich würde gerne mitmachen. Wo kann ich mich melden?'
    },
  ];

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <MessageCircle className="h-5 w-5 text-purple-400" />
        <h3 className="text-lg font-semibold text-white">Kommentare</h3>
      </div>

      <div className="space-y-4 mb-4">
        {mockComments.map((comment) => {
          // Handle both string and object author formats
          const authorName = typeof comment.author === 'string' ? comment.author : comment.author?.name || 'Unbekannt';
          const authorAvatar = typeof comment.author === 'object' ? comment.author?.avatar : null;

          return (
            <div key={comment.id} className="flex gap-3">
              <img
                alt={authorName}
                className="w-8 h-8 rounded-full object-cover"
                src={authorAvatar || "https://images.unsplash.com/photo-1554829954-117d7897bf34"}
              />
              <div className="flex-1">
                <div className="bg-slate-800/40 backdrop-blur-sm rounded-lg p-3 border border-white/10">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm text-white">{authorName}</span>
                    <span className="text-xs text-white/60">{comment.time}</span>
                  </div>
                  <p className="text-sm text-white/80">{comment.text}</p>
                </div>
              </div>
            </div>
          );
        })}
        {mockComments.length === 0 && (
            <p className="text-sm text-white/60 text-center py-4">Noch keine Kommentare vorhanden. Sei der Erste!</p>
        )}
      </div>
    </div>
  );
};

export default Comments;
