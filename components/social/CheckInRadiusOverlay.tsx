import MapboxGL from '@rnmapbox/maps';
import { useMemo } from 'react';

import { useCheckInReadinessStore } from '../../store/checkInReadinessStore';
import { useMapStore } from '../../store/mapStore';
import { useSocialStore } from '../../store/socialStore';
import { SOCIAL_FEATURE_ENABLED } from '../../types/social';
import { CHECK_IN_RADIUS_METRES, createCheckInRadiusPolygon, resolveCheckInRadiusCenter } from '../../utils/checkInRadius';

export default function CheckInRadiusOverlay() {
  // This overlay intentionally reads only the signed-in user's owner-scoped check-in.
  // Friend activity projections never contribute coordinates to this radius.
  const ownCheckIn = useSocialStore((state) => state.ownCheckIn);
  const readinessAnchor = useCheckInReadinessStore((state) => state.evidence.anchor);
  const selectedVenues = useMapStore((state) => state.selectedVenues);
  const clusters = useMapStore((state) => state.clusters);

  const radius = useMemo(() => {
    if (!SOCIAL_FEATURE_ENABLED || !ownCheckIn) return null;
    const center = resolveCheckInRadiusCenter(ownCheckIn, readinessAnchor, selectedVenues, clusters);
    return center ? createCheckInRadiusPolygon(center, CHECK_IN_RADIUS_METRES) : null;
  }, [clusters, ownCheckIn, readinessAnchor, selectedVenues]);

  if (!radius) return null;

  const color = ownCheckIn?.locationType === 'private_place' ? '#8054D8' : '#287FEA';
  return (
    <MapboxGL.ShapeSource id="own-check-in-radius-source" shape={radius as any}>
      <MapboxGL.FillLayer
        id="own-check-in-radius-fill"
        style={{ fillColor: color, fillOpacity: 0.09 }}
      />
      <MapboxGL.LineLayer
        id="own-check-in-radius-outline"
        style={{ lineColor: color, lineOpacity: 0.58, lineWidth: 1.5, lineJoin: 'round' }}
      />
    </MapboxGL.ShapeSource>
  );
}
