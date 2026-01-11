import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, MoreVertical, Phone, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import { CURRENT_USER_ID } from '@/data/mockMessages';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const MessageThread = ({
  conversation,
  messages,
  onBack,
  onSendMessage,
  onReact,
  onTogglePin,
  onToggleMute,
  isMobile,
}) => {
  const [replyTo, setReplyTo] = useState(null);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (content, attachments, replyToId) => {
    const type = attachments.length > 0 && attachments[0].type === 'image' ? 'image' : 'text';
    onSendMessage(conversation.id, content, type, attachments, replyToId);
    setReplyTo(null);
  };

  const handleReply = (message) => {
    setReplyTo(message);
  };

  const handleCancelReply = () => {
    setReplyTo(null);
  };

  // Group messages by same sender for avatar display logic
  const messagesWithAvatarInfo = messages.map((msg, index) => {
    const prevMsg = index > 0 ? messages[index - 1] : null;
    const showAvatar = !prevMsg || prevMsg.senderId !== msg.senderId;
    return { ...msg, showAvatar };
  });

  // Get sender info for messages
  const getSenderInfo = (senderId) => {
    if (senderId === CURRENT_USER_ID) {
      return { name: 'Du', avatar: null };
    }

    // For direct conversations, use conversation info
    if (conversation.type === 'direct') {
      return {
        name: conversation.name,
        avatar: conversation.avatar,
      };
    }

    // For group conversations, we'd need to look up participant info
    // For now, return placeholder
    return {
      name: 'User',
      avatar: null,
    };
  };

  return (
    <div className="h-full flex flex-col bg-slate-900/30">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/20 bg-slate-900/50 backdrop-blur-lg flex-shrink-0">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Back button (mobile only) */}
          {isMobile && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="text-white hover:bg-white/10 flex-shrink-0"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}

          {/* Conversation info */}
          <Avatar className="h-10 w-10 flex-shrink-0">
            <AvatarImage src={conversation.avatar} />
            <AvatarFallback>
              {conversation.name.substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h3 className="text-white font-semibold truncate">{conversation.name}</h3>
            <p className="text-xs text-white/50">
              {conversation.type === 'group'
                ? `${conversation.participants.length} Mitglieder`
                : 'Online'}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="text-white/70 hover:text-white hover:bg-white/10"
          >
            <Phone className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-white/70 hover:text-white hover:bg-white/10"
          >
            <Video className="h-5 w-5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-white/70 hover:text-white hover:bg-white/10"
              >
                <MoreVertical className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onTogglePin(conversation.id)}>
                {conversation.isPinned ? 'Lösen' : 'Anheften'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onToggleMute(conversation.id)}>
                {conversation.isMuted ? 'Stummschaltung aufheben' : 'Stummschalten'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-600">
                Unterhaltung löschen
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-1"
        style={{ overflowAnchor: 'auto' }}
      >
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-white/50">
            <p>Noch keine Nachrichten. Schreibe die erste!</p>
          </div>
        ) : (
          <>
            {messagesWithAvatarInfo.map((message) => {
              const senderInfo = getSenderInfo(message.senderId);
              const replyToMessage = message.replyTo
                ? messages.find(m => m.id === message.replyTo)
                : null;

              return (
                <MessageBubble
                  key={message.id}
                  message={message}
                  senderInfo={senderInfo}
                  onReact={(messageId, emoji) => onReact(conversation.id, messageId, emoji)}
                  onReply={handleReply}
                  replyToMessage={replyToMessage}
                  showAvatar={message.showAvatar}
                />
              );
            })}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="flex-shrink-0">
        <MessageInput
          onSend={handleSend}
          replyTo={replyTo}
          onCancelReply={handleCancelReply}
        />
      </div>
    </div>
  );
};

export default MessageThread;
