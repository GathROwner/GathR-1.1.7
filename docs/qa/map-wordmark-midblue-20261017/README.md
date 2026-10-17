# Darker clear-blue map wordmark

Craig confirmed the light version reads as blue but requested it darker. Sole runtime change: lettering `#2585E6` -> `#206BB8`, retaining the clear blue hue instead of returning to the previously rejected near-black navy. Preserve 70x26 dimensions, vector paths, crimson `#96232B`, transparent pin circle, centering and behavior.

Live iOS Preview baseline verified with EAS list/view: source `07bbc71b2d463ca5a5f9ed11bba76cc786563131`, update `01a14ac2-ea09-73ac-be4b-06b5d4d903b5`, group `75803825-5fb7-4c92-b81a-5f45079ab47e`, runtime1.1.10. Current branch contains this accepted source and its evidence-only follow-up.

`mid-blue-comparison.png` renders actual component vector paths at accepted native dimensions, comparing preceding light blue with new darker blue and Events-header reference. Independently reviewed hue/darkness, retained geometry, red accents and open pin centre. Isolated source-artwork rendering is not final native app verification. No map interaction or emulator reconnect; iPhone adoption/appearance remain separate checks under standing iOS Preview release authority.

TypeScript passes, 4/4 existing header lifecycle tests pass, lint0errors /215existing warnings. Guarded publisher must retain clean ancestry, runtime, iOS account continuity, both social flags and Mapbox. No native dependency/configuration, Production/Android release, backend deployment or data mutation.
