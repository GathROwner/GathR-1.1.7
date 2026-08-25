import { composeTutorialCalloutMeasurement } from '../tutorialCalloutMeasurement';

describe('composeTutorialCalloutMeasurement', () => {
  const viewport = { width: 390, height: 844 };

  it('converts a callout-local target rectangle into window coordinates', () => {
    expect(composeTutorialCalloutMeasurement(
      { x: 0, y: 47, width: 390, height: 725 },
      { x: 0, y: 45, width: 390, height: 90 },
      viewport,
    )).toEqual({ x: 0, y: 92, width: 390, height: 90 });
  });

  it('keeps the committed layout stable while a native entrance transform settles', () => {
    const calloutLayout = { x: 0, y: 47, width: 390, height: 725 };
    const targetLayout = { x: 0, y: 45, width: 390, height: 90 };

    expect(composeTutorialCalloutMeasurement(calloutLayout, targetLayout, viewport))
      .toEqual({ x: 0, y: 92, width: 390, height: 90 });
  });

  it('rejects missing, zero-sized, and offscreen layouts', () => {
    expect(composeTutorialCalloutMeasurement(null, { x: 0, y: 45, width: 390, height: 90 }, viewport)).toBeNull();
    expect(composeTutorialCalloutMeasurement(
      { x: 0, y: 47, width: 390, height: 725 },
      { x: 0, y: 45, width: 0, height: 90 },
      viewport,
    )).toBeNull();
    expect(composeTutorialCalloutMeasurement(
      { x: 0, y: 900, width: 390, height: 725 },
      { x: 0, y: 45, width: 390, height: 90 },
      viewport,
    )).toBeNull();
  });
});
