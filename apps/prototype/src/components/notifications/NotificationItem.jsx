import React from 'react';
import { motion } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Circle, CheckCircle2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import { NOTIFICATION_TYPE_CONFIG } from '@/data/notificationTypes';

const NotificationItem = ({ notification, onToggleRead, onClick }) => {
  const config = NOTIFICATION_TYPE_CONFIG[notification.type];

  const handleClick = () => {
    onClick(notification);
  };

  const handleToggleRead = (e) => {
    e.stopPropagation();
    onToggleRead(notification.id);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className={`flex items-start gap-3 p-4 border-b border-white/10 cursor-pointer transition-colors ${
        !notification.isRead
          ? 'bg-purple-500/10 hover:bg-purple-500/20'
          : 'hover:bg-white/5'
      }`}
      onClick={handleClick}
    >
      {/* Avatar */}
      <Avatar className="h-10 w-10 flex-shrink-0">
        <AvatarImage src={notification.data.userAvatar} />
        <AvatarFallback>
          {notification.data.userName.substring(0, 2)}
        </AvatarFallback>
      </Avatar>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm text-white/90 leading-snug">
            <span className="font-semibold">{notification.data.userName}</span>
            {' '}
            {config.template(notification.data)}
          </p>
          <span className={`text-lg flex-shrink-0 ${config.color}`}>
            {config.icon}
          </span>
        </div>

        {/* Comment preview for comment notifications */}
        {(notification.type === 'new_comment' || notification.type === 'comment_reply') &&
         notification.data.commentText && (
          <p className="text-sm text-white/60 mt-1 line-clamp-2 italic">
            "{notification.data.commentText}"
          </p>
        )}

        <p className="text-xs text-white/50 mt-1">
          {formatDistanceToNow(new Date(notification.createdAt), {
            addSuffix: true,
            locale: de
          })}
        </p>
      </div>

      {/* Read/Unread Toggle */}
      <Button
        variant="ghost"
        size="icon"
        onClick={handleToggleRead}
        className="flex-shrink-0 h-8 w-8 hover:bg-white/10"
        title={notification.isRead ? 'Als ungelesen markieren' : 'Als gelesen markieren'}
      >
        {notification.isRead ? (
          <CheckCircle2 className="h-4 w-4 text-green-400" />
        ) : (
          <Circle className="h-4 w-4 text-purple-400" />
        )}
      </Button>
    </motion.div>
  );
};

export default NotificationItem;
