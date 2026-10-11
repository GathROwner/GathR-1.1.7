import { formatLightboxAddress } from '../lightboxAddress';

describe('lightbox address labels', () => {
  it.each([
    ['2 Prince St, Charlottetown, PE C1A 4P5, Canada', '2 Prince St, Charlottetown'],
    ['2 Prince St, Charlottetown PE C1A4P5, Canada', '2 Prince St, Charlottetown'],
    ['189 Great George St, Charlottetown, PE C1A 4L1, Canada', '189 Great George St, Charlottetown'],
    ['Unit 4, 123 Queen St, Charlottetown, Prince Edward Island, C1A 4P5, Canada', 'Unit 4, 123 Queen St, Charlottetown'],
    ['  2 Prince St\nCharlottetown, PE, Canada  ', '2 Prince St, Charlottetown'],
    ['2 Prince St, Charlottetown', '2 Prince St, Charlottetown'],
    ['123 Rue Saint-Jean, Quebec', '123 Rue Saint-Jean, Quebec'],
    ['Unit 4, 123 Rue Saint-Jean, Quebec, G1R 1N4, Canada', 'Unit 4, 123 Rue Saint-Jean, Quebec'],
    ['Address shared later', 'Address shared later'],
    [undefined, ''],
  ])('formats %s without losing street, unit, or city', (address, expected) => {
    expect(formatLightboxAddress(address)).toBe(expected);
  });
});
