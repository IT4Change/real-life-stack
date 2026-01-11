import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Send, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import EmojiReactionPicker from '@/components/ui/EmojiReactionPicker';
import { cn } from '@/lib/utils';

const ProfileBottomBar = ({
  reactions,
  commentsCount,
  onReaction,
  inputRef,
  onCommentSubmit,
  isVisible = true
}) => {
  const [isCommentMode, setIsCommentMode] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current && isCommentMode) {
      inputRef.current.style.height = 'auto';
      const scrollHeight = inputRef.current.scrollHeight;
      // Max height of 120px (approximately 5 lines)
      inputRef.current.style.height = `${Math.min(scrollHeight, 120)}px`;
    }
  }, [commentText, isCommentMode]);

  const handleFocus = () => {
    setIsCommentMode(true);
  };

  const handleBlur = () => {
    // Only exit comment mode if there's no text
    if (!commentText.trim()) {
      setIsCommentMode(false);
    }
  };

  const handleBack = (e) => {
    // Use onMouseDown instead of onClick to prevent input blur
    e.preventDefault();
    setIsCommentMode(false);
    setCommentText('');
    inputRef.current?.blur();
  };

  const handleSend = (e) => {
    e.preventDefault();
    if (commentText.trim()) {
      onCommentSubmit(commentText);
      setCommentText('');
      setIsCommentMode(false);
      inputRef.current?.blur();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
    if (e.key === 'Escape') {
      setIsCommentMode(false);
      setCommentText('');
      inputRef.current?.blur();
    }
  };

  const handleEmojiSelect = (emoji) => {
    onReaction(emoji);
    setShowEmojiPicker(false);
  };

  const handleReactionClick = (emoji, e) => {
    e.stopPropagation();
    onReaction(emoji);
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          className="absolute bottom-0 left-0 right-0 z-[500] border-t border-purple-400/30 bg-gradient-to-t from-slate-900/98 via-slate-800/95 to-slate-800/90 backdrop-blur-xl shadow-2xl shadow-black/60"
        >
          <div className="flex items-center gap-3 p-4">
            {/* Reaction buttons - fade out when in comment mode */}
            <AnimatePresence>
              {!isCommentMode && (
                <motion.div
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                  className="flex items-center gap-2 relative"
                  style={{ overflow: 'visible' }}
                >
                  {/* Display existing reactions */}
                  {Object.entries(reactions).map(([emoji, count]) => (
                    <Button
                      key={emoji}
                      variant="ghost"
                      size="sm"
                      className="text-white hover:text-white bg-purple-500/20 hover:bg-purple-400/30 border border-purple-400/20 hover:border-purple-300/40 rounded-full px-3 py-1 h-8 transition-all"
                      onClick={(e) => handleReactionClick(emoji, e)}
                    >
                      <span className="mr-1 opacity-100">{emoji}</span>
                      <span className="text-xs text-white/90">{count}</span>
                    </Button>
                  ))}

                  {/* Add reaction button */}
                  <div className="relative">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-purple-200/70 hover:text-white bg-purple-500/20 hover:bg-purple-400/30 border border-purple-400/20 hover:border-purple-300/40 rounded-full h-8 w-8 p-0 flex items-center justify-center transition-all"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowEmojiPicker(!showEmojiPicker);
                      }}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>

                    {/* Emoji picker */}
                    <AnimatePresence>
                      {showEmojiPicker && (
                        <EmojiReactionPicker
                          onEmojiSelect={handleEmojiSelect}
                          onClose={() => setShowEmojiPicker(false)}
                          reactions={reactions}
                          className="bottom-full left-1/2 -translate-x-1/2 mb-3"
                        />
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Back button - appears when in comment mode */}
            <AnimatePresence>
              {isCommentMode && (
                <motion.div
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                  className="overflow-hidden"
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    onMouseDown={handleBack}
                    className="flex-shrink-0"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Input - grows to fill space */}
            <motion.div
              layout
              transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              className="flex-1"
            >
              {isCommentMode ? (
                <Textarea
                  ref={inputRef}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                  onKeyDown={handleKeyDown}
                  placeholder="Schreibe einen Kommentar..."
                  className="w-full resize-none min-h-[40px] max-h-[120px] overflow-y-auto transition-[height] duration-150 ease-out"
                  autoFocus
                  rows={1}
                />
              ) : (
                <Input
                  onFocus={handleFocus}
                  placeholder="Kommentar schreiben..."
                  className="w-full"
                  readOnly
                />
              )}
            </motion.div>

            {/* Send button - always visible */}
            <Button
              variant="default"
              size="icon"
              onMouseDown={handleSend}
              disabled={!isCommentMode || !commentText.trim()}
              className="flex-shrink-0 bg-gradient-to-r from-purple-500 to-fuchsia-500 hover:from-purple-600 hover:to-fuchsia-600 disabled:from-slate-700 disabled:to-slate-700 disabled:opacity-50 shadow-lg shadow-purple-500/30 transition-all"
            >
              <Send className="h-5 w-5 text-white" />
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ProfileBottomBar;
