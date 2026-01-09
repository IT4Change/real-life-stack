import React from 'react';
import { motion } from 'framer-motion';
import { X, Home, Users, Settings, Bell, HelpCircle, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';

const Sidebar = ({ isOpen, onClose }) => {
  const menuItems = [
    { icon: Home, label: 'Dashboard', id: 'dashboard' },
    { icon: Users, label: 'Team', id: 'team' },
    { icon: Bell, label: 'Benachrichtigungen', id: 'notifications' },
    { icon: Star, label: 'Favoriten', id: 'favorites' },
    { icon: Settings, label: 'Einstellungen', id: 'settings' },
    { icon: HelpCircle, label: 'Hilfe', id: 'help' }
  ];

  const handleMenuClick = (item) => {
    toast({
      title: `${item.label} ausgewählt`,
      description: "🚧 This feature isn't implemented yet—but don't worry! You can request it in your next prompt! 🚀"
    });
  };

  return (
    <>
      <motion.div
        initial={{ x: -320 }}
        animate={{ x: 0 }}
        exit={{ x: -320 }}
        transition={{ type: "spring", damping: 30, stiffness: 250 }}
        className="fixed left-0 top-16 h-[calc(100vh-4rem)] w-80 bg-white/10 backdrop-blur-lg border-r border-white/20 z-30 overflow-y-auto"
      >
        <div className="p-4">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-white text-lg font-semibold">Navigation</h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-white hover:bg-white/20 lg:hidden"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          <nav className="space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <motion.button
                  key={item.id}
                  onClick={() => handleMenuClick(item)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full flex items-center space-x-3 px-4 py-3 text-white hover:bg-white/20 rounded-lg transition-all group"
                >
                  <Icon className="h-5 w-5 group-hover:scale-110 transition-transform" />
                  <span className="font-medium">{item.label}</span>
                </motion.button>
              );
            })}
          </nav>

          <div className="mt-8 pt-6 border-t border-white/20">
            <div className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-lg p-4">
              <h3 className="text-white font-semibold mb-2">Pro Version</h3>
              <p className="text-white/70 text-sm mb-3">Upgrade für erweiterte Features</p>
              <Button 
                size="sm" 
                className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                onClick={() => toast({
                  title: "Upgrade",
                  description: "🚧 This feature isn't implemented yet—but don't worry! You can request it in your next prompt! 🚀"
                })}
              >
                Jetzt upgraden
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    </>
  );
};

export default Sidebar;