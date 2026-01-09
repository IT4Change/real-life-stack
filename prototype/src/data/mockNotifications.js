import { subMinutes, subHours, subDays } from 'date-fns';
import { NOTIFICATION_TYPES } from './notificationTypes';

export const mockNotifications = [
  {
    id: 'notif-1',
    type: NOTIFICATION_TYPES.NEW_REACTION,
    userId: 'user-2',
    targetUserId: 'current-user',
    postId: 'post-1',
    data: {
      userName: 'Max Schmidt',
      userAvatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100',
      postTitle: 'Yoga im Park',
      emoji: '❤️',
    },
    isRead: false,
    createdAt: subMinutes(new Date(), 15).toISOString(),
  },
  {
    id: 'notif-2',
    type: NOTIFICATION_TYPES.NEW_COMMENT,
    userId: 'user-3',
    targetUserId: 'current-user',
    postId: 'post-2',
    commentId: 'c-3',
    data: {
      userName: 'Julia Klein',
      userAvatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=100',
      postTitle: 'Community-Garten anlegen',
      commentText: 'Super Idee! Wann geht es los?',
    },
    isRead: false,
    createdAt: subHours(new Date(), 2).toISOString(),
  },
  {
    id: 'notif-3',
    type: NOTIFICATION_TYPES.COMMENT_REPLY,
    userId: 'user-1',
    targetUserId: 'current-user',
    postId: 'post-1',
    commentId: 'c-1',
    data: {
      userName: 'Lena Weber',
      userAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100',
      postTitle: 'Yoga im Park',
      commentText: 'Danke für deine Antwort! Freue mich!',
    },
    isRead: true,
    createdAt: subDays(new Date(), 1).toISOString(),
  },
  {
    id: 'notif-4',
    type: NOTIFICATION_TYPES.NEW_REACTION,
    userId: 'user-4',
    targetUserId: 'current-user',
    postId: 'post-2',
    data: {
      userName: 'Thomas Müller',
      userAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100',
      postTitle: 'Community-Garten anlegen',
      emoji: '👍',
    },
    isRead: false,
    createdAt: subHours(new Date(), 5).toISOString(),
  },
];

export const initializeNotifications = () => {
  if (!localStorage.getItem('notifications')) {
    localStorage.setItem('notifications', JSON.stringify(mockNotifications));
  }
};
