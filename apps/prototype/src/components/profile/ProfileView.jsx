import React, { useState, useRef, useEffect } from 'react';
import { motion, useScroll, useMotionValueEvent, useMotionValue, animate } from 'framer-motion';
import { useDrag } from '@use-gesture/react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Element as ScrollElement, scroller } from 'react-scroll';
import ProfileHeader from '@/components/profile/ProfileHeader';
import ProfileNavTabs from '@/components/profile/ProfileNavTabs';
import ProfileNavDots from '@/components/profile/ProfileNavDots';
import TextComponent from '@/components/profile/components/TextComponent';
import MediaGallery from '@/components/profile/components/MediaGallery';
import EventFunctions from '@/components/profile/components/EventFunctions';
import Comments from '@/components/profile/components/Comments';
import Crowdfunding from '@/components/profile/components/Crowdfunding';
import Members from '@/components/profile/components/Members';
import ComingEvents from '@/components/profile/components/ComingEvents';
import Projects from '@/components/profile/components/Projects';
import Quests from '@/components/profile/components/Quests';
import Badges from '@/components/profile/components/Badges';
import ContactInfo from '@/components/profile/components/ContactInfo';
import { useToast } from '@/components/ui/use-toast';
import MapPreview from '@/components/shared/MapPreview';
import MapComponent from '@/components/profile/components/MapComponent';
import ProfileBottomBar from '@/components/profile/ProfileBottomBar';
import { cn } from '@/lib/utils';

// Profile content component that will be reused across different modes
const ProfileContent = ({
  data,
  config,
  showBanner,
  reactions,
  handleReaction,
  handleCommentSubmit,
  handleScrollToComments,
  scrollRef,
  commentsRef,
  commentInputRef,
  activeComponents,
  commentsComponent,
  onClose,
  navigationSource,
  onSwitchToMap,
  dragBinder,
  isMobile,
  isDragging,
  panelState,
  displayMode,
  onSwitchDisplayMode
}) => (
  <div className={cn("bg-purple-900 w-full flex flex-col rounded-t-2xl md:rounded-none relative", displayMode === 'draggable' ? "pointer-events-auto h-screen" : "h-full")}>
    {/* Drag handle for mobile bottom sheet */}
    {isMobile && dragBinder && (
      <div {...dragBinder} className="w-full py-6 flex justify-center items-center touch-none cursor-grab active:cursor-grabbing bg-slate-800/40 border-b border-white/20" style={{ touchAction: 'none' }}>
        <div
          className={`w-12 h-1.5 rounded-full transition-all duration-200 ${
            isDragging
              ? 'bg-purple-400 w-16 h-2'
              : 'bg-gray-300'
          }`}
        />
        {/* State indicator dots */}
        <div className="absolute right-4 top-6 flex space-x-1">
          {['small', 'medium', 'maximized'].map((state) => (
            <div
              key={state}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${
                panelState === state ? 'bg-purple-400' : 'bg-gray-300'
              }`}
            />
          ))}
        </div>
      </div>
    )}

    <ProfileHeader
      data={data}
      showBanner={showBanner}
      onClose={onClose}
      navigationSource={navigationSource}
      displayMode={displayMode}
      onSwitchDisplayMode={onSwitchDisplayMode}
      isMobile={isMobile}
    />

    {config.navigation === 'tabs' && activeComponents.length > 0 && (
      <ProfileNavTabs
        components={activeComponents}
        scrollContainerRef={scrollRef}
      />
    )}

    <div className="flex-1 relative overflow-hidden">
      {config.navigation === 'dots' && activeComponents.length > 0 && (
        <ProfileNavDots
          components={activeComponents}
          scrollContainerRef={scrollRef}
        />
      )}

      <div ref={scrollRef} className="h-full overflow-y-auto" id="profile-scroll-container">
        <div className="max-w-3xl mx-auto px-6 py-6 space-y-8">
          {activeComponents.map(({ key, component: Component, props }) => (
            <ScrollElement name={key} key={key}>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.2 }}
              >
                <Component {...props} />
              </motion.div>
            </ScrollElement>
          ))}

          {config.components.comments && (
            <div className="pt-0" ref={commentsRef}>
              <ScrollElement name={commentsComponent.key}>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.2 }}
                >
                  <commentsComponent.component {...commentsComponent.props} />
                </motion.div>
              </ScrollElement>
            </div>
          )}
          <div className="h-40"></div>
        </div>
      </div>
    </div>

    {/* Fixed Bottom Bar */}
    <ProfileBottomBar
      reactions={reactions}
      commentsCount={data.comments?.length || 0}
      onReaction={handleReaction}
      inputRef={commentInputRef}
      onCommentSubmit={handleCommentSubmit}
      isVisible={true}
    />
  </div>
);

const ProfileView = ({
  data,
  config,
  isModal = true,
  onClose,
  onSwitchToMap,
  navigationSource = null,
  onDisplayModeChange,
  isInMapView = false
}) => {
  const [showBanner, setShowBanner] = useState(true);
  const [reactions, setReactions] = useState(data.reactions || {});
  const [isMobile, setIsMobile] = useState(false);
  const [panelState, setPanelState] = useState('medium');
  const [isAnimating, setIsAnimating] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(
    typeof window !== 'undefined' ? window.innerHeight : 800
  );

  // Display mode state: 'overlay' | 'sidebar' | 'draggable'
  const [displayMode, setDisplayMode] = useState(() => {
    if (typeof window === 'undefined') return isModal ? 'overlay' : 'sidebar';
    const mobile = window.innerWidth < 768;
    if (mobile) return 'draggable'; // Always use draggable on mobile
    return isModal ? 'overlay' : 'sidebar';
  });

  const scrollRef = useRef(null);
  const commentsRef = useRef(null);
  const commentInputRef = useRef(null);
  const { scrollY } = useScroll({ container: scrollRef });
  const { toast } = useToast();

  // Motion value for mobile bottom sheet - start at bottom (100%)
  const y = useMotionValue('100%');

  // Get y position for each state
  const getStateYPosition = (state) => {
    switch (state) {
      case 'small': return `${100 - 30}%`;
      case 'medium': return `${100 - 65}%`;
      case 'maximized': return '0%';
      case 'closed': return '100%';
      default: return `${100 - 65}%`;
    }
  };

  // Animation variants for mobile bottom sheet
  const panelVariants = {
    closed: {
      y: '100%',
      opacity: 0,
      transition: { type: 'spring', stiffness: 300, damping: 30 }
    },
    small: {
      y: `${100 - 30}%`,
      opacity: 1,
      transition: { type: 'spring', stiffness: 300, damping: 30 }
    },
    medium: {
      y: `${100 - 65}%`,
      opacity: 1,
      transition: { type: 'spring', stiffness: 300, damping: 30 }
    },
    maximized: {
      y: '0%',
      opacity: 1,
      transition: { type: 'spring', stiffness: 300, damping: 30 }
    }
  };

  const snapToState = (targetState) => {
    if (isAnimating) return;
    setIsAnimating(true);
    setPanelState(targetState);
    const targetPosition = getStateYPosition(targetState);

    // Use smooth animation instead of instant set
    animate(y, targetPosition, {
      type: 'spring',
      stiffness: 300,
      damping: 30,
      onComplete: () => {
        // Ensure the final value is set as a string percentage
        y.set(targetPosition);
        setIsAnimating(false);
      }
    });
  };

  // Handle display mode switching
  const handleSwitchDisplayMode = () => {
    // Reset y motion value BEFORE switching away from draggable mode
    if (displayMode === 'draggable') {
      y.set('0%');
    }

    if (isMobile) {
      // Mobile: Toggle between draggable and overlay
      const newMode = displayMode === 'draggable' ? 'overlay' : 'draggable';
      if (onDisplayModeChange) {
        // Parent is controlling the mode, just notify
        onDisplayModeChange(newMode);
      } else {
        // No parent control, manage internally
        setDisplayMode(newMode);
      }

      // Set y position when entering draggable mode
      if (newMode === 'draggable') {
        setTimeout(() => {
          y.set(getStateYPosition(panelState));
        }, 0);
      }
    } else {
      // Desktop: Toggle between overlay and sidebar
      const newMode = displayMode === 'overlay' ? 'sidebar' : 'overlay';
      if (onDisplayModeChange) {
        // Parent is controlling the mode, just notify
        onDisplayModeChange(newMode);
      } else {
        // No parent control, manage internally
        setDisplayMode(newMode);
      }
    }
  };

  useEffect(() => {
    const handleResize = () => {
      if (typeof window === 'undefined') return;
      const wasMobile = isMobile;
      const nowMobile = window.innerWidth < 768;
      setIsMobile(nowMobile);
      setViewportHeight(window.innerHeight);

      // Adjust display mode when switching between mobile/desktop
      if (wasMobile !== nowMobile) {
        if (nowMobile) {
          // Switched to mobile
          setDisplayMode(prev => prev === 'sidebar' ? 'draggable' : prev);
        } else {
          // Switched to desktop
          setDisplayMode(prev => prev === 'draggable' ? (isModal ? 'overlay' : 'sidebar') : prev);
        }
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isMobile]);

  const dragBinder = useDrag(
    ({ first, last, movement: [, my], velocity: [, vy], memo }) => {
      if (first) {
        // Allow interrupting animations when user starts dragging
        if (isAnimating) {
          setIsAnimating(false);
        }
        setIsDragging(true);
        const currentPosition = y.get();
        let initialY;

        // Handle both string ("50%") and number (0.5) formats
        if (typeof currentPosition === 'string' && currentPosition.includes('%')) {
          initialY = parseFloat(currentPosition.replace('%', ''));
        } else if (typeof currentPosition === 'number') {
          // If it's a number, it's likely in pixels or a fraction
          // Calculate percentage based on viewport height
          initialY = (currentPosition / viewportHeight) * 100;
        } else {
          // Fallback: use the state position
          const statePosition = getStateYPosition(panelState);
          initialY = parseFloat(statePosition.replace('%', ''));
        }

        return { startY: initialY, startState: panelState };
      }

      // Prevent processing during animation (except on first touch)
      if (isAnimating) {
        return memo;
      }

      const startY = memo?.startY ?? 35;
      const dragOffset = (my / viewportHeight) * 100;
      const newY = Math.max(0, Math.min(100, startY + dragOffset));

      if (!last) {
        y.set(`${newY}%`);
        return { startY, newY, startState: memo?.startState || panelState };
      }

      if (last) {
        setIsDragging(false);

        // Close if dragged to less than 20% visible (80% down)
        if (newY >= 80) {
          onClose();
          return memo;
        }

        // Snap to maximized only if dragging UP to the top
        // Don't snap if already near top and just making small adjustments
        if (newY < 10 && startY >= 10) {
          // Dragged up from below to the top - snap to maximize
          snapToState('maximized');
        } else if (newY < 10) {
          // Already at top (< 10%), just maintain position without snapping
          setPanelState('maximized');
        } else {
          // Between 10% and 80% - stay at current position (freely sizeable)
          // Update panel state to 'free' to indicate it's not in a named state
          setPanelState('free');
          // The motion value y is already set to newY% during drag
        }
      }

      return { startY, newY, startState: memo?.startState || panelState };
    },
    { axis: 'y', rubberband: true }
  );

  // Initialize position on mount only
  useEffect(() => {
    const targetPosition = getStateYPosition(panelState);
    // Animate from bottom to target position on mount
    animate(y, targetPosition, {
      type: 'spring',
      stiffness: 300,
      damping: 30,
      duration: 0.3
    });
  }, []); // Only run on mount

  useMotionValueEvent(scrollY, "change", (latest) => {
    if (latest <= 10) {
      setShowBanner(true);
    } else if (latest > 10 && showBanner) {
      setShowBanner(false);
    }
  });
  
  const handleReaction = (emoji) => {
    setReactions(prev => {
        const newReactions = { ...prev };
        newReactions[emoji] = (newReactions[emoji] || 0) + 1;
        toast({
            title: `${emoji} Reaktion hinzugefügt`,
            description: `Du hast mit ${emoji} reagiert.`,
        });
        return newReactions;
    });
  };
  
  const handleCommentSubmit = (commentText) => {
    // Add the new comment to the data
    toast({
      title: "💬 Kommentar hinzugefügt",
      description: "Dein Kommentar wurde erfolgreich gepostet.",
    });
    // TODO: Implement actual comment submission logic
    console.log('Comment submitted:', commentText);
  };

  const handleScrollToComments = () => {
    scroller.scrollTo('comments', {
      duration: 800,
      delay: 0,
      smooth: 'easeInOutQuart',
      containerId: 'profile-scroll-container',
      offset: -20,
    });
    // Focus the input after scrolling
    setTimeout(() => {
        commentInputRef.current?.focus();
    }, 800);
  };


  const componentsConfig = [
    { key: 'text', component: TextComponent, props: { text: data.text }, name: 'Über' },
    { key: 'eventFunctions', component: EventFunctions, props: { eventDetails: data.eventDetails, location: data.location, onSwitchToMap: onSwitchToMap, isInMapView: isInMapView }, name: 'Event' },
    { key: 'mediaGallery', component: MediaGallery, props: { images: data.images || [] }, name: 'Galerie' },
    { key: 'crowdfunding', component: Crowdfunding, props: { crowdfunding: data.crowdfunding }, name: 'Funding' },
    { key: 'members', component: Members, props: { members: data.members }, name: 'Mitglieder' },
    { key: 'comingEvents', component: ComingEvents, props: { events: data.comingEvents }, name: 'Events' },
    { key: 'projects', component: Projects, props: { projects: data.projects }, name: 'Projekte' },
    { key: 'quests', component: Quests, props: { questDetails: data.questDetails }, name: 'Quests' },
    { key: 'badges', component: Badges, props: { badges: data.badges }, name: 'Badges' },
    { key: 'contactInfo', component: ContactInfo, props: { contactInfo: data.contactInfo }, name: 'Kontakt' },
  ];

  const activeComponents = componentsConfig.filter(({ key, props, condition }) => {
    // Check explicit condition first (e.g., map only shows if location exists)
    if (condition !== undefined && !condition) return false;

    // Map component is always enabled if location exists (handled by condition above)
    if (key === 'map') return true;

    // For other components, check config
    if (!config.components[key]) return false;

    // Check if the component has the necessary data to render
    const propKeys = Object.keys(props);
    if (propKeys.length > 0) {
      return propKeys.some(propKey => props[propKey] !== undefined && props[propKey] !== null);
    }
    return true;
  });
  
  const commentsComponent = { key: 'comments', component: Comments, props: { reactions: reactions, comments: data.comments, onReaction: handleReaction, inputRef: commentInputRef }, name: 'Kommentare' };

  // Common props for ProfileContent
  const contentProps = {
    data,
    config,
    showBanner,
    reactions,
    handleReaction,
    handleCommentSubmit,
    handleScrollToComments,
    scrollRef,
    commentsRef,
    commentInputRef,
    activeComponents,
    commentsComponent,
    onClose,
    navigationSource,
    onSwitchToMap,
    displayMode,
    onSwitchDisplayMode: handleSwitchDisplayMode,
    isMobile
  };

  // Render based on display mode
  switch (displayMode) {
    case 'overlay':
      return (
        <Dialog open={true} onOpenChange={onClose}>
          <DialogContent
            showCloseButton={false}
            className={cn(
              "bg-transparent border-none p-0 shadow-none",
              isMobile
                ? "w-full h-screen max-w-full max-h-screen m-0"
                : "max-w-[95vw] w-full h-[95vh] max-h-[95vh]"
            )}
            style={{ display: 'block' }}
          >
            <DialogTitle className="sr-only">
              {data.title || data.name || 'Profile Details'}
            </DialogTitle>
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 0 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 0 }}
              transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              className="rounded-lg overflow-hidden h-full"
            >
              <ProfileContent
                {...contentProps}
                dragBinder={null}
                isDragging={false}
                panelState={null}
              />
            </motion.div>
          </DialogContent>
        </Dialog>
      );

    case 'draggable':
      return (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          className="fixed inset-x-0 bottom-0 z-[1003] pointer-events-none"
          style={{ y }}
        >
          <ProfileContent
            {...contentProps}
            dragBinder={dragBinder()}
            isDragging={isDragging}
            panelState={panelState}
          />
        </motion.div>
      );

    case 'sidebar':
      return (
        <motion.div
          initial={{ x: '100%', opacity: 0, y: 0 }}
          animate={{ x: 0, opacity: 1, y: 0 }}
          exit={{ x: '100%', opacity: 0, y: 0 }}
          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          className="w-full h-[calc(100vh-69px)] overflow-hidden shadow-2xl shadow-black/50 md:border-l md:border-gray-300"
        >
          <ProfileContent
            {...contentProps}
            dragBinder={null}
            isDragging={false}
            panelState={null}
          />
        </motion.div>
      );

    default:
      return null;
  }
};

export default ProfileView;