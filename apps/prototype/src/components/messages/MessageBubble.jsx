import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import { Smile, Reply, MoreVertical, Check, CheckCheck } from 'lucide-react';
import { CURRENT_USER_ID } from '@/data/mockMessages';
import { MESSAGE_TYPES } from '@/data/messageTypes';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { COMMON_REACTIONS } from '@/data/messageTypes';

const MessageBubble = ({
  message,
  senderInfo,
  onReact,
  onReply,
  replyToMessage,
  showAvatar = true
}) => {
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const isOwnMessage = message.senderId === CURRENT_USER_ID;

  const handleReactionClick = (emoji) => {
    onReact(message.id, emoji);
    setShowReactionPicker(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-3 mb-4 group ${isOwnMessage ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {/* Avatar (only for other users' messages) */}
      {showAvatar && !isOwnMessage && (
        <Avatar className="h-8 w-8 flex-shrink-0">
          <AvatarImage src={senderInfo?.avatar} />
          <AvatarFallback>
            {senderInfo?.name?.substring(0, 2).toUpperCase() || 'U'}
          </AvatarFallback>
        </Avatar>
      )}

      {/* Spacer when avatar is hidden */}
      {!showAvatar && !isOwnMessage && <div className="w-8 flex-shrink-0"></div>}

      {/* Message content */}
      <div className={`flex flex-col max-w-[70%] ${isOwnMessage ? 'items-end' : 'items-start'}`}>
        {/* Sender name (only for other users) */}
        {!isOwnMessage && showAvatar && (
          <span className="text-xs text-white/60 mb-1 px-3">
            {senderInfo?.name || 'Unknown'}
          </span>
        )}

        {/* Reply preview */}
        {message.replyTo && replyToMessage && (
          <div className={`px-3 py-1 mb-1 rounded-lg text-xs bg-white/5 border-l-2 ${
            isOwnMessage ? 'border-purple-400' : 'border-white/30'
          }`}>
            <p className="text-white/50 truncate">
              {replyToMessage.content || '[Anhang]'}
            </p>
          </div>
        )}

        {/* Message bubble */}
        <div className="relative group/bubble">
          <div
            className={`px-4 py-2 rounded-2xl ${
              isOwnMessage
                ? 'bg-gradient-to-br from-purple-500 to-purple-600 text-white'
                : 'bg-slate-800/80 text-white/90'
            }`}
          >
            {/* Image attachment */}
            {message.type === MESSAGE_TYPES.IMAGE && message.attachments?.[0] && (
              <div className="rounded-lg overflow-hidden mb-2">
                <img
                  src={message.attachments[0].url}
                  alt={message.attachments[0].name}
                  className="max-w-full max-h-64 object-cover"
                />
              </div>
            )}

            {/* Text content */}
            {message.content && (
              <p className="text-sm whitespace-pre-wrap break-words">
                {message.content}
              </p>
            )}

            {/* Timestamp and status */}
            <div className={`flex items-center gap-1 mt-1 ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
              <span className={`text-xs ${isOwnMessage ? 'text-white/70' : 'text-white/50'}`}>
                {formatDistanceToNow(new Date(message.createdAt), {
                  addSuffix: false,
                  locale: de
                })}
              </span>
              {message.isEdited && (
                <span className={`text-xs italic ${isOwnMessage ? 'text-white/70' : 'text-white/50'}`}>
                  (bearbeitet)
                </span>
              )}
              {isOwnMessage && (
                <span className="ml-1">
                  {message.isRead ? (
                    <CheckCheck className="h-3 w-3 text-blue-300" />
                  ) : message.isDelivered ? (
                    <CheckCheck className="h-3 w-3 text-white/70" />
                  ) : (
                    <Check className="h-3 w-3 text-white/70" />
                  )}
                </span>
              )}
            </div>
          </div>

          {/* Action buttons (visible on hover) */}
          <div className={`absolute top-0 ${isOwnMessage ? 'left-0 -translate-x-full' : 'right-0 translate-x-full'} opacity-0 group-hover/bubble:opacity-100 transition-opacity flex items-center gap-1 px-2`}>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 bg-slate-800/80 hover:bg-slate-700 text-white rounded-full"
              onClick={() => setShowReactionPicker(!showReactionPicker)}
            >
              <Smile className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 bg-slate-800/80 hover:bg-slate-700 text-white rounded-full"
              onClick={() => onReply(message)}
            >
              <Reply className="h-4 w-4" />
            </Button>
            {isOwnMessage && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 bg-slate-800/80 hover:bg-slate-700 text-white rounded-full"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>Bearbeiten</DropdownMenuItem>
                  <DropdownMenuItem className="text-red-600">Löschen</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* Reaction picker */}
          {showReactionPicker && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`absolute top-full mt-1 ${isOwnMessage ? 'right-0' : 'left-0'} bg-slate-800 rounded-lg p-2 shadow-xl border border-white/20 flex gap-1 z-10`}
            >
              {COMMON_REACTIONS.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => handleReactionClick(emoji)}
                  className="hover:bg-white/10 rounded p-1 transition-colors text-lg"
                >
                  {emoji}
                </button>
              ))}
            </motion.div>
          )}
        </div>

        {/* Reactions */}
        {message.reactions && Object.keys(message.reactions).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1 px-2">
            {Object.entries(message.reactions).map(([emoji, userIds]) => (
              <button
                key={emoji}
                onClick={() => onReact(message.id, emoji)}
                className={`px-2 py-0.5 rounded-full text-xs flex items-center gap-1 transition-colors ${
                  userIds.includes(CURRENT_USER_ID)
                    ? 'bg-purple-500/30 border border-purple-400/50'
                    : 'bg-white/10 border border-white/20 hover:bg-white/20'
                }`}
              >
                <span>{emoji}</span>
                <span className="text-white/70">{userIds.length}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default MessageBubble;
