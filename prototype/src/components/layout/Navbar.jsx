import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Menu, Calendar, Map, Rss, User, Settings, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/use-toast';
import NotificationBell from '@/components/notifications/NotificationBell';
import NotificationPanel from '@/components/notifications/NotificationPanel';
import MessageButton from '@/components/messages/MessageButton';

const Navbar = ({
  currentView,
  setCurrentView,
  sidebarOpen,
  setSidebarOpen,
  notifications,
  unreadCount,
  notificationPanelOpen,
  setNotificationPanelOpen,
  onNotificationClick,
  markAllAsRead,
  toggleNotificationRead,
  isMobile,
  // Messaging props
  totalUnreadCount,
  isMessagingOpen,
  onOpenMessaging,
}) => {
  const viewOptions = [
    { id: 'feed', label: 'Feed', icon: Rss },
    { id: 'map', label: 'Karte', icon: Map },
    { id: 'calendar', label: 'Kalender', icon: Calendar }
  ];

  const handleUserMenuClick = (action) => {
    toast({
      title: "🚧 Feature nicht implementiert",
      description: "🚧 This feature isn't implemented yet—but don't worry! You can request it in your next prompt! 🚀"
    });
  };

  return (
    <motion.nav 
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      className="fixed top-0 left-0 right-0 z-50 bg-white/10 backdrop-blur-lg border-b border-white/20"
    >
      <div className="flex items-center justify-between px-4 py-3">
        {/* Left Section */}
        <div className="flex items-center space-x-4">
          {/* Burger Menu */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-white hover:bg-white/20"
          >
            <Menu className="h-5 w-5" />
          </Button>

          {/* Logo */}
          <motion.div 
            className="flex items-center space-x-2"
            whileHover={{ scale: 1.05 }}
          >
            <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">A</span>
            </div>
            <span className="text-white font-semibold text-lg hidden sm:block">AppShell</span>
          </motion.div>
        </div>

        {/* Center Section - View Selection (Desktop Only) */}
        <div className="hidden md:flex items-center space-x-2 bg-white/10 rounded-full p-1">
          {viewOptions.map((option) => {
            const Icon = option.icon;
            return (
              <Button
                key={option.id}
                variant={currentView === option.id ? "default" : "ghost"}
                size="sm"
                onClick={() => setCurrentView(option.id)}
                className={`flex items-center space-x-2 px-4 py-2 rounded-full transition-all ${
                  currentView === option.id 
                    ? 'bg-white text-purple-900 shadow-lg' 
                    : 'text-white hover:bg-white/20'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{option.label}</span>
              </Button>
            );
          })}
        </div>

        {/* Right Section - Messages, Notifications & User Menu */}
        <div className="flex items-center space-x-2">
          {/* Message Button */}
          <MessageButton
            unreadCount={totalUnreadCount}
            onClick={onOpenMessaging}
            isOpen={isMessagingOpen}
          />

          {/* Notification Bell */}
          <div className="relative" data-notification-bell>
            <NotificationBell
              unreadCount={unreadCount}
              onClick={() => setNotificationPanelOpen(!notificationPanelOpen)}
              isOpen={notificationPanelOpen}
            />

            {/* Desktop Notification Panel */}
            {!isMobile && (
              <NotificationPanel
                notifications={notifications}
                isOpen={notificationPanelOpen}
                onClose={() => setNotificationPanelOpen(false)}
                onMarkAllRead={markAllAsRead}
                onToggleRead={toggleNotificationRead}
                onNotificationClick={onNotificationClick}
                isMobile={false}
              />
            )}
          </div>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                <Avatar className="h-10 w-10 border-2 border-white/30">
                  <AvatarImage src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face" alt="User" />
                  <AvatarFallback className="bg-gradient-to-r from-purple-500 to-pink-500 text-white">
                    JD
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56 backdrop-blur-lg border border-white/20" align="end">
            <DropdownMenuItem 
              onClick={() => handleUserMenuClick('profile')}
              className="flex items-center space-x-2 cursor-pointer"
            >
              <User className="h-4 w-4" />
              <span>Profil</span>
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => handleUserMenuClick('settings')}
              className="flex items-center space-x-2 cursor-pointer"
            >
              <Settings className="h-4 w-4" />
              <span>Einstellungen</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={() => handleUserMenuClick('logout')}
              className="flex items-center space-x-2 cursor-pointer text-red-600"
            >
              <LogOut className="h-4 w-4" />
              <span>Logout</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </motion.nav>
  );
};

export default Navbar;