import React, { useCallback, useRef, useState } from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';
import Svg, { SvgXml } from 'react-native-svg';
import type { HybridGraphic } from '../../utils/hybridSummaryGraphic';

// Small graphics are shared across clusters. Bound retained PNGs for long map sessions.
const images = new Map<string, string>();
const cacheImage = (key: string, uri: string) => {
  images.delete(key); images.set(key, uri);
  if (images.size > 128) images.delete(images.keys().next().value!);
};

/** Explicit SVG drawing avoids iOS CALayer snapshots dropping detached RCTText/subview contents. */
export default function HybridSummaryImage({ graphic, onLoad, visible = true }: { graphic: HybridGraphic; onLoad?: () => void; visible?: boolean }) {
  const svg = useRef<Svg>(null);
  const [raster, setRaster] = useState<{ key: string; uri: string } | null>(null);
  const key = graphic.xml;
  const identity = useRef({ key, visible, revision: 0 });
  if (identity.current.key !== key || identity.current.visible !== visible) identity.current = { key, visible, revision: identity.current.revision + 1 };
  const revision = identity.current.revision;
  const uri = raster?.key === key ? raster.uri : images.get(key);
  const capture = useCallback(() => {
    if (!visible || identity.current.revision !== revision || Platform.OS === 'web') return;
    const cached = images.get(key);
    if (cached) { setRaster({ key, uri: cached }); return; }
    svg.current?.toDataURL(base64 => {
      // A hidden/removed SVG must not seed the shared cache with an empty capture.
      if (!base64 || identity.current.revision !== revision || !identity.current.visible) return;
      const result = `data:image/png;base64,${base64.replace(/\s/g, '')}`;
      cacheImage(key, result);
      setRaster({ key, uri: result });
    });
  }, [key, visible, revision]);
  return <View pointerEvents="none" accessibilityLabel={graphic.label} style={{ width: graphic.width, height: graphic.height }}>
    {visible && !uri && <Svg key={`${key}:${revision}`} ref={svg} width={graphic.width} height={graphic.height} onLayout={capture}>
      <SvgXml xml={graphic.xml} />
    </Svg>}
    {visible && uri && <Image key={`${key}:${revision}`} testID="hybrid-summary-bitmap" source={{ uri }} fadeDuration={0}
      style={StyleSheet.absoluteFill} onLoad={() => { if (identity.current.revision === revision && identity.current.visible) onLoad?.(); }} />}
  </View>;
}
