import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Event } from '../../types/events';
import type { FilterCriteria, UpcomingDateFilter } from '../../types/filter';
import { addDaysToDateKey } from '../../utils/eventExpiry';
import { countUpcomingDateEvents, createEventTimeContext } from '../../utils/mapEventFilters';
import { formatLocalDateKey, formatUpcomingDateLabel, localDateFromKey, normalizeUpcomingDate } from '../../utils/upcomingDateWindow';

type CustomDate = Extract<UpcomingDateFilter, { kind: 'custom' }>;
type Props = { events: Event[]; criteria: FilterCriteria; onSelect: (selection: UpcomingDateFilter) => void };

const defaultCustomDate = (today: string): CustomDate => {
  const tomorrow = addDaysToDateKey(today, 1);
  return { kind: 'custom', startDate: tomorrow, endDate: tomorrow };
};

const CalendarSheet = ({ events, criteria, initial, onApply, onClose }: Omit<Props, 'onSelect'> & {
  initial: CustomDate; onApply: (selection: CustomDate) => void; onClose: () => void;
}) => {
  const insets = useSafeAreaInsets();
  const today = formatLocalDateKey(new Date());
  const [mode, setMode] = useState<'day' | 'range'>(initial.startDate === initial.endDate ? 'day' : 'range');
  const [start, setStart] = useState(initial.startDate);
  const [end, setEnd] = useState<string | null>(initial.endDate);
  const [month, setMonth] = useState(() => {
    const date = localDateFromKey(initial.startDate);
    return new Date(date.getFullYear(), date.getMonth(), 1, 12);
  });
  const pending: CustomDate = { kind: 'custom', startDate: start, endDate: end || start };
  const valid = start > today && !!end && end >= start;
  const count = useMemo(() => valid ? countUpcomingDateEvents(events, criteria,
    { kind: 'custom', startDate: start, endDate: end! }) : 0, [events, criteria, start, end, valid]);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((month.getDay() + daysInMonth) / 7) * 7 }, (_, index) => {
    const day = index - month.getDay() + 1;
    return day > 0 && day <= daysInMonth ? formatLocalDateKey(new Date(month.getFullYear(), month.getMonth(), day, 12)) : null;
  });
  const canGoBack = formatLocalDateKey(month).slice(0, 7) > today.slice(0, 7);
  const selectDay = (key: string) => {
    if (mode === 'day') { setStart(key); setEnd(key); }
    else if (end || key < start) { setStart(key); setEnd(null); }
    else setEnd(key);
  };

  return (
    <Modal transparent visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.modal}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Dismiss date picker" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16), maxHeight: '90%' }]} accessibilityViewIsModal>
          <View style={styles.handle} />
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.title}>Choose a date</Text>
              <Text style={styles.subtitle}>Find your next outing</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close date picker" onPress={onClose} style={styles.iconButton}>
              <Ionicons name="close" size={22} color="#334155" />
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.segment}>
              {(['day', 'range'] as const).map(value => (
                <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: mode === value }}
                  onPress={() => { setMode(value); setEnd(value === 'day' ? start : null); }}
                  style={[styles.segmentButton, mode === value && styles.segmentActive]}>
                  <Text style={[styles.segmentText, mode === value && styles.blue]}>{value === 'day' ? 'Single day' : 'Date range'}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.monthHeader}>
              <Pressable accessibilityRole="button" accessibilityLabel="Previous month" disabled={!canGoBack}
                style={styles.iconButton} onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1, 12))}>
                <Ionicons name="chevron-back" size={22} color={canGoBack ? '#334155' : '#CBD5E1'} />
              </Pressable>
              <Text style={styles.month}>{month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Next month" style={styles.iconButton}
                onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1, 12))}>
                <Ionicons name="chevron-forward" size={22} color="#334155" />
              </Pressable>
            </View>
            <View style={styles.week}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <Text key={index} style={styles.weekday}>{day}</Text>)}
            </View>
            <View style={styles.grid}>
              {cells.map((key, index) => {
                const selected = key === start || key === end;
                const inside = !!key && !!end && key > start && key < end;
                const disabled = !key || key <= today;
                return <View key={key || `blank-${index}`} style={[styles.cell, inside && styles.rangeCell]}>
                  {key && <Pressable accessibilityRole="button" accessibilityState={{ selected: selected || inside, disabled }}
                    accessibilityLabel={localDateFromKey(key).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                    disabled={disabled} onPress={() => selectDay(key)} style={[styles.day, selected && styles.selectedDay]}>
                    <Text style={[styles.dayText, disabled && styles.disabledText, selected && styles.white]}>{Number(key.slice(-2))}</Text>
                  </Pressable>}
                </View>;
              })}
            </View>
            <View style={styles.selectionSummary}>
              <Ionicons name="calendar-outline" size={19} color="#1976D2" />
              <Text style={styles.selectionText}>{!end ? 'Choose an end date' : formatUpcomingDateLabel(pending)}</Text>
            </View>
            <Text style={styles.note}>Upcoming starts tomorrow. Your other event filters still apply.</Text>
          </ScrollView>
          <Pressable accessibilityRole="button" disabled={!valid} onPress={() => onApply(pending)}
            style={[styles.apply, !valid && styles.disabledButton]}>
            <Text style={styles.applyText}>{!valid ? 'Choose an end date' : `Show ${count} events`}</Text>
            <Ionicons name="arrow-forward" size={20} color="white" />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

export default function UpcomingDateOptions({ events, criteria, onSelect }: Props) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const today = formatLocalDateKey(new Date());
  const selection = normalizeUpcomingDate(criteria.eventFilters.upcomingDate, today);
  const custom = selection.kind === 'custom' ? selection : defaultCustomDate(today);
  const options: { label: string; icon: keyof typeof Ionicons.glyphMap; selection: UpcomingDateFilter }[] = [
    { label: 'Any date', icon: 'calendar-outline', selection: { kind: 'any' } },
    { label: 'This weekend', icon: 'sunny-outline', selection: { kind: 'weekend' } },
    { label: 'Next 7 days', icon: 'calendar-number-outline', selection: { kind: 'next7' } },
    { label: 'Choose date…', icon: 'calendar-clear-outline', selection: custom },
  ];
  const context = createEventTimeContext();
  return <View style={styles.refinement}>
    <Text style={styles.refinementTitle}>Narrow upcoming</Text>
    <Text style={styles.helper}>Choose when you want to go</Text>
    <View style={styles.options}>
      {options.map(option => {
        const active = selection.kind === option.selection.kind;
        const count = countUpcomingDateEvents(events, criteria, option.selection, context);
        return <Pressable key={option.selection.kind} accessibilityRole="button" accessibilityState={{ selected: active }}
          accessibilityLabel={`${option.label}, ${count} events`}
          onPress={() => option.selection.kind === 'custom' ? setCalendarOpen(true) : onSelect(option.selection)}
          style={[styles.option, active && styles.activeOption]}>
          <Ionicons name={option.icon} size={16} color={active ? 'white' : '#1976D2'} />
          <Text style={[styles.optionText, active && styles.white]}>{option.label}</Text>
          <Text style={[styles.count, active && styles.white]}>({count})</Text>
        </Pressable>;
      })}
    </View>
    {calendarOpen && <CalendarSheet events={events} criteria={criteria} initial={custom}
      onClose={() => setCalendarOpen(false)} onApply={value => { onSelect(value); setCalendarOpen(false); }} />}
  </View>;
}

const styles = StyleSheet.create({
  refinement: { marginBottom: 8 },
  refinementTitle: { fontSize: 13, fontWeight: '600', color: '#253C55' },
  helper: { fontSize: 11, color: '#526880', marginTop: 2, marginBottom: 8 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  option: { width: '48%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 9, borderRadius: 12, backgroundColor: 'white', borderWidth: 1, borderColor: '#D5E4F3' },
  activeOption: { backgroundColor: '#2196F3', borderColor: '#2196F3' },
  optionText: { color: '#334155', fontSize: 12, flexShrink: 1 },
  count: { color: '#64748B', fontSize: 11, marginLeft: 'auto' },
  white: { color: 'white' },
  modal: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15, 30, 50, 0.42)' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 22, paddingTop: 10 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1', alignSelf: 'center', marginBottom: 17 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  title: { fontSize: 23, fontWeight: '700', color: '#172B43' },
  subtitle: { fontSize: 13, color: '#64748B', marginTop: 4 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  segment: { flexDirection: 'row', backgroundColor: '#EDF3F9', borderRadius: 13, padding: 4 },
  segmentButton: { flex: 1, paddingVertical: 11, alignItems: 'center', borderRadius: 10 },
  segmentActive: { backgroundColor: 'white', elevation: 1, shadowColor: '#183B56', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  segmentText: { fontSize: 14, fontWeight: '600', color: '#64748B' },
  blue: { color: '#1976D2' },
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 17, marginBottom: 8 },
  month: { fontSize: 17, fontWeight: '600', color: '#253C55' },
  week: { flexDirection: 'row', marginBottom: 8 },
  weekday: { width: '14.2857%', textAlign: 'center', fontSize: 12, color: '#64748B', fontWeight: '500' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '14.2857%', height: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  rangeCell: { backgroundColor: '#E4F2FF' },
  day: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  selectedDay: { backgroundColor: '#2196F3' },
  dayText: { fontSize: 15, color: '#334155', fontWeight: '500' },
  disabledText: { color: '#B9C3CF' },
  selectionSummary: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: '#F1F7FD', borderRadius: 12, padding: 13, marginTop: 15 },
  selectionText: { fontSize: 14, fontWeight: '600', color: '#253C55' },
  note: { fontSize: 12, lineHeight: 18, color: '#64748B', marginVertical: 12 },
  apply: { backgroundColor: '#2196F3', borderRadius: 15, minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 6 },
  disabledButton: { backgroundColor: '#93ABC0' },
  applyText: { color: 'white', fontSize: 16, fontWeight: '700' },
});
