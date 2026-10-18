import { getBottomSystemInset } from '../systemInsets';

describe('bottom system clearance', () => {
  it.each<[string, number, number, number, number]>([
    ['android', 0, 800, 1280, 52],
    ['android', 24, 1280, 800, 52],
    ['android', 80, 800, 1280, 80],
    ['android', 24, 390, 844, 24],
    ['android', 0, 844, 390, 0],
    ['ios', 34, 800, 1280, 34],
  ])('reserves the system area for %s with inset %s at %sx%s', (
    platform, reportedBottom, width, height, expected,
  ) => {
    expect(getBottomSystemInset(platform, reportedBottom, { width, height })).toBe(expected);
  });
});
