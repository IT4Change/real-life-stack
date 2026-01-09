import React from 'react';
import { MessageSquare } from 'lucide-react';
import ConversationItem from './ConversationItem';

const ConversationList = ({ conversations, activeConversationId, onSelectConversation }) => {
  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-white/60 p-8">
        <MessageSquare className="h-16 w-16 mb-4 opacity-40" />
        <p className="text-lg">Keine Nachrichten</p>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto h-full">
      {conversations.map(conversation => (
        <ConversationItem
          key={conversation.id}
          conversation={conversation}
          isActive={activeConversationId === conversation.id}
          onClick={() => onSelectConversation(conversation.id)}
        />
      ))}
    </div>
  );
};

export default ConversationList;
