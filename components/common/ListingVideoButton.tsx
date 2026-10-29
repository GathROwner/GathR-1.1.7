import React, { useEffect, useState } from 'react';
import { AppState, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Event } from '../../types/events';
import { getListingVideo, normalizeListingVideo, videoListingPath, videoPlayerHtml, type ListingVideo } from '../../lib/listingVideo';

/** The WebView (and its media URL) exists only after an explicit play tap. */
export default function ListingVideoButton({ event, overlay = false }: { event: Event; overlay?: boolean }) {
  const path = videoListingPath(event); const insets = useSafeAreaInsets();
  const [video, setVideo] = useState<ListingVideo | null>(null);
  const [open, setOpen] = useState(false); const [failed, setFailed] = useState(false);
  useEffect(() => {
    let current = true; setVideo(null); setOpen(false); setFailed(false);
    if (path) void getListingVideo(path).then(value => { if (current) setVideo(value); });
    return () => { current = false; };
  }, [path]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => { if (state !== 'active') setOpen(false); });
    return () => listener.remove();
  }, []);
  useEffect(() => {
    if (!video) return;
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      const remaining = Date.parse(video.expiresAt) - Date.now();
      if (remaining <= 0) { setOpen(false); setVideo(null); }
      else timer = setTimeout(check, Math.min(remaining, 86400_000));
    };
    check();
    return () => clearTimeout(timer);
  }, [video]);
  if (!video || failed || !normalizeListingVideo(video)) return null;
  const seconds = Math.ceil(video.durationSeconds);
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`Watch video for ${event.title}, ${seconds} seconds`}
      onPress={touch => { touch.stopPropagation(); if (normalizeListingVideo(video)) setOpen(true); }}
      style={[styles.button, overlay && styles.overlay]}>
      <Ionicons name="play-circle" size={26} color="#fff" />
      <Text style={styles.label}>Watch video</Text><Text style={styles.duration}>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</Text>
    </Pressable>
    <Modal visible={open} animationType="fade" presentationStyle="fullScreen" onRequestClose={() => setOpen(false)}>
      <View style={[styles.player, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.heading}><Text numberOfLines={2} style={styles.title}>{event.title}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close video" onPress={() => setOpen(false)} style={styles.close}>
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable></View>
        {open && <WebView source={{ html: videoPlayerHtml(video), baseUrl: 'https://storage.googleapis.com/' }}
          style={styles.web} originWhitelist={['https://storage.googleapis.com']}
          onShouldStartLoadWithRequest={request => request.url === 'about:blank' || request.url === 'https://storage.googleapis.com/' || request.url === video.url}
          javaScriptEnabled allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false}
          allowsFullscreenVideo={false} allowsAirPlayForMediaPlayback={false} setSupportMultipleWindows={false}
          allowFileAccess={false} mixedContentMode="never" cacheEnabled={false}
          onMessage={message => { if (message.nativeEvent.data === 'error') { setFailed(true); setOpen(false); } }}
          onError={() => { setFailed(true); setOpen(false); }} />}
        <Text style={styles.hint}>Video from the venue’s post · Sound starts muted</Text>
      </View>
    </Modal>
  </>;
}
const styles = StyleSheet.create({
  button: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: '#12273C', borderRadius: 25, minHeight: 44, paddingHorizontal: 13, marginVertical: 10 },
  overlay: { position: 'absolute', alignSelf: 'center', top: '43%', marginVertical: 0, backgroundColor: 'rgba(8,20,32,0.88)', zIndex: 4 },
  label: { color: '#fff', fontWeight: '700', fontSize: 14 }, duration: { color: '#CDD8E4', fontSize: 12 },
  player: { flex: 1, backgroundColor: '#080B10' }, heading: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  title: { flex: 1, color: '#fff', fontSize: 18, fontWeight: '700' }, close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  web: { flex: 1, backgroundColor: '#080B10' }, hint: { color: '#B9C4D0', textAlign: 'center', padding: 14, fontSize: 12 },
});
