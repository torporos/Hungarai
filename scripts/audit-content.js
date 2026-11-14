import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compileContent, readContentPacks } from './build-content.js'
import { analyzeTargets } from './content-targets.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

async function auditContent() {
  const packs = await readContentPacks()
  const content = compileContent(packs)
  const targets = JSON.parse(await readFile(resolve(root, 'content', 'targets.json'), 'utf8'))
  const report = analyzeTargets(content, packs, targets)

  for (const quarter of report.quarters) {
    console.log(`\n${quarter.id.toUpperCase()} · ${quarter.title}: ${quarter.actualWords}/${quarter.vocabulary_target} words, ${quarter.exerciseSentences}/${quarter.exercise_sentence_target} exercise sentences, ${quarter.stories}/${quarter.requiredStories} stories`)
    for (const category of quarter.categories) {
      console.log(`  ${category.complete ? 'OK' : 'TODO'} ${category.id}: ${category.actual}/${category.target}`)
    }
    for (const topic of quarter.grammarTopics) {
      console.log(`  ${topic.complete ? 'OK' : 'TODO'} grammar ${topic.id}`)
    }
  }
  if (report.unassignedPacks.length) console.log(`\nPacks without a valid quarter: ${report.unassignedPacks.join(', ')}`)
  for (const issue of report.progressionIssues) console.log(`\nProgression issue: ${issue}`)
  console.log(`\n${report.complete
    ? 'All design targets are met.'
    : 'Curriculum is incomplete; full-curriculum export remains blocked. Q1-Q2 can be exported with content:build:q2.'}`)
}

auditContent().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
