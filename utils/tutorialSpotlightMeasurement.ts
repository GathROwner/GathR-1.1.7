import { ComponentMeasurement } from '../types/tutorial';

interface Options {
  expandHorizontalToViewport?: boolean;
}

export const normalizeTutorialSpotlightMeasurement = (
  measurement: ComponentMeasurement,
  screenWidth: number,
  screenHeight: number,
  options: Options = {},
): ComponentMeasurement | null => {
  if (
    !Number.isFinite(measurement.x)
    || !Number.isFinite(measurement.y)
    || !Number.isFinite(measurement.width)
    || !Number.isFinite(measurement.height)
    || screenWidth <= 0
    || screenHeight <= 0
  ) {
    return null;
  }

  const top = Math.max(0, measurement.y);
  const bottom = Math.min(screenHeight, measurement.y + measurement.height);
  const left = options.expandHorizontalToViewport ? 0 : Math.max(0, measurement.x);
  const right = options.expandHorizontalToViewport
    ? screenWidth
    : Math.min(screenWidth, measurement.x + measurement.width);
  const width = right - left;
  const height = bottom - top;

  return width > 0 && height > 0
    ? { x: left, y: top, width, height }
    : null;
};
