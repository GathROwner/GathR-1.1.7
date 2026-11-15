/** One repeated neutral dash pattern plus one selected arc, regardless of venue count. */
export function hybridRingGeometry(diameter: number, stroke: number, count: number, preferredGap: number) {
  const segments = Math.max(1, Math.floor(count));
  const radius = (diameter - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const step = circumference / segments;
  const gap = segments === 1 ? 0 : Math.min(preferredGap, step * .28);
  return { radius, circumference, step, gap, arc: step - gap };
}
