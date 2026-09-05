import Dexie, { type EntityTable } from 'dexie'
import { z } from 'zod'

export const experiencePreferencesSchema = z.object({
  id: z.literal('current'),
  autoRotate: z.boolean(),
  quality: z.enum(['balanced', 'low']),
  updatedAt: z.number().int().nonnegative(),
})

export type ExperiencePreferences = z.infer<typeof experiencePreferencesSchema>

export const questionChallengeProgressSchema = z.object({
  challengeId: z
    .string()
    .regex(/^(world|asia|europe|africa|americas|oceania):(easy|normal|hard)$/),
  bestScore: z.number().int().min(0).max(100),
  lastScore: z.number().int().min(0).max(100),
  attemptCount: z.number().int().nonnegative(),
  passedAt: z.number().int().nonnegative().nullable(),
  updatedAt: z.number().int().nonnegative(),
})

export type QuestionChallengeProgress = z.infer<
  typeof questionChallengeProgressSchema
>

export type PersistenceStatus =
  'idle' | 'saving' | 'saved' | 'memory-only' | 'error'

export type PersistenceOutcome<T> = {
  value: T
  status: Extract<PersistenceStatus, 'saved' | 'memory-only' | 'error'>
}

const defaultPreferences: ExperiencePreferences = {
  id: 'current',
  autoRotate: true,
  quality: 'balanced',
  updatedAt: 0,
}

type QuestionProgressMigrationTransaction = {
  table: (name: 'questionProgress') => {
    clear: () => void | PromiseLike<unknown>
  }
}

export function clearLegacyQuestionProgress(
  transaction: QuestionProgressMigrationTransaction,
) {
  return transaction.table('questionProgress').clear()
}

class ScioGeoDatabase extends Dexie {
  preferences!: EntityTable<ExperiencePreferences, 'id'>
  questionProgress!: EntityTable<QuestionChallengeProgress, 'challengeId'>

  constructor() {
    super('scio-geo')
    this.version(1).stores({
      preferences: 'id, updatedAt',
    })
    this.version(2).stores({
      preferences: 'id, updatedAt',
      knowledgeProgress: 'regionId, updatedAt, passedAt',
    })
    this.version(3).stores({
      preferences: 'id, updatedAt',
      knowledgeProgress: null,
      questionProgress: 'challengeId, updatedAt, passedAt',
    })
    this.version(4)
      .stores({
        preferences: 'id, updatedAt',
        questionProgress: 'challengeId, updatedAt, passedAt',
      })
      .upgrade((transaction) => clearLegacyQuestionProgress(transaction))
  }
}

let database: ScioGeoDatabase | undefined

function getDatabase() {
  if (typeof indexedDB === 'undefined') return undefined
  database ??= new ScioGeoDatabase()
  return database
}

export async function loadExperiencePreferences() {
  const table = getDatabase()?.preferences
  if (!table) {
    return {
      value: defaultPreferences,
      status: 'memory-only',
    } satisfies PersistenceOutcome<ExperiencePreferences>
  }
  try {
    const stored = await table.get('current')
    const parsed = experiencePreferencesSchema.safeParse(stored)
    return {
      value: parsed.success ? parsed.data : defaultPreferences,
      status: 'saved',
    } satisfies PersistenceOutcome<ExperiencePreferences>
  } catch {
    return {
      value: defaultPreferences,
      status: 'error',
    } satisfies PersistenceOutcome<ExperiencePreferences>
  }
}

export async function saveExperiencePreferences(
  preferences: Pick<ExperiencePreferences, 'autoRotate' | 'quality'>,
) {
  const table = getDatabase()?.preferences
  if (!table) {
    return {
      value: preferences,
      status: 'memory-only',
    } satisfies PersistenceOutcome<typeof preferences>
  }
  try {
    await table.put({
      id: 'current',
      ...preferences,
      updatedAt: Date.now(),
    })
    return { value: preferences, status: 'saved' } satisfies PersistenceOutcome<
      typeof preferences
    >
  } catch {
    return { value: preferences, status: 'error' } satisfies PersistenceOutcome<
      typeof preferences
    >
  }
}

export function mergeQuestionChallengeResult(
  current: QuestionChallengeProgress | undefined,
  challengeId: string,
  score: number,
  now = Date.now(),
): QuestionChallengeProgress {
  const normalizedScore = Math.min(100, Math.max(0, Math.round(score)))
  return {
    challengeId,
    bestScore: Math.max(current?.bestScore ?? 0, normalizedScore),
    lastScore: normalizedScore,
    attemptCount: (current?.attemptCount ?? 0) + 1,
    passedAt: current?.passedAt ?? (normalizedScore >= 80 ? now : null),
    updatedAt: now,
  }
}

export async function loadQuestionProgress() {
  const table = getDatabase()?.questionProgress
  if (!table) {
    return {
      value: [],
      status: 'memory-only',
    } satisfies PersistenceOutcome<QuestionChallengeProgress[]>
  }
  try {
    const stored = await table.toArray()
    return {
      value: stored.flatMap((progress) => {
        const parsed = questionChallengeProgressSchema.safeParse(progress)
        return parsed.success ? [parsed.data] : []
      }),
      status: 'saved',
    } satisfies PersistenceOutcome<QuestionChallengeProgress[]>
  } catch {
    return {
      value: [],
      status: 'error',
    } satisfies PersistenceOutcome<QuestionChallengeProgress[]>
  }
}

export async function saveQuestionChallengeResult(
  challengeId: string,
  score: number,
) {
  const table = getDatabase()?.questionProgress
  if (!table) {
    const value = mergeQuestionChallengeResult(undefined, challengeId, score)
    return {
      value,
      status: 'memory-only',
    } satisfies PersistenceOutcome<QuestionChallengeProgress>
  }
  try {
    const current = await table.get(challengeId)
    const next = mergeQuestionChallengeResult(current, challengeId, score)
    await table.put(next)
    return {
      value: next,
      status: 'saved',
    } satisfies PersistenceOutcome<QuestionChallengeProgress>
  } catch {
    const value = mergeQuestionChallengeResult(undefined, challengeId, score)
    return {
      value,
      status: 'error',
    } satisfies PersistenceOutcome<QuestionChallengeProgress>
  }
}
