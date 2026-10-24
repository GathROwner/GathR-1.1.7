import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PUCK_DIAGNOSTICS_AVAILABLE, puckDiagnosticSnapshot, startPuckDiagnostics, stopPuckDiagnostics, subscribePuckDiagnostics, type PuckDiagnosticRow } from '../utils/puckDiagnostics';

type Props = { bottom: number; focused: boolean; permission: boolean; zoom: number; blocked: boolean; width: number; height: number };
const line = (row: PuckDiagnosticRow | null) => row ? `${Math.round(row.elapsedMs / 1000)}s ${row.event} ${Object.entries(row.values).map(([key, value]) => `${key}:${value}`).join(' ')}` : 'Waiting for an actual placement callback';
/** No modal, telemetry, storage, or placement triggers: gestures outside the panel stay native. */
export function PuckDiagnostics(props: Props) {
  const capture = useSyncExternalStore(subscribePuckDiagnostics, puckDiagnosticSnapshot, puckDiagnosticSnapshot);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (!props.focused) { stopPuckDiagnostics(); setExpanded(false); }
  }, [props.focused]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => { if (state !== 'active') { stopPuckDiagnostics(); setExpanded(false); } });
    return () => { listener.remove(); stopPuckDiagnostics(); };
  }, []);
  if (!PUCK_DIAGNOSTICS_AVAILABLE) return null;
  const start = () => { if (props.focused) { startPuckDiagnostics(); setExpanded(true); } };
  return <>
    <Pressable testID="puck-diagnostics-entry" accessibilityRole="button" accessibilityLabel="GathR map logo. Hold to inspect marker placement" accessibilityActions={[{ name: 'longpress', label: 'Inspect marker placement' }]} onAccessibilityAction={event => { if (event.nativeEvent.actionName === 'longpress') start(); }} onLongPress={start} delayLongPress={700} style={[styles.logoHost, { bottom: props.bottom - 10 }]}>
      <Image source={require('../assets/images/icon.png')} style={styles.logo} resizeMode="contain" />
    </Pressable>
    {capture.active && <View testID="puck-diagnostics-panel" onAccessibilityEscape={stopPuckDiagnostics} style={[styles.panel, { bottom: props.bottom + 38, maxWidth: Math.max(220, props.width - 24) }]}>
      <View style={styles.buttons}>
        <Pressable testID="puck-diagnostics-toggle" accessibilityRole="button" onPress={() => setExpanded(value => !value)} style={styles.button}><Text style={styles.buttonText}>{expanded ? 'Hide details' : 'Inspect placement'}</Text></Pressable>
        <Pressable testID="puck-diagnostics-stop" accessibilityRole="button" onPress={stopPuckDiagnostics} style={styles.button}><Text style={styles.buttonText}>Stop / clear</Text></Pressable>
      </View>
      {expanded && <ScrollView style={styles.details} nestedScrollEnabled>
        <Text style={styles.title}>Local marker diagnostics</Text>
        <Text style={styles.text}>Memory only · stops after 3 minutes or leaving this screen. No location is recorded or sent.</Text>
        <Text style={styles.text}>Focus {Number(props.focused)} · permission {Number(props.permission)} · blocked {Number(props.blocked)} · zoom {props.zoom.toFixed(1)} · view {Math.round(props.width)}×{Math.round(props.height)}</Text>
        <Text style={styles.text}>Native puck: visibility requested with permission; native pixels are not measured.</Text>
        <Text style={styles.text}>Camera {capture.cameraMoves} · idle {capture.idles} · attempts {capture.attempts} · current offsets {capture.currentOffsets}</Text>
        <Text style={styles.text}>Sample: {line(capture.sample)}</Text>
        <Text style={styles.text}>Decision: {line(capture.decision)}</Text>
        <Text style={styles.text}>Current committed move: {capture.chosen ? line(capture.chosen) : 'none observed'}</Text>
        {capture.candidates.filter((row, index) => index === 0 || row.values.overlap).map((row, index) => <Text key={`candidate-${index}`} style={styles.text}>{line(row)}</Text>)}
        {capture.rows.slice(-8).map((row, index) => <Text key={index} style={styles.text}>{line(row)}</Text>)}
      </ScrollView>}
    </View>}
  </>;
}
const styles = StyleSheet.create({
  logoHost: { position: 'absolute', left: 0, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', zIndex: 200, elevation: 200 },
  logo: { width: 24, height: 24, borderRadius: 12 },
  panel: { position: 'absolute', left: 12, width: 350, borderRadius: 10, padding: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: '#666', zIndex: 201, elevation: 201 },
  buttons: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  button: { minHeight: 44, padding: 8, justifyContent: 'center' }, buttonText: { color: '#174889', fontWeight: '700', fontSize: 14 },
  details: { maxHeight: 300 }, title: { fontSize: 16, color: '#111', fontWeight: '700', marginVertical: 4 }, text: { fontSize: 12, color: '#111', marginBottom: 5 },
});
