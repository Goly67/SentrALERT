/**
 * Figures from the Surigao City Local Disaster Risk Reduction and Management
 * Plan (LDRRMP) 2019–2025, supplied by the CDRRMO.
 */

export const LDRRMP_SOURCE = 'Surigao City LDRRMP 2019–2025';
export const LDRRMP_CENSUS_YEAR = 2007;
export const LDRRMP_PROJECTION_YEAR = 2020;

/**
 * Built-up land and homes per barangay.
 * [name, built-up area (ha) from Table 11, households 2007 from Table 9,
 *  population 2007 from Table 9, projected population 2020 from Table 14]
 *
 * Homes today are the 2007 households grown with the barangay's projected
 * population, at the same household size and on the same built-up land (new
 * homes assumed to fill in, not spread out: the worst case for a fire).
 * Households per built-up hectare stands in for buildings per hectare in the
 * fire spread model. It counts homes only (not shops or offices) and the
 * built-up area includes roads and yards, so it is a floor, not a survey.
 */
const BUILT_UP = [
  ["Canlanipa",     22.35,   985,   7200,   8749],
  ["Luna",          66.21,  1342,   7707,   9365],
  ["San Juan",      34.16,  2288,  12969,  15759],
  ["Taft",          63.18,  4411,  16917,  20556],
  ["Washington",    96.27,  4488,  20817,  25295],
  ["Alang-Alang",    3.65,   106,    478,    581],
  ["Alegria",        3.69,   128,    611,    743],
  ["Anomar",        10.58,   224,   1162,   1412],
  ["Aurora",         3.28,   164,    694,    843],
  ["Balibayon",      7.10,   245,   1512,   1838],
  ["Baybay",         2.01,    54,    268,    326],
  ["Bilabid",        2.57,    57,    314,    382],
  ["Bitaugan",       1.90,   114,    570,    693],
  ["Bonifacio",     17.69,   354,   2600,   3159],
  ["Buenavista",     5.94,   247,    977,   1187],
  ["Cabongbongan",   8.19,   141,    608,    738],
  ["Cagniog",       22.96,   551,   3564,   4331],
  ["Cagutsan",       1.97,    93,    387,    450],
  ["Cantiasay",      4.10,   186,    909,   1105],
  ["Capalayan",     20.31,   467,   2306,   2802],
  ["Catadman",       2.20,   104,    369,    448],
  ["Danao",          5.50,   107,    528,    642],
  ["Danawan",        2.76,   109,    599,    728],
  ["Day-asan",       4.03,   261,   1434,   1743],
  ["Ipil",          17.04,   747,   3727,   4529],
  ["Libuac",         4.01,   182,    889,   1080],
  ["Lipata",        43.44,   335,   1659,   2016],
  ["Lisondra",       3.94,   146,    916,   1113],
  ["Mabini",        11.39,   352,   1625,   1975],
  ["Mabua",          5.16,   461,   2147,   2608],
  ["Manjagao",       4.13,   142,    753,    915],
  ["Mapawa",         7.13,   152,    930,   1130],
  ["Mat-i",         15.24,   741,   4304,   5230],
  ["Nabago",         9.78,   242,   1038,   1261],
  ["Nonoc",         21.14,   259,   1154,   1402],
  ["Orok",           6.58,   189,    898,   1091],
  ["Poctoy",         8.01,   233,   1353,   1644],
  ["Punta Bilar",    3.83,   146,    830,   1099],
  ["Quezon",        45.03,   394,   1911,   2322],
  ["Rizal",         53.33,   974,   5290,   6428],
  ["Sabang",         6.91,   378,   2853,   3466],
  ["San Isidro",     3.09,   103,    459,    557],
  ["San Jose",       5.37,   283,   1529,   1858],
  ["San Pedro",      2.82,   148,    816,    992],
  ["San Roque",      3.65,   191,   1076,   1307],
  ["Serna",          8.48,   207,   1130,   1373],
  ["Sidlakan",       2.19,    61,    366,    444],
  ["Silop",          8.62,   164,   1178,   1431],
  ["Sugbay",         1.70,   101,    424,    515],
  ["Sukailang",     17.13,   199,   1104,   1342],
  ["Talisay",       21.05,   533,   1823,   2215],
  ["Togbongon",     15.95,   364,   1743,   2118],
  ["Trinidad",      31.79,   417,   2186,   2656],
  ["Zaragosa",       3.38,   146,    540,    656],
];

// The boundary map spells a few barangays differently from the LDRRMP.
const ALIASES = { manyagao: 'manjagao', sema: 'serna', zaragoza: 'zaragosa' };
const key = (name) => {
  const k = String(name ?? '').trim().toLowerCase();
  return ALIASES[k] ?? k;
};

const BY_NAME = new Map(BUILT_UP.map(([name, builtUpHa, households2007, population2007, population2020]) => {
  const homes = households2007 * (population2020 / population2007);
  return [key(name), {
    name,
    builtUpHa,
    households2007,
    population2020,
    homes: Math.round(homes),
    homesPerHa: Math.round((homes / builtUpHa) * 10) / 10,
  }];
}));

/** LDRRMP built-up figures for a barangay name, or null when it is not listed. */
export function builtUpDensity(name) {
  return BY_NAME.get(key(name)) ?? null;
}

/**
 * Major causes of fire incidents in Surigao City, Table 30 (BFP records).
 * Counts per year 2016, 2017, 2018. Grass fires are kept apart: they burn
 * vegetation, not homes.
 */
export const FIRE_CAUSE_YEARS = [2016, 2017, 2018];
export const FIRE_CAUSES = [
  { cause: 'Electrical short circuit', counts: [13, 8, 21] },
  { cause: 'Open flame (grass fire)', counts: [1, 2, 35], grass: true },
  { cause: 'Unattended cooking', counts: [3, 7, 6] },
  { cause: 'Careless smoking', counts: [0, 2, 4] },
  { cause: 'Overheated appliances', counts: [4, 1, 1] },
  { cause: 'Unattended candles', counts: [2, 0, 2] },
  { cause: 'Flammable liquids', counts: [0, 2, 1] },
  { cause: 'Children playing with fire', counts: [1, 1, 0] },
  { cause: 'Left unattended', counts: [0, 0, 2] },
  { cause: 'Faulty electrical equipment', counts: [0, 0, 1] },
].map((row) => ({ ...row, total: row.counts.reduce((sum, n) => sum + n, 0) }));
