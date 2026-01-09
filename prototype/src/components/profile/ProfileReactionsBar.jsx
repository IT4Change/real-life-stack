
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ThumbsUp, Heart, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const ProfileReactionsBar = ({ reactions, commentsCount, onReaction, onCommentClick, isVisible }) => {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          className="absolute bottom-0 left-0 right-0 z-20 border-t border-white/20 bg-slate-800/90 backdrop-blur-lg"
        >
          <div className="flex items-center justify-between gap-4 p-3">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onReaction('likes')}
                className={cn(
                  "flex items-center gap-2 transition-colors",
                  reactions.userLiked ? 'text-purple-400 bg-purple-500/20' : 'text-white/70 hover:bg-white/10'
                )}
              >
                <ThumbsUp className="h-5 w-5" />
                <span className="font-medium">{reactions.likes}</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onReaction('hearts')}
                className={cn(
                    "flex items-center gap-2 transition-colors",
                    reactions.userHearted ? 'text-red-400 bg-red-500/20' : 'text-white/70 hover:bg-white/10'
                )}
              >
                <Heart className="h-5 w-5" />
                <span className="font-medium">{reactions.hearts}</span>
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={onCommentClick}
              className="flex items-center gap-2 text-white/70 hover:bg-white/10"
            >
              <MessageCircle className="h-5 w-5" />
              <span className="font-medium">{commentsCount}</span>
              <span className="hidden sm:inline">Kommentare</span>
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ProfileReactionsBar;
