import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Map, Rss, Filter, ArrowDownUp, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import FeedView from '@/components/views/FeedView';
import MapView from '@/components/views/MapView';
import CalendarView from '@/components/views/CalendarView';
import ProfileView from '@/components/profile/ProfileView';
import { postToProfileData } from '@/lib/profileAdapter';
import { generateProfileConfig } from '@/lib/profileConfig';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const MainContent = ({ currentView, onSelectPost, selectedPost, onCloseDetail, postToOpenOnMap, postToOpenOnCalendar, setSelectedPost, onCreatePost, onSwitchToMapView, onSwitchToMapViewFromProfile, onSwitchToCalendarView, onBackToFeed, onBackToCalendar, showBackToFeed, showBackToCalendar, onCreateEvent }) => {
  const [posts, setPosts] = useState([]);
  const [users, setUsers] = useState({});
  const [sortOrder, setSortOrder] = useState('chronological');
  const [feedProfileDisplayMode, setFeedProfileDisplayMode] = useState('overlay');

  useEffect(() => {
    const storedPosts = JSON.parse(localStorage.getItem('posts')) || [];
    const storedUsers = JSON.parse(localStorage.getItem('users')) || {};
    setPosts(storedPosts);
    setUsers(storedUsers);
  }, []);

  const handleNotImplemented = () => {
    toast({
      title: "🚧 Feature nicht implementiert",
      description: "🚧 This feature isn't implemented yet—but don't worry! You can request it in your next prompt! 🚀"
    });
  };

  const isMapView = currentView === 'map';
  const isCalendarView = currentView === 'calendar';
  const isFeedView = currentView === 'feed';
  const showFeedProfile = selectedPost && isFeedView;
  const showProfileInSidebar = showFeedProfile && feedProfileDisplayMode === 'sidebar';

  const getViewContent = () => {
    switch (currentView) {
      case 'feed':
        return <FeedView posts={posts} sortOrder={sortOrder} onSelectPost={onSelectPost} onCreatePost={onCreatePost} onSwitchToMapView={onSwitchToMapView} onSwitchToCalendarView={onSwitchToCalendarView} />;
      case 'map':
        return <MapView posts={posts} onSelectPost={onSelectPost} postToOpen={postToOpenOnMap} setSelectedPost={setSelectedPost} selectedPost={selectedPost} onCloseDetail={onCloseDetail} onBackToFeed={onBackToFeed} onBackToCalendar={onBackToCalendar} showBackToFeed={showBackToFeed} showBackToCalendar={showBackToCalendar} />;
      case 'calendar':
        return <CalendarView posts={posts} onSelectPost={onSelectPost} postToOpen={postToOpenOnCalendar} setSelectedPost={setSelectedPost} selectedPost={selectedPost} onCloseDetail={onCloseDetail} onSwitchToMapView={onSwitchToMapView} onBackToFeed={onBackToFeed} showBackToFeed={showBackToFeed} onCreateEvent={onCreateEvent} />;
      default:
        return null;
    }
  };

  return (
    <motion.main
      key={currentView}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`relative flex-1 min-h-0 ${isMapView || isCalendarView ? 'p-0' : 'p-4 md:p-8'}`}
    >
      {/* Feed view with potential sidebar */}
      {isFeedView ? (
        <div className="flex h-full w-[calc(100%+2rem)] md:w-[calc(100%+4rem)] -mx-4 md:-mx-8 overflow-hidden">
          {/* Feed content */}
          <div className="flex-1 overflow-y-auto p-4 md:p-8">
            {/* Only show controls for feed view */}
            <div className="flex justify-end mb-8 max-w-3xl mx-auto">
              <div className="flex items-center space-x-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="bg-slate-800/60 border-white/20 text-white hover:bg-slate-700/80 hover:text-white backdrop-blur-sm">
                      <ArrowDownUp className="mr-2 h-4 w-4" />
                      {sortOrder === 'chronological' ? 'Neueste' : 'Entfernung'}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56">
                    <DropdownMenuItem onSelect={() => setSortOrder('chronological')} className="cursor-pointer">
                      <Calendar className="mr-2 h-4 w-4" />
                      <span>Chronologisch</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setSortOrder('distance')} className="cursor-pointer">
                      <MapPin className="mr-2 h-4 w-4" />
                      <span>Entfernung</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="outline" onClick={handleNotImplemented} className="bg-slate-800/60 border-white/20 text-white hover:bg-slate-700/80 hover:text-white backdrop-blur-sm shadow-lg">
                  <Filter className="mr-2 h-4 w-4" /> Filter
                </Button>
              </div>
            </div>

            <div className="max-w-3xl mx-auto">
              {getViewContent()}
            </div>
          </div>

          {/* Sidebar profile (when in sidebar mode) */}
          <AnimatePresence mode="wait">
            {showProfileInSidebar && (
              <div className="w-[450px] flex-shrink-0 h-full border-l border-white/20">
                <ProfileView
                  key="feed-sidebar"
                  data={postToProfileData(selectedPost, users, posts)}
                  config={generateProfileConfig(selectedPost)}
                  isModal={false}
                  onClose={onCloseDetail}
                  onSwitchToMap={() => onSwitchToMapViewFromProfile(selectedPost)}
                  navigationSource={null}
                  onDisplayModeChange={(mode) => setFeedProfileDisplayMode(mode)}
                />
              </div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        /* Map and Calendar views - need overflow visible for map to render */
        getViewContent()
      )}

      {/* Modal profile (when in overlay/draggable mode) - only for feed */}
      <AnimatePresence mode="wait">
        {showFeedProfile && feedProfileDisplayMode !== 'sidebar' && (
          <ProfileView
            key="feed-modal"
            data={postToProfileData(selectedPost, users, posts)}
            config={generateProfileConfig(selectedPost)}
            isModal={true}
            onClose={onCloseDetail}
            onSwitchToMap={() => onSwitchToMapViewFromProfile(selectedPost)}
            navigationSource={null}
            onDisplayModeChange={(mode) => setFeedProfileDisplayMode(mode)}
          />
        )}
      </AnimatePresence>
    </motion.main>
  );
};

export default MainContent;
