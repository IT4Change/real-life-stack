import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';

/**
 * Calculate distance between two coordinates
 * Returns formatted distance string (e.g., "2.3 km")
 */
const calculateDistance = (lat1, lon1, lat2 = 52.52, lon2 = 13.40) => {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;
  return `${distance.toFixed(1)} km`;
};

/**
 * Convert emoji reactions to likes/hearts counts
 */
const convertReactions = (reactions) => {
  if (!reactions) return { likes: 0, hearts: 0 };

  let likes = 0;
  let hearts = 0;

  Object.entries(reactions).forEach(([emoji, count]) => {
    if (emoji === '❤️' || emoji === '💕' || emoji === '💖') {
      hearts += count;
    } else {
      likes += count;
    }
  });

  return { likes, hearts };
};

/**
 * Format relative time
 */
const formatRelativeTime = (dateString) => {
  try {
    return formatDistanceToNow(new Date(dateString), {
      addSuffix: true,
      locale: de
    });
  } catch (e) {
    return 'vor kurzem';
  }
};

/**
 * Convert Edge comments format to Profile format
 */
const convertComments = (comments, users) => {
  if (!comments || !Array.isArray(comments)) return [];

  return comments.map(comment => {
    const author = users[comment.authorId];
    return {
      id: comment.id,
      author: {
        name: author?.name || 'Unbekannt',
        avatar: author?.avatar || null
      },
      time: formatRelativeTime(comment.createdAt),
      text: comment.text,
      // Include replies if they exist
      replies: comment.replies && comment.replies.length > 0
        ? convertComments(comment.replies, users)
        : undefined
    };
  });
};

/**
 * Convert event startTime/endTime to event details
 */
const convertEventDetails = (post) => {
  if (!post.startTime) return null;

  const startDate = new Date(post.startTime);
  const endDate = post.endTime ? new Date(post.endTime) : null;

  return {
    startDate: startDate.toISOString().split('T')[0],
    startTime: startDate.toTimeString().slice(0, 5),
    endDate: endDate ? endDate.toISOString().split('T')[0] : startDate.toISOString().split('T')[0],
    endTime: endDate ? endDate.toTimeString().slice(0, 5) : null,
    participants: post.eventDetails?.participants || []
  };
};

/**
 * Get user's projects (find posts where user is a member)
 */
const getUserProjects = (userId, allPosts) => {
  return allPosts
    .filter(p => p.type === 'project' && p.members?.includes(userId))
    .map(p => ({
      id: p.id,
      name: p.title,
      image: p.media?.[0]?.url
    }));
};

/**
 * Get user's coming events (find events where user is organizer or participant)
 */
const getUserComingEvents = (userId, allPosts) => {
  return allPosts
    .filter(p => {
      if (p.type !== 'event') return false;
      if (p.authorId === userId) return true;
      if (p.eventDetails?.participants?.some(part => part.id === userId)) return true;
      return false;
    })
    .map(p => ({
      id: p.id,
      name: p.title,
      date: p.startTime,
      image: p.media?.[0]?.url
    }))
    .slice(0, 5); // Limit to 5 upcoming events
};

/**
 * Main adapter: Convert Edge post format to Profile data format
 */
export const postToProfileData = (post, users, allPosts = []) => {
  if (!post) return null;

  const author = users[post.authorId] || {};
  const location = post.location || null;

  // Base data structure common to all types
  const banner = post.type === 'person'
    ? (author.banner || post.media?.[1]?.url)
    : (post.media?.[0]?.url || author.banner);

  // Filter out banner from gallery images
  const galleryImages = post.media
    ?.filter(m => m.url !== banner)
    .map(m => m.url) || [];

  const baseData = {
    type: post.type,
    name: post.title,
    avatar: post.type === 'person' ? author.avatar : (post.media?.[0]?.url || author.avatar),
    banner: banner,
    address: location?.name || '',
    distance: location ? calculateDistance(location.lat, location.lon) : null,
    text: post.content,
    images: galleryImages,
    reactions: post.reactions || {},
    comments: convertComments(post.comments, users),
    location: location // Keep original location for map
  };

  // Type-specific additions
  const typeSpecific = {};

  switch (post.type) {
    case 'person':
      typeSpecific.contactInfo = post.contactInfo || author.contactInfo || null;
      typeSpecific.badges = post.badges || author.badges || [];
      typeSpecific.projects = getUserProjects(post.authorId, allPosts);
      typeSpecific.comingEvents = getUserComingEvents(post.authorId, allPosts);
      break;

    case 'event':
      typeSpecific.eventDetails = convertEventDetails(post);
      break;

    case 'quest':
      typeSpecific.questDetails = post.questDetails || null;
      break;

    case 'project':
      typeSpecific.members = post.members?.map(userId => ({
        id: userId,
        name: users[userId]?.name || 'Unbekannt',
        avatar: users[userId]?.avatar || null
      })) || [];
      typeSpecific.crowdfunding = post.crowdfunding || null;
      break;

    case 'offer':
      typeSpecific.contactInfo = post.contactInfo || author.contactInfo || null;
      break;

    default:
      break;
  }

  return { ...baseData, ...typeSpecific };
};

/**
 * Get banner image from post (for PostCard compatibility)
 */
export const getPostBanner = (post) => {
  return post.media?.[0]?.url || null;
};
