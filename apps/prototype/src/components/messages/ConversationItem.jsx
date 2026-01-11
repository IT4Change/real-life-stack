import React from 'react';
import { motion } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import { Pin, Volume2, VolumeX } from 'lucide-react';

const ConversationItem = ({ conversation, isActive, onClick }) => {
  const displayName = conversation.name;
  const lastMessage = conversation.lastMessage;
  const hasUnread = conversation.unreadCount > 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className={`flex items-start gap-3 p-4 cursor-pointer transition-colors border-b border-white/10 ${
        isActive
          ? 'bg-purple-500/20 border-l-4 border-l-purple-400'
          : hasUnread
          ? 'bg-purple-500/5 hover:bg-purple-500/10'
          : 'hover:bg-white/5'
      }`}
      onClick={onClick}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <Avatar className="h-12 w-12">
          <AvatarImage src={conversation.avatar} />
          <AvatarFallback>
            {displayName.substring(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        {hasUnread && (
          <div className="absolute -top-1 -right-1 h-5 w-5 bg-purple-500 rounded-full border-2 border-slate-900"></div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <h4 className={`text-sm truncate ${hasUnread ? 'font-semibold text-white' : 'font-medium text-white/90'}`}>
              {displayName}
            </h4>
            {conversation.isPinned && (
              <Pin className="h-3 w-3 text-purple-400 flex-shrink-0" />
            )}
            {conversation.isMuted && (
              <VolumeX className="h-3 w-3 text-white/40 flex-shrink-0" />
            )}
          </div>
          {lastMessage && (
            <span className="text-xs text-white/50 flex-shrink-0">
              {formatDistanceToNow(new Date(lastMessage.createdAt), {
                addSuffix: false,
                locale: de
              })}
            </span>
          )}
        </div>

        {/* Last message preview */}
        {lastMessage && (
          <p className={`text-sm truncate ${hasUnread ? 'text-white/80 font-medium' : 'text-white/60'}`}>
            {lastMessage.content || '[Anhang]'}
          </p>
        )}

        {/* Unread count badge */}
        {hasUnread && (
          <div className="mt-1">
            <span className="inline-block px-2 py-0.5 bg-purple-500 text-white text-xs font-bold rounded-full">
              {conversation.unreadCount}
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default ConversationItem;
