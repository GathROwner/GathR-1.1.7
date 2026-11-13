import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Image, Modal, Pressable, StatusBar, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { WebView } from 'react-native-webview';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Event } from '../../types/events';
import { getListingVideo, inlineVideoHtml, normalizeListingVideo, videoListingPath, videoPlayerHtml, type ListingVideo } from '../../lib/listingVideo';
import { listingVideoAutoplay as autoplay, videoVisibility, type VideoSurface } from '../../lib/listingVideoAutoplay';
import { useListingVideoPrefs } from '../../store/listingVideoPrefsStore';

/** Original photos stay mounted underneath. Only the elected visible listing creates media. */
export default function ListingVideoSurface({ event, overlay = false, surface = 'detail', active = true, suspended = false, controlsBottom = 12 }: {
  event: Event; overlay?: boolean; surface?: VideoSurface; active?: boolean; suspended?: boolean; controlsBottom?: number;
}) {
  const id = useId(); const path = videoListingPath(event); const latestPath = useRef(path); latestPath.current = path;
  const insets = useSafeAreaInsets(); const viewport = useWindowDimensions();
  const enabled = useListingVideoPrefs(s => s.autoplay);
  const hydrated = useListingVideoPrefs(s => s.hydrated);
  const root = useRef<View>(null); const inline = useRef<WebView>(null); const mounted = useRef(true);
  const position = useRef({ x: NaN, y: NaN, width: 0, height: 0, settledAt: Date.now() });
  const ownsInline = useRef(false); const wasOnScreen = useRef(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const [video, setVideo] = useState<ListingVideo | null>(null);
  const [open, setOpen] = useState(false); const [failed, setFailed] = useState(false);
  const [lease, setLease] = useState(false); const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false); const [muted, setMuted] = useState(true);
  const [manualInline, setManualInline] = useState(false);
  const fullscreenSource = useRef({ html: '', baseUrl: 'https://storage.googleapis.com/' });
  const [manualHold, setManualHold] = useState(false); const [completed, setCompleted] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(true);
  const inlineSource = useRef({ html: '', baseUrl: 'https://storage.googleapis.com/' });

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; autoplay.remove(id); autoplay.detail(id, false); };
  }, [id]);
  useEffect(() => {
    let current = true; autoplay.remove(id); setVideo(null); setOpen(false); setFailed(false);
    setManualHold(false); setManualInline(false); setPaused(false); setCompleted(false); wasOnScreen.current = false; position.current.settledAt = Date.now();
    if (path) void getListingVideo(path).then(value => {
      if (current) { setVideo(value); if (value) setCompleted(autoplay.hasFinished(value.assetId)); }
    });
    return () => { current = false; autoplay.setFullscreen(id, false); autoplay.remove(id); };
  }, [path, id]);
  useEffect(() => {
    let current = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (current) setReduceMotion(value); }).catch(() => {});
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { current = false; listener.remove(); };
  }, []);
  useEffect(() => {
    if (surface === 'detail') autoplay.detail(id, active);
    return () => { if (surface === 'detail') autoplay.detail(id, false); };
  }, [surface, id, active]);
  useEffect(() => {
    autoplay.setForeground(AppState.currentState === 'active');
    const listener = AppState.addEventListener('change', state => {
      autoplay.setForeground(state === 'active'); position.current.settledAt = Date.now();
      if (state !== 'active') { setOpen(false); autoplay.setFullscreen(id, false); }
    });
    return () => listener.remove();
  }, [id]);
  useEffect(() => {
    if (!video) return;
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      const remaining = Date.parse(video.expiresAt) - Date.now();
      if (remaining <= 0) { autoplay.remove(id); setOpen(false); setVideo(null); }
      else timer = setTimeout(check, Math.min(remaining, 86400_000));
    };
    check(); return () => clearTimeout(timer);
  }, [video, id]);

  const measure = useCallback(() => {
    if (!video || failed || !root.current) return;
    root.current.measureInWindow((x, y, width, height) => {
      if (!mounted.current || path !== latestPath.current) return;
      const now = Date.now(); const previous = position.current;
      if (!Number.isFinite(previous.y) || Math.abs(y - previous.y) > 3 || Math.abs(x - previous.x) > 3 || height !== previous.height || width !== previous.width) position.current = { x, y, width, height, settledAt: now };
      const visibility = videoVisibility(y, height, insets.top + (surface === 'detail' ? 48 : 100), viewport.height - insets.bottom - 72, x, width, viewport.width, manualInline ? 0.01 : 0.75);
      if (!visibility.onScreen && wasOnScreen.current) {
        setCompleted(false); setManualInline(false); setManualHold(false); setPaused(false);
      }
      wasOnScreen.current = visibility.onScreen;
      autoplay.update(id, { assetId: video.assetId, surface, ...visibility, settledAt: position.current.settledAt,
        enabled: active && !suspended && ((enabled && hydrated && !reduceMotion && !manualHold) || manualInline) && !failed && !!normalizeListingVideo(video), paused, manual: manualInline }, owns => {
        if (!mounted.current) return;
        ownsInline.current = owns;
        if (owns) {
          inlineSource.current = { html: inlineVideoHtml(video, autoplay.position(video.assetId), !manualInline), baseUrl: 'https://storage.googleapis.com/' };
          setMuted(!manualInline);
        }
        else { inline.current?.injectJavaScript('window.__listingVideoPause?.();true;'); opacity.setValue(0); setPlaying(false); setMuted(true); }
        setLease(owns);
      }, now);
    });
  }, [path, video, failed, insets.top, insets.bottom, viewport.height, viewport.width, surface, id, active, suspended, enabled, hydrated, reduceMotion, manualHold, manualInline, paused, opacity]);
  useEffect(() => {
    measure(); if (!video || failed) return;
    const timer = setInterval(measure, 250); return () => clearInterval(timer);
  }, [measure, video, failed]);

  const close = () => { setOpen(false); autoplay.setFullscreen(id, false); };
  const openPlayer = (touch: { stopPropagation: () => void }) => {
    touch.stopPropagation(); if (!video || !normalizeListingVideo(video)) return;
    fullscreenSource.current = { html: videoPlayerHtml(video, autoplay.position(video.assetId), { title: event.title, topInset: insets.top, bottomInset: insets.bottom, muted }), baseUrl: 'https://storage.googleapis.com/' };
    setManualHold(true); setManualInline(false); autoplay.setFullscreen(id, true); StatusBar.setBarStyle('light-content'); setOpen(true);
  };
  if (!video || failed || !normalizeListingVideo(video)) return null;
  const seconds = Math.ceil(video.durationSeconds); const duration = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const done = completed || autoplay.hasFinished(video.assetId);
  return <View ref={root} collapsable={false} pointerEvents="box-none" onLayout={measure} style={[styles.root, overlay && styles.overlay]}>
    {lease && <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity }]}>
      <WebView ref={inline} testID="listing-inline-video" source={inlineSource.current} style={styles.inline}
        originWhitelist={['https://storage.googleapis.com']} javaScriptEnabled allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false}
        allowsFullscreenVideo={false} allowsAirPlayForMediaPlayback={false} setSupportMultipleWindows={false}
        allowFileAccess={false} mixedContentMode="never" cacheEnabled={false} scrollEnabled={false}
        onShouldStartLoadWithRequest={request => request.url === 'about:blank' || request.url === 'https://storage.googleapis.com/' || request.url === video.url}
        onMessage={message => {
          if (!ownsInline.current) return;
          const text = message.nativeEvent.data;
          if (text === 'playing') { setPlaying(true); Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start(); }
          else if (text === 'ended') { setCompleted(true); setManualInline(false); autoplay.complete(video.assetId); }
          else if (text === 'error' || text === 'blocked') { setManualInline(false); setManualHold(true); autoplay.remove(id); }
          else { try { const p = JSON.parse(text); if (p.type === 'progress') autoplay.remember(video.assetId, p.seconds); } catch { /* Ignore unknown messages. */ } }
        }} onError={() => { setManualInline(false); setManualHold(true); autoplay.remove(id); }} />
    </Animated.View>}
    {playing && <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel={`Expand video for ${event.title}`} onPress={openPlayer} />}
    <View pointerEvents="box-none" style={[styles.controls, { bottom: controlsBottom }]}>
      {playing ? <>
        <Pressable style={styles.control} accessibilityRole="button" accessibilityLabel={paused ? 'Resume video' : 'Pause video'} onPress={touch => {
          touch.stopPropagation(); inline.current?.injectJavaScript(paused ? 'window.__listingVideoPlay?.();true;' : 'window.__listingVideoPause?.();true;'); if (paused) setMuted(false); setPaused(!paused);
        }}><Ionicons name={paused ? 'play' : 'pause'} size={19} color="#fff" /></Pressable>
        <Pressable style={styles.control} accessibilityRole="button" accessibilityLabel={muted ? 'Turn video sound on' : 'Mute video'} onPress={touch => {
          touch.stopPropagation(); inline.current?.injectJavaScript(`window.__listingVideoMute?.(${!muted});true;`); setMuted(!muted);
        }}><Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={19} color="#fff" /></Pressable>
      </> : <Pressable style={[styles.control, styles.posterControl]} accessibilityRole="button"
        accessibilityLabel={`${done ? 'Replay' : 'Watch'} video for ${event.title}, ${seconds} seconds`} onPress={touch => {
          touch.stopPropagation(); if (done) autoplay.replay(video.assetId);
          autoplay.remove(id); setCompleted(false); setPaused(false); setMuted(false); setManualHold(false); setManualInline(true);
        }}><Ionicons name={done ? 'refresh' : 'play'} size={18} color="#fff" /><Text style={styles.duration}>{done ? 'Replay' : duration}</Text></Pressable>}
    </View>
    <Modal visible={open} animationType="fade" presentationStyle="fullScreen" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
      <View style={styles.player}>
        {open && <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />}
        {!!(event.relevantImageUrl || event.imageUrl) && <Image accessible={false} source={{ uri: event.relevantImageUrl || event.imageUrl }} blurRadius={24} style={StyleSheet.absoluteFill} resizeMode="cover" />}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(3,8,14,0.78)' }]} />
        {open && <WebView testID="listing-fullscreen-video" source={fullscreenSource.current}
          style={styles.web} originWhitelist={['https://storage.googleapis.com']}
          onShouldStartLoadWithRequest={request => request.url === 'about:blank' || request.url === 'https://storage.googleapis.com/' || request.url === video.url}
          javaScriptEnabled allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false} allowsFullscreenVideo={false}
          allowsAirPlayForMediaPlayback={false} setSupportMultipleWindows={false} allowFileAccess={false} mixedContentMode="never" cacheEnabled={false} scrollEnabled={false} bounces={false} automaticallyAdjustContentInsets={false} contentInsetAdjustmentBehavior="never"
          onMessage={message => {
            const text = message.nativeEvent.data;
            if (text === 'dismiss') close();
            else if (text === 'error') { setFailed(true); close(); }
            else if (text === 'ended') { setCompleted(true); autoplay.complete(video.assetId); }
            else { try { const p = JSON.parse(text); if (p.type === 'progress') autoplay.remember(video.assetId, p.seconds); } catch { /* Ignore unknown messages. */ } }
          }} onError={() => { setFailed(true); close(); }} />}
      </View>
    </Modal>
  </View>;
}
const styles = StyleSheet.create({
  root: { height: 260, position: 'relative' }, overlay: { ...StyleSheet.absoluteFillObject, height: undefined, zIndex: 4 },
  inline: { flex: 1, backgroundColor: 'transparent' }, controls: { position: 'absolute', bottom: 12, left: 12, flexDirection: 'row', gap: 8 },
  control: { minWidth: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(8,20,32,0.88)', alignItems: 'center', justifyContent: 'center' },
  posterControl: { flexDirection: 'row', gap: 5, paddingHorizontal: 13 }, duration: { color: '#fff', fontSize: 12, fontWeight: '600' },
  player: { flex: 1, backgroundColor: '#05090E' }, web: { flex: 1, backgroundColor: 'transparent' },
});
