import { useState, useEffect, useCallback } from 'react';
import { CURRENT_USER_ID } from '@/data/mockMessages';

export const useMessages = () => {
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState({});
  const [activeConversationId, setActiveConversationId] = useState(null);

  // Load conversations and messages from localStorage
  useEffect(() => {
    const loadConversations = () => {
      const stored = localStorage.getItem('conversations');
      if (stored) {
        const parsed = JSON.parse(stored);
        // Sort by updated time (most recent first), with pinned items at top
        const sorted = parsed.sort((a, b) => {
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          return new Date(b.updatedAt) - new Date(a.updatedAt);
        });
        setConversations(sorted);
      }
    };

    const loadMessages = () => {
      const stored = localStorage.getItem('messages');
      if (stored) {
        setMessages(JSON.parse(stored));
      }
    };

    loadConversations();
    loadMessages();
  }, []);

  // Save conversations to localStorage
  const saveConversations = useCallback((updatedConversations) => {
    localStorage.setItem('conversations', JSON.stringify(updatedConversations));
    setConversations(updatedConversations);
  }, []);

  // Save messages to localStorage
  const saveMessages = useCallback((updatedMessages) => {
    localStorage.setItem('messages', JSON.stringify(updatedMessages));
    setMessages(updatedMessages);
  }, []);

  // Get total unread count across all conversations
  const totalUnreadCount = conversations.reduce((sum, conv) => sum + conv.unreadCount, 0);

  // Get messages for a specific conversation
  const getConversationMessages = useCallback((conversationId) => {
    return messages[conversationId] || [];
  }, [messages]);

  // Send a new message
  const sendMessage = useCallback((conversationId, content, type = 'text', attachments = [], replyTo = null) => {
    const newMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      conversationId,
      senderId: CURRENT_USER_ID,
      content,
      type,
      attachments,
      reactions: {},
      replyTo,
      isRead: true,
      isDelivered: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isEdited: false,
    };

    // Update messages
    const updatedMessages = {
      ...messages,
      [conversationId]: [...(messages[conversationId] || []), newMessage],
    };
    saveMessages(updatedMessages);

    // Update conversation's last message and timestamp
    const updatedConversations = conversations.map(conv => {
      if (conv.id === conversationId) {
        return {
          ...conv,
          lastMessage: {
            content: content || '[Anhang]',
            senderId: CURRENT_USER_ID,
            createdAt: newMessage.createdAt,
          },
          updatedAt: newMessage.createdAt,
        };
      }
      return conv;
    });

    // Re-sort conversations (most recent first, maintaining pinned at top)
    const sorted = updatedConversations.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });

    saveConversations(sorted);

    return newMessage;
  }, [conversations, messages, saveConversations, saveMessages]);

  // Mark conversation messages as read
  const markConversationAsRead = useCallback((conversationId) => {
    // Mark all messages in conversation as read
    const conversationMessages = messages[conversationId] || [];
    const updatedConversationMessages = conversationMessages.map(msg => ({
      ...msg,
      isRead: true,
    }));

    const updatedMessages = {
      ...messages,
      [conversationId]: updatedConversationMessages,
    };
    saveMessages(updatedMessages);

    // Update conversation unread count
    const updatedConversations = conversations.map(conv => {
      if (conv.id === conversationId) {
        return { ...conv, unreadCount: 0 };
      }
      return conv;
    });
    saveConversations(updatedConversations);
  }, [conversations, messages, saveConversations, saveMessages]);

  // Toggle message reaction
  const toggleReaction = useCallback((conversationId, messageId, emoji) => {
    const conversationMessages = messages[conversationId] || [];
    const updatedConversationMessages = conversationMessages.map(msg => {
      if (msg.id === messageId) {
        const reactions = { ...msg.reactions };
        const userIds = reactions[emoji] || [];

        if (userIds.includes(CURRENT_USER_ID)) {
          // Remove reaction
          const filtered = userIds.filter(id => id !== CURRENT_USER_ID);
          if (filtered.length === 0) {
            delete reactions[emoji];
          } else {
            reactions[emoji] = filtered;
          }
        } else {
          // Add reaction
          reactions[emoji] = [...userIds, CURRENT_USER_ID];
        }

        return { ...msg, reactions };
      }
      return msg;
    });

    const updatedMessages = {
      ...messages,
      [conversationId]: updatedConversationMessages,
    };
    saveMessages(updatedMessages);
  }, [messages, saveMessages]);

  // Edit a message
  const editMessage = useCallback((conversationId, messageId, newContent) => {
    const conversationMessages = messages[conversationId] || [];
    const updatedConversationMessages = conversationMessages.map(msg => {
      if (msg.id === messageId && msg.senderId === CURRENT_USER_ID) {
        return {
          ...msg,
          content: newContent,
          isEdited: true,
          updatedAt: new Date().toISOString(),
        };
      }
      return msg;
    });

    const updatedMessages = {
      ...messages,
      [conversationId]: updatedConversationMessages,
    };
    saveMessages(updatedMessages);
  }, [messages, saveMessages]);

  // Delete a message
  const deleteMessage = useCallback((conversationId, messageId) => {
    const conversationMessages = messages[conversationId] || [];
    const updatedConversationMessages = conversationMessages.filter(
      msg => !(msg.id === messageId && msg.senderId === CURRENT_USER_ID)
    );

    const updatedMessages = {
      ...messages,
      [conversationId]: updatedConversationMessages,
    };
    saveMessages(updatedMessages);
  }, [messages, saveMessages]);

  // Toggle conversation pin status
  const togglePin = useCallback((conversationId) => {
    const updatedConversations = conversations.map(conv => {
      if (conv.id === conversationId) {
        return { ...conv, isPinned: !conv.isPinned };
      }
      return conv;
    });

    // Re-sort to move pinned to top
    const sorted = updatedConversations.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });

    saveConversations(sorted);
  }, [conversations, saveConversations]);

  // Toggle conversation mute status
  const toggleMute = useCallback((conversationId) => {
    const updatedConversations = conversations.map(conv => {
      if (conv.id === conversationId) {
        return { ...conv, isMuted: !conv.isMuted };
      }
      return conv;
    });
    saveConversations(updatedConversations);
  }, [conversations, saveConversations]);

  // Create a new direct conversation
  const createDirectConversation = useCallback((userId, userName, userAvatar) => {
    // Check if conversation already exists
    const existing = conversations.find(
      conv => conv.type === 'direct' && conv.participants.includes(userId)
    );
    if (existing) {
      return existing.id;
    }

    // Create new conversation
    const newConversation = {
      id: `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'direct',
      name: userName,
      participants: [CURRENT_USER_ID, userId],
      avatar: userAvatar,
      lastMessage: null,
      unreadCount: 0,
      isPinned: false,
      isMuted: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updatedConversations = [newConversation, ...conversations];
    saveConversations(updatedConversations);

    // Initialize empty message array
    const updatedMessages = {
      ...messages,
      [newConversation.id]: [],
    };
    saveMessages(updatedMessages);

    return newConversation.id;
  }, [conversations, messages, saveConversations, saveMessages]);

  // Create a new group conversation
  const createGroupConversation = useCallback((name, description, memberIds, avatar = null) => {
    const newConversation = {
      id: `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'group',
      name,
      description: description || undefined,
      participants: [CURRENT_USER_ID, ...memberIds],
      avatar: avatar || 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=100&h=100&fit=crop',
      lastMessage: null,
      unreadCount: 0,
      isPinned: false,
      isMuted: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updatedConversations = [newConversation, ...conversations];
    saveConversations(updatedConversations);

    // Initialize empty message array
    const updatedMessages = {
      ...messages,
      [newConversation.id]: [],
    };
    saveMessages(updatedMessages);

    return newConversation.id;
  }, [conversations, messages, saveConversations, saveMessages]);

  // Simulate receiving a message (for demo purposes)
  const simulateIncomingMessage = useCallback((conversationId, senderId, content) => {
    const newMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      conversationId,
      senderId,
      content,
      type: 'text',
      attachments: [],
      reactions: {},
      replyTo: null,
      isRead: false,
      isDelivered: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isEdited: false,
    };

    // Update messages
    const updatedMessages = {
      ...messages,
      [conversationId]: [...(messages[conversationId] || []), newMessage],
    };
    saveMessages(updatedMessages);

    // Update conversation
    const updatedConversations = conversations.map(conv => {
      if (conv.id === conversationId) {
        return {
          ...conv,
          lastMessage: {
            content,
            senderId,
            createdAt: newMessage.createdAt,
          },
          unreadCount: conv.unreadCount + 1,
          updatedAt: newMessage.createdAt,
        };
      }
      return conv;
    });

    // Re-sort conversations
    const sorted = updatedConversations.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });

    saveConversations(sorted);
  }, [conversations, messages, saveConversations, saveMessages]);

  return {
    conversations,
    messages,
    totalUnreadCount,
    activeConversationId,
    setActiveConversationId,
    getConversationMessages,
    sendMessage,
    markConversationAsRead,
    toggleReaction,
    editMessage,
    deleteMessage,
    togglePin,
    toggleMute,
    createDirectConversation,
    createGroupConversation,
    simulateIncomingMessage,
  };
};
