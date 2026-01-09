import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

const MessageButton = ({ unreadCount, onClick, isOpen }) => {
  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={onClick}
        className={`relative h-10 w-10 rounded-full text-white hover:bg-white/20 ${
          isOpen ? 'bg-white/20' : ''
        }`}
        aria-label="Nachrichten"
      >
        <MessageCircle className="h-5 w-5" />

        {/* Unread badge */}
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 bg-gradient-to-br from-pink-500 to-red-500 rounded-full flex items-center justify-center shadow-lg"
            >
              <span className="text-white text-xs font-bold">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </Button>
    </div>
  );
};

export default MessageButton;
