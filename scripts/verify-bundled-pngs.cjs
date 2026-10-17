// Independently decode with pngjs and compare to the reviewed Git baseline.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert/strict');
const { execFileSync } = require('child_process');
const { PNG } = require('pngjs');
const report = JSON.parse(fs.readFileSync('docs/qa/lossless-assets-20261013/compression.json'));
const baseline = process.argv[2];
assert(baseline, 'Pass the original Git commit');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const metadata = bytes => {
  const parts = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const kind = bytes.toString('ascii', offset + 4, offset + 8);
    if (kind !== 'IDAT') parts.push(bytes.subarray(offset, offset + 12 + length));
    offset += 12 + length;
  }
  return Buffer.concat(parts);
};
for (const row of report.assets) {
  const before = execFileSync('git', ['show', `${baseline}:${row.path}`], { maxBuffer: 10 * 1024 * 1024 });
  const after = fs.readFileSync(row.path);
  assert.equal(digest(before), row.beforeSha256, row.path);
  assert.equal(digest(after), row.afterSha256, row.path);
  const original = PNG.sync.read(before, { checkCRC: true });
  const optimized = PNG.sync.read(after, { checkCRC: true });
  assert.equal(original.width, optimized.width, row.path);
  assert.equal(original.height, optimized.height, row.path);
  assert.deepEqual(original.data, optimized.data, row.path);
  assert.deepEqual(metadata(before), metadata(after), row.path);
  if (process.argv.includes('--qa-originals')) {
    fs.mkdirSync('artifacts/asset-originals', { recursive: true });
    fs.writeFileSync(path.join('artifacts/asset-originals', path.basename(row.path)), before);
  }
}
console.log(`PASS: ${report.assets.length} PNGs match ${baseline} in pixels, dimensions, metadata and CRCs. Saved ${report.savedBytes} bytes.`);
