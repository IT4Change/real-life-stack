import React from 'react';
import { motion } from 'framer-motion';
import { Calendar, Map, Rss } from 'lucide-react';

const BottomMenu = ({ currentView, setCurrentView }) => {
  const viewOptions = [
    { id: 'feed', label: 'Feed', icon: Rss },
    { id: 'map', label: 'Karte', icon: Map },
    { id: 'calendar', label: 'Kalender', icon: Calendar }
  ];

  return (
    <motion.div 
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="md:hidden w-full bg-white/10 backdrop-blur-lg border-t border-white/20 mt-auto"
    >
      <div className="flex items-center justify-around py-2 pb-[env(safe-area-inset-bottom)]">
        {viewOptions.map((option) => {
          const Icon = option.icon;
          const isActive = currentView === option.id;
          
          return (
            <motion.button
              key={option.id}
              onClick={() => setCurrentView(option.id)}
              whileTap={{ scale: 0.95 }}
              className={`flex flex-col items-center space-y-1 px-4 py-2 rounded-lg transition-all ${
                isActive 
                  ? 'text-white' 
                  : 'text-white/60 hover:text-white'
              }`}
            >
              <div className={`p-2 rounded-full transition-all ${
                isActive 
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 shadow-lg' 
                  : 'hover:bg-white/20'
              }`}>
                <Icon className="h-5 w-5" />
              </div>
              <span className="text-xs font-medium">{option.label}</span>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
};

export default BottomMenu;
