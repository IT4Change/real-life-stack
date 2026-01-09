import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ConversationList from './ConversationList';
import MessageThread from './MessageThread';
import NewChatDialog from './NewChatDialog';

const MessagingWidget = ({
  conversations,
  messages,
  activeConversationId,
  onSelectConversation,
  onSendMessage,
  onReact,
  onTogglePin,
  onToggleMute,
  onCreateDirect,
  onCreateGroup,
  onClose,
}) => {
  const [isMobile, setIsMobile] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);

  // Detect mobile screen size
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Auto-select first conversation on desktop when no conversation is selected
  useEffect(() => {
    if (!isMobile && conversations.length > 0 && !activeConversationId) {
      onSelectConversation(conversations[0].id);
    }
  }, [isMobile, conversations, activeConversationId, onSelectConversation]);

  // Filter conversations based on search
  const filteredConversations = searchQuery.trim()
    ? conversations.filter(conv =>
        conv.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : conversations;

  const activeConversation = conversations.find(c => c.id === activeConversationId);
  const conversationMessages = activeConversationId ? messages[activeConversationId] || [] : [];

  const handleCreateDirect = (userId, userName, userAvatar) => {
    const conversationId = onCreateDirect(userId, userName, userAvatar);
    onSelectConversation(conversationId);
    setIsNewChatOpen(false);
  };

  const handleCreateGroup = (name, description, memberIds) => {
    const conversationId = onCreateGroup(name, description, memberIds);
    onSelectConversation(conversationId);
    setIsNewChatOpen(false);
  };

  const handleBackToList = () => {
    onSelectConversation(null);
  };

  return (
    <div className="h-full flex flex-col overflow-x-hidden bg-gradient-to-br from-slate-900 via-purple-900 to-indigo-900">
      {/* Header */}
      <div className="bg-slate-900/80 backdrop-blur-xl border-b border-slate-700 flex-shrink-0">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-white font-semibold text-xl">Nachrichten</h1>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setIsNewChatOpen(true)}
              className="bg-purple-600 hover:bg-purple-700 text-white"
              size="sm"
            >
              <Plus className="h-4 w-4 mr-2" />
              Neue Nachricht
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-white hover:bg-white/20"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        {/* Desktop: Split View */}
        {!isMobile ? (
          <div className="h-full flex max-w-7xl mx-auto">
            {/* Left: Conversation List */}
            <div className="w-80 border-r border-white/10 flex flex-col bg-slate-900/30">
              {/* Search */}
              <div className="p-4 border-b border-white/10">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Unterhaltungen durchsuchen..."
                    className="w-full bg-slate-800/60 text-white placeholder:text-white/50 pl-10 pr-4 py-2 rounded-lg border border-white/20 focus:border-purple-400 focus:outline-none transition-colors"
                  />
                </div>
              </div>

              {/* Conversation List */}
              <div className="flex-1 overflow-y-auto">
                <ConversationList
                  conversations={filteredConversations}
                  activeConversationId={activeConversationId}
                  onSelectConversation={onSelectConversation}
                />
              </div>
            </div>

            {/* Right: Message Thread */}
            <div className="flex-1 flex flex-col bg-slate-900/20">
              {activeConversation ? (
                <MessageThread
                  conversation={activeConversation}
                  messages={conversationMessages}
                  onBack={handleBackToList}
                  onSendMessage={onSendMessage}
                  onReact={onReact}
                  onTogglePin={onTogglePin}
                  onToggleMute={onToggleMute}
                  isMobile={false}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-white/50">
                  <div className="text-center">
                    <p className="text-lg mb-2">Wähle eine Unterhaltung aus</p>
                    <p className="text-sm">oder starte eine neue Nachricht</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Mobile: Sequential Navigation */
          <div className="h-full">
            {!activeConversationId ? (
              <div className="h-full flex flex-col bg-slate-900/30">
                {/* Search */}
                <div className="p-4 border-b border-white/10">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Unterhaltungen durchsuchen..."
                      className="w-full bg-slate-800/60 text-white placeholder:text-white/50 pl-10 pr-4 py-2 rounded-lg border border-white/20 focus:border-purple-400 focus:outline-none transition-colors"
                    />
                  </div>
                </div>

                {/* Conversation List */}
                <div className="flex-1 overflow-y-auto">
                  <ConversationList
                    conversations={filteredConversations}
                    activeConversationId={activeConversationId}
                    onSelectConversation={onSelectConversation}
                  />
                </div>
              </div>
            ) : (
              <div className="h-full bg-slate-900/20">
                <MessageThread
                  conversation={activeConversation}
                  messages={conversationMessages}
                  onBack={handleBackToList}
                  onSendMessage={onSendMessage}
                  onReact={onReact}
                  onTogglePin={onTogglePin}
                  onToggleMute={onToggleMute}
                  isMobile={true}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* New Chat Dialog */}
      <NewChatDialog
        isOpen={isNewChatOpen}
        onClose={() => setIsNewChatOpen(false)}
        onCreateDirect={handleCreateDirect}
        onCreateGroup={handleCreateGroup}
      />
    </div>
  );
};

export default MessagingWidget;
