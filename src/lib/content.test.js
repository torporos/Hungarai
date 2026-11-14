import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { loadContent, validateContent } from './content.js'

function validContent() {
  return {
    vocabulary: [{ id: 'word-a', word: 'ház' }],
    exercises: [{ id: 'exercise-a', type: 'recall', vocabulary_id: 'word-a', accepted_answers: ['ház'] }],
    stories: [{
      id: 'story-a',
      prerequisite_lesson_ids: [],
      vocabulary_ids: ['word-a'],
      segments: [{ text: 'ház', vocabulary_id: 'word-a' }],
      questions: [{ id: 'question-a', options_cs: ['dům', 'stůl', 'voda'], answer_index: 0 }],
    }],
    lessons: [{
      id: 'lesson-a',
      vocabulary_ids: ['word-a'],
      new_vocabulary_ids: ['word-a'],
      grammar_ids: ['grammar-a'],
      exercise_ids: ['exercise-a'],
      story_ids: ['story-a'],
      prerequisite_lesson_ids: [],
    }],
    grammar: [{ id: 'grammar-a' }],
  }
}

function memoryStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  }
}

test('validates lesson content and cross-file references', () => {
  const content = validContent()
  assert.equal(validateContent(content), content)
})

test('rejects broken lesson references', () => {
  const content = validContent()
  content.lessons[0].exercise_ids = ['missing-exercise']
  assert.throws(() => validateContent(content), /missing ID "missing-exercise"/u)
})

test('published curriculum data is linked and lessons include reinforcement practice', () => {
  const content = Object.fromEntries(['vocabulary', 'exercises', 'stories', 'lessons', 'grammar'].map((name) => [
    name,
    JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url), 'utf8')),
  ]))

  validateContent(content)
  for (const lesson of content.lessons) {
    assert.ok(
      lesson.exercise_ids.length >= lesson.new_vocabulary_ids.length + 3,
      `${lesson.id} needs more than one exercise per new word`,
    )
  }

  const q1Vocabulary = content.vocabulary.filter((word) => word.tags?.includes('military_basic'))
  assert.equal(q1Vocabulary.length, 50)

  const q1Lessons = content.lessons.filter((lesson) => lesson.theme_id === 'q1-novacek-kasarny')
  assert.equal(q1Lessons.length, 5)
  for (const lesson of q1Lessons) {
    const story = content.stories.find((item) => item.id === lesson.story_ids[0])
    assert.equal(story.curriculum_lesson_id, lesson.id)
  }
})

test('loads all curriculum files from the configured remote base URL', async () => {
  const content = validContent()
  const requests = []
  const result = await loadContent({
    fetcher: async (url) => {
      requests.push(url)
      const name = url.split('/').pop().replace('.json', '')
      return { ok: true, json: async () => content[name] }
    },
  })

  assert.equal(requests.length, 5)
  assert.equal(result.lessons[0].id, 'lesson-a')
  assert.ok(requests.every((url) => url.startsWith('https://raw.githubusercontent.com/torporos/Hungarai/main/src/data/')))
})

test('uses its last successful GitHub response when offline', async () => {
  const storage = memoryStorage()
  const content = validContent()
  const online = await loadContent({
    storage,
    fetcher: async (url) => {
      const name = url.split('/').pop().replace('.json', '')
      return { ok: true, json: async () => content[name] }
    },
  })
  const offline = await loadContent({ storage, fetcher: async () => { throw new Error('offline') } })

  assert.equal(online.source, 'github')
  assert.equal(offline.source, 'cache')
  assert.equal(offline.lessons[0].id, 'lesson-a')
  assert.match(offline.loadWarning, /offline/u)
})

test('uses bundled lesson data if GitHub and the offline cache are unavailable', async () => {
  const content = await loadContent({ storage: memoryStorage(), fetcher: async () => { throw new Error('offline') } })

  assert.equal(content.source, 'bundled')
  assert.equal(content.lessons.length, 18)
  assert.ok(content.exercises.length >= 90)
})

test('does not turn a cancelled load into an offline fallback', async () => {
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(
    loadContent({ signal: controller.signal, storage: memoryStorage(), fetcher: async () => { throw new Error('aborted') } }),
    /aborted/u,
  )
})
