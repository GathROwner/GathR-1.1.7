import React from 'react';
import {
  Modal,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  MAP_TRACE_UI_ENABLED,
  clearMapTrace,
  formatMapTraceExport,
  traceMapEvent,
  useMapTraceState,
} from '../../utils/mapTrace';

interface MapTracePanelProps {
  visible: boolean;
  onClose: () => void;
}

const formatEntryDetails = (details?: Record<string, string | number | boolean | null>) => {
  if (!details || Object.keys(details).length === 0) {
    return '';
  }

  return Object.entries(details)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(' ');
};

export default function MapTracePanel({ visible, onClose }: MapTracePanelProps) {
  const { entries, snapshot } = useMapTraceState();

  if (!MAP_TRACE_UI_ENABLED) {
    return null;
  }

  const handleShare = async () => {
    traceMapEvent('trace_share_requested', { entryCount: entries.length });

    try {
      await Share.share({
        title: 'GathR Map Trace',
        message: formatMapTraceExport(),
      });
    } catch (error) {
      traceMapEvent('trace_share_failed', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleClear = () => {
    clearMapTrace();
    traceMapEvent('trace_cleared');
  };

  const handleClose = () => {
    traceMapEvent('trace_panel_closed');
    onClose();
  };

  return (
    <Modal
      animationType="slide"
      presentationStyle="pageSheet"
      transparent={false}
      visible={visible}
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Map Trace</Text>
          <Text style={styles.subtitle}>
            Share this log from the phone to email it to yourself.
          </Text>
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity style={[styles.primaryButton, styles.buttonSpacing]} onPress={handleShare}>
            <Text style={styles.primaryButtonText}>Share Logs</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.secondaryButton, styles.buttonSpacing]} onPress={handleClear}>
            <Text style={styles.secondaryButtonText}>Clear</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={handleClose}>
            <Text style={styles.secondaryButtonText}>Close</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
          <Text style={styles.sectionTitle}>State</Text>
          <View style={styles.section}>
            {Object.keys(snapshot).length === 0 ? (
              <Text style={styles.emptyText}>No state captured yet.</Text>
            ) : (
              Object.entries(snapshot)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, value]) => (
                  <Text key={key} style={styles.stateLine}>
                    {key}={String(value)}
                  </Text>
                ))
            )}
          </View>

          <Text style={styles.sectionTitle}>Events</Text>
          <View style={styles.section}>
            {entries.length === 0 ? (
              <Text style={styles.emptyText}>No events captured yet.</Text>
            ) : (
              [...entries].reverse().map((entry) => (
                <View key={entry.id} style={styles.entryRow}>
                  <Text style={styles.entryLabel}>
                    {new Date(entry.timestamp).toLocaleTimeString([], {
                      hour12: false,
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                    {'.'}
                    {new Date(entry.timestamp).getMilliseconds().toString().padStart(3, '0')}{' '}
                    {entry.label}
                  </Text>
                  {entry.details ? (
                    <Text style={styles.entryDetails}>{formatEntryDetails(entry.details)}</Text>
                  ) : null}
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1115',
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 24,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 6,
  },
  subtitle: {
    color: '#B8C0CC',
    fontSize: 14,
    lineHeight: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  buttonSpacing: {
    marginRight: 10,
  },
  primaryButton: {
    backgroundColor: '#F3C341',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryButtonText: {
    color: '#1C1C1C',
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: '#1A202B',
    borderColor: '#2B3442',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  secondaryButtonText: {
    color: '#E6EBF2',
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  contentInner: {
    paddingBottom: 24,
  },
  sectionTitle: {
    color: '#F3C341',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  section: {
    backgroundColor: '#131822',
    borderColor: '#242D3A',
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 18,
    padding: 12,
  },
  emptyText: {
    color: '#8A93A3',
    fontSize: 13,
  },
  stateLine: {
    color: '#E6EBF2',
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 18,
  },
  entryRow: {
    borderBottomColor: '#202735',
    borderBottomWidth: 1,
    paddingVertical: 8,
  },
  entryLabel: {
    color: '#FFFFFF',
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 18,
  },
  entryDetails: {
    color: '#98A3B3',
    fontFamily: 'monospace',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
});
