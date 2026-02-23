// Ad Theme Constants - Modern Social Media Style
// Used by NativeAdComponent and CompactNativeAdComponent

export const AdColors = {
  light: {
    // Card
    cardBackground: '#FFFFFF',
    cardBorder: 'transparent',

    // Typography
    headline: '#1A1A1A',
    body: '#4A4A4A',
    advertiser: '#65676B',
    metaText: '#8A8D91',

    // CTA Button
    ctaBackground: '#0866FF',
    ctaPressed: '#0553CC',
    ctaText: '#FFFFFF',

    // Badge
    badgeBackground: 'rgba(0, 0, 0, 0.05)',
    badgeText: '#65676B',
    badgeBorder: 'rgba(0, 0, 0, 0.1)',

    // Stars
    starActive: '#F5B800',
    starInactive: '#E4E6EA',

    // Media
    mediaPlaceholder: '#F0F2F5',

    // Skeleton
    skeletonBase: '#E4E6EA',
    skeletonHighlight: '#F0F2F5',

    // Shadow
    shadowColor: '#000000',
    shadowOpacity: 0.08,
  },
  dark: {
    // Card
    cardBackground: '#242526',
    cardBorder: 'rgba(255, 255, 255, 0.1)',

    // Typography
    headline: '#E4E6EB',
    body: '#B0B3B8',
    advertiser: '#B0B3B8',
    metaText: '#8A8D91',

    // CTA Button
    ctaBackground: '#2D88FF',
    ctaPressed: '#1877F2',
    ctaText: '#FFFFFF',

    // Badge
    badgeBackground: 'rgba(255, 255, 255, 0.1)',
    badgeText: '#B0B3B8',
    badgeBorder: 'rgba(255, 255, 255, 0.15)',

    // Stars
    starActive: '#F5B800',
    starInactive: '#3E4042',

    // Media
    mediaPlaceholder: '#3A3B3C',

    // Skeleton
    skeletonBase: '#3A3B3C',
    skeletonHighlight: '#4E4F50',

    // Shadow
    shadowColor: '#000000',
    shadowOpacity: 0.3,
  },
};

// Consistent spacing scale (8px base unit)
export const AdSpacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
};

// Border radius matching social media style
export const AdRadius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
};

// Animation durations
export const AdAnimations = {
  fadeIn: 250,
  slideUp: 300,
  press: 100,
};

// Helper type for color scheme
export type AdColorScheme = 'light' | 'dark';

// Get colors based on color scheme
export const getAdColors = (colorScheme: AdColorScheme) => AdColors[colorScheme];
