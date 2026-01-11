import React from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';

const NotificationBell = ({ unreadCount, onClick, isOpen }) => {
  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={onClick}
        className={`relative h-10 w-10 rounded-full text-white hover:bg-white/20 ${
          isOpen ? 'bg-white/20' : ''
        }`}
      >
        <Bell className="h-5 w-5" />
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-gradient-to-r from-pink-500 to-red-500 flex items-center justify-center text-[10px] font-bold text-white shadow-lg"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </motion.div>
          )}
        </AnimatePresence>
      </Button>
    </div>
  );
};

export default NotificationBell;
