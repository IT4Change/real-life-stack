import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { MessageCircle, Plus, Share2, Calendar, MapPin, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import { toast } from '@/components/ui/use-toast';
import EmojiReactionPicker from '@/components/ui/EmojiReactionPicker';

const PostCard = ({ post, onSwitchToMapView, onSwitchToCalendarView }) => {
  const [author, setAuthor] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [reactions, setReactions] = useState(post.reactions || {});

  useEffect(() => {
    const users = JSON.parse(localStorage.getItem('users'));
    setAuthor(users[post.authorId]);
  }, [post.authorId]);

  const handleNotImplemented = (e) => {
    e.stopPropagation();
    toast({
      title: "🚧 Feature nicht implementiert",
      description: "🚧 This feature isn't implemented yet—but don't worry! You can request it in your next prompt! 🚀"
    });
  };

  const handleEmojiSelect = (emoji) => {
    const newReactions = { ...reactions };
    newReactions[emoji] = (newReactions[emoji] || 0) + 1;
    setReactions(newReactions);
  };

  const handleReactionClick = (emoji, e) => {
    e.stopPropagation();
    const newReactions = { ...reactions };
    newReactions[emoji] = (newReactions[emoji] || 0) + 1;
    setReactions(newReactions);
  };

  const getPostTypePill = () => {
    switch (post.type) {
      case 'event':
        return <div className="absolute top-4 right-4 bg-blue-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg">Event</div>;
      case 'project':
        return <div className="absolute top-4 right-4 bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg">Projekt</div>;
      case 'offer':
        return <div className="absolute top-4 right-4 bg-yellow-500 text-black text-xs font-bold px-3 py-1 rounded-full shadow-lg">Angebot</div>;
      default:
        return null;
    }
  };

  if (!author) return null;

  return (
    <motion.div
      className="bg-purple-900/50 backdrop-blur-lg rounded-lg border border-purple-400/30 overflow-hidden cursor-pointer relative shadow-2xl shadow-purple-900/50"
    >
      {post.media && post.media[0]?.type === 'image' && (
        <div className="h-48 w-full overflow-hidden relative">
          <img src={post.media[0].url} alt={post.title} className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-purple-900/70 via-purple-900/20 to-transparent"></div>
        </div>
      )}
      
      {getPostTypePill()}

      <div className="p-6">
        <div className="flex items-center mb-4">
          <div className="h-10 w-10 mr-4 bg-slate-700 rounded-full flex-shrink-0"></div>
          <h2 className="text-xl font-bold text-white">{post.title}</h2>
        </div>

        <div className="space-y-2 mb-4">
            {post.location && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSwitchToMapView && onSwitchToMapView(post);
                }}
                className="flex items-center text-sm text-white/70 hover:text-purple-400 transition-colors group"
              >
                <MapPin className="h-4 w-4 mr-2 text-purple-300 group-hover:text-purple-400" />
                <span className="hover:underline decoration-purple-300/50 group-hover:decoration-purple-400">{post.location.name} (115km)</span>
              </button>
            )}
            {post.startTime && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSwitchToCalendarView && onSwitchToCalendarView(post);
                }}
                className="flex items-center text-sm text-white/70 hover:text-purple-400 transition-colors group"
              >
                <Clock className="h-4 w-4 mr-2 text-purple-300 group-hover:text-purple-400" />
                <span className="hover:underline decoration-purple-300/50 group-hover:decoration-purple-400">{new Date(post.startTime).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} Uhr</span>
              </button>
            )}
        </div>

        <p className="text-white/80 line-clamp-3 mb-6">{post.content}</p>

        <div className="flex items-center mb-6">
          <Avatar className="h-6 w-6 mr-3">
            <AvatarImage src={author.avatar} alt={author.name} />
            <AvatarFallback>{author.name.substring(0, 2)}</AvatarFallback>
          </Avatar>
          <p className="text-sm text-white/90">{author.name},</p>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <p className="text-sm text-white/60 ml-1">
                  {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true, locale: de })}
                </p>
              </TooltipTrigger>
              <TooltipContent>
                <p>{new Date(post.createdAt).toLocaleString('de-DE')}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="pt-4 border-t border-white/20 flex flex-wrap gap-2 justify-between">
          {/* Actions - stay at bottom right */}
          <div className="flex items-center space-x-2 flex-shrink-0 ml-auto order-2">
            <Button variant="ghost" size="sm" className="text-white/60 hover:text-white" onClick={handleNotImplemented}>
              <Share2 className="h-4 w-4 mr-2" /> Teilen
            </Button>
            <Button variant="ghost" size="sm" className="text-white/60 hover:text-white" onClick={handleNotImplemented}>
              <MessageCircle className="h-4 w-4 mr-2" /> {post.comments.length} Kommentare
            </Button>
          </div>

          {/* Reactions - will wrap to top when needed */}
          <div className="flex items-center space-x-2 flex-wrap relative order-1">
            {/* Display existing reactions */}
            {Object.entries(reactions).map(([emoji, count]) => (
              <Button
                key={emoji}
                variant="ghost"
                size="sm"
                className="text-white hover:text-white bg-white/10 hover:bg-white/20 rounded-full px-3 py-1 h-8"
                onClick={(e) => handleReactionClick(emoji, e)}
              >
                <span className="mr-1 opacity-100">{emoji}</span>
                <span className="text-xs text-white/90">{count}</span>
              </Button>
            ))}

            {/* Add reaction button */}
            <Button
              variant="ghost"
              size="sm"
              className="text-white/60 hover:text-white bg-white/10 hover:bg-white/20 rounded-full h-8 w-8 p-0"
              onClick={(e) => {
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
                  className="bottom-full left-0 mb-2"
                />
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default PostCard;