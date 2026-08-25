import type { ComponentMeasurement } from '../types/tutorial';

type LayoutRect = Pick<ComponentMeasurement, 'x' | 'y' | 'width' | 'height'>;

export const composeTutorialCalloutMeasurement = (
  calloutLayout: LayoutRect | null,
  targetLayout: LayoutRect | null,
  viewport: Pick<ComponentMeasurement, 'width' | 'height'>,
): ComponentMeasurement | null => {
  if (!calloutLayout || !targetLayout) return null;

  const measurement = {
    x: calloutLayout.x + targetLayout.x,
    y: calloutLayout.y + targetLayout.y,
    width: targetLayout.width,
    height: targetLayout.height,
  };
  const values = [
    measurement.x,
    measurement.y,
    measurement.width,
    measurement.height,
    viewport.width,
    viewport.height,
  ];
  if (!values.every(Number.isFinite)) return null;
  if (measurement.width <= 0 || measurement.height <= 0) return null;
  if (measurement.x >= viewport.width || measurement.y >= viewport.height) return null;
  if (measurement.x + measurement.width <= 0 || measurement.y + measurement.height <= 0) return null;

  return {
    x: Math.round(measurement.x),
    y: Math.round(measurement.y),
    width: Math.round(measurement.width),
    height: Math.round(measurement.height),
  };
};
