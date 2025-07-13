/**
 * Component prop type definitions for the GathR application
 */

import { FilterCriteria, CategoryOption, FilterChangeHandler } from './filter';
import { Venue, Cluster } from './events';

/**
 * Props for the MarkerView component
 */
export interface MarkerViewProps {
  count: number;
  isCluster: boolean;
  categories: string[];
  isSelected: boolean;
}

/**
 * Props for the FilterBar component
 */
export interface FilterBarProps {
  onFilterChange: FilterChangeHandler;
  categories: CategoryOption[];
  activeFilters: FilterCriteria;
}

/**
 * Props for the CategoryFilter component
 */
export interface CategoryFilterProps {
  categories: CategoryOption[];
  selectedCategory?: string;
  onSelectCategory: (category?: string) => void;
}

/**
 * Props for the TimeFilter component
 */
export interface TimeFilterProps {
  selected: string;
  onSelect: (timeFilter: string) => void;
}

/**
 * Props for the TypeFilter component
 */
export interface TypeFilterProps {
  selected?: 'event' | 'special';
  onSelect: (type?: 'event' | 'special') => void;
}

/**
 * Props for the SearchBar component
 */
export interface SearchBarProps {
  value: string;
  onSearch: (text: string) => void;
  placeholder?: string;
}

/**
 * Props for the EventCallout component
 */
export interface EventCalloutProps {
  venue: Venue;
  onClose: () => void;
}

/**
 * Props for the ClusterManager component
 */
export interface ClusterManagerProps {
  events: any[];
  zoom: number;
  onClustersGenerated: (clusters: Cluster[]) => void;
}