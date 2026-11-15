import { markerClusterConfig, markerClusterZoom } from '../markerClusterConfig';
it('keeps Current clustering and applies the accepted Hybrid density and zoom profile', () => {
 expect(markerClusterConfig('default', 64, 512, 16)).toEqual({radius:64,extent:512,maxZoom:16});
 expect(markerClusterConfig('hybrid', 64, 512, 16)).toEqual({radius:112,extent:512,maxZoom:20});
 expect(markerClusterZoom('default',12.7)).toBe(12);
 expect(markerClusterZoom('hybrid',12.7)).toBe(13);
});
