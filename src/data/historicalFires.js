/**
 * HISTORICAL FIRES — real, sourced incidents (not sample data).
 *
 * Unlike surigao.js's seedReports (fabricated demo pins), every entry here is
 * built from published reporting or a local-government document. Locations
 * are placed at the barangay/purok level, NOT a verified street address —
 * exact lot-level coordinates for a purok are not published anywhere public,
 * so `location` is the nearest confident anchor point and `locationNote`
 * says so plainly. Re-geocode before treating a pin as authoritative.
 *
 * Add new fires here as they're documented. Each needs at least one source.
 */

export const historicalFires = [
  {
    id: 'taft-2026-08-12',
    name: 'Nueva Purok Zenia / Espina Purok Sampaguita fire',
    barangayId: 'taft',
    barangayName: 'Taft',
    // Exact ignition point and direction provided by the user:
    // 9°46'43.8"N, 125°29'33.2"E to 9°46'46.6"N, 125°29'30.5"E.
    location: [9.778833333, 125.492555556],
    locationNote:
      'Exact ignition point from the field reference: 9°46\'43.8"N, 125°29\'33.2"E. The documented spread ran toward 9°46\'46.6"N, 125°29\'30.5"E. This is the anchor used for the August 2026 historical fire.',
    fuel: 'dense_residential',
    startedAt: '2026-08-12T12:48:00+08:00',
    containedAt: '2026-08-12T15:11:00+08:00',
    cause: 'Strong winds and combustible materials; fire origin at a residential home in Purok Zenia',
    familiesAffected: 93,
    individualsAffected: 458,
    housesAffected: 83,
    summary:
      'A fire broke out at around 12:55 p.m. on 12 Aug 2026 at the home of a 64-year-old resident in Purok Zenia, Barangay Taft, Surigao City. The blaze spread rapidly because of strong winds and combustible materials. The City Social Welfare and Development Office later reported 93 families, or 458 individuals, as fire victims, with evacuees sheltered at the Barangay Taft Gymnasium. The Surigao del Norte Police Provincial Office deployed personnel to secure the area, prevent looting, manage crowds, assist with orderly evacuation, support firefighters, and help keep traffic moving. Estimated losses were reported at Php33,207,210.00. Under the command of Provincial Director PCOL WARREN E DABLO, police personnel from the Surigao del Norte Provincial Police Office and Surigao Component City Police Station carried out security and peace-and-order duties during and after the incident.',
    sources: [
      {
        label: 'Surigao del Norte Police Provincial Office — press release, 13 Aug 2026',
        url: 'https://www.facebook.com/SurigaodelNortePulis/posts/press-releaseaugust-13-2026%F0%9D%90%92%F0%9D%90%94%F0%9D%90%91%F0%9D%90%88%F0%9D%90%86%F0%9D%90%80%F0%9D%90%8E-%F0%9D%90%83%F0%9D%90%84%F0%9D%90%8B-%F0%9D%90%8D%F0%9D%90%8E%F0%9D%90%91%F0%9D%90%93%F0%9D%90%84-%F0%9D%90%8F%F0%9D%90%8E%F0%9D%90%8B%F0%9D%90%88%F0%9D%90%82%F0%9D%90%84-%F0%9D%90%92%F0%9D%90%84%F0%9D%90%82%F0%9D%90%94%F0%9D%90%91%F0%9D%90%84%F0%9D%90%92-%F0%9D%90%8F%F0%9D%90%84%F0%9D%90%80%F0%9D%90%82%F0%9D%90%84-%F0%9D%90%80%F0%9D%90%8D%F0%9D%90%83-%F0%9D%90%8E%F0%9D%90%91%F0%9D%90%83%F0%9D%90%84%F0%9D%90%91-%F0%9D%90%83%F0%9D%90%94%F0%9D%90%91%F0%9D%90%88/1044627881798828/',
      },
      {
        label: 'City Social Welfare and Development Office (CSWDO) latest assessment, 13 Aug 2026',
        url: 'https://surigaocity.gov.ph/',
      },
      {
        label: 'Sangguniang Panlungsod (City Council) minutes, 31st regular session, 13 Aug 2026',
        url: 'https://sp.surigaocity.gov.ph/pdfViewer.html?dir=C%3A%5CWEBFILES%5CREFERRALS&filename=2026%5C20261786692246430%5CFINAL_Minutes-31st-RS-08-13-26_reviewed_by_ghsa-7568268128656755874.pdf',
      },
    ],
    verificationNote:
      'This record reflects the 12 Aug 2026 Taft residential fire as reported by SDNPPO and the CSWDO. The public release cited 93 families and 458 individuals as fire victims; the house count remains listed at 83 based on the field reference used for this app and the local damage estimate for the affected cluster.',
  },
];

export function getHistoricalFire(id) {
  return historicalFires.find((fire) => fire.id === id) ?? null;
}