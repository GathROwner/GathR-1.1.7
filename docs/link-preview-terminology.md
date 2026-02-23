# GathR Link Preview Terminology Guide

## Complete Link Sharing Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         USER SHARES EVENT IN APP                         │
│                                                                           │
│  App calls: Share.share({                                                │
│    title: "Event Title",                                                 │
│    message: "Event description...",                                      │
│    url: "https://link.gathrapp.ca/event/12345"                          │
│  })                                                                       │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    ① NATIVE SHARE SHEET (iOS/Android)                    │
│  ═══════════════════════════════════════════════════════════════════     │
│                                                                           │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │  SHARE PREVIEW CARD (what user sees before selecting target)     │   │
│   │  ───────────────────────────────────────────────────────────────│   │
│   │                                                                   │   │
│   │  ┌────────────────────────────────────────────────────────────┐ │   │
│   │  │ Preview Thumbnail (if available)                           │ │   │
│   │  │ - iOS: Shows link icon or fetched OG image                 │ │   │
│   │  │ - Black box = failed to fetch OG image                     │ │   │
│   │  └────────────────────────────────────────────────────────────┘ │   │
│   │                                                                   │   │
│   │  Preview Title                                                    │   │
│   │  ▔▔▔▔▔▔▔▔▔▔▔▔▔                                                    │   │
│   │  "Teen Burger Night"                                              │   │
│   │                                                                   │   │
│   │  Preview Subtitle/Description                                     │   │
│   │  ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔                                        │   │
│   │  "Join us at The Fickle Pickle..."                               │   │
│   │                                                                   │   │
│   │  Preview URL/Domain                                               │   │
│   │  ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔                                              │   │
│   │  link.gathrapp.ca                                                 │   │
│   │                                                                   │   │
│   └───────────────────────────────────────────────────────────────────┘   │
│                                                                           │
│   Share Targets (iMessage, Messenger, WhatsApp, etc.)                    │
│   ═══════════════════════════════════════════════════════════════════    │
│   📱 iMessage    💬 Messenger    📲 WhatsApp    📧 Mail    [More...]     │
│                                                                           │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
              User selects "Messenger"
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              ② COMPOSE VIEW (in target app, e.g., Messenger)             │
│  ═══════════════════════════════════════════════════════════════════     │
│                                                                           │
│   To: [Select recipient...]                                              │
│                                                                           │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │  MESSAGE COMPOSE PREVIEW (before sending)                        │   │
│   │  ───────────────────────────────────────────────────────────────│   │
│   │                                                                   │   │
│   │  Teen Burger Night                                                │   │
│   │                                                                   │   │
│   │  Join us at The Fickle Pickle on Feb 27 at 6:00 PM...           │   │
│   │                                                                   │   │
│   │  ┌─────────────────────────────────────────────────────────────┐│   │
│   │  │                                                              ││   │
│   │  │         LINK PREVIEW CARD THUMBNAIL                          ││   │
│   │  │         (if OG image loads)                                  ││   │
│   │  │                                                              ││   │
│   │  │  [Event Image: Teen Burger with GathR branding]             ││   │
│   │  │                                                              ││   │
│   │  └─────────────────────────────────────────────────────────────┘│   │
│   │  Card Title: Teen Burger Night                                   │   │
│   │  Card Description: The Fickle Pickle • Feb 27 at 6:00 PM        │   │
│   │  Card Domain: link.gathrapp.ca                                   │   │
│   │                                                                   │   │
│   └───────────────────────────────────────────────────────────────────┘   │
│                                                                           │
│   [Send Button]                                                           │
│                                                                           │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                  User sends message
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│            ③ CONVERSATION VIEW (recipient sees in chat)                  │
│  ═══════════════════════════════════════════════════════════════════     │
│                                                                           │
│   Messenger Conversation Thread                                           │
│   ─────────────────────────────────────────────────────────────────      │
│                                                                           │
│   You (11:23 AM):                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │  MESSAGE BUBBLE PREVIEW (in chat thread)                         │   │
│   │  ───────────────────────────────────────────────────────────────│   │
│   │                                                                   │   │
│   │  Teen Burger Night                                                │   │
│   │                                                                   │   │
│   │  Join us at The Fickle Pickle on Feb 27 at 6:00 PM...           │   │
│   │                                                                   │   │
│   │  ┌─────────────────────────────────────────────────────────────┐│   │
│   │  │                                                              ││   │
│   │  │       RICH LINK PREVIEW CARD (Link Unfurl)                   ││   │
│   │  │       ═══════════════════════════════════════                ││   │
│   │  │                                                              ││   │
│   │  │  ┌──────────────────────────────────────────────────────┐  ││   │
│   │  │  │                                                       │  ││   │
│   │  │  │    OG IMAGE (1200x630px PNG)                         │  ││   │
│   │  │  │    ─────────────────────────                         │  ││   │
│   │  │  │                                                       │  ││   │
│   │  │  │    [Event photo with GathR branding overlay]         │  ││   │
│   │  │  │    [Globe logo] GathR          EVENT                 │  ││   │
│   │  │  │                                                       │  ││   │
│   │  │  │                                                       │  ││   │
│   │  │  │                                                       │  ││   │
│   │  │  │                    Teen Burger Night                 │  ││   │
│   │  │  │                    The Fickle Pickle                 │  ││   │
│   │  │  │                    Feb 27 at 6:00 PM                 │  ││   │
│   │  │  │                                                       │  ││   │
│   │  │  └──────────────────────────────────────────────────────┘  ││   │
│   │  │                                                              ││   │
│   │  │  Card Title (og:title)                                       ││   │
│   │  │  ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔                                         ││   │
│   │  │  Teen Burger Night                                           ││   │
│   │  │                                                              ││   │
│   │  │  Card Description (og:description)                           ││   │
│   │  │  ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔                            ││   │
│   │  │  Join us at The Fickle Pickle on February 27 at 6:00 PM...  ││   │
│   │  │                                                              ││   │
│   │  │  Card Domain/Link (og:url)                                   ││   │
│   │  │  ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔                                     ││   │
│   │  │  🔗 link.gathrapp.ca                                         ││   │
│   │  │                                                              ││   │
│   │  └─────────────────────────────────────────────────────────────┘│   │
│   │                                                                   │   │
│   └───────────────────────────────────────────────────────────────────┘   │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## Terminology Breakdown

### 1. Native Share Sheet Components

**Official iOS term**: `UIActivityViewController`
**Official Android term**: `ShareSheet`

| Component | User Term | Technical Term | What Controls It |
|-----------|-----------|----------------|------------------|
| Overall dialog | "Share sheet" | Activity view / Share sheet | iOS/Android system |
| Event preview | "Share preview card" | Link Metadata Preview | `Share.share()` title/message + OG fetch |
| Small image | "Preview thumbnail" | Link preview icon/image | iOS fetches `og:image` |
| Main text | "Preview title" | Activity item title | `Share.share({ title })` |
| Body text | "Preview subtitle" | Activity item message | `Share.share({ message })` |
| Domain label | "Preview URL" | URL display | `Share.share({ url })` |
| App icons | "Share targets" | Activity types | System-provided apps |

**Key terminology for requesting changes**:
- "Share sheet preview card" = the event preview shown before selecting target
- "Preview thumbnail" = small image on left side of preview card
- "Share targets" = iMessage, Messenger, WhatsApp icons at bottom

---

### 2. Compose View Components

**Platform-specific terms**:
- iMessage: "Message composition view"
- Messenger: "Compose message screen"
- WhatsApp: "Chat input view"

| Component | User Term | Technical Term | What Controls It |
|-----------|-----------|----------------|------------------|
| Overall view | "Compose view" | Message composition UI | Target app (Messenger, iMessage) |
| Event preview | "Compose preview" | Rich link preview | Target app fetches OG tags |
| Large image | "Link preview card thumbnail" | OG image render | Your server's `og:image` URL |
| Card container | "Link preview card" | Rich link card / Link unfurl | OG meta tags |
| Card main text | "Card title" | OG title | `og:title` meta tag |
| Card body | "Card description" | OG description | `og:description` meta tag |
| Domain/link | "Card domain" | URL label | `og:url` meta tag |

**Key terminology for requesting changes**:
- "Compose preview" = preview shown before sending
- "Link preview card" = full rich card with image + text
- "Card thumbnail" = large event image in preview card

---

### 3. Conversation View (Message Thread)

**Official term**: "Rich link preview" or "Link unfurl"

| Component | User Term | Technical Term | What Controls It |
|-----------|-----------|----------------|------------------|
| Message bubble | "Message bubble" | Chat message container | Target app UI |
| Event preview | "Message bubble preview" | Inline link preview | Target app + OG tags |
| Full rich card | "Rich link preview card" | Link unfurl / Rich link card | OG meta tags from your server |
| Large image | "OG image" | Open Graph image | `og:image` (generated PNG) |
| Image branding | "Image overlay" | SVG overlay elements | `lib/ogImage.js` SVG generation |
| Card text | "Card title/description" | OG metadata | `og:title`, `og:description` |
| Clickable link | "Card domain link" | Canonical URL | `og:url` |

**Key terminology for requesting changes**:
- "Message bubble preview" = how it appears in chat thread
- "Rich link preview card" = full unfurled link with image
- "OG image" = the 1200x630px generated PNG
- "Image overlay" = GathR branding on top of event photo

---

## OG Image Anatomy (What You See in Message Previews)

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                    │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                    OG IMAGE (1200x630px)                    │  │
│  │                    ═══════════════════════                  │  │
│  │                                                             │  │
│  │  BACKGROUND LAYER                                           │  │
│  │  ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔                                           │  │
│  │  - Event photo (fetched from Firebase)                     │  │
│  │  - OR gradient background if no image                      │  │
│  │                                                             │  │
│  │  ┌──────────────────────────────────────────────────────┐  │  │
│  │  │  HEADER AREA (top 20%)                               │  │  │
│  │  │  ─────────────────────────                           │  │  │
│  │  │                                                       │  │  │
│  │  │  Brand Chip (left):                                  │  │  │
│  │  │  ┌─────────────────┐                                 │  │  │
│  │  │  │ 🌐 GathR        │  ← Globe logo + text logo       │  │  │
│  │  │  └─────────────────┘                                 │  │  │
│  │  │                                                       │  │  │
│  │  │  Type Badge (right):                                 │  │  │
│  │  │                              EVENT  ← or "SPECIAL"   │  │  │
│  │  │                                                       │  │  │
│  │  └──────────────────────────────────────────────────────┘  │  │
│  │                                                             │  │
│  │  ┌──────────────────────────────────────────────────────┐  │  │
│  │  │  CONTENT AREA (bottom 50%)                           │  │  │
│  │  │  ─────────────────────────                           │  │  │
│  │  │                                                       │  │  │
│  │  │  Text Readability Gradient:                          │  │  │
│  │  │  ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔                         │  │  │
│  │  │  - Top: 0% opacity (event photo visible)             │  │  │
│  │  │  - Middle: 35% opacity (gradual darkening)           │  │  │
│  │  │  - Bottom: 80% opacity (dark for text contrast)      │  │  │
│  │  │                                                       │  │  │
│  │  │  Event Title (42px bold):                            │  │  │
│  │  │  ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔                                │  │  │
│  │  │  Teen Burger Night                                   │  │  │
│  │  │                                                       │  │  │
│  │  │  Venue Line (26px):                                  │  │  │
│  │  │  ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔                                     │  │  │
│  │  │  The Fickle Pickle                                   │  │  │
│  │  │                                                       │  │  │
│  │  │  Date/Time Line (26px):                              │  │  │
│  │  │  ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔                                 │  │  │
│  │  │  Feb 27 at 6:00 PM                                   │  │  │
│  │  │                                                       │  │  │
│  │  │  Description Lines (22px, max 2 lines):              │  │  │
│  │  │  ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔                  │  │  │
│  │  │  Join us for our famous Teen Burgers on             │  │  │
│  │  │  Thursday evenings...                                │  │  │
│  │  │                                                       │  │  │
│  │  └──────────────────────────────────────────────────────┘  │  │
│  │                                                             │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### OG Image Layer Terminology

| Component | User Term | Technical Term | File Location |
|-----------|-----------|----------------|---------------|
| Full image | "OG image" | Open Graph image | Generated by `lib/ogImage.js` |
| Event photo | "Background layer" | Background image data URI | Fetched by `fetchRemoteImageDataUri()` |
| Default blue | "Gradient background" | SVG linear gradient `#bgGrad` | Lines 265-268 in `ogImage.js` |
| GathR logo bubble | "Brand chip" | Branded container with logos | Lines 292-294 |
| Globe icon | "Globe logo" | SVG logo asset | Loaded by `loadBrandAssets()` |
| GathR text | "Text logo" | SVG text logo asset | Loaded by `loadBrandAssets()` |
| EVENT label | "Type badge" | Event type indicator | Line 295 |
| Dark bottom | "Text readability gradient" | SVG gradient `#textReadabilityGradient` | Lines 274-278, applied line 290 |
| Event name | "Event title" | Title text element (42px) | Line 299 |
| Restaurant | "Venue line" | Venue text element (26px) | Line 300 |
| Date/time | "Date/time line" | DateTime text element (26px) | Line 301 |
| Description | "Description lines" | Description text (22px, max 2 lines) | Lines 302-304 |

**Key terminology for requesting changes**:
- "Background layer" = the event photo or gradient behind everything
- "Brand chip" = the rounded rectangle with GathR logo (top left)
- "Type badge" = "EVENT" or "SPECIAL" label (top right)
- "Text readability gradient" = dark gradient on bottom half for text contrast
- "Event title" = large bold text with event name
- "Venue line" = restaurant/location name
- "Date/time line" = when the event happens
- "Description lines" = 2-line preview of event description

---

## How to Request Changes

### Examples of Clear Requests

**❌ Unclear**: "Make the image look better"

**✅ Clear**: "In the **OG image**, increase the opacity of the **text readability gradient** to make the **event title** more readable"

---

**❌ Unclear**: "The preview doesn't show the picture"

**✅ Clear**: "The **share sheet preview card** shows a black box for the **preview thumbnail** instead of loading the event image"

---

**❌ Unclear**: "Change the branding"

**✅ Clear**: "In the **OG image**, move the **brand chip** from top-left to top-right, and remove the **type badge**"

---

**❌ Unclear**: "Fix the text"

**✅ Clear**: "In the **message bubble preview's link preview card**, the **card title** is truncated. Increase the character limit in the `truncateText()` function"

---

## Technical File Mapping

When you want changes to specific components:

| Component | File to Modify | Function/Section |
|-----------|----------------|------------------|
| Share sheet preview | `utils/shareUtils.ts` | `buildGathrSharePayload()` |
| OG meta tags | `gathr-deeplink-service/server.js` | `handleLandingPage()` lines 125-140 |
| OG image generation | `gathr-deeplink-service/lib/ogImage.js` | `buildOgSvg()` |
| OG image branding | `gathr-deeplink-service/lib/ogImage.js` | Lines 292-295 (brand chip, type badge) |
| OG image text | `gathr-deeplink-service/lib/ogImage.js` | Lines 299-304 (title, venue, date, description) |
| OG image background | `gathr-deeplink-service/lib/ogImage.js` | Lines 382-384 (`fetchRemoteImageDataUri`) |
| Text readability | `gathr-deeplink-service/lib/ogImage.js` | Lines 274-278, 290 (gradient overlay) |
| Cache busting | `gathr-deeplink-service/server.js` | Lines 77-80 (`buildOgImageUrl`) |
| Link landing page | `gathr-deeplink-service/server.js` | Lines 374-402 (`handleLandingPage`) |

---

## Common Issue Terminology

| User Description | Technical Term | What's Happening |
|------------------|----------------|------------------|
| "Black box instead of image" | OG image fetch failure | `og:image` URL returns error (500) |
| "Image is covered by dark box" | Overlay opacity too high | SVG overlay element blocking background |
| "Preview doesn't update" | Cache staleness | Platform cached old `og:image` URL |
| "No preview at all" | OG tag missing/malformed | HTML missing `og:image` meta tag |
| "Text is hard to read" | Insufficient contrast gradient | Text readability gradient too light |
| "Wrong event showing" | Deep link routing issue | Event ID mismatch in URL params |
| "Link opens in browser" | Universal Link not working | AASA file or app link configuration |

---

## Testing URLs

Use this terminology when testing:

**"Test the OG image endpoint"**:
```
https://link.gathrapp.ca/og/event/{eventId}.png
```

**"Test the landing page meta tags"**:
```
https://link.gathrapp.ca/event/{eventId}
```

**"Test link unfurl in Facebook Debugger"**:
```
https://developers.facebook.com/tools/debug/
```

**"Clear iMessage preview cache"**:
- Share with different event ID (new URL)
- OR add `?v=2` cache-busting parameter

---

## Recap: Key Terms for Requesting Changes

1. **Share sheet preview card** - Preview before selecting share target
2. **Preview thumbnail** - Small image in share sheet
3. **Link preview card** - Rich card with image in messages
4. **OG image** - 1200x630px generated PNG
5. **Background layer** - Event photo behind branding
6. **Brand chip** - GathR logo bubble (top-left)
7. **Type badge** - "EVENT"/"SPECIAL" label (top-right)
8. **Text readability gradient** - Dark overlay on bottom for contrast
9. **Event title** - Large bold text (42px)
10. **Venue line** - Location name (26px)
11. **Date/time line** - When event happens (26px)
12. **Description lines** - 2-line event description (22px)
13. **Card title** - Title text in link preview card
14. **Card description** - Body text in link preview card
15. **Message bubble preview** - How link appears in chat thread

---

Use this guide when requesting changes to be precise about which component you're referring to!
