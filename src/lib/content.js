import vocabularyFallback from '../data/vocabulary.json' with { type: 'json' }
import exercisesFallback from '../data/exercises.json' with { type: 'json' }
import storiesFallback from '../data/stories.json' with { type: 'json' }
import lessonsFallback from '../data/lessons.json' with { type: 'json' }
import grammarFallback from '../data/grammar.json' with { type: 'json' }

export const CONTENT_BASE_URL = 'https://raw.githubusercontent.com/torporos/Hungarai/main/src/data'
export const CONTENT_CACHE_KEY = 'hungarai-content-v1'

const contentFiles = {
  vocabulary: 'vocabulary.json',
  exercises: 'exercises.json',
  stories: 'stories.json',
  lessons: 'lessons.json',
  grammar: 'grammar.json',
}

const bundledContent = {
  vocabulary: vocabularyFallback,
  exercises: exercisesFallback,
  stories: storiesFallback,
  lessons: lessonsFallback,
  grammar: grammarFallback,
}

const choiceQuestionTypes = new Set(['harmony', 'cloze', 'vocabulary', 'phonetics', 'listening'])

function assertArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be a JSON array.`)
}

function assertUniqueIds(items, label) {
  const seen = new Set()
  for (const item of items) {
    if (typeof item.id !== 'string' || !item.id) throw new Error(`${label} contains an item without an ID.`)
    if (seen.has(item.id)) throw new Error(`${label} contains duplicate ID "${item.id}".`)
    seen.add(item.id)
  }
  return seen
}

function assertReferences(ids, availableIds, label) {
  for (const id of ids) {
    if (!availableIds.has(id)) throw new Error(`${label} refers to missing ID "${id}".`)
  }
}

export function validateContent(content) {
  for (const name of Object.keys(contentFiles)) assertArray(content[name], name)

  const vocabularyIds = assertUniqueIds(content.vocabulary, 'vocabulary.json')
  const exerciseIds = assertUniqueIds(content.exercises, 'exercises.json')
  const storyIds = assertUniqueIds(content.stories, 'stories.json')
  const lessonIds = assertUniqueIds(content.lessons, 'lessons.json')
  const grammarIds = assertUniqueIds(content.grammar, 'grammar.json')

  for (const lesson of content.lessons) {
    assertArray(lesson.vocabulary_ids, `lesson "${lesson.id}" vocabulary_ids`)
    assertArray(lesson.new_vocabulary_ids, `lesson "${lesson.id}" new_vocabulary_ids`)
    assertArray(lesson.grammar_ids, `lesson "${lesson.id}" grammar_ids`)
    assertArray(lesson.exercise_ids, `lesson "${lesson.id}" exercise_ids`)
    assertArray(lesson.story_ids, `lesson "${lesson.id}" story_ids`)
    assertArray(lesson.prerequisite_lesson_ids, `lesson "${lesson.id}" prerequisite_lesson_ids`)
    assertReferences(lesson.vocabulary_ids, vocabularyIds, `lesson "${lesson.id}" vocabulary_ids`)
    assertReferences(lesson.new_vocabulary_ids, vocabularyIds, `lesson "${lesson.id}" new_vocabulary_ids`)
    assertReferences(lesson.grammar_ids, grammarIds, `lesson "${lesson.id}" grammar_ids`)
    assertReferences(lesson.exercise_ids, exerciseIds, `lesson "${lesson.id}" exercise_ids`)
    assertReferences(lesson.story_ids, storyIds, `lesson "${lesson.id}" story_ids`)
    assertReferences(lesson.prerequisite_lesson_ids, lessonIds, `lesson "${lesson.id}" prerequisite_lesson_ids`)
  }

  for (const exercise of content.exercises) {
    if (exercise.vocabulary_id) assertReferences([exercise.vocabulary_id], vocabularyIds, `exercise "${exercise.id}"`)
    if (exercise.grammar_id) assertReferences([exercise.grammar_id], grammarIds, `exercise "${exercise.id}"`)
    if (choiceQuestionTypes.has(exercise.type)) {
      assertArray(exercise.options_cs, `exercise "${exercise.id}" options_cs`)
      if (exercise.options_cs.length < 3 || !Number.isInteger(exercise.answer_index)
        || exercise.answer_index < 0 || exercise.answer_index >= exercise.options_cs.length) {
        throw new Error(`Exercise "${exercise.id}" has invalid answer choices.`)
      }
    }
    if (exercise.type === 'recall' && (!Array.isArray(exercise.accepted_answers) || !exercise.accepted_answers.length)) {
      throw new Error(`Exercise "${exercise.id}" has no accepted answers.`)
    }
    if (exercise.type === 'order' && (!Array.isArray(exercise.accepted_orders) || !exercise.accepted_orders.length)) {
      throw new Error(`Exercise "${exercise.id}" has no accepted sentence orders.`)
    }
  }

  for (const story of content.stories) {
    assertArray(story.prerequisite_lesson_ids, `story "${story.id}" prerequisite_lesson_ids`)
    assertArray(story.vocabulary_ids, `story "${story.id}" vocabulary_ids`)
    assertArray(story.segments, `story "${story.id}" segments`)
    assertArray(story.questions, `story "${story.id}" questions`)
    assertReferences(story.prerequisite_lesson_ids, lessonIds, `story "${story.id}" prerequisite_lesson_ids`)
    assertReferences(story.vocabulary_ids, vocabularyIds, `story "${story.id}" vocabulary_ids`)
    for (const segment of story.segments) {
      if (segment.vocabulary_id) assertReferences([segment.vocabulary_id], vocabularyIds, `story "${story.id}" segment`)
    }
    for (const question of story.questions) {
      assertArray(question.options_cs, `story question "${question.id}" options_cs`)
      if (question.options_cs.length < 3 || !Number.isInteger(question.answer_index)
        || question.answer_index < 0 || question.answer_index >= question.options_cs.length) {
        throw new Error(`Story question "${question.id}" has invalid answer choices.`)
      }
    }
  }

  return content
}

function getStorage(storage) {
  if (storage !== undefined) return storage
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function readCachedContent(storage) {
  if (!storage) return { content: null, warning: 'Místní úložiště není dostupné.' }
  try {
    const saved = JSON.parse(storage.getItem(CONTENT_CACHE_KEY) || 'null')
    if (!saved) return { content: null, warning: '' }
    return {
      content: validateContent(saved.content),
      loadedAt: typeof saved.loadedAt === 'string' ? saved.loadedAt : null,
      warning: '',
    }
  } catch {
    return { content: null, warning: 'Uloženou offline kopii se nepodařilo ověřit.' }
  }
}

function saveCachedContent(storage, content, loadedAt) {
  if (!storage) return 'Offline kopii se nepodařilo uložit do místního úložiště.'
  try {
    storage.setItem(CONTENT_CACHE_KEY, JSON.stringify({ content, loadedAt }))
    return ''
  } catch {
    return 'Offline kopii se nepodařilo uložit do místního úložiště.'
  }
}

export async function loadContent({
  baseUrl = CONTENT_BASE_URL,
  fetcher = globalThis.fetch,
  signal,
  storage,
  timeoutMs = 10000,
} = {}) {
  const cacheStorage = getStorage(storage)
  const requestController = new AbortController()
  const abortRequest = () => requestController.abort()
  if (signal?.aborted) requestController.abort()
  else signal?.addEventListener('abort', abortRequest, { once: true })
  const timeoutId = setTimeout(abortRequest, timeoutMs)
  let remoteError

  try {
    if (typeof fetcher !== 'function') throw new Error('Tento prohlížeč nepodporuje načítání obsahu.')
    const entries = await Promise.all(Object.entries(contentFiles).map(async ([name, filename]) => {
      const response = await fetcher(`${baseUrl}/${filename}`, {
        cache: 'no-store',
        signal: requestController.signal,
      })
      if (!response.ok) throw new Error(`GitHub vrátil chybu HTTP ${response.status} pro ${filename}.`)

      let data
      try {
        data = await response.json()
      } catch {
        throw new Error(`Soubor ${filename} z GitHubu neobsahuje platný JSON.`)
      }
      return [name, data]
    }))

    const content = validateContent(Object.fromEntries(entries))
    const loadedAt = new Date().toISOString()
    const cacheWarning = saveCachedContent(cacheStorage, content, loadedAt)
    return { ...content, source: 'github', loadedAt, loadWarning: cacheWarning }
  } catch (error) {
    if (signal?.aborted) throw error
    remoteError = requestController.signal.aborted
      ? new Error('Načítání obsahu z GitHubu překročilo časový limit.')
      : error
  } finally {
    clearTimeout(timeoutId)
    signal?.removeEventListener('abort', abortRequest)
  }

  const cached = readCachedContent(cacheStorage)
  if (cached.content) {
    return {
      ...cached.content,
      source: 'cache',
      loadedAt: cached.loadedAt,
      loadWarning: `GitHub není dostupný (${remoteError.message}). Používají se naposledy uložená data.`,
    }
  }

  const content = validateContent(bundledContent)
  const cacheWarning = cached.warning ? ` ${cached.warning}` : ''
  return {
    ...content,
    source: 'bundled',
    loadedAt: null,
    loadWarning: `GitHub není dostupný (${remoteError.message}). Používá se obsah přibalený v aplikaci.${cacheWarning}`,
  }
}
