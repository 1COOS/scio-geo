import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import prettier from 'prettier'
import { optimize } from 'svgo'
import { feature } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import countriesSource from 'world-countries'

import {
  adjacentRegionNames,
  capitalChineseNames,
  capitalCoordinateOverrides,
  capitalNameAliases,
  countryBoundaryGeometrySupplements,
  countryCurrencyOverrides,
  currencyOverrides,
  featuredCountryContent,
  FEATURED_COUNTRY_CODES,
  languageChineseNameOverrides,
  subregionChineseNames,
} from './country-content'
import { countrySources } from './country-sources'
import {
  countryBoundariesSchema,
  countryCatalogSchema,
  countryFlagDetailsSchema,
  countrySourceRegistrySchema,
  type Country,
} from '../src/data/countrySchema'
import { cityCatalogSchema, type City } from '../src/data/citySchema'
import { priorityCityCounts, reviewedCitySelections } from './city-content'
import { countryPopulationByCode } from './country-population'
import { generateRiverGeometries } from './generate-river-geometries'
import { generateMountainGeometries } from './generate-mountain-geometries'
import { generateWaterbodyGeometries } from './generate-waterbody-geometries'
import { generateDesertGeometries } from './generate-desert-geometries'

type CitySource = {
  city: string
  city_ascii: string
  lat: string
  lng: string
  iso2: string
  capital: string
  population: string
  id: string
}

type SourceFeature = {
  type: 'Feature'
  id?: string | number
  properties: Record<string, unknown>
  geometry: {
    type: string
    coordinates: unknown[]
  } | null
}

type BoundaryGeometry = {
  type: 'Polygon' | 'MultiPolygon'
  coordinates: unknown[]
}

const projectRoot = path.resolve(import.meta.dirname, '..')
const flagViewBoxPattern = /\bviewBox\s*=\s*["']([^"']+)["']/i

function optimizeFlagSvg(svg: string, sourcePath: string) {
  const sourceViewBox = svg.match(flagViewBoxPattern)?.[1]
  const viewBox = sourceViewBox
    ? sourceViewBox
        .trim()
        .split(/[\s,]+/)
        .map(Number)
    : undefined
  const useWholeUnitPrecision =
    Buffer.byteLength(svg) > 40_000 &&
    viewBox?.length === 4 &&
    viewBox[2] >= 500 &&
    viewBox[3] >= 300

  const optimized = optimize(svg, {
    path: sourcePath,
    multipass: true,
    plugins: [
      {
        name: 'preset-default',
        params: { floatPrecision: useWholeUnitPrecision ? 0 : 1 },
      },
    ],
  }).data

  return sourceViewBox
    ? optimized.replace(flagViewBoxPattern, `viewBox="${sourceViewBox}"`)
    : optimized
}
const generatedDirectory = path.join(projectRoot, 'src/data/generated')
const flagsDirectory = path.join(projectRoot, 'public/flags')

const continentNames: Record<string, { zh: string; en: string }> = {
  Africa: { zh: '非洲', en: 'Africa' },
  Americas: { zh: '美洲', en: 'Americas' },
  Asia: { zh: '亚洲', en: 'Asia' },
  Europe: { zh: '欧洲', en: 'Europe' },
  Oceania: { zh: '大洋洲', en: 'Oceania' },
}

const languageDisplayNames = new Intl.DisplayNames(['zh-CN'], {
  type: 'language',
})
const currencyDisplayNames = new Intl.DisplayNames(['zh-CN'], {
  type: 'currency',
})

function normalizeName(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}

function findCitySource(countryCode: string, cityName: string) {
  const normalizedName = normalizeName(cityName)
  return citySource
    .filter(
      (city) =>
        city.iso2 === countryCode &&
        (normalizeName(city.city) === normalizedName ||
          normalizeName(city.city_ascii) === normalizedName),
    )
    .sort(
      (left, right) =>
        Number(right.population || 0) - Number(left.population || 0),
    )[0]
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, 'utf8')) as T
}

async function writeFormattedJson(filePath: string, value: unknown) {
  const formatted = await prettier.format(JSON.stringify(value), {
    parser: 'json',
  })
  await writeFile(filePath, formatted)
}

const citySource = await readJson<CitySource[]>(
  path.join(projectRoot, 'node_modules/world-cities-json/data/cities.json'),
)
const countryProfileContent = await readJson<
  Record<string, Country['profile']>
>(path.join(projectRoot, 'scripts/country-profile-content.json'))
type CountryFlagTranslation = {
  sourceSha256: string
  description: string | null
  meaning: string | null
  history: string | null
}
const countryFlagContent = await readJson<
  Record<string, CountryFlagTranslation>
>(path.join(projectRoot, 'scripts/country-flag-content.json'))

const topology = await readJson<
  Topology<{ countries: GeometryCollection<Record<string, unknown>> }>
>(path.join(projectRoot, 'node_modules/world-atlas/countries-110m.json'))

const rawFeatureCollection = feature(
  topology,
  topology.objects.countries,
) as unknown as { type: 'FeatureCollection'; features: SourceFeature[] }

const rawFeaturesByNumericCode = new Map(
  rawFeatureCollection.features.map((sourceFeature) => [
    String(sourceFeature.id).padStart(3, '0'),
    sourceFeature,
  ]),
)

const sourceCountries = countriesSource
  .filter((country) => country.unMember || country.cca2 === 'PS')
  .sort((left, right) => left.cca2.localeCompare(right.cca2))

const targetNumericCodes = new Set(
  sourceCountries.map((country) => country.ccn3.padStart(3, '0')),
)

const availableGeometryCodes = new Set(
  rawFeatureCollection.features
    .map((countryFeature) => String(countryFeature.id).padStart(3, '0'))
    .filter((numericCode) => targetNumericCodes.has(numericCode)),
)

function findCapital(
  countryCode: string,
  capitalName: string,
): { latitude: number; longitude: number } {
  const coordinateOverride =
    capitalCoordinateOverrides[`${countryCode}:${capitalName}`]
  if (coordinateOverride) return coordinateOverride

  const alias =
    capitalNameAliases[`${countryCode}:${capitalName}`] ?? capitalName
  const normalizedAlias = normalizeName(alias)
  const matchingCity = findCitySource(countryCode, normalizedAlias)

  if (!matchingCity) {
    throw new Error(
      `Missing capital coordinates for ${countryCode}:${capitalName}`,
    )
  }

  return {
    latitude: Number(matchingCity.lat),
    longitude: Number(matchingCity.lng),
  }
}

function getChineseDisplayName(
  type: 'language' | 'currency',
  code: string,
  overrides: Record<string, string>,
) {
  const overridden = overrides[code]
  if (overridden) return overridden
  const displayNames =
    type === 'language' ? languageDisplayNames : currencyDisplayNames
  const displayed = displayNames.of(code)
  if (!displayed || displayed === code) {
    throw new Error(`Missing Chinese ${type} name for ${code}`)
  }
  return displayed
}

function generatedHighlight(
  countryName: string,
  area: number,
  landlocked: boolean,
  borderCount: number,
) {
  if (landlocked) {
    return `${countryName}是一个内陆国家，不直接濒临海洋，并与${borderCount}个主权国家接壤。`
  }
  if (borderCount === 0) {
    return `${countryName}没有陆地国界，国土面积约为${Math.round(area).toLocaleString('zh-CN')}平方千米。`
  }
  return `${countryName}拥有海岸线，并与${borderCount}个主权国家接壤，国土面积约为${Math.round(area).toLocaleString('zh-CN')}平方千米。`
}

const featuredCodes = new Set<string>(FEATURED_COUNTRY_CODES)
const sovereignCountryCodesByAlpha3 = new Map(
  sourceCountries.map((country) => [country.cca3, country.cca2]),
)

const countries: Country[] = sourceCountries.map((country) => {
  const featuredContent = featuredCodes.has(country.cca2)
    ? featuredCountryContent[
        country.cca2 as (typeof FEATURED_COUNTRY_CODES)[number]
      ]
    : undefined

  const subregionZh = subregionChineseNames[country.subregion]
  if (!subregionZh) {
    throw new Error(`Missing Chinese subregion name for ${country.subregion}`)
  }

  const population = countryPopulationByCode[country.cca2]
  if (!population) {
    throw new Error(`Missing reviewed population for ${country.cca2}`)
  }
  const profile = countryProfileContent[country.cca2]
  if (!profile) {
    throw new Error(`Missing country profile for ${country.cca2}`)
  }
  const flagTranslation = countryFlagContent[country.cca2]
  if (!flagTranslation) {
    throw new Error(`Missing flag translation for ${country.cca2}`)
  }
  const flagDetails =
    flagTranslation.description ||
    flagTranslation.meaning ||
    flagTranslation.history
      ? countryFlagDetailsSchema.parse({
          description: flagTranslation.description,
          meaning: flagTranslation.meaning,
          history: flagTranslation.history,
          sourceIds: ['cia-world-factbook'],
        })
      : null

  const borderCountryCodes = country.borders.flatMap((borderCode) => {
    const countryCode = sovereignCountryCodesByAlpha3.get(borderCode)
    return countryCode ? [countryCode] : []
  })
  const adjacentRegions = country.borders.flatMap((borderCode) => {
    const name =
      adjacentRegionNames[borderCode as keyof typeof adjacentRegionNames]
    return name
      ? [
          {
            code: borderCode as keyof typeof adjacentRegionNames,
            kind: 'region' as const,
            name,
          },
        ]
      : []
  })
  const unresolvedBorders = country.borders.filter(
    (borderCode) =>
      !sovereignCountryCodesByAlpha3.has(borderCode) &&
      !(borderCode in adjacentRegionNames),
  )
  if (unresolvedBorders.length) {
    throw new Error(
      `Unresolved border codes for ${country.cca2}: ${unresolvedBorders.join(', ')}`,
    )
  }

  const sourceCurrencies =
    Object.keys(country.currencies).length > 0
      ? country.currencies
      : countryCurrencyOverrides[country.cca2]
  if (!sourceCurrencies || Object.keys(sourceCurrencies).length === 0) {
    throw new Error(`Missing currencies for ${country.cca2}`)
  }

  const baseCountry = {
    code: country.cca2,
    alpha3Code: country.cca3,
    numericCode: country.ccn3.padStart(3, '0'),
    name: {
      zh: country.translations.zho.common,
      en: country.name.common,
    },
    officialName: {
      zh: country.translations.zho.official,
      en: country.name.official,
    },
    continent: continentNames[country.region],
    subregion: { zh: subregionZh, en: country.subregion },
    center: {
      latitude: country.latlng[0],
      longitude: country.latlng[1],
    },
    capitals: country.capital.map((capitalName) => ({
      name: {
        zh: capitalChineseNames[`${country.cca2}:${capitalName}`],
        en: capitalName,
      },
      ...findCapital(country.cca2, capitalName),
    })),
    languages: Object.entries(country.languages).map(([code, name]) => ({
      code,
      name: {
        zh: getChineseDisplayName(
          'language',
          code,
          languageChineseNameOverrides,
        ),
        en: name,
      },
    })),
    currencies: Object.entries(sourceCurrencies).map(([code, currency]) => {
      const override = currencyOverrides[code]
      return {
        code,
        symbol: override?.symbol ?? currency.symbol,
        name: override?.name ?? {
          zh: getChineseDisplayName('currency', code, {}),
          en: currency.name,
        },
      }
    }),
    areaSquareKilometers: country.area,
    population: population.population,
    populationYear: population.year,
    populationSourceId: population.sourceId,
    landlocked: country.landlocked,
    borderCountryCodes,
    adjacentRegions,
    flagAsset: `/flags/${country.cca2.toLowerCase()}.svg`,
    flagDetails,
    hasGeometry: availableGeometryCodes.has(country.ccn3.padStart(3, '0')),
    profile,
  }

  for (const capital of baseCountry.capitals) {
    if (!capital.name.zh) {
      throw new Error(
        `Missing Chinese capital name for ${country.cca2}:${capital.name.en}`,
      )
    }
  }

  return featuredContent
    ? { ...baseCountry, featured: true as const, ...featuredContent }
    : {
        ...baseCountry,
        featured: false as const,
        highlights: [
          {
            text: generatedHighlight(
              country.translations.zho.common,
              country.area,
              country.landlocked,
              borderCountryCodes.length,
            ),
            sourceIds: ['world-countries'],
          },
        ] as const,
      }
})

const countriesByNumericCode = new Map(
  countries.map((country) => [country.numericCode, country]),
)

const antarcticaSourceFeature = rawFeaturesByNumericCode.get('010')
if (
  !antarcticaSourceFeature?.geometry ||
  (antarcticaSourceFeature.geometry.type !== 'Polygon' &&
    antarcticaSourceFeature.geometry.type !== 'MultiPolygon')
) {
  throw new Error('Missing World Atlas Antarctica geometry 010')
}

const cities: City[] = countries.flatMap((country) => {
  const capitalCities = country.capitals.map((capital, index) => {
    const alias =
      capitalNameAliases[`${country.code}:${capital.name.en}`] ??
      capital.name.en
    const matchingCity = findCitySource(country.code, alias)

    return {
      id: `${country.code.toLowerCase()}-${slugify(capital.name.en)}`,
      countryCode: country.code,
      name: capital.name,
      latitude: capital.latitude,
      longitude: capital.longitude,
      population: matchingCity?.population
        ? Number(matchingCity.population)
        : null,
      isCapital: true,
      order: index + 1,
      reasons: ['capital'] as City['reasons'],
      sourceIds: matchingCity
        ? ['world-countries', 'world-cities']
        : ['world-countries'],
    }
  })

  const reviewedSelections =
    reviewedCitySelections[
      country.code as keyof typeof reviewedCitySelections
    ] ?? []
  const reviewedCities = reviewedSelections.map((selection, index) => {
    const matchingCity = findCitySource(country.code, selection.sourceName)
    if (!matchingCity) {
      throw new Error(
        `Missing reviewed city coordinates for ${country.code}:${selection.sourceName}`,
      )
    }
    const topPopulationCandidates = citySource
      .filter(
        (city) =>
          city.iso2 === country.code && Number(city.population || 0) > 0,
      )
      .sort(
        (left, right) =>
          Number(right.population || 0) - Number(left.population || 0),
      )
      .slice(0, 10)
    const isTopPopulationCandidate = topPopulationCandidates.some(
      (city) => city.id === matchingCity.id,
    )
    const hasReviewedReplacementReason = selection.reasons.some(
      (reason) => reason !== 'population_center',
    )
    if (!isTopPopulationCandidate && !hasReviewedReplacementReason) {
      throw new Error(
        `Reviewed city outside the population top ten needs a non-population reason: ${country.code}:${selection.sourceName}`,
      )
    }

    return {
      id: `${country.code.toLowerCase()}-${slugify(selection.sourceName)}`,
      countryCode: country.code,
      name: {
        zh: selection.nameZh,
        en: selection.sourceName,
      },
      latitude: Number(matchingCity.lat),
      longitude: Number(matchingCity.lng),
      population: matchingCity.population
        ? Number(matchingCity.population)
        : null,
      isCapital: false,
      order: capitalCities.length + index + 1,
      reasons: selection.reasons,
      sourceIds: ['world-cities', 'scio-geo-city-review'],
    }
  })

  const expectedCount =
    priorityCityCounts[country.code as keyof typeof priorityCityCounts]
  if (
    expectedCount &&
    capitalCities.length + reviewedCities.length !== expectedCount
  ) {
    throw new Error(
      `Unexpected reviewed city count for ${country.code}: expected ${expectedCount}, received ${capitalCities.length + reviewedCities.length}`,
    )
  }

  return [...capitalCities, ...reviewedCities]
})

const boundaries = {
  type: 'FeatureCollection' as const,
  features: rawFeatureCollection.features.flatMap((sourceFeature) => {
    const numericCode = String(sourceFeature.id).padStart(3, '0')
    const country = countriesByNumericCode.get(numericCode)
    if (!country || !sourceFeature.geometry) return []
    if (
      sourceFeature.geometry.type !== 'Polygon' &&
      sourceFeature.geometry.type !== 'MultiPolygon'
    ) {
      return []
    }

    const supplementalSourceFeatures = (
      countryBoundaryGeometrySupplements[numericCode] ?? []
    ).map((supplementalNumericCode) => {
      const supplementalFeature = rawFeaturesByNumericCode.get(
        supplementalNumericCode,
      )
      if (
        !supplementalFeature?.geometry ||
        (supplementalFeature.geometry.type !== 'Polygon' &&
          supplementalFeature.geometry.type !== 'MultiPolygon')
      ) {
        throw new Error(
          `Missing boundary geometry supplement ${supplementalNumericCode} for ${country.code}`,
        )
      }
      return supplementalFeature
    })
    const sourceGeometries = [
      sourceFeature.geometry as BoundaryGeometry,
      ...supplementalSourceFeatures.map(
        (feature) => feature.geometry as BoundaryGeometry,
      ),
    ]
    const geometry: BoundaryGeometry =
      sourceGeometries.length === 1
        ? sourceGeometries[0]
        : {
            type: 'MultiPolygon',
            coordinates: sourceGeometries.flatMap((sourceGeometry) =>
              sourceGeometry.type === 'Polygon'
                ? [sourceGeometry.coordinates]
                : sourceGeometry.coordinates,
            ),
          }

    return [
      {
        type: 'Feature' as const,
        properties: {
          code: country.code,
          nameZh: country.name.zh,
          nameEn: country.name.en,
        },
        geometry,
      },
    ]
  }),
  landmasses: [
    {
      type: 'Feature' as const,
      properties: {
        id: 'antarctica' as const,
        nameZh: '南极洲' as const,
        nameEn: 'Antarctica' as const,
      },
      geometry: antarcticaSourceFeature.geometry as BoundaryGeometry,
    },
  ] as const,
}

countryCatalogSchema.parse(countries)
cityCatalogSchema.parse(cities)
countryBoundariesSchema.parse(boundaries)
countrySourceRegistrySchema.parse(countrySources)

await mkdir(generatedDirectory, { recursive: true })
await rm(flagsDirectory, { recursive: true, force: true })
await mkdir(flagsDirectory, { recursive: true })

await writeFormattedJson(
  path.join(generatedDirectory, 'countries.json'),
  countries,
)
await writeFormattedJson(
  path.join(generatedDirectory, 'country-sources.json'),
  countrySources,
)
await writeFormattedJson(
  path.join(generatedDirectory, 'country-boundaries.json'),
  boundaries,
)
await writeFormattedJson(path.join(generatedDirectory, 'cities.json'), cities)
const riverGeometries = await generateRiverGeometries()
const mountainGeometries = await generateMountainGeometries()
const waterbodyGeometries = await generateWaterbodyGeometries()
const desertGeometries = await generateDesertGeometries()

await Promise.all(
  countries.map(async (country) => {
    const code = country.code.toLowerCase()
    const sourcePath = path.join(
      projectRoot,
      `node_modules/svg-country-flags/svg/${code}.svg`,
    )
    const svg = await readFile(sourcePath, 'utf8')
    await writeFile(
      path.join(flagsDirectory, `${code}.svg`),
      optimizeFlagSvg(svg, sourcePath),
    )
  }),
)

console.log(
  `Generated ${countries.length} countries, ${cities.length} capital and reviewed city entries, ${boundaries.features.length} boundaries, ${riverGeometries.length} river geometries, ${mountainGeometries.length} mountain geometries, ${waterbodyGeometries.length} surface waterbody geometries, ${desertGeometries.length} desert geometries, and ${countries.length} local flags.`,
)
