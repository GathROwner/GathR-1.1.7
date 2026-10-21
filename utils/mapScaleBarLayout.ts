// Mapbox Android 11.18.2 measures its native scale view as 50% of the map
// width plus 10dp internal padding (ScaleBarImpl.calculateWidthAndHeight).
// Keep its frame centered on the full app window, independent of attribution.
export const getAndroidScaleBarLeft = (
  windowWidth: number,
  mapWidth = windowWidth,
  mapOffsetX = 0,
) => Math.round((windowWidth - (mapWidth * 0.5 + 10)) / 2 - mapOffsetX);
