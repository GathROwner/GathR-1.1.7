/** Resolve the icon for a vertical interest pill using its displayed category or short label. */
export const getInterestFilterPillIconName = (category: string): string => {
  const categoryLower = category.toLowerCase();
  if (categoryLower.includes('live music') || categoryLower.includes('music')) return 'audiotrack';
  if (categoryLower.includes('comedy') || categoryLower.includes('laugh')) return 'sentiment-very-satisfied';
  if (categoryLower.includes('sport')) return 'sports-basketball';
  if (categoryLower.includes('trivia')) return 'psychology-alt';
  if (categoryLower.includes('workshop') || categoryLower.includes('class')) return 'history-edu';
  if (categoryLower.includes('religious') || categoryLower.includes('church') || categoryLower.includes('pray')) return 'church';
  if (categoryLower.includes('family')) return 'family-restroom';
  if (categoryLower.includes('gathering') || categoryLower.includes('parties') || categoryLower.includes('party')) return 'nightlife';
  if (categoryLower.includes('cinema') || categoryLower.includes('movie') || categoryLower.includes('film')) return 'theaters';
  if (categoryLower.includes('happy hour')) return 'local-bar';
  if (categoryLower.includes('food') || categoryLower.includes('wing')) return 'restaurant';
  if (categoryLower.includes('drink')) return 'wine-bar';
  return 'category';
};
