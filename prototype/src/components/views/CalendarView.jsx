import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { addMonths, subMonths, set } from 'date-fns';
import CalendarHeader from '@/components/calendar/CalendarHeader';
import CalendarFilters from '@/components/calendar/CalendarFilters';
import MonthView from '@/components/calendar/MonthView';
import WeekView from '@/components/calendar/WeekView';
import DayView from '@/components/calendar/DayView';
import ListView from '@/components/calendar/ListView';
import ProfileView from '@/components/profile/ProfileView';
import { postToProfileData } from '@/lib/profileAdapter';
import { generateProfileConfig } from '@/lib/profileConfig';
import ConfirmEventDialog from '@/components/calendar/ConfirmEventDialog';

const CalendarView = ({
  posts,
  onSelectPost,
  postToOpen,
  setSelectedPost,
  selectedPost,
  onCloseDetail,
  onSwitchToMapView,
  onBackToFeed,
  showBackToFeed,
  onCreateEvent,
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState('month');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({
    eventTypes: ['event', 'project', 'offer'],
    location: 'all',
    myEventsOnly: false,
  });
  const [isMobile, setIsMobile] = useState(false);
  const [confirmDialogDate, setConfirmDialogDate] = useState(null);
  const [users, setUsers] = useState({});
  const sidebarRef = useRef(null);

  // Load users data
  useEffect(() => {
    const storedUsers = JSON.parse(localStorage.getItem('users')) || {};
    setUsers(storedUsers);
  }, []);

  // Detect mobile
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Auto-open post if postToOpen is provided
  useEffect(() => {
    if (postToOpen && postToOpen.id) {
      setSelectedPost(postToOpen);
    }
  }, [postToOpen, setSelectedPost]);

  // Filter events
  const filteredEvents = posts.filter((post) => {
    // Must be event type with startTime
    if (post.type !== 'event' || !post.startTime) return false;

    // Event type filter
    if (!filters.eventTypes.includes(post.type)) return false;

    // Location filter
    if (filters.location === 'with' && !post.location) return false;
    if (filters.location === 'without' && post.location) return false;

    // My events filter (dummy - would check against current user)
    if (filters.myEventsOnly) {
      // In a real app, check post.authorId === currentUserId
      return false; // For demo, hide all when toggled
    }

    return true;
  });

  // Navigation handlers
  const handlePreviousMonth = () => {
    if (viewMode === 'month' || viewMode === 'list') {
      setCurrentDate(subMonths(currentDate, 1));
    } else if (viewMode === 'week') {
      setCurrentDate(subMonths(currentDate, 0, { weeks: -1 }));
    } else if (viewMode === 'day') {
      setCurrentDate(new Date(currentDate.setDate(currentDate.getDate() - 1)));
    }
  };

  const handleNextMonth = () => {
    if (viewMode === 'month' || viewMode === 'list') {
      setCurrentDate(addMonths(currentDate, 1));
    } else if (viewMode === 'week') {
      setCurrentDate(addMonths(currentDate, 0, { weeks: 1 }));
    } else if (viewMode === 'day') {
      setCurrentDate(new Date(currentDate.setDate(currentDate.getDate() + 1)));
    }
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const handleEventClick = (event) => {
    onSelectPost(event);
  };

  const handleDateClick = (date, events) => {
    if (events.length === 0) {
      // No events on this day - show confirmation dialog
      setConfirmDialogDate(date);
    } else if (events.length === 1) {
      // One event - open it
      handleEventClick(events[0]);
    } else if (events.length > 1) {
      // Multiple events - switch to day view for this date
      setCurrentDate(date);
      setViewMode('day');
    }
  };

  const handleConfirmCreate = () => {
    if (confirmDialogDate) {
      // Create new event with default time (9:00 AM)
      handleSlotClick(confirmDialogDate, 9, 0);
      setConfirmDialogDate(null);
    }
  };

  const handleSlotClick = (date, hour, minute = 0) => {
    if (onCreateEvent) {
      const eventDate = set(date, { hours: hour, minutes: minute, seconds: 0 });
      onCreateEvent(eventDate);
    }
  };

  // Count active filters
  const activeFilterCount =
    (3 - filters.eventTypes.length) +
    (filters.location !== 'all' ? 1 : 0) +
    (filters.myEventsOnly ? 1 : 0);

  return (
    <div className="flex flex-col h-full relative">
      {/* Header */}
      <CalendarHeader
        currentDate={currentDate}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onPreviousMonth={handlePreviousMonth}
        onNextMonth={handleNextMonth}
        onToday={handleToday}
        onToggleFilters={() => setFiltersOpen(!filtersOpen)}
        filtersOpen={filtersOpen}
        activeFilterCount={activeFilterCount}
      />

      {/* Filters */}
      <CalendarFilters
        isOpen={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        onFiltersChange={setFilters}
      />

      {/* Calendar Views with Sidebar Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Calendar content */}
        <div className="flex-1 overflow-hidden relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={viewMode}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="h-full"
            >
              {viewMode === 'month' && (
                <MonthView
                  currentDate={currentDate}
                  events={filteredEvents}
                  onEventClick={handleEventClick}
                  onDateClick={handleDateClick}
                  selectedEventId={selectedPost?.id}
                />
              )}

              {viewMode === 'week' && (
                <WeekView
                  currentDate={currentDate}
                  events={filteredEvents}
                  onEventClick={handleEventClick}
                  onSlotClick={handleSlotClick}
                  selectedEventId={selectedPost?.id}
                />
              )}

              {viewMode === 'day' && (
                <DayView
                  currentDate={currentDate}
                  events={filteredEvents}
                  onEventClick={handleEventClick}
                  onSlotClick={handleSlotClick}
                  selectedEventId={selectedPost?.id}
                />
              )}

              {viewMode === 'list' && (
                <ListView
                  events={filteredEvents}
                  onEventClick={handleEventClick}
                  selectedEventId={selectedPost?.id}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Sidebar Profile (Desktop) */}
        <AnimatePresence mode="wait">
          {selectedPost && !isMobile && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 450, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="flex-shrink-0 h-full border-l border-white/20 overflow-hidden"
            >
              <ProfileView
                data={postToProfileData(selectedPost, users, posts)}
                config={generateProfileConfig(selectedPost)}
                isModal={false}
                onClose={onCloseDetail}
                navigationSource={showBackToFeed ? 'feed' : null}
                onSwitchToMap={
                  selectedPost.location && onSwitchToMapView
                    ? () => onSwitchToMapView(selectedPost)
                    : undefined
                }
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Mobile Profile (Bottom Sheet / Overlay) */}
      <AnimatePresence>
        {selectedPost && isMobile && (
          <motion.div
            className="absolute inset-0 z-[1002] pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="flex h-full w-full items-end justify-center">
              <div className="pointer-events-auto w-full" ref={sidebarRef}>
                <ProfileView
                  data={postToProfileData(selectedPost, users, posts)}
                  config={generateProfileConfig(selectedPost)}
                  isModal={true}
                  onClose={onCloseDetail}
                  navigationSource={showBackToFeed ? 'feed' : null}
                  onSwitchToMap={
                    selectedPost.location && onSwitchToMapView
                      ? () => onSwitchToMapView(selectedPost)
                      : undefined
                  }
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmation Dialog for creating new events */}
      <ConfirmEventDialog
        isOpen={!!confirmDialogDate}
        onClose={() => setConfirmDialogDate(null)}
        onConfirm={handleConfirmCreate}
        selectedDate={confirmDialogDate}
      />
    </div>
  );
};

export default CalendarView;
