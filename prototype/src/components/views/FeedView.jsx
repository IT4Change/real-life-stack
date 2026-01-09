import React from 'react';
import { motion } from 'framer-motion';
import PostCard from '@/components/shared/PostCard';

const FeedView = ({ posts, sortOrder, onSelectPost, onCreatePost, onSwitchToMapView, onSwitchToCalendarView }) => {

  const sortedPosts = [...posts].sort((a, b) => {
    if (sortOrder === 'distance') {
      return (a.location?.lat || 0) - (b.location?.lat || 0);
    }
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  return (
    <motion.div
      className="grid grid-cols-1 gap-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* Create Post Placeholder */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={onCreatePost}
        className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700/50 cursor-text transition-all duration-200 hover:bg-slate-800/60 hover:border-slate-600 p-4"
      >
        <motion.div
          layoutId="text-input-hero"
          className="text-slate-500 text-base"
        >
          Was möchtest du teilen?
        </motion.div>
      </motion.div>
      {sortedPosts.map((post, index) => (
        <motion.div
          key={post.id}
          layoutId={`post-card-${post.id}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.05 }}
          onClick={() => onSelectPost(post)}
        >
          <PostCard post={post} onSwitchToMapView={onSwitchToMapView} onSwitchToCalendarView={onSwitchToCalendarView} />
        </motion.div>
      ))}
    </motion.div>
  );
};

export default FeedView;