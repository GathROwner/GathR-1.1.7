# Optional single-venue programme contract

Frontend base: published iOS Preview `2d40cb7c7f1b69d50074fe0343a233f1c32eb787`, update `01a14538-c839-782f-a845-87e89f643ed9`, runtime 1.1.10. This task does not publish or mutate backend/data.

The existing area schedule browser and cache can serve a one-venue programme without public area semantics. A small internal adapter supplies its existing exact-child selector. Parent `locationScope`, venue ownership, coordinates, timing, discovery, filters, counts and occurrence identity remain unchanged. The parent detail footer gains View programme alongside Calendar and Directions. The existing white-card Part of row indexes the same explicit children.

## Proposed public field

```json
{
  "programmeData": {
    "version": 1,
    "status": "verified",
    "venueId": "slug_foundersfoodhall",
    "linkedEventIds": ["X7fuxHlvFRgWwlEchJ3L", "qBimPRIGiW8A8EqMHxYj"],
    "sourceUrl": "https://foundersfoodhall.com/events/harvest-fest-2/",
    "sourceLabel": "Founders Food Hall programme"
  }
}
```

This is a proposed contract/example, not evidence of a live write. Optional `verifiedAt` is a parseable date/timestamp string. Frontend accepts verified/partial: partial means only the listed links are reviewed; it never authorizes inferred links. The backend owner chooses status from its reviewed source evidence.

## Backend/API requirements

- Pass the strictly validated optional object through **both full paginated minimal feed and detail/batch projections**, top-level preferably. Metadata-only projection is tolerated. Explicit top-level null wins over older metadata.
- Version must be numeric 1; status verified/partial; venueId a nonempty trimmed canonical document ID without path separators; linkedEventIds an array of nonempty trimmed canonical event IDs without paths. Empty array is a valid explicit removal. Duplicate aliases are deduplicated by existing event-ID canonicalization.
- Require a valid HTTP(S) original source item/first-party URL. Social profile-only URLs fail the existing original-source guard. Optional sourceLabel must be nonempty text; optional verifiedAt must parse as a date.
- The parent must remain a public nonrecurring venue event whose canonical venueId exactly matches programmeData. For this reviewed case it stays venue/exact. A self-link is invalid. Malformed optional data is omitted/null, never guessed or coerced into membership.
- Every child must already exist as a public canonical event with exact same venue ownership and reviewed source membership. Canonical IDs are the ones returned by the existing event detail endpoint. Do not create clones, recurrence substitutions, area roots or fake occurrences. No food/retail hours or held play-zone timing are included.
- Use null or explicit empty linkedEventIds when revoked, including omission from new authoritative responses; never retain removed field values from previous projections. Invalidate the backend feed projection/version using its normal reviewed data-release process.

## Frontend safeguards

The internal adapter never writes areaData or changes scope/geometry. The shared child selector rejects cancelled/deleted/expired, private/friend, recurring, wrong-venue, missing and out-of-parent-date children and orders usable canonical children by start time. The schedule intentionally follows the existing area-programme model: all upcoming explicit children within the parent's dates, without modifying the user's discovery filters or injecting them into a filtered feed.

The accepted membership authority ledger/single-flight parent navigation is extended to venue roots. Fresh canonical cache opens immediately; 404/410 and newer removals beat older feed/store objects and persist across query GC. Transient errors retain usable cache. No new fetch is issued merely to build backlinks.

Normalized feed and detail query generations receive the `venue-programme-v1` suffix. Old query generations remain isolated instead of clearing any storage; auth/preferences are untouched. Store detail normalization carries valid programme metadata for existing/reconstructed events and explicitly overwrites removed membership. Other timing/calendar/filter/count/native contracts remain in place.

Rendered evidence and final checks will be added before coordinator review. Publication is held for the consolidated release decision; iPhone adoption is not established by Android fixture screenshots.
