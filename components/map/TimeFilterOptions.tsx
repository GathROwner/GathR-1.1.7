import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MaterialIcons } from '@expo/vector-icons';
import { TimeFilterType } from '../../types';
import { useMapStore } from '../../store';

interface TimeFilterOptionsProps {
  selected: TimeFilterType;
  onSelect: (filter: TimeFilterType) => void;
  counts?: { [key in TimeFilterType]: number }; // Add counts prop
}

const TimeFilterOptions: React.FC<TimeFilterOptionsProps> = ({ 
  selected, 
  onSelect, 
  counts 
}) => {
  const options = [
    { 
      value: TimeFilterType.NOW, 
      label: 'Now', 
      icon: 'time-outline',
      description: 'Happening now'
    },
    { 
      value: TimeFilterType.TODAY, 
      label: 'Today', 
      icon: 'today-outline',
      description: 'Events today'
    },
    { 
      value: TimeFilterType.UPCOMING, 
      label: 'Upcoming', 
      icon: 'calendar-outline',
      description: 'Future events only'
    }
  ];

  return (
    <View style={styles.container}>
      {options.map((option) => {
        const count = counts?.[option.value] ?? 0;
        
        return (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.option,
              selected === option.value && styles.selectedOption
            ]}
            onPress={() => onSelect(option.value)}
          >
            <Ionicons 
              name={option.icon as any} 
              size={20} 
              color={selected === option.value ? 'white' : '#333'} 
            />
            <View style={styles.textContainer}>
              <View style={styles.labelRow}>
                <Text style={[
                  styles.optionLabel,
                  selected === option.value && styles.selectedText
                ]}>
                  {option.label}
                </Text>
                {counts && (
                  <Text style={[
                    styles.countText,
                    selected === option.value && styles.selectedText
                  ]}>
                    ({count})
                  </Text>
                )}
              </View>
              <Text style={[
                styles.optionDescription,
                selected === option.value && styles.selectedDescription
              ]}>
                {option.description}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'column',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  selectedOption: {
    backgroundColor: '#2196F3',
  },
  textContainer: {
    marginLeft: 10,
    flex: 1,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  countText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
    marginLeft: 8,
  },
  optionDescription: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  selectedText: {
    color: 'white',
  },
  selectedDescription: {
    color: 'rgba(255, 255, 255, 0.8)',
  }
});

export default TimeFilterOptions;