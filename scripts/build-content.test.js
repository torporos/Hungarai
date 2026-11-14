import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildContent } from './build-content.js'

test('Q2-limited export contains only the completed Q1-Q2 curriculum', async () => {
  const outputDirectory = await mkdtemp(join(tmpdir(), 'hungarai-q2-export-'))
  try {
    await buildContent({ outputDirectory, throughQuarter: 'q2' })
    const [vocabulary, lessons] = await Promise.all(['vocabulary', 'lessons'].map(async (name) =>
      JSON.parse(await readFile(join(outputDirectory, `${name}.json`), 'utf8'))))
    const lessonIds = new Set(lessons.map(({ id }) => id))
    const q2Words = vocabulary.filter((word) => word.tags?.includes('q2'))

    assert.equal(q2Words.length, 360)
    assert.ok(lessonIds.has('varosi-igek-a'))
    assert.ok(lessonIds.has('varosi-igek-b'))
    assert.ok(!lessonIds.has('cesta-vlakem-1913'))
    assert.ok(!vocabulary.some((word) => word.tags?.includes('q3') || word.tags?.includes('q4')))
  } finally {
    await rm(outputDirectory, { recursive: true, force: true })
  }
})

test('default export generates the complete Q1-Q4 curriculum', async () => {
  const outputDirectory = await mkdtemp(join(tmpdir(), 'hungarai-full-export-'))
  try {
    const counts = await buildContent({ outputDirectory })
    const [vocabulary, lessons] = await Promise.all(['vocabulary', 'lessons'].map(async (name) =>
      JSON.parse(await readFile(join(outputDirectory, `${name}.json`), 'utf8'))))

    assert.ok(counts.vocabulary > 1400)
    assert.equal(vocabulary.filter((word) => word.tags?.includes('q4')).length, 450)
    assert.ok(lessons.some(({ id }) => id === 'bureaucracy-and-law-a'))
  } finally {
    await rm(outputDirectory, { recursive: true, force: true })
  }
})
