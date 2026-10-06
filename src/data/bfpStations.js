/**
 * Real Bureau of Fire Protection stations and offices across Mindanao.
 *
 * Station records and contact numbers are compiled from public map listings.
 * Several Surigao del Norte municipal locations use town-center coordinates
 * where an exact station listing was unavailable. Verify a pin and number
 * with the station before relying on it in an emergency.
 *
 * Coverage: Regions IX, X, XI, XII, XIII and BARMM.
 */

export const MINDANAO_CENTER = [8.0, 124.9];
export const BFP_CARAGA_FALLBACK_CONTACT = '(086) 232-5131';
export const NATIONAL_EMERGENCY_CONTACT = '911';

export const bfpStations = [
  // ---- Region XIII (Caraga) ----
  {
    id: 'caraga-ro',
    name: 'BFP Caraga Regional Office',
    region: 'Region XIII (Caraga)',
    city: 'Surigao City',
    location: [9.7796507, 125.4646169],
    contact: '+63 86 231 6747',
    kind: 'regional',
  },
  {
    id: 'surigao-city',
    name: 'Surigao City Central Fire Station',
    region: 'Region XIII (Caraga)',
    city: 'Surigao City',
    location: [9.7920671, 125.4939451],
    contact: '0931-721-8790 / 0955-214-8510',
    kind: 'station',
  },
  // ---- Surigao del Norte municipal fire stations ----
  // Every LGU is required by law (RA 6975 / DILG) to have a BFP presence.
  // Coordinates below are each municipality's poblacion / municipal-hall
  // vicinity (sourced from Wikipedia / PhilAtlas municipal-center data),
  // since exact station-building coordinates aren't published for most of
  // these towns — good enough to place a marker in the right barangay, but
  // pin-precision should be verified against the actual station if used
  // operationally. Contact numbers were not reliably available and are
  // left null rather than guessed.
  {
    id: 'sdn-alegria',
    name: 'Alegria Fire Station',
    region: 'Region XIII (Caraga)',
    city: 'Alegria',
    location: [9.4667, 125.5767],
    contact: null,
    kind: 'station',
  },
  {
    id: 'sdn-bacuag',
    name: 'Bacuag Fire Station',
    region: 'Region XIII (Caraga)',
    city: 'Bacuag',
    location: [9.6081, 125.6405],
    contact: null,
    kind: 'station',
  },
  {
    id: 'sdn-claver',
    name: 'Claver Fire Station',
    region: 'Region XIII (Caraga)',
    city: 'Claver',
    location: [9.5742, 125.7328],
    contact: null,
    kind: 'station',
  },
  {
    id: 'sdn-gigaquit',
    name: 'Gigaquit Fire Station',
    region: 'Region XIII (Caraga)',
    city: 'Gigaquit',
    location: [9.5947, 125.6975],
    contact: null,
    kind: 'station',
  },
  {
    id: 'sdn-mainit',
    name: 'Mainit Fire Station',
    region: 'Region XIII (Caraga)',
    city: 'Mainit',
    location: [9.5369, 125.5231],
    contact: null,
    kind: 'station',
  },
  {
    id: 'sdn-malimono',
    name: 'Malimono Fire Station',
    region: 'Region XIII (Caraga)',
    city: 'Malimono',
    location: [9.6183, 125.4019],
    contact: null,
    kind: 'station',
  },
  {
    id: 'sdn-placer',
    name: 'Placer Fire Station',
    region: 'Region XIII (Caraga)',
    city: 'Placer',
    location: [9.65703, 125.60161],
    contact: null,
    kind: 'station',
  },
  {
    id: 'sdn-san-francisco',
    name: 'San Francisco (Anao-Aon) Fire Station',
    region: 'Region XIII (Caraga)',
    city: 'San Francisco',
    location: [9.7778, 125.4231],
    contact: null,
    kind: 'station',
  },
  {
    id: 'sdn-sison',
    name: 'Sison Fire Station',
    region: 'Region XIII (Caraga)',
    city: 'Sison',
    location: [9.6592, 125.5272],
    contact: null,
    kind: 'station',
  },
  {
    id: 'sdn-tagana-an',
    name: 'Tagana-an Fire Station',
    region: 'Region XIII (Caraga)',
    city: 'Tagana-an',
    location: [9.6964, 125.5825],
    contact: 'MDRRMO: 0995-154-9304',
    kind: 'station',
  },
  {
    id: 'sdn-tubod',
    name: 'Tubod Fire Station',
    region: 'Region XIII (Caraga)',
    city: 'Tubod',
    location: [9.5547, 125.5697],
    contact: null,
    kind: 'station',
  },
  {
    id: 'sdn-burgos',
    name: 'Burgos Fire Station',
    region: 'Region XIII (Caraga)',
    city: 'Burgos (Siargao)',
    location: [10.018, 126.074],
    contact: null,
    kind: 'station',
  },
  {
    id: 'sdn-dapa',
    name: 'Dapa Fire Station',
    region: 'Region XIII (Caraga)',
    city: 'Dapa (Siargao)',
    location: [9.7578, 126.0528],
    contact: null,
    kind: 'station',
  },
  {
    id: 'sdn-del-carmen',
    name: 'Del Carmen Fire Station',
    region: 'Region XIII (Caraga)',
    city: 'Del Carmen (Siargao)',
    location: [9.869, 125.97],
    contact: null,
    kind: 'station',
  },
  {
    id: 'sdn-general-luna',
    name: 'General Luna Fire Station',
    region: 'Region XIII (Caraga)',
    city: 'General Luna (Siargao)',
    location: [9.783, 126.156],
    contact: null,
    kind: 'station',
  },
  {
    id: 'sdn-pilar',
    name: 'Pilar Fire Station',
    region: 'Region XIII (Caraga)',
    city: 'Pilar (Siargao)',
    location: [9.8639, 126.1008],
    contact: null,
    kind: 'station',
  },
  {
    id: 'sdn-san-benito',
    name: 'San Benito Fire Station',
    region: 'Region XIII (Caraga)',
    city: 'San Benito (Siargao)',
    location: [9.958, 126.007],
    contact: null,
    kind: 'station',
  },
  {
    id: 'sdn-san-isidro',
    name: 'San Isidro Fire Station',
    region: 'Region XIII (Caraga)',
    city: 'San Isidro (Siargao)',
    location: [9.9369, 126.0886],
    contact: null,
    kind: 'station',
  },
  {
    id: 'sdn-santa-monica',
    name: 'Santa Monica (Sapao) Fire Station',
    region: 'Region XIII (Caraga)',
    city: 'Santa Monica (Siargao)',
    location: [10.02, 126.038],
    contact: null,
    kind: 'station',
  },
  {
    id: 'sdn-socorro',
    name: 'Socorro Fire Station',
    region: 'Region XIII (Caraga)',
    city: 'Socorro (Bucas Grande)',
    location: [9.618, 125.966],
    contact: null,
    kind: 'station',
  },

  {
    id: 'butuan-central',
    name: 'Butuan City Central Fire Station',
    region: 'Region XIII (Caraga)',
    city: 'Butuan City',
    location: [8.9505815, 125.5436375],
    contact: '(085) 342-8217 / (085) 815-0160 / 0910-667-0623',
    contactNote: 'Older directory listing; verify before use.',
    kind: 'station',
  },
  {
    id: 'butuan-ampayon',
    name: 'Butuan Ampayon Fire Sub-station',
    region: 'Region XIII (Caraga)',
    city: 'Ampayon (Butuan City)',
    location: [8.9612686, 125.6025253],
    contact: '(085) 815-2616 / 0918-509-7692',
    contactNote: 'Older directory listing; verify before use. Map pin uses the approximate Ampayon barangay center.',
    kind: 'substation',
  },
  {
    id: 'butuan-libertad',
    name: 'BFP Libertad Sub-station',
    region: 'Region XIII (Caraga)',
    city: 'Butuan City',
    location: [8.9437722, 125.5021648],
    contact: null,
    kind: 'substation',
  },
  {
    id: 'tandag',
    name: 'Tandag Fire Station',
    region: 'Region XIII (Caraga)',
    city: 'Tandag City',
    location: [9.0804531, 126.196872],
    contact: null,
    kind: 'station',
  },
  {
    id: 'sdsur-pfm',
    name: 'Office of the Provincial Fire Marshal — Surigao del Sur',
    region: 'Region XIII (Caraga)',
    city: 'Tandag City',
    location: [9.0638604, 126.1991638],
    contact: '+63 86 211 3068',
    kind: 'provincial',
  },
  {
    id: 'bislig-central',
    name: 'Bislig City Central Fire Station',
    region: 'Region XIII (Caraga)',
    city: 'Bislig City',
    location: [8.1899659, 126.3533575],
    contact: '+63 931 721 8754',
    kind: 'station',
  },

  // ---- Region X (Northern Mindanao) ----
  {
    id: 'r10-ro',
    name: 'BFP Regional Office X',
    region: 'Region X (Northern Mindanao)',
    city: 'Cagayan de Oro City',
    location: [8.4785606, 124.6304756],
    contact: '+63 917 308 7972',
    kind: 'regional',
  },
  {
    id: 'cdo-district',
    name: 'Cagayan de Oro City Fire District',
    region: 'Region X (Northern Mindanao)',
    city: 'Cagayan de Oro City',
    location: [8.4792166, 124.6512174],
    contact: '+63 88 856 5466',
    kind: 'district',
  },
  {
    id: 'cdo-carmen',
    name: 'Carmen Fire Station',
    region: 'Region X (Northern Mindanao)',
    city: 'Cagayan de Oro City',
    location: [8.4810657, 124.6358355],
    contact: '0967-840-4415',
    kind: 'station',
  },
  {
    id: 'iligan',
    name: 'Iligan City Fire Station',
    region: 'Region X (Northern Mindanao)',
    city: 'Iligan City',
    location: [8.2287265, 124.2365503],
    contact: null,
    kind: 'station',
  },
  {
    id: 'ozamiz',
    name: 'Ozamiz City Central Fire Station',
    region: 'Region X (Northern Mindanao)',
    city: 'Ozamiz City',
    location: [8.1436433, 123.8385889],
    contact: '+63 949 971 1711',
    kind: 'station',
  },
  {
    id: 'malaybalay',
    name: 'Malaybalay City Fire Station',
    region: 'Region X (Northern Mindanao)',
    city: 'Malaybalay City',
    location: [8.1537723, 125.1276086],
    contact: '+63 917 883 2911',
    kind: 'station',
  },

  // ---- Region XI (Davao) ----
  {
    id: 'r11-ro',
    name: 'BFP Regional Office XI',
    region: 'Region XI (Davao)',
    city: 'Davao City',
    location: [7.0755793, 125.6248006],
    contact: '+63 82 224 0524',
    kind: 'regional',
  },
  {
    id: 'davao-bangoy',
    name: 'BFP Davao — C. Bangoy Street',
    region: 'Region XI (Davao)',
    city: 'Davao City',
    location: [7.0729763, 125.6109291],
    contact: '+63 82 221 0221',
    kind: 'station',
  },
  {
    id: 'davao-buhangin',
    name: 'BFP Buhangin Fire Station',
    region: 'Region XI (Davao)',
    city: 'Davao City',
    location: [7.1090003, 125.6156778],
    contact: '+63 82 241 0220',
    kind: 'station',
  },
  {
    id: 'tagum-central',
    name: 'Tagum City Central Fire Station',
    region: 'Region XI (Davao)',
    city: 'Tagum City',
    location: [7.4216211, 125.7900992],
    contact: null,
    kind: 'station',
  },
  {
    id: 'digos',
    name: 'Digos Fire Station',
    region: 'Region XI (Davao)',
    city: 'Digos City',
    location: [6.744831, 125.3563545],
    contact: '(082) 553-1160 / 0919-858-8656',
    kind: 'station',
  },
  {
    id: 'mati',
    name: 'Mati Fire Station',
    region: 'Region XI (Davao)',
    city: 'Mati City',
    location: [6.9518177, 126.2169577],
    contact: null,
    kind: 'station',
  },

  // ---- Region XII (SOCCSKSARGEN) ----
  {
    id: 'r12-ro',
    name: 'BFP Regional Office XII',
    region: 'Region XII (SOCCSKSARGEN)',
    city: 'Koronadal City',
    location: [6.4525232, 124.8777465],
    contact: '+63 907 958 2557',
    kind: 'regional',
  },
  {
    id: 'koronadal-sub',
    name: 'BFP Koronadal Sub-station',
    region: 'Region XII (SOCCSKSARGEN)',
    city: 'Koronadal City',
    location: [6.4835811, 124.8528177],
    contact: null,
    kind: 'substation',
  },
  {
    id: 'gensan',
    name: 'BFP General Santos City',
    region: 'Region XII (SOCCSKSARGEN)',
    city: 'General Santos City',
    location: [6.1146551, 125.170552],
    contact: '(083) 552-1160 / 0943-341-5561 / Dial 160',
    kind: 'station',
  },
  {
    id: 'gensan-ro12',
    name: 'BFP Region 12 Regional Office (General Santos)',
    region: 'Region XII (SOCCSKSARGEN)',
    city: 'General Santos City',
    location: [6.0722616, 125.1410855],
    contact: '(083) 552-1160 / 0943-341-5561 / Dial 160',
    kind: 'regional',
  },
  {
    id: 'kidapawan',
    name: 'Kidapawan City Fire Station',
    region: 'Region XII (SOCCSKSARGEN)',
    city: 'Kidapawan City',
    location: [7.0135204, 125.0671416],
    contact: '+63 64 577 1333',
    kind: 'station',
  },
  {
    id: 'cotabato-prov',
    name: 'BFP Cotabato Provincial Headquarters',
    region: 'Region XII (SOCCSKSARGEN)',
    city: 'Kidapawan City',
    location: [7.0683257, 124.9618133],
    contact: '+63 909 005 9300',
    kind: 'provincial',
  },

  // ---- Region IX (Zamboanga Peninsula) ----
  {
    id: 'zamboanga-district',
    name: 'Zamboanga City Fire District',
    region: 'Region IX (Zamboanga Peninsula)',
    city: 'Zamboanga City',
    location: [6.9071726, 122.0748865],
    contact: '(062) 991-2267 / 0955-781-6063',
    kind: 'district',
  },
  {
    id: 'pagadian',
    name: 'Pagadian City Fire Station',
    region: 'Region IX (Zamboanga Peninsula)',
    city: 'Pagadian City',
    location: [7.8235129, 123.4327283],
    contact: '+63 62 214 3913',
    kind: 'station',
  },
  {
    id: 'dipolog',
    name: 'Dipolog City Fire Station',
    region: 'Region IX (Zamboanga Peninsula)',
    city: 'Dipolog City',
    location: [8.5902333, 123.342258],
    contact: '+63 65 212 3222',
    kind: 'station',
  },

  // ---- BARMM ----
  {
    id: 'cotabato-central',
    name: 'Cotabato City Central Fire Station',
    region: 'BARMM',
    city: 'Cotabato City',
    location: [7.2256048, 124.2485577],
    contact: '+63 966 166 3427',
    kind: 'station',
  },
  {
    id: 'barmm-ocm',
    name: 'BFP-BARMM OCM Fire Sub-station',
    region: 'BARMM',
    city: 'Cotabato City',
    location: [7.1983157, 124.2468536],
    contact: null,
    kind: 'substation',
  },
  {
    id: 'marawi-central',
    name: 'Marawi City Central Fire Station',
    region: 'BARMM',
    city: 'Marawi City',
    location: [8.0015845, 124.3009556],
    contact: '+63 907 022 4843',
    kind: 'station',
  },
  {
    id: 'marawi-sub',
    name: 'BFP Marawi City Fire Sub-station',
    region: 'BARMM',
    city: 'Marawi City',
    location: [7.9980177, 124.2659142],
    contact: '+63 910 805 2258',
    kind: 'substation',
  },
];

export const regions = [...new Set(bfpStations.map((s) => s.region))].sort();

export const STATION_DATA_NOTE =
  'Pins use public map listings where available; some locations mark a town or barangay center, not the exact station building. Older-directory and user-submitted contacts are not independently verified; confirm before operational use.';

const CITY_TEMPERATURE_LOCATIONS = {
  'Surigao City': [9.7839, 125.4889],
};

/**
 * One representative point per city/municipality, used to associate nearby
 * Public weather station readings with city labels on the map.
 */
export const cities = Object.values(
  bfpStations.reduce((byCity, station) => {
    if (!byCity[station.city]) {
      byCity[station.city] = {
        id: station.city.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
        name: station.city,
        region: station.region,
        location: CITY_TEMPERATURE_LOCATIONS[station.city] ?? station.location,
      };
    }
    return byCity;
  }, {})
).sort((a, b) => a.name.localeCompare(b.name));