/**
 * SAMPLE DATA — approximate, hand-placed for the demo.
 *
 * Before this is used for anything real, replace `barangays` with the city's
 * actual boundary GeoJSON. The fuel class on each barangay is a guess and
 * should come from building-footprint data or the aerial survey.
 *
 * Fire stations are NOT sample data — see data/bfpStations.js for real BFP
 * stations across Mindanao.
 */

export const SURIGAO_CENTER = [9.7839, 125.4889];

export const barangays = [
  { id: 'washington',  name: 'Washington',   center: [9.7880, 125.4936], fuel: 'dense_residential' },
  { id: 'taft',        name: 'Taft',         center: [9.7852, 125.4907], fuel: 'dense_residential' },
  { id: 'luna',        name: 'Luna',         center: [9.7902, 125.4881], fuel: 'mixed_residential' },
  { id: 'rizal',       name: 'Rizal',        center: [9.7826, 125.4948], fuel: 'commercial' },
  { id: 'san_juan',    name: 'San Juan',     center: [9.7774, 125.4890], fuel: 'mixed_residential' },
  { id: 'canlanipa',   name: 'Canlanipa',    center: [9.7709, 125.4934], fuel: 'dense_residential' },
  { id: 'punta_bilar', name: 'Punta Bilar',  center: [9.7963, 125.4975], fuel: 'dense_residential' },
  { id: 'ipil',        name: 'Ipil',         center: [9.7649, 125.4861], fuel: 'sparse' },
  { id: 'cagniog',     name: 'Cagniog',      center: [9.8025, 125.4812], fuel: 'sparse' },
  { id: 'quezon',      name: 'Quezon',       center: [9.7795, 125.4835], fuel: 'mixed_residential' },
];

export { bfpStations as fireStations } from './bfpStations.js';

const minutesAgo = (m) => new Date(Date.now() - m * 60000).toISOString();

/** Seed incidents so the map is not empty on first load. */
export const seedReports = [
  {
    id: 'rpt-1001',
    location: [9.78835, 125.49375],
    barangayId: 'washington',
    source: 'aerial',
    modelConfidence: 0.91,
    note: 'Smoke column picked up on the morning drone sweep, roofline obscured.',
    reportedAt: minutesAgo(6),
  },
  {
    id: 'rpt-1002',
    location: [9.78862, 125.49402],
    barangayId: 'washington',
    source: 'crowd',
    modelConfidence: 0.84,
    note: 'Neighbour two houses down, flames visible through the window.',
    driveUrl: 'https://drive.google.com/file/d/1SampleSharedClip/view',
    reportedAt: minutesAgo(4),
  },
  {
    id: 'rpt-1003',
    location: [9.77105, 125.49318],
    barangayId: 'canlanipa',
    source: 'crowd',
    modelConfidence: 0.74,
    note: 'Thick smoke near the shoreline path.',
    reportedAt: minutesAgo(11),
  },
  {
    id: 'rpt-1004',
    location: [9.78252, 125.49470],
    barangayId: 'rizal',
    source: 'crowd',
    modelConfidence: 0.41,
    note: 'Possible smoke behind the market, could be cooking.',
    reportedAt: minutesAgo(19),
  },
];
