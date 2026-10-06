# SentrALERT

SentrALERT is a community-focused situational awareness app for Surigao City
and the surrounding area. It brings together fire reports, weather and
environmental conditions, map-based alerts, and earthquake information to help
teams view developing incidents in one place. Fire reports can be triaged
automatically, with wind and spread projections supporting situational
awareness.

## Run it

```bash
npm install
npm run dev
```

http://localhost:5173. No API keys — wind from Open-Meteo, base map from Esri's
free Light Gray Canvas (no signup, no key), tinted warm orange with a CSS filter,
everything else in-memory.

## Why not CARTO

CARTO changed policy in August 2026: their raster basemap tiles now stamp
"API KEY REQUIRED" across every tile unless you register a free key with them.
Rather than add that dependency, the base map is Esri's World Light Gray Canvas
(`server.arcgisonline.com`), which is free with no signup and, being monochrome,
tints cleanly under a CSS filter — no blue water or green parks fighting the
orange cast. `src/styles.css` holds the two filter rules (`img.tile-base`,
`img.tile-labels`) if you want to adjust the tone.

## The 5-level warning system

`src/lib/alarmLevels.js` holds the ladder, and `src/components/WarningSystem.jsx`
renders the reference card people can open from the sidebar. The level in play
on the map is highlighted in the reference, so the two never disagree.

| Level | Trigger (structures in the 30-min projection) | Units |
|---|---|---|
| Light Warning | held report, not dispatched | 0 |
| 1st Alarm | any | 4 |
| 2nd Alarm | 12+ | 8 |
| 3rd Alarm | 35+ | 12 |
| 4th Alarm | 80+ | 18 |
| 5th Alarm | 150+ | 30 |

Reporter-count thresholds are 5 for 1st Alarm, 25 for 2nd, 35 for 3rd, 45 for
4th, and 50 for 5th. Spread projection and elapsed time can still escalate the
level further. Nothing waits on a person.

## BFP stations — real data

`src/data/bfpStations.js` holds 32 real Bureau of Fire Protection stations,
sub-stations, districts, provincial headquarters and regional offices across all
of Mindanao: Caraga (XIII), Northern Mindanao (X), Davao (XI), SOCCSKSARGEN
(XII), Zamboanga Peninsula (IX) and BARMM. Coordinates and contact numbers come
from Google Maps listings.

These are real records, not placeholders. They are still third-party listings,
so verify a number against the station before relying on it in an emergency.

Responding stations for an incident are the real nearest ones by great-circle
distance, with tap-to-call links on the numbers that have them.

## Animation

- Fire markers flicker, glow, and throw expanding alarm rings tinted to the level
- Embers and smoke stream downwind, rotated to the computed spread heading
- The active spread front breathes; the wind vector marches downwind
- A timeline under the map scrubs the projection from now to +60 minutes, with
  play at 12 projected minutes per second — watching the front move is what makes
  the wind model legible
- Fire truck glyphs in the level reference roll and flash on hover

All of it is disabled under `prefers-reduced-motion`.

## Facebook, and only Facebook

There's no "search every social media" — Facebook closed keyword search
across arbitrary public content in Graph API v2.0 back in 2015, and never
reopened it at any price. What still works, for free: reading the feed of a
**Page you administer** — a public tip line, e.g. "SentrALERT Reports".
Reading a **Group's** feed needs Meta's separate Groups API app
review, which can take weeks, so this only covers a Page.

`functions/index.js` is a scheduled Cloud Function (`pollFacebookPage`) that:

1. Runs every 1 minute
2. Pulls new posts and comments on your Page since the last run
3. Matches fire keywords in English, Filipino, and Bisaya (`sunog`, `kalayo`
   and their conjugations, alongside `fire`, `smoke`, `burning`)
4. Tries to match a barangay name in the text
5. A match with a barangay goes straight into `reports/` — same triage as
   an app report, so a lone Facebook comment lands as a Light Warning until
   something corroborates it
6. A match with no barangay goes into `facebookLeads/` instead, and shows up
   in the sidebar for someone to place on the map by hand — this queue is
   intel, not an approval gate, and it never blocks or delays the pipeline
   above it

Setup:

1. Requires the **Blaze (pay-as-you-go)** Firebase plan. Cloud Functions
   don't run at all on the free Spark plan — that's a platform rule, not a
   size limit. This function's own usage stays inside the free monthly
   quota, so it should cost $0, but a billing account has to be attached
   for Google to let it run.
2. Create the Facebook Page, then generate a **long-lived Page Access
   Token** (Graph API Explorer -> select the Page -> `pages_read_engagement`
   permission -> exchange for a long-lived token).
3. `cd functions && npm install`
4. `firebase functions:secrets:set FB_PAGE_ACCESS_TOKEN` (paste the token)
5. `firebase functions:config:set` or an env var for `FB_PAGE_ID`
6. `npm run deploy` from `functions/`

Add to your RTDB rules alongside `reports`:
```json
{ "rules": { "reports": { ".read": true, ".write": true },
             "incidentStatuses": { ".read": true,
               ".write": "auth != null && auth.token.email == 'forestparty223@gmail.com'" },
             "facebookLeads": { ".read": true, ".write": true },
             "airQualitySignals": { ".read": true, ".write": false },
             "_meta": { ".read": false, ".write": false } } }
```
(`_meta` only needs to be reachable by the function's admin SDK, not the browser.)

## Data: Firebase Realtime Database, not Firestore

Reports live at `reports/{id}` in Realtime Database. RTDB was picked over
Firestore on purpose — Firestore's free tier caps daily reads and writes and
bills per operation past that; RTDB's Spark plan is free for an app this size,
with no per-read/write charge, just a bandwidth/storage ceiling.

1. Create a Firebase project, add a Realtime Database (Spark/free plan)
2. Project settings -> General -> Your apps -> copy the SDK config
3. `cp .env.example .env.local` and fill in the `VITE_FIREBASE_*` values
4. Set the database's rules for the demo (tighten before anything real):
   ```json
   {
     "rules": {
       "reports": { ".read": true, ".write": true },
       "incidentStatuses": {
         ".read": true,
         ".write": "auth != null && auth.token.email == 'forestparty223@gmail.com'"
       }
     }
   }
   ```

Leave `.env.local` unset and the app runs on in-memory sample data instead —
`src/lib/reportsStore.js` is the one seam that decides which, so nothing else
in the app needs to know or care.

## PM2.5 corroboration

`functions/airQuality.js` runs every 15 minutes and reads the latest PM2.5 value
for Surigao City from Open-Meteo's air-quality API. It compares the reading with
the median of the previous eight readings and writes a short-lived signal to
`airQualitySignals/` when the value reaches the tunable `PM25_SPIKE_RATIO`
threshold (currently 1.8x). The browser treats a signal from the last 30 minutes
as corroboration for existing reports whose score is in the monitoring range.

This is deliberately not a report and never creates a map pin: one citywide
reading cannot identify where a fire is. It only raises confidence in fires that
people have already located and reported. The function stores its rolling input
at `_meta/pm25History`; the browser only reads `airQualitySignals/`.

## Satellite thermal corroboration

The browser also checks the public Esri copy of NASA VIIRS thermal hotspots
around Surigao every 15 minutes. A fresh hotspot can strengthen an existing
nearby report when it falls within 2 km, alongside the independent-report
logic. VIIRS detects thermal activity, not individual houses, so it never
creates a report or map pin by itself.

The Philippines fire map merges the ArcGIS VIIRS feed with NASA FIRMS when a
FIRMS map key is configured. FIRMS adds separate near-real-time feeds for
Suomi NPP VIIRS, NOAA-20 VIIRS, NOAA-21 VIIRS, and MODIS. Create a free key at
<https://firms.modaps.eosdis.nasa.gov/api/map_key/> and add it to `.env.local`:

```bash
VITE_FIRMS_MAP_KEY=your_firms_map_key
```


## Evidence: Google Drive links, not uploads

There's no file upload — no free tier here has anywhere cheap to put photo or
video bytes. Instead the report form takes a Google Drive or Google Photos
share link (shared as "anyone with the link"), which travels with the report
as plain text and shows up as a "View evidence" chip on the incident, and in
the auto-composed Facebook post if one was attached to the report that
triggered it.

## Interactive panel and notifications

- The side panel collapses via the handle on its right edge (bottom edge on
  mobile) so the map can take the full screen — useful once you're actually
  standing outside looking at the fire.
- A bell in the top-right of the map lists every active incident and pops a
  toast for new reports or escalations as they happen, without needing the
  panel open.

## Still placeholder

- `src/data/surigao.js` — barangay centres and fuel classes are approximate.
  Replace with real boundary GeoJSON and building-footprint data.
- Detector score — the slider in the report form stands in for the hosted
  fire/smoke model. In production a Cloud Function would score the linked
  Drive media server-side.
- Facebook auto-posting — `composePost()` builds the exact text a Cloud Function
  would hand to the Graph API; nothing posts from the browser.

## Fuel classes

Spread rate depends on what is burning. `dense_residential` assumes walls are
physically touching, which is the common case in the target barangays: fire
moves building to building by direct contact, so the no-wind spread rate is
already high before wind is applied. `involvementRate` is the share of buildings
inside the projected footprint that actually burn.

## Next steps toward production

1. Reports to Firestore, photos to Firebase Storage
2. Cloud Function on report create: score the photo, cluster, project, publish
3. Facebook Graph API page-post call inside that function
4. Real barangay GeoJSON and building footprints for structure counts
5. Only then, add a real station notification channel with rate limiting
