import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
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
      value: TimeFilterType.TOMORROW,
      label: 'Tomorrow',
      icon: 'sunny-outline',
      description: 'Events tomorrow'
    },
    {
      value: TimeFilterType.UPCOMING,
      label: 'Upcoming',
      icon: 'calendar-outline',
      description: 'Future events only'
    }
  ];

  return (
    <View style={styles.outerContainer}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.container}
        contentOffset={{x: 0, y: 0}}
      >
        <View style={styles.centerWrapper}>
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
                  size={16}
                  color={selected === option.value ? 'white' : '#666'}
                  style={styles.icon}
                />
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
  icon: {
    marginRight: 4,
  },
  optionLabel: {
    fontSize: 12,
    fontWeight: '400',
    color: '#333',
  },
  countText: {
    fontSize: 11,
    color: '#666',
    marginLeft: 4,
    fontWeight: '400',
  },
  selectedText: {
    color: 'white',
    fontWeight: '500',
  }
});

export default TimeFilterOptions;