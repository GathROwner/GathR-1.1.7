import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useMapStore } from '../../store';

interface CategoryFilterOptionsProps {
  type: 'event' | 'special';
  counts?: { [category: string]: number }; // Add counts prop
  onCategorySelect?: (category: string) => void; // NEW: Callback for interaction tracking
}

const CategoryFilterOptions: React.FC<CategoryFilterOptionsProps> = ({ 
  type, 
  counts,
  onCategorySelect // NEW: Accept interaction tracking callback
}) => {
  const { categories, filterCriteria, setTypeFilters, events } = useMapStore();
  
  // Get categories specific to this type (event or special)
  const typeEvents = events.filter(e => e.type === type);
  
  // If counts are provided (with custom order), use that order
  // Otherwise fall back to extracting from events
const typeCategories = counts 
  ? Object.keys(counts).filter(category => counts[category] > 0)
  : Array.from(new Set(typeEvents.map(e => e.category)));
  
  // Get the currently active category for this event type
  const activeCategory = type === 'event' 
    ? filterCriteria.eventFilters.category 
    : filterCriteria.specialFilters.category;
  
  // Helper function to get icon for category
  const getCategoryIcon = (category: string): string => {
    const categoryLower = category.toLowerCase();
    
    // Handle variations in category names
    if (categoryLower.includes('live music') || categoryLower.includes('music')) {
      return 'audiotrack';
    }
    if (categoryLower.includes('comedy')) {
      return 'sentiment-very-satisfied';
    }
    if (categoryLower.includes('sport')) {
      return 'sports-basketball';
    }
    if (categoryLower.includes('trivia')) {
      return 'psychology-alt';
    }
    if (categoryLower.includes('workshop') || categoryLower.includes('class')) {
      return 'school';
    }
    if (categoryLower.includes('religious') || categoryLower.includes('church')) {
      return 'church';
    }
    if (categoryLower.includes('family')) {
      return 'family-restroom';
    }
    if (categoryLower.includes('gathering') || categoryLower.includes('parties') || categoryLower.includes('party')) {
      return 'nightlife';
    }
    if (categoryLower.includes('cinema') || categoryLower.includes('movie') || categoryLower.includes('film')) {
      return 'theaters';
    }
    if (categoryLower.includes('happy hour')) {
      return 'local-bar';
    }
    if (categoryLower.includes('food') || categoryLower.includes('wing')) {
      return 'restaurant';
    }
    if (categoryLower.includes('drink')) {
      return 'wine-bar';
    }
    
    // Default fallback icon
    return 'category';
  };

  // Helper function to get color for category
  const getCategoryColor = (category: string): string => {
    switch (category.toLowerCase()) {
      case 'live music': return '#E94E77';
      case 'comedy show': 
      case 'comedy': return '#F1984D';
      case 'cabaret': return '#7B68EE';
      case 'sports': return '#4CAF50';
      case 'meeting': return '#2196F3';
      default: return '#757575';
    }
  };

  // ===============================================================
  // UPDATED: Handle category selection with interaction tracking
  // ===============================================================
  const handleCategorySelected = (category: string) => {
    // NEW: Call interaction tracking callback BEFORE applying filter
    if (onCategorySelect) {
      console.log(`[CategoryFilterOptions] Calling interaction tracking for category: ${category}`);
      onCategorySelect(category);
    }

    // EXISTING: Apply the filter (toggle logic)
    const newCategory = activeCategory === category ? undefined : category;
    console.log(`[CategoryFilterOptions] Setting ${type} category filter to: ${newCategory || 'undefined'}`);

    setTypeFilters(type, {
      category: newCategory
    }, 'filter-pills');
  };

  return (
    <View style={styles.outerContainer}>
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.container}
        contentOffset={{x: 0, y: 0}}
      >
        <View style={styles.centerWrapper}>
          {typeCategories.map((category) => {
            const count = counts?.[category] ?? 0;
            const iconName = getCategoryIcon(category);
            
            return (
              <TouchableOpacity
                key={category}
                style={[
                  styles.option,
                  activeCategory === category && styles.selectedOption
                ]}
                onPress={() => handleCategorySelected(category)} // UPDATED: Now includes interaction tracking
              >
                <View style={styles.categoryContent}>
                <MaterialIcons
                    name={iconName as any}
                    size={14}
                    color={activeCategory === category ? '#FFFFFF' : '#666'}
                    style={styles.categoryIcon}
                  />
                  <Text 
                    style={[
                      styles.optionText,
                      activeCategory === category && styles.selectedOptionText
                    ]}
                  >
                    {category}
                  </Text>
                  {counts && (
                    <Text 
                      style={[
                        styles.countText,
                        activeCategory === category && styles.selectedCountText
                      ]}
                    >
                      ({count})
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  outerContainer: {
    width: '100%',
  },
  container: {
    paddingVertical: 2,
    paddingBottom: 4,
  },
  centerWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
  },

option: {
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: '#FFFFFF',
  paddingHorizontal: 12,
  paddingVertical: 6,
  borderRadius: 16,
  marginRight: 6,
  borderWidth: 1,
  borderColor: '#EEEEEE',
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.1,
  shadowRadius: 1,
  elevation: 1,
},

  selectedOption: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
  categoryContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryIcon: {
    marginRight: 4,
  },
  optionText: {
    fontSize: 12,
    color: '#333',
  },
  selectedOptionText: {
    color: 'white',
    fontWeight: '500',
  },
  countText: {
    fontSize: 11,
    color: '#666',
    marginLeft: 4,
    fontWeight: '400',
  },
  selectedCountText: {
    color: 'rgba(255, 255, 255, 0.9)',
  }
});

export default CategoryFilterOptions;