import React from 'react';
import fs from 'fs';
import path from 'path';
import { transformSync } from '@babel/core';
import { getAdjacentLightboxIndex } from '../../../../utils/lightboxNavigation';

const source = fs.readFileSync(path.join(process.cwd(), 'components/map/EventImageLightbox.tsx'), 'utf8');
const compile = (code: string) => transformSync(code, { filename: 'LightboxControls.tsx', configFile: false, babelrc: false,
  presets: [require.resolve('@babel/preset-typescript'), [require.resolve('@babel/preset-react'), { runtime: 'classic' }]],
})!.code!;
const swipeStart = source.indexOf('const onHorizontalPanStateChange = useRef((');
const swipeEnd = source.indexOf('}).current;', swipeStart) + '}).current;'.length;
if (swipeStart < 0 || swipeEnd < swipeStart) throw Error('Actual lightbox swipe handler not found');
const swipeBody = compile(source.slice(swipeStart, swipeEnd));
const arrow = (direction: 'previous' | 'next') => {
  const condition = source.indexOf(`{${direction}Index !== null && (`);
  const start = source.indexOf('<TouchableOpacity', condition);
  const end = source.indexOf('</TouchableOpacity>', start) + '</TouchableOpacity>'.length;
  if (condition < 0 || start < 0 || end < start) throw Error('Actual lightbox arrow not found');
  return source.slice(start, end);
};
const arrowBody = compile(`const controls = <>${arrow('previous')}${arrow('next')}</>;`);

// Actual production arrow callbacks and swipe completion, evaluated without mounting native UI.
// Caller tests supply their real props; no loop flag or boundary logic is replaced here.
export function actualLightboxControls(props: any) {
  const previous = getAdjacentLightboxIndex(props.currentIndex, props.events?.length ?? 0, -1, props.loopNavigation);
  const next = getAdjacentLightboxIndex(props.currentIndex, props.events?.length ?? 0, 1, props.loopNavigation);
  const controls = new Function('React', 'TouchableOpacity', 'View', 'Text', 'MaterialIcons', 'styles',
    'previousIndex', 'nextIndex', 'interestPosition', 'calloutPaging', 'calloutPager', 'onNavigate', arrowBody + ';return controls;')(
    React, 'Arrow', 'View', 'Text', 'Icon', {}, previous, next, null, props.calloutPaging ?? false, { step: () => {} }, props.onNavigate,
  );
  const translateX = { setValue: () => {} };
  const animated = { timing: () => ({ start: (done: () => void) => done?.() }), spring: () => ({ start: () => {} }) };
  const swipe = new Function('useRef', 'State', 'Animated', 'translateX', 'SCREEN_WIDTH',
    'currentIndexRef', 'onNavigateRef', 'eventsLengthRef', 'loopNavigationRef', 'getAdjacentLightboxIndex', swipeBody + ';return onHorizontalPanStateChange;')(
    (value: any) => ({ current: value }), { END: 5, CANCELLED: 3 }, animated, translateX, 360,
    { current: props.currentIndex }, { current: props.onNavigate }, { current: props.events?.length ?? 0 }, { current: props.loopNavigation ?? false }, getAdjacentLightboxIndex,
  );
  return {
    arrow: (direction: -1 | 1) => {
      const destination = direction < 0 ? previous : next;
      if (destination === null) return false;
      controls.props.children[direction < 0 ? 0 : 1].props.onPress();
      return true;
    },
    swipe: (direction: -1 | 1) => swipe({ nativeEvent: { state: 5, translationX: -direction * 80, velocityX: 0 } }),
  };
}
