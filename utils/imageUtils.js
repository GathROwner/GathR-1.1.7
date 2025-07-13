// imageUtils.js - Utility functions for handling images and fallbacks

/**
 * Returns the appropriate fallback image based on category, type, and fallback context
 * @param {string} category - The event/special category (e.g., 'Live Music', 'Food Special')
 * @param {string} type - The item type ('event' or 'special')
 * @param {string} fallbackType - The context ('post' for main images or 'profile' for profile images)
 * @returns {any} - The require() result for the appropriate image
 */
export const getCategoryFallbackImage = (category, type = 'event', fallbackType = 'post') => {
  // Add debug logging to help troubleshoot
  // LOG: Function entry - tracks every fallback image request with full parameters
  // console.log("getCategoryFallbackImage called with:", { 
  //   category, 
  //   type, 
  //   fallbackType,
  //   typeIsEvent: type === 'event',
  //   typeIsSpecial: type === 'special'
  // });

  // Handle profile image fallbacks with direct path resolution
// Find the section that handles profile fallbacks
if (fallbackType === 'profile') {
  // LOG: Profile fallback requested - shows when profile images are being handled
  // console.log("Profile fallback requested with type:", type);
  
  // Strict equality check for 'event' type
  if (type === 'event') {
    // LOG: Using event default profile image fallback
    // console.log("Using EVENT default profile image");
    return require('../assets/fallbacks/categories/event-default.webp');
  } else {
    // LOG: Using special default profile image fallback
    // console.log("Using SPECIAL default profile image");
    return require('../assets/fallbacks/categories/special-default.webp');
  }
}
  
  // For post images, map categories to their specific fallback images
  const fallbackMap = {
    // Event categories
    'Live Music': require('../assets/fallbacks/categories/live-music.webp'),
    'Trivia Night': require('../assets/fallbacks/categories/trivia-night.webp'),
    'Comedy': require('../assets/fallbacks/categories/comedy.webp'),
    'Workshops & Classes': require('../assets/fallbacks/categories/workshops.webp'),
    'Religious': require('../assets/fallbacks/categories/religious.webp'),
    'Sports': require('../assets/fallbacks/categories/sports.webp'),
    'Family Friendly': require('../assets/fallbacks/categories/family-friendly.webp'),
    'Social Gatherings & Parties': require('../assets/fallbacks/categories/social-gatherings.webp'),
    
    // Food special categories
    'Happy Hour': require('../assets/fallbacks/categories/happy-hour.webp'),
    'Wing Night': require('../assets/fallbacks/categories/wing-night.webp'),
    'Food Special': require('../assets/fallbacks/categories/food-special.webp'),
    'Drink Special': require('../assets/fallbacks/categories/drink-special.webp'),
  };
  
  // If category has a specific fallback, use it; otherwise use type default
  if (category && fallbackMap[category]) {
    // LOG: Using category-specific fallback image for matched category
    // console.log(`Using category-specific fallback for "${category}"`);
    return fallbackMap[category];
  }
  
  // Use generic type defaults if no specific category match is found
  // LOG: Using generic fallback when no category-specific image available
  // console.log(`Using generic fallback for type "${type}"`);
  // Explicit check for type
  if (type === 'event') {
    return require('../assets/fallbacks/categories/event-default.webp');
  } else {
    return require('../assets/fallbacks/categories/special-default.webp');
  }
};

/**
 * Validates if a provided image URL is usable
 * @param {string} url - The URL to validate
 * @returns {boolean} - Whether the URL appears valid
 */
export const isValidImageUrl = (url) => {
  if (!url) return false;
  if (url === '') return false;
  if (url === 'N/A') return false;
  
  // Basic URL validation (checks for http/https prefix)
  return url.startsWith('http://') || url.startsWith('https://');
};

/**
 * Gets the appropriate image URL, using fallbacks when needed
 * @param {Object} item - The event or special item
 * @param {string} preferredField - The preferred image field to use
 * @returns {string} - The best available image URL
 */
export const getBestImageUrl = (item, preferredField = 'imageUrl') => {
  // Check preferred field first
  if (isValidImageUrl(item[preferredField])) {
    return item[preferredField];
  }
  
  // Try alternative fields in priority order
  const alternativeFields = ['relevantImageUrl', 'SharedPostThumbnail', 'profileUrl'];
  
  for (const field of alternativeFields) {
    if (isValidImageUrl(item[field])) {
      return item[field];
    }
  }
  
  // Return empty string to trigger fallback image if no valid URL found
  return '';
};