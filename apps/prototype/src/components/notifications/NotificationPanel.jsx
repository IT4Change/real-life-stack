import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Bell, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import NotificationItem from './NotificationItem';

const NotificationPanel = ({
  notifications,
  isOpen,
  onClose,
  onMarkAllRead,
  onToggleRead,
  onNotificationClick,
  isMobile,
}) => {
  const panelRef = useRef(null);

  // Close on click outside (desktop only)
  useEffect(() => {
    if (!isOpen || isMobile) return;

    const handleClickOutside = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        // Check if click is on the bell button
        const bellButton = document.querySelector('[data-notification-bell]');
        if (bellButton && bellButton.contains(e.target)) return;
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose, isMobile]);

  if (!isOpen) return null;

  const unreadNotifications = notifications.filter(n => !n.isRead);
  const readNotifications = notifications.filter(n => n.isRead);

  // Desktop: Dropdown panel
  if (!isMobile) {
    return (
      <AnimatePresence>
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, y: -10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          transition={{ duration: 0.15 }}
          className="absolute right-0 top-full mt-2 w-96 max-h-[calc(100vh-100px)] bg-slate-800/95 backdrop-blur-lg border border-white/20 rounded-lg shadow-2xl z-50 flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-white/20">
            <h3 className="text-white font-semibold text-lg">Benachrichtigungen</h3>
            {unreadNotifications.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onMarkAllRead}
                className="text-purple-400 hover:text-purple-300 hover:bg-purple-500/20 h-8"
              >
                <CheckCheck className="h-4 w-4 mr-1" />
                Alle lesen
              </Button>
            )}
          </div>

          {/* Notification List */}
          <div className="overflow-y-auto flex-1 max-h-96">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-white/60">
                <Bell className="h-12 w-12 mx-auto mb-3 opacity-40" />
                <p>Keine Benachrichtigungen</p>
              </div>
            ) : (
              <>
                {unreadNotifications.length > 0 && (
                  <div>
                    <div className="px-4 py-2 text-xs font-semibold text-white/50 uppercase tracking-wider">
                      Neu
                    </div>
                    {unreadNotifications.map(notification => (
                      <NotificationItem
                        key={notification.id}
                        notification={notification}
                        onToggleRead={onToggleRead}
                        onClick={onNotificationClick}
                      />
                    ))}
                  </div>
                )}
                {readNotifications.length > 0 && (
                  <div>
                    <div className="px-4 py-2 text-xs font-semibold text-white/50 uppercase tracking-wider">
                      Gelesen
                    </div>
                    {readNotifications.map(notification => (
                      <NotificationItem
                        key={notification.id}
                        notification={notification}
                        onToggleRead={onToggleRead}
                        onClick={onNotificationClick}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // Mobile: Full-page overlay
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          className="absolute inset-x-0 top-16 bottom-0 bg-slate-900 flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex flex-col gap-3 p-4 border-b border-white/20 bg-slate-900/95 backdrop-blur-lg">
            <div className="flex items-center justify-between">
              <h2 className="text-white font-semibold text-xl">Benachrichtigungen</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="text-white hover:bg-white/20 flex-shrink-0"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            {unreadNotifications.length > 0 && (
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onMarkAllRead}
                  className="text-purple-400 hover:text-purple-300 hover:bg-purple-500/20"
                >
                  <CheckCheck className="h-4 w-4 mr-2" />
                  Alle als gelesen markieren
                </Button>
              </div>
            )}
          </div>

          {/* Notification List */}
          <div className="flex-1 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-white/60 p-8">
                <Bell className="h-16 w-16 mb-4 opacity-40" />
                <p className="text-lg">Keine Benachrichtigungen</p>
              </div>
            ) : (
              <>
                {unreadNotifications.length > 0 && (
                  <div>
                    <div className="px-4 py-3 text-sm font-semibold text-white/50 uppercase tracking-wider bg-slate-800/50">
                      Neu ({unreadNotifications.length})
                    </div>
                    {unreadNotifications.map(notification => (
                      <NotificationItem
                        key={notification.id}
                        notification={notification}
                        onToggleRead={onToggleRead}
                        onClick={onNotificationClick}
                      />
                    ))}
                  </div>
                )}
                {readNotifications.length > 0 && (
                  <div>
                    <div className="px-4 py-3 text-sm font-semibold text-white/50 uppercase tracking-wider bg-slate-800/50">
                      Gelesen
                    </div>
                    {readNotifications.map(notification => (
                      <NotificationItem
                        key={notification.id}
                        notification={notification}
                        onToggleRead={onToggleRead}
                        onClick={onNotificationClick}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default NotificationPanel;
