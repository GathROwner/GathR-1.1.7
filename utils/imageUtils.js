// imageUtils.js - Utility functions for handling images and fallbacks

/**
 * Returns the appropriate fallback image based on category, type, and fallback context
 * @param {string} category - The event/special category (e.g., 'Live Music', 'Food Special')
 * @param {string} type - The item type ('event' or 'special')
 * @param {string} fallbackType - The context ('post' for main images or 'profile' for profile images)
 * @param {Object|string|null} [itemOrSeed=null] - Optional event data or seed text for deterministic variant selection
 * @returns {any} - The require() result for the appropriate image
 */
export const getCategoryFallbackImage = (category, type = 'event', fallbackType = 'post', itemOrSeed = null) => {
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
  const variantMap = {
    'Food Special': [
      {
        source: require('../assets/fallbacks/categories/variants/food-special-refined-dinner.webp'),
        keywords: ['prix fixe', 'three course', '3 course', 'course meal', 'wine pairing', 'chef', 'tasting', 'dinner', 'supper', 'pasta', 'carbonara'],
      },
      {
        source: require('../assets/fallbacks/categories/variants/food-special-casual-pub.webp'),
        keywords: ['burger', 'wing', 'fries', 'fry', 'taco', 'pizza', 'nacho', 'bbq', 'barbecue', 'pub', 'steak', 'sandwich'],
      },
      {
        source: require('../assets/fallbacks/categories/variants/food-special-cafe-lunch.webp'),
        keywords: ['soup', 'biscuit', 'bakery', 'cafe', 'coffee', 'lunch', 'fresh fridge', 'salad'],
      },
      {
        source: require('../assets/fallbacks/categories/variants/food-special-brunch.webp'),
        keywords: ['brunch', 'breakfast', 'pancake', 'waffle', 'egg', 'benny', 'benedict'],
      },
      {
        source: require('../assets/fallbacks/categories/variants/food-special-seafood.webp'),
        keywords: ['seafood', 'fish', 'mussel', 'oyster', 'clam', 'lobster', 'chowder'],
      },
    ],
    'Live Music': [
      {
        source: require('../assets/fallbacks/categories/variants/live-music-acoustic-pub.webp'),
        keywords: ['acoustic', 'singer', 'songwriter', 'solo', 'guitar'],
      },
      {
        source: require('../assets/fallbacks/categories/variants/live-music-concert-stage.webp'),
        keywords: ['band', 'concert', 'tribute', 'rock', 'country', 'top 40', 'choir', 'orchestra'],
      },
      {
        source: require('../assets/fallbacks/categories/variants/live-music-jazz-lounge.webp'),
        keywords: ['jazz', 'blues', 'sax', 'lounge'],
      },
      {
        source: require('../assets/fallbacks/categories/variants/live-music-dj-dance.webp'),
        keywords: ['dj', 'dance', 'club night', 'party night'],
      },
      {
        source: require('../assets/fallbacks/categories/variants/live-music-open-mic.webp'),
        keywords: ['open mic', 'jam session', 'karaoke'],
      },
    ],
    'Gatherings & Parties': [
      {
        source: require('../assets/fallbacks/categories/variants/gatherings-community-social.webp'),
        keywords: ['community', 'social', 'meetup', 'open hours', 'simulcast'],
      },
      {
        source: require('../assets/fallbacks/categories/variants/gatherings-craft-market.webp'),
        keywords: ['market', 'craft', 'vendor', 'artisan', 'maker', 'fair', 'bazaar'],
      },
      {
        source: require('../assets/fallbacks/categories/variants/gatherings-classic-car-night.webp'),
        keywords: ['classic car', 'car night', 'car show', 'vehicle', 'motorcycle', 'cruise'],
      },
      {
        source: require('../assets/fallbacks/categories/variants/gatherings-fundraiser.webp'),
        keywords: ['fundraiser', 'benefit', 'raffle', 'auction', 'banquet'],
      },
      {
        source: require('../assets/fallbacks/categories/variants/gatherings-casual-celebration.webp'),
        keywords: ['party', 'celebration', 'anniversary', 'networking', 'social bar'],
      },
    ],
    'Social Gatherings & Parties': [
      {
        source: require('../assets/fallbacks/categories/variants/gatherings-community-social.webp'),
        keywords: ['community', 'social', 'meetup', 'open hours', 'simulcast'],
      },
      {
        source: require('../assets/fallbacks/categories/variants/gatherings-craft-market.webp'),
        keywords: ['market', 'craft', 'vendor', 'artisan', 'maker', 'fair', 'bazaar'],
      },
      {
        source: require('../assets/fallbacks/categories/variants/gatherings-classic-car-night.webp'),
        keywords: ['classic car', 'car night', 'car show', 'vehicle', 'motorcycle', 'cruise'],
      },
      {
        source: require('../assets/fallbacks/categories/variants/gatherings-fundraiser.webp'),
        keywords: ['fundraiser', 'benefit', 'raffle', 'auction', 'banquet'],
      },
      {
        source: require('../assets/fallbacks/categories/variants/gatherings-casual-celebration.webp'),
        keywords: ['party', 'celebration', 'anniversary', 'networking', 'social bar'],
      },
    ],
    'Sports': [
      {
        source: require('../assets/fallbacks/categories/variants/sports-team-tournament.webp'),
        keywords: ['hockey', 'soccer', 'football', 'basketball', 'baseball', 'volleyball', 'rugby', 'tournament', 'centennial cup'],
      },
      {
        source: require('../assets/fallbacks/categories/variants/sports-swimming-pool.webp'),
        keywords: ['swim', 'swimming', 'pool', 'aquatic', 'aqua'],
      },
      {
        source: require('../assets/fallbacks/categories/variants/sports-outdoor-fitness.webp'),
        keywords: ['run', 'running', 'walk', 'marathon', 'trail', 'fitness', 'yoga', 'cycle', 'cycling', 'bike', 'pickleball'],
      },
      {
        source: require('../assets/fallbacks/categories/variants/sports-golf.webp'),
        keywords: ['golf'],
      },
      {
        source: require('../assets/fallbacks/categories/variants/sports-ice-rink.webp'),
        keywords: ['ice', 'rink', 'skate', 'skating', 'curling', 'ringette'],
      },
    ],
    'Happy Hour': [
      {
        source: require('../assets/fallbacks/categories/variants/happy-hour-cocktails.webp'),
        keywords: ['cocktail', 'martini', 'margarita'],
      },
      {
        source: require('../assets/fallbacks/categories/variants/happy-hour-craft-beer.webp'),
        keywords: ['beer', 'pint', 'draft', 'draught', 'brew', 'taproom', 'ale', 'lager', 'stout'],
      },
      {
        source: require('../assets/fallbacks/categories/variants/happy-hour-wine-small-plates.webp'),
        keywords: ['wine', 'cheese', 'charcuterie'],
      },
      {
        source: require('../assets/fallbacks/categories/variants/happy-hour-patio.webp'),
        keywords: ['patio', 'summer', 'sunset'],
      },
      {
        source: require('../assets/fallbacks/categories/variants/happy-hour-bar-snacks.webp'),
        keywords: ['wing', 'nacho', 'flatbread', 'snack', 'appetizer'],
      },
    ],
    'Drink Special': [
      {
        source: require('../assets/fallbacks/categories/variants/drink-special-beer-bucket.webp'),
        keywords: ['beer', 'bucket', 'pint', 'draft', 'draught', 'brew', 'ale', 'lager', 'stout'],
      },
      {
        source: require('../assets/fallbacks/categories/variants/drink-special-cocktails.webp'),
        keywords: ['cocktail', 'martini', 'margarita', 'rum', 'gin', 'vodka', 'whiskey', 'whisky'],
      },
      {
        source: require('../assets/fallbacks/categories/variants/drink-special-wine.webp'),
        keywords: ['wine', 'sangria'],
      },
      {
        source: require('../assets/fallbacks/categories/variants/drink-special-caesar.webp'),
        keywords: ['caesar', 'bloody mary', 'clamato'],
      },
      {
        source: require('../assets/fallbacks/categories/variants/drink-special-mocktail-table.webp'),
        keywords: ['mocktail', 'non alcoholic', 'non-alcoholic', 'sparkling', 'seltzer'],
      },
    ],
  };

  const getSeedText = () => {
    if (typeof itemOrSeed === 'string') {
      return itemOrSeed;
    }

    if (itemOrSeed && typeof itemOrSeed === 'object') {
      return [
        itemOrSeed.id,
        itemOrSeed.title,
        itemOrSeed.venue,
        itemOrSeed.category,
        itemOrSeed.description,
        itemOrSeed.fullDescription,
        itemOrSeed.startDate,
        itemOrSeed.startTime,
      ]
        .filter(Boolean)
        .join(' ');
    }

    return [category, type].filter(Boolean).join(' ');
  };

  const hashString = (value) => {
    const text = String(value || '');
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
      hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  };

  const chooseVariantFallback = (variants) => {
    const seedText = getSeedText();
    const normalizedSeed = seedText.toLowerCase();
    const keywordMatch = variants.find((variant) =>
      variant.keywords.some((keyword) => normalizedSeed.includes(keyword))
    );

    if (keywordMatch) {
      return keywordMatch.source;
    }

    return variants[hashString(seedText) % variants.length].source;
  };

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
    'Gatherings & Parties': require('../assets/fallbacks/categories/social-gatherings.webp'),
    'Cinema': require('../assets/fallbacks/categories/Cinema.webp'),
    'Karaoke': require('../assets/fallbacks/categories/karaoke.webp'),
    
    // Food special categories
    'Happy Hour': require('../assets/fallbacks/categories/happy-hour.webp'),
    'Wing Night': require('../assets/fallbacks/categories/wing-night.webp'),
    'Food Special': require('../assets/fallbacks/categories/food-special.webp'),
    'Drink Special': require('../assets/fallbacks/categories/drink-special.webp'),
  };

  if (fallbackType === 'post' && category && variantMap[category]) {
    return chooseVariantFallback(variantMap[category]);
  }
  
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

export const isFacebookLookasideCrawlerMediaUrl = (url) => {
  const value = String(url || '').trim();
  if (!value) return false;

  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase().replace(/\/+$/, '');
    return (
      (host === 'lookaside.fbsbx.com' || host.endsWith('.fbsbx.com')) &&
      path === '/lookaside/crawler/media'
    );
  } catch {
    return false;
  }
};

/**
 * Validates if a provided image URL is usable
 * @param {string} url - The URL to validate
 * @returns {boolean} - Whether the URL appears valid
 */
export const isValidImageUrl = (url) => {
  const value = String(url || '').trim();
  if (!value) return false;
  if (value === 'N/A') return false;
  if (isFacebookLookasideCrawlerMediaUrl(value)) return false;
  
  // Basic URL validation (checks for http/https prefix)
  return value.startsWith('http://') || value.startsWith('https://');
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
