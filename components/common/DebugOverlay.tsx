import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';

interface DebugOverlayProps {
  logs: string[];
  onClear: () => void;
}

/**
 * A non-blocking debug overlay that can be toggled on/off and
 * allows interaction with elements beneath it.
 */
export default function DebugOverlay({ logs, onClear }: DebugOverlayProps) {
  const [expanded, setExpanded] = useState(false);
  const [visible, setVisible] = useState(true);

  // If hidden, just show a small button to restore it
  if (!visible) {
    return (
      <TouchableOpacity 
        style={styles.showButton}
        onPress={() => setVisible(true)}
      >
        <Text style={styles.showButtonText}>D</Text>
      </TouchableOpacity>
    );
  }

  return (
    // The main container uses box-none to allow touches to pass through
    // to underlying components when not directly on buttons/content
    <View 
      style={[
        styles.container, 
        expanded ? styles.expandedContainer : styles.collapsedContainer
      ]}
      pointerEvents="box-none"
    >
      {/* Only the header gets pointerEvents="auto" to capture touches */}
      <View style={styles.header} pointerEvents="auto">
        <Text style={styles.title}>
          AdMob Debug ({logs.length})
        </Text>
        
        <View style={styles.buttonContainer}>
          <TouchableOpacity 
            style={styles.toggleButton}
            onPress={() => setExpanded(!expanded)}
          >
            <Text style={styles.buttonText}>
              {expanded ? '▼' : '▲'}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.clearButton}
            onPress={onClear}
          >
            <Text style={styles.buttonText}>✕</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.hideButton}
            onPress={() => setVisible(false)}
          >
            <Text style={styles.buttonText}>−</Text>
          </TouchableOpacity>
        </View>
      </View>
      
      {/* Only show log content when expanded, and make it scrollable */}
      {expanded && (
        <ScrollView 
          style={styles.logContainer}
          pointerEvents="auto"
          nestedScrollEnabled={true}
        >
          {logs.map((log, index) => (
            <Text key={index} style={styles.logText}>
              {log}
            </Text>
          ))}
          
          {logs.length === 0 && (
            <Text style={styles.emptyLogText}>No logs yet</Text>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 10,
    bottom: 80, // Position above tab bar
    zIndex: 999, // High but not maximum z-index
    borderRadius: 8,
    // No width/height constraints on container to avoid occupying space unnecessarily
  },
  collapsedContainer: {
    width: 'auto', // Only as wide as content
    // No background color on collapsed container to avoid blocking touches
  },
  expandedContainer: {
    width: '80%', // Use percentage for responsive width
    maxWidth: 300, // But limit maximum width
    maxHeight: 200, // Limit maximum height
    backgroundColor: 'rgba(0, 0, 0, 0.7)', // Only apply background when expanded
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(52, 52, 52, 0.8)', // Darker background for header
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  title: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  buttonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toggleButton: {
    paddingHorizontal: 5,
  },
  clearButton: {
    backgroundColor: 'red',
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  hideButton: {
    backgroundColor: '#666',
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  buttonText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  logContainer: {
    maxHeight: 150,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 8,
    marginTop: 2,
    borderRadius: 8,
  },
  logText: {
    color: 'white',
    fontSize: 10,
    marginVertical: 1,
  },
  emptyLogText: {
    color: '#aaa',
    fontSize: 10,
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 8,
  },
  showButton: {
    position: 'absolute',
    right: 10,
    bottom: 80,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  showButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  }
});