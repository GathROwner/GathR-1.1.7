import fs from 'fs';
import path from 'path';
import { HYBRID_POINT_ANNOTATION_LAYER_ID } from '../hybridTapDelivery';

it('pins the shipped RNMapbox native hit-layer and GeoJSON serialization contract', () => {
  const dependency = path.dirname(require.resolve('@rnmapbox/maps/package.json'));
  expect(JSON.parse(fs.readFileSync(path.join(dependency, 'package.json'), 'utf8')).version).toBe('10.3.0');
  const native = fs.readFileSync(path.join(dependency, 'ios/RNMBX/RNMBXMapView.swift'), 'utf8');
  expect(native).toContain(`makePointAnnotationManager(id: "${HYBRID_POINT_ANNOTATION_LAYER_ID}")`);
  expect(native).toContain('try queriedFeature.feature.toJSON()');
  const annotation = fs.readFileSync(path.join(dependency, 'ios/RNMBX/RNMBXPointAnnotation.swift'), 'utf8');
  // The native feature gets an SDK UUID, not the React prop ID. Coordinate-based
  // identity resolution must remain explicit when upgrading this dependency.
  expect(annotation).toContain('PointAnnotation(coordinate: CLLocationCoordinate2D())');
});
