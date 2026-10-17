// Deterministic native-map equivalents of FriendCheckInBadge (2x resolution).
// Uses the tooling runtime's sharp package; no runtime dependency is required.
const path = require('path');
const sharp = require(process.env.SHARP_MODULE || 'sharp');
const people = '<circle cx="8" cy="6" r="3.5"/><circle cx="18" cy="7" r="3"/><path d="M1 20v-4c0-6 14-6 14 0v4zM16 12c5-1 8 1 8 4v4h-7v-4c0-2-.4-3-1-4z"/>';
async function main() {
  for (const standalone of [false, true]) {
    const width=standalone?84:68, height=standalone?72:44, body=standalone?60:44;
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${standalone?'<path d="M32 57L42 71L52 57" fill="#6941C6"/>':''}<rect x="2" y="2" width="${width-4}" height="${body-4}" rx="${body/2-2}" fill="#6941C6" stroke="white" stroke-width="3"/><g fill="white" transform="translate(${standalone?12:9} ${standalone?15:11}) scale(${standalone?1.35:1})">${people}</g></svg>`;
    const destination=path.join(__dirname,'../assets/map-markers',standalone?'friend-only.png':'friend-attached.png');
    await sharp(Buffer.from(svg)).png().toFile(destination);
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});

