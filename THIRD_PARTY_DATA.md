# Third-party geography data

Scio Geo generates and ships local, offline-ready geography assets from fixed package versions. These sources are used during `bun run data:generate`; the application does not query them or any external API at runtime.

## Country catalogue

- Source: `world-countries@5.1.0`
- Project: <https://github.com/mledoze/countries>
- License: Open Database License (ODbL) 1.0
- Use: ISO codes, Chinese/English common and official names, continents, subregions, country centers, area, landlocked status, borders, capital names, language and currency source data.

The generated catalogue is a derivative database. It remains attributable to the source and is redistributed under the ODbL terms applicable to that database.

Scio Geo adds repository-owned Chinese labels for capitals, subregions and the small number of language or currency codes that are not localized by the pinned JavaScript runtime. The pinned source omits a currency entry for the Federated States of Micronesia, so the generator applies an explicit local USD correction and validates it with the rest of the catalogue.

## Knowledge-card highlights

- Structured highlights for 183 countries are generated from stable `world-countries@5.1.0` fields such as area, landlocked status and sovereign-border count.
- Three highlights for each of the 12 featured countries are repository-owned summaries reviewed against linked references from Encyclopaedia Britannica, UNESCO, the World Wildlife Fund and the U.S. National Park Service.
- The generated `country-sources.json` registry records publisher, URL, version or access date, and license notes. Links are optional references only; all displayed content remains available offline.

Reference sites retain their own copyright. Scio Geo stores short original Chinese summaries rather than copying source prose.

## Country profile resources, people and economy

- Base source: CIA _The World Factbook_ country profiles, consumed from the
  public-domain `factbook/factbook.json` mirror pinned at commit
  `c8cfe21cd019d7748a6b0d57a75d6a77f5ec6ac6`.
- Use: natural resources, major ethnic groups, religions, agricultural
  products, industries, national symbols and short geography notes.
- Resource provenance: `scripts/country-resource-source.json` stores the exact
  195-country `Natural resources` text and source path extracted from the pinned
  Factbook commit. A reviewed bilingual vocabulary rebuilds resource groups
  from that snapshot; normal builds never fetch the upstream repository.
- Coverage: all 195 catalogue countries are reviewed for local resource,
  people and economy profiles. Empty or low-confidence categories are omitted.
  Country-signature items are optional and come only from the reviewed local
  landmark catalogue or explicit country-specific editorial entries.

Scio Geo commits normalized Chinese profile data and never queries the Factbook
at runtime. The Chinese summaries are repository-authored teaching text rather
than copied source prose. Ethnic and religious categories follow the cited
source's statistical vocabulary and should not be interpreted as legal,
political or value classifications. Only complete single-value percentages are
kept; estimate years remain provenance metadata and are not displayed.

## 经纬网与义务教育地理知识

- 课程范围基线：中华人民共和国教育部《义务教育课程方案和课程标准（2022年版）》发布页面，访问日期 2026-08-17。
- 地理定义复核：Encyclopaedia Britannica 的 latitude / longitude 参考条目，访问日期 2026-08-17。
- Use: 经纬度判读、南北与东西半球、低中高纬度、赤道、南北回归线、南北极圈和地球五带的仓库内教学内容。

Scio Geo 使用中国大陆初中地理常用的近似值：回归线约 23.5°，极圈约 66.5°；东西半球以 20°W 和 160°E 组成的经线圈划分。0°和180°经线用于判读东西经，不作为东西半球界线。所有说明均为仓库原创总结，没有复制教材正文；参考链接不构成运行时依赖。

## 世界气候类型

- Scientific source: Beck et al. (2023), _High-resolution (1 km) Köppen-Geiger maps for 1901–2099 based on constrained CMIP6 projections_, Figshare dataset version 2, <https://doi.org/10.6084/m9.figshare.21789074.v2>.
- License: CC BY 4.0 according to the canonical Figshare metadata. The GloH2O project page contains an inconsistent legacy license link; Scio Geo therefore records and follows the Figshare dataset license.
- Pinned input: `koppen_geiger_tif.zip`, 130,618,411 bytes, official MD5 `7fc2f5a15d4f5fe0ce59c9a9b502aa09`; fixed member `1991_2020/koppen_geiger_0p1.tif` (3600×1800, 0.1°).
- Accessed: 2026-08-18. The pinned version includes the January 2026 correction described by the publisher.
- Use: 1991–2020 historical Köppen–Geiger land classification, converted at build time into two deterministic offline PNG rasters for balanced and low-quality rendering.

Köppen–Geiger classes do not map one-to-one to the 13 climate names commonly used in mainland Chinese junior-secondary geography. Scio Geo applies a documented, repository-owned conversion and deliberately simplified teaching masks for the East Asian temperate monsoon region and major highland/mountain regions. The masks are original generalized outlines and do not copy a textbook map. They prioritize the curriculum concepts of broad distribution and controlling factors over scientific micro-boundaries.

The displayed climate layer is a teaching generalization, not a weather forecast, legal boundary, ecological survey or local planning dataset. Mountain valleys, coasts, islands and transition zones can differ at finer scales. The runtime is fully offline and never contacts Figshare, GloH2O or an educational API.

## Adjacent regions

Border codes outside the 195-country catalogue are not treated as sovereign countries. The local data contract classifies Hong Kong, Macao, Gibraltar, French Guiana, Western Sahara and Kosovo as non-interactive adjacent-region labels. This classification is a product presentation rule and does not replace a public-release map-compliance review.

## International organizations and cooperation mechanisms

Scio Geo maintains a reviewed catalogue of 18 selective international identities:
formal organizations, cooperation mechanisms and the five permanent United
Nations Security Council seats. Near-universal global bodies such as the United
Nations, WTO, WHO, IMF and World Bank are intentionally excluded so that the
country card highlights relationships that distinguish countries from one
another. A global identity may not cover more than half of the 195-country
catalogue; region-wide organizations are allowed because they still express a
meaningful regional relationship.

Membership and short repository-authored Chinese summaries are reviewed against
the official sites of the represented organizations or participating
governments. Only current, normally participating formal members are mapped to
country cards. Observers, dialogue partners, candidate countries, associate
members and suspended members are excluded. The G20's European Union and
African Union seats, the African Union's Sahrawi Arab Democratic Republic seat,
and CARICOM's Montserrat membership are preserved as non-country-card member
entities so the displayed official totals remain complete.

The application stores all summaries and membership mappings locally and makes
no runtime request to an organization website. It does not copy or display
official organization logos; compact letter monograms are repository-owned UI
elements rather than official emblems or trademarks.

## Reviewed overseas regions

Scio Geo keeps the 195-country learning catalogue unchanged and maintains a
separate, repository-owned catalogue for nine representative overseas regions:
Greenland, the Faroe Islands, Gibraltar, Bermuda, Puerto Rico, Guam, French
Guiana, French Polynesia and New Caledonia. They are searchable learning
entities but are not included in country totals, country quizzes, rankings or
learning progress.

Administrative relationships, population and teaching summaries are reviewed
against the official statistical services of Greenland, the Faroe Islands,
Gibraltar, Bermuda, the United States Census Bureau, INSEE, ISPF and ISEE. The
application stores short original Chinese summaries and does not query those
services at runtime.

Selected-only teaching geometry for Greenland, Puerto Rico, French Guiana and
New Caledonia is derived from the pinned `world-atlas@2.0.2` source. Smaller or
widely dispersed regions use repository-reviewed center markers. These
overlays appear only after an explicit search or related-country selection and
do not alter the underlying country boundary catalogue.

## Country boundaries

- Source: `world-atlas@2.0.2`, derived from Natural Earth 4.1.0 Admin 0 data
- Projects: <https://github.com/topojson/world-atlas> and <https://www.naturalearthdata.com/>
- License: ISC for the World Atlas package; Natural Earth vector data is public domain
- Use: 1:110m prototype country polygons and the non-country Antarctica landmass converted from TopoJSON to local GeoJSON.

Natural Earth publishes Taiwan island as numeric feature `158`. Scio Geo incorporates that island polygon into China's numeric feature `156` when generating the local `CN` boundary; it does not create a separate country catalogue or knowledge-card entry. These boundaries are for internal product prototyping. Public release, especially in regulated jurisdictions, requires a separate map-compliance review.

Natural Earth publishes Antarctica as numeric feature `010`. Scio Geo renders it as a non-interactive continental landmass on 2D and 3D maps; it is not added to the 195-country catalogue, search, country cards, challenges or learning progress.

## Capital coordinates

- Source: `world-cities-json@1.0.1`, based on the SimpleMaps World Cities Database
- Project: <https://github.com/JetSetExpert/cities-json>
- License: Creative Commons Attribution 4.0 International (CC BY 4.0)
- Use: latitude and longitude for capital markers. Palestine uses an explicit local Ramallah coordinate override because the source does not include a matching capital record.

## Oceans and named waterbodies

- Primary surface geometry: Natural Earth 5.1.0 1:10m geography marine polygons, public domain. The pinned archive SHA-256 is `a2d3395904c41e718e02c3ec5bc988712164c524c236fad32d95d282ca303b2a`.
- Build process: `data:generate` downloads or accepts a local copy of the pinned archive, verifies its version and SHA-256, resolves 45 catalogue objects by repository-reviewed `ne_id`, combines the north and south records for the Pacific and Atlantic oceans, and writes deterministic high and low-detail JSON. `data:validate` never accesses the network.
- Reviewed geometry supplements: Natural Earth does not include matching polygons for the Bering Strait or Strait of Hormuz. Scio Geo stores small repository-owned teaching outlines for those two objects, reviewed against Marine Regions geographic names and IHO reference material; no copyrighted reference geometry is copied.
- References: NOAA Ocean Service education materials, the GEBCO Gazetteer of Undersea Feature Names, International Hydrographic Organization standards, and Marine Regions geographic names.
- Accessed: 2026-08-14.
- Use: reviewed Chinese and English names, broad locations, classifications, adjacent land descriptions, and educational summaries for 51 oceans, seas, bays, gulfs, straits, and trenches.

Scio Geo stores repository-owned summaries and source-aligned, deliberately simplified teaching geometries. Surface polygons and trench lines show an approximate geographic extent only. They are not hydrographic limits and do not represent territorial seas, exclusive economic zones, jurisdiction, sovereignty, or any legal boundary. Public release still requires a separate map-compliance and content review.

## Major rivers and artificial canals

- Primary river geometry: Natural Earth 5.0.0 1:10m river and lake centerlines, public domain. The pinned archive SHA-256 is `ded71b01870855ccfe19b51f2ec14c9bb48fae23c0e9f3c11974d426433b5c38`.
- Build process: `data:generate` downloads or accepts a local copy of the pinned archive, verifies the SHA-256, reads SHP/DBF records by repository-reviewed `ne_id` and part indexes, then commits deterministic high, medium and low-detail main-stem JSON. `data:validate` never accesses the network.
- Supplement references: public Ministry of Water Resources material for the upper Yangtze review; Mekong River Commission material for the upper Mekong review; Natural Resources Canada's National Hydro Network for the Great Lakes–Saint Lawrence connection; Peru's ANA for the Amazon source reach; and Brazil's ANA/SNIRH for the Paraguay main stem. These references guide short repository-authored connectors; their original vector records are not copied into the committed JSON.
- Content references: Encyclopaedia Britannica river and canal overviews, UNESCO's Grand Canal record, and official Suez and Panama canal authority pages.
- Accessed: 2026-08-13.
- Use: reviewed Chinese and English names, approximate lengths, sources and mouths or endpoints, connected waters, and simplified main-stem paths for 30 major river systems and 10 artificial canals.

Five catalog objects include explicitly recorded educational supplements because Natural Earth does not contain a complete source-to-mouth main stem: the Yangtze, Mekong, Amazon, Paraná–Paraguay and Saint Lawrence–Great Lakes systems. Generated provenance records every Natural Earth feature/part and every inserted gap. The shipped lines remain teaching centerlines and intentionally omit ordinary tributaries, changing channels, floodplains, legal water boundaries, guaranteed depths, shipping conditions and real-time flow. HydroRIVERS and Hydrography90m are not used because their redistribution terms do not fit this offline PWA release.

## Famous mountain ranges

- Primary range envelopes: Natural Earth 5.0.0 1:10m geography region polygons, public domain. The pinned archive SHA-256 is `cb7b9db200284ed1551f20eacc7f3333e9b5f311c19f7cb2670694529f688682`.
- Build process: `data:generate` verifies the pinned archive, resolves 30 repository-reviewed `ne_id` records, validates ordered ridge controls against their range envelopes, and writes deterministic high, medium and low-detail ridge lines. `data:validate` does not access the network.
- Content references: Encyclopaedia Britannica mountain references, the U.S. Geological Survey, China's Ministry of Natural Resources, Geoscience Australia and Land Information New Zealand. Accessed 2026-08-14.
- Use: Chinese and English names, broad locations, approximate lengths, highest-peak names, elevations, coordinates and original educational summaries.

Natural Earth provides broad range polygons rather than crest lines. Scio Geo therefore treats those polygons as validation envelopes and derives repository-reviewed teaching ridges from ordered control points. The displayed line and peak marker are not a digital elevation model, complete mountain boundary, climbing route, hazard assessment, administrative border or sovereignty statement. Mountain and summit measurements can vary between surveys, so values marked as approximate should not be read as live surveying results.

## Flags

- Source: `hampusborgos/country-flags` pinned at commit
  `c09927e63705529bbf59ca6684cd9b23225dddad`
- Project: <https://github.com/hampusborgos/country-flags>
- License: Public domain (`PD` in the source package metadata)
- Use: copied native-aspect-ratio SVG flags for the 195-country catalogue.
- Build optimization: `svgo@4.0.2` (MIT), with deterministic precision chosen
  from source size and `viewBox` scale while preserving each native `viewBox`.

The source project derives its SVGs from Wikimedia Commons and official flag
construction references. Scio Geo pins the exact source revision, copies only the
195 catalogue flags during `bun run data:generate`, and validates that shipped
SVGs contain a valid `viewBox` without scripts or external image references.

Flag descriptions, meanings, and history notes use CIA _The World Factbook_
country profiles from the pinned `factbook/factbook.json` commit documented
above. `scripts/country-flag-source.json` preserves each complete raw
`Government.Flag.text`, its source path, parsed English sections, and SHA-256;
`scripts/country-flag-content.json` stores complete repository-authored Chinese
translations of every available section. The pinned source supplies 194
descriptions, 171 meaning sections, and 56 history sections; its Palestine
profile has no Flag content. Missing sections remain absent rather than being
inferred or supplemented. No flag content or translation is fetched at runtime.

Flag designs may also be subject to jurisdiction-specific laws and usage rules beyond the source-code license.
