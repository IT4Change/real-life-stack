import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, Users, MessageSquare, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { mockUsers } from '@/data/mockData';
import { CURRENT_USER_ID } from '@/data/mockMessages';

const NewChatDialog = ({ isOpen, onClose, onCreateDirect, onCreateGroup }) => {
  const [activeTab, setActiveTab] = useState('direct'); // 'direct' or 'group'
  const [searchQuery, setSearchQuery] = useState('');
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [selectedMembers, setSelectedMembers] = useState([]);

  // Filter out current user and existing conversation partners
  const availableUsers = useMemo(() => {
    return Object.entries(mockUsers)
      .filter(([id]) => id !== CURRENT_USER_ID)
      .map(([id, data]) => ({ id, ...data }));
  }, []);

  // Filter users based on search query
  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return availableUsers;
    const query = searchQuery.toLowerCase();
    return availableUsers.filter(user =>
      user.name.toLowerCase().includes(query)
    );
  }, [availableUsers, searchQuery]);

  const handleToggleMember = (userId) => {
    setSelectedMembers(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const handleCreateDirect = (user) => {
    onCreateDirect(user.id, user.name, user.avatar);
    handleClose();
  };

  const handleCreateGroup = () => {
    if (groupName.trim() && selectedMembers.length >= 2) {
      onCreateGroup(groupName.trim(), groupDescription.trim(), selectedMembers);
      handleClose();
    }
  };

  const handleClose = () => {
    setActiveTab('direct');
    setSearchQuery('');
    setGroupName('');
    setGroupDescription('');
    setSelectedMembers([]);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={handleClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-slate-800/95 backdrop-blur-lg border border-white/20 rounded-lg shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-white/20">
            <h2 className="text-white font-semibold text-lg">Neue Unterhaltung</h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              className="text-white hover:bg-white/20 h-8 w-8"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-white/20">
            <button
              onClick={() => setActiveTab('direct')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 transition-colors ${
                activeTab === 'direct'
                  ? 'text-purple-400 border-b-2 border-purple-400 bg-purple-500/10'
                  : 'text-white/60 hover:text-white/80 hover:bg-white/5'
              }`}
            >
              <MessageSquare className="h-4 w-4" />
              <span className="font-medium">Direktnachricht</span>
            </button>
            <button
              onClick={() => setActiveTab('group')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 transition-colors ${
                activeTab === 'group'
                  ? 'text-purple-400 border-b-2 border-purple-400 bg-purple-500/10'
                  : 'text-white/60 hover:text-white/80 hover:bg-white/5'
              }`}
            >
              <Users className="h-4 w-4" />
              <span className="font-medium">Neue Gruppe</span>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {activeTab === 'direct' ? (
              <div className="space-y-4">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Benutzer suchen..."
                    className="w-full bg-slate-900/60 text-white placeholder:text-white/50 pl-10 pr-4 py-2 rounded-lg border border-white/20 focus:border-purple-400 focus:outline-none transition-colors"
                  />
                </div>

                {/* User List */}
                <div className="space-y-2">
                  {filteredUsers.length === 0 ? (
                    <p className="text-white/50 text-center py-8">
                      Keine Benutzer gefunden
                    </p>
                  ) : (
                    filteredUsers.map(user => (
                      <button
                        key={user.id}
                        onClick={() => handleCreateDirect(user)}
                        className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-white/10 transition-colors group"
                      >
                        <Avatar className="h-12 w-12">
                          <AvatarImage src={user.avatar} />
                          <AvatarFallback>
                            {user.name.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 text-left">
                          <p className="text-white font-medium">{user.name}</p>
                          <p className="text-white/50 text-sm">Nachricht senden</p>
                        </div>
                        <MessageSquare className="h-5 w-5 text-white/30 group-hover:text-purple-400 transition-colors" />
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Group Name */}
                <div>
                  <label className="block text-white/70 text-sm font-medium mb-2">
                    Gruppenname *
                  </label>
                  <input
                    type="text"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="z.B. Community Team"
                    className="w-full bg-slate-900/60 text-white placeholder:text-white/50 px-4 py-2 rounded-lg border border-white/20 focus:border-purple-400 focus:outline-none transition-colors"
                    maxLength={50}
                  />
                </div>

                {/* Group Description */}
                <div>
                  <label className="block text-white/70 text-sm font-medium mb-2">
                    Beschreibung (optional)
                  </label>
                  <textarea
                    value={groupDescription}
                    onChange={(e) => setGroupDescription(e.target.value)}
                    placeholder="Wofür ist diese Gruppe?"
                    className="w-full bg-slate-900/60 text-white placeholder:text-white/50 px-4 py-2 rounded-lg border border-white/20 focus:border-purple-400 focus:outline-none transition-colors resize-none"
                    rows={3}
                    maxLength={200}
                  />
                </div>

                {/* Member Selection */}
                <div>
                  <label className="block text-white/70 text-sm font-medium mb-2">
                    Mitglieder hinzufügen * (mindestens 2)
                  </label>
                  {/* Search */}
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Benutzer suchen..."
                      className="w-full bg-slate-900/60 text-white placeholder:text-white/50 pl-10 pr-4 py-2 rounded-lg border border-white/20 focus:border-purple-400 focus:outline-none transition-colors"
                    />
                  </div>

                  {/* Selected Count */}
                  {selectedMembers.length > 0 && (
                    <p className="text-purple-400 text-sm mb-2">
                      {selectedMembers.length} Mitglied{selectedMembers.length !== 1 ? 'er' : ''} ausgewählt
                    </p>
                  )}

                  {/* User List with Checkboxes */}
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {filteredUsers.map(user => {
                      const isSelected = selectedMembers.includes(user.id);
                      return (
                        <button
                          key={user.id}
                          onClick={() => handleToggleMember(user.id)}
                          className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${
                            isSelected
                              ? 'bg-purple-500/20 border border-purple-400/50'
                              : 'hover:bg-white/10 border border-transparent'
                          }`}
                        >
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={user.avatar} />
                            <AvatarFallback>
                              {user.name.substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 text-left">
                            <p className="text-white font-medium text-sm">{user.name}</p>
                          </div>
                          <div
                            className={`h-5 w-5 rounded border-2 flex items-center justify-center transition-colors ${
                              isSelected
                                ? 'bg-purple-500 border-purple-500'
                                : 'border-white/30'
                            }`}
                          >
                            {isSelected && <Check className="h-3 w-3 text-white" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          {activeTab === 'group' && (
            <div className="p-4 border-t border-white/20">
              <Button
                onClick={handleCreateGroup}
                disabled={!groupName.trim() || selectedMembers.length < 2}
                className="w-full bg-gradient-to-br from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Gruppe erstellen
              </Button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default NewChatDialog;
