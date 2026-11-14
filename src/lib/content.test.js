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

test('reports remote HTTP failures', async () => {
  await assert.rejects(
    loadContent({ fetcher: async () => ({ ok: false, status: 404 }) }),
    /HTTP 404/u,
  )
})
