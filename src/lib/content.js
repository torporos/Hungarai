import vocabularyFallback from '../data/vocabulary.json' with { type: 'json' }
import exercisesFallback from '../data/exercises.json' with { type: 'json' }
import storiesFallback from '../data/stories.json' with { type: 'json' }
import lessonsFallback from '../data/lessons.json' with { type: 'json' }
import grammarFallback from '../data/grammar.json' with { type: 'json' }
import { validateContent } from './content-validation.js'

export { validateContent } from './content-validation.js'

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
