import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Send, Paperclip, X, Image as ImageIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const MessageInput = ({ onSend, replyTo, onCancelReply }) => {
  const [message, setMessage] = useState('');
  const [attachments, setAttachments] = useState([]);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  const handleSend = () => {
    if (message.trim() || attachments.length > 0) {
      onSend(message.trim(), attachments, replyTo?.id || null);
      setMessage('');
      setAttachments([]);
      inputRef.current?.focus();
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    // For demo: just store file info, in production you'd upload these
    const newAttachments = files.map(file => ({
      id: `att-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: file.type.startsWith('image/') ? 'image' : 'file',
      url: URL.createObjectURL(file), // Preview URL
      name: file.name,
      size: file.size,
      mimeType: file.type,
    }));
    setAttachments([...attachments, ...newAttachments]);
  };

  const removeAttachment = (id) => {
    setAttachments(attachments.filter(att => att.id !== id));
  };

  return (
    <div className="border-t border-white/20 bg-slate-900/50 p-4">
      {/* Reply preview */}
      <AnimatePresence>
        {replyTo && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-3 px-3 py-2 bg-purple-500/10 border-l-2 border-purple-400 rounded flex items-center justify-between"
          >
            <div className="flex-1 min-w-0">
              <p className="text-xs text-purple-300 font-medium mb-1">
                Antwort auf Nachricht
              </p>
              <p className="text-sm text-white/80 truncate">
                {replyTo.content || '[Anhang]'}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onCancelReply}
              className="h-6 w-6 flex-shrink-0 ml-2 hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Attachment previews */}
      <AnimatePresence>
        {attachments.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-3 flex flex-wrap gap-2"
          >
            {attachments.map(att => (
              <div
                key={att.id}
                className="relative bg-slate-800/60 rounded-lg p-2 flex items-center gap-2 max-w-[200px]"
              >
                {att.type === 'image' && (
                  <img
                    src={att.url}
                    alt={att.name}
                    className="h-12 w-12 object-cover rounded"
                  />
                )}
                {att.type !== 'image' && (
                  <div className="h-12 w-12 bg-purple-500/20 rounded flex items-center justify-center">
                    <ImageIcon className="h-6 w-6 text-purple-400" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white/90 truncate">{att.name}</p>
                  <p className="text-xs text-white/50">
                    {(att.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <button
                  onClick={() => removeAttachment(att.id)}
                  className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                >
                  <X className="h-3 w-3 text-white" />
                </button>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input area */}
      <div className="flex items-end gap-2">
        {/* Attachment button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          className="flex-shrink-0 h-10 w-10 text-white/70 hover:text-white hover:bg-white/10"
        >
          <Paperclip className="h-5 w-5" />
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/*,.pdf,.doc,.docx"
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Text input */}
        <div className="flex-1 bg-slate-800/60 rounded-lg border border-white/20 focus-within:border-purple-400 transition-colors">
          <textarea
            ref={inputRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Nachricht schreiben..."
            className="w-full bg-transparent text-white placeholder:text-white/50 px-4 py-3 resize-none focus:outline-none max-h-32"
            rows={1}
            style={{
              minHeight: '44px',
              height: 'auto',
            }}
            onInput={(e) => {
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px';
            }}
          />
        </div>

        {/* Send button */}
        <Button
          onClick={handleSend}
          disabled={!message.trim() && attachments.length === 0}
          className="flex-shrink-0 h-10 w-10 bg-gradient-to-br from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white disabled:opacity-50 disabled:cursor-not-allowed rounded-full p-0"
        >
          <Send className="h-5 w-5" />
        </Button>
      </div>

      <p className="text-xs text-white/40 mt-2">
        Enter zum Senden, Shift+Enter für neue Zeile
      </p>
    </div>
  );
};

export default MessageInput;
