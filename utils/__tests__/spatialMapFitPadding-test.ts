import {
  AREA_LOCATION_MAP_FIT_PADDING,
  ROUTE_MAP_FIT_PADDING,
} from '../spatialMapFitPadding';

describe('spatial event map fit padding', () => {
  it('keeps both route endpoints outside the right-side filter rail', () => {
    expect(ROUTE_MAP_FIT_PADDING).toEqual([72, 112, 190, 48]);
    expect(ROUTE_MAP_FIT_PADDING[1]).toBeGreaterThan(ROUTE_MAP_FIT_PADDING[3]);
  });

  it('uses the same control-rail clearance for unordered area locations', () => {
    expect(AREA_LOCATION_MAP_FIT_PADDING[1]).toBe(ROUTE_MAP_FIT_PADDING[1]);
  });
});

