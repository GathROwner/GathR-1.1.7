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
export default function HybridSummaryImage({ graphic, onLoad }: { graphic: HybridGraphic; onLoad?: () => void }) {
  const svg = useRef<Svg>(null);
  const [raster, setRaster] = useState<{ key: string; uri: string } | null>(null);
  const key = graphic.xml;
  const currentKey = useRef(key); currentKey.current = key;
  const uri = raster?.key === key ? raster.uri : images.get(key);
  const capture = useCallback(() => {
    if (Platform.OS === 'web') return;
    const cached = images.get(key);
    if (cached) { setRaster({ key, uri: cached }); return; }
    svg.current?.toDataURL(base64 => {
      if (!base64) return;
      const result = `data:image/png;base64,${base64.replace(/\s/g, '')}`;
      cacheImage(key, result);
      if (currentKey.current === key) setRaster({ key, uri: result });
    });
  }, [key]);
  return <View pointerEvents="none" accessibilityLabel={graphic.label} style={{ width: graphic.width, height: graphic.height }}>
    {!uri && <Svg key={key} ref={svg} width={graphic.width} height={graphic.height} onLayout={capture}>
      <SvgXml xml={graphic.xml} />
    </Svg>}
    {uri && <Image key={key} testID="hybrid-summary-bitmap" source={{ uri }} fadeDuration={0}
      style={StyleSheet.absoluteFill} onLoad={onLoad} />}
  </View>;
}
