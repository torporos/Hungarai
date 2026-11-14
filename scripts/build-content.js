import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateContent } from '../src/lib/content-validation.js'
import { analyzeTargets, assertTargetsSatisfied } from './content-targets.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const collectionNames = ['vocabulary', 'grammar', 'exercises', 'stories']
const contentNames = [...collectionNames, 'lessons']

export function compileContent(packs) {
  if (!Array.isArray(packs) || packs.length === 0) {
    throw new Error('At least one lesson pack is required.')
  }
  if (packs.some((pack) => !pack || typeof pack !== 'object' || Array.isArray(pack))) {
    throw new Error('Each lesson pack must be a JSON object.')
  }

  const orders = new Set()
  const content = Object.fromEntries(contentNames.map((name) => [name, []]))

  for (const pack of [...packs].sort((left, right) => left.order - right.order)) {
    if (!Number.isInteger(pack.order) || pack.order < 1 || orders.has(pack.order)) {
      throw new Error(`Lesson pack "${pack.lesson?.id ?? 'unknown'}" needs a unique positive order.`)
    }
    orders.add(pack.order)

    if (!pack.lesson || typeof pack.lesson !== 'object' || Array.isArray(pack.lesson)) {
      throw new Error(`Lesson pack ${pack.order} needs one lesson object.`)
    }
    content.lessons.push(pack.lesson)

    for (const name of collectionNames) {
      if (!Array.isArray(pack[name])) {
        throw new Error(`Lesson pack "${pack.lesson.id}" must define a "${name}" array.`)
      }
      content[name].push(...pack[name])
    }
  }

  return validateContent(content)
}

export async function readContentPacks(sourceDirectory = resolve(root, 'content', 'packs')) {
  const filenames = (await readdir(sourceDirectory))
    .filter((filename) => filename.toLowerCase().endsWith('.json'))
    .sort()

  if (filenames.length === 0) throw new Error(`No lesson packs found in ${sourceDirectory}.`)

  return Promise.all(filenames.map(async (filename) => {
    const path = resolve(sourceDirectory, filename)
    const source = await readFile(path, 'utf8')
    let pack
    try {
      pack = JSON.parse(source)
    } catch (error) {
      throw new Error(`Invalid JSON in ${filename}: ${error.message}`, { cause: error })
    }
    if (pack?.lesson?.id && filename !== `${pack.lesson.id}.json`) {
      throw new Error(`Filename "${filename}" must match lesson ID "${pack.lesson.id}".`)
    }
    return pack
  }))
}

async function matchesExisting(path, items, preserveOrder = false) {
  let existing
  try {
    existing = JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw new Error(`Cannot read generated content at ${path}: ${error.message}`, { cause: error })
  }

  if (!Array.isArray(existing) || existing.length !== items.length) return false
  if (preserveOrder) return JSON.stringify(existing) === JSON.stringify(items)
  const byId = (records) => [...records].sort((left, right) => left.id.localeCompare(right.id))
  return JSON.stringify(byId(existing)) === JSON.stringify(byId(items))
}

export async function buildContent({
  sourceDirectory = resolve(root, 'content', 'packs'),
  outputDirectory = resolve(root, 'src', 'data'),
  throughQuarter,
} = {}) {
  const allPacks = await readContentPacks(sourceDirectory)
  const targets = JSON.parse(await readFile(resolve(root, 'content', 'targets.json'), 'utf8'))
  const quarterIds = targets.quarters.map(({ id }) => id)
  if (allPacks.some((pack) => !quarterIds.includes(pack.quarter))) {
    throw new Error('Every lesson pack must belong to a configured quarter.')
  }

  let requiredQuarterIds = quarterIds
  let packs = allPacks
  if (throughQuarter !== undefined) {
    const throughIndex = quarterIds.indexOf(throughQuarter)
    if (throughIndex < 0) throw new Error(`Unknown export quarter "${throughQuarter}".`)
    requiredQuarterIds = quarterIds.slice(0, throughIndex + 1)
    const included = new Set(requiredQuarterIds)
    packs = allPacks.filter((pack) => included.has(pack.quarter))
  }

  const content = compileContent(packs)
  assertTargetsSatisfied(analyzeTargets(content, packs, targets), requiredQuarterIds)

  await Promise.all(contentNames.map(async (name) => {
    const path = resolve(outputDirectory, `${name}.json`)
    if (await matchesExisting(path, content[name], name === 'lessons')) return
    await writeFile(path, `${JSON.stringify(content[name], null, 2)}\n`, 'utf8')
  }))

  return Object.fromEntries(contentNames.map((name) => [name, content[name].length]))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  let options = {}
  if (args.length > 0) {
    if (args.length !== 2 || args[0] !== '--through-quarter') {
      throw new Error('Usage: node scripts/build-content.js [--through-quarter qN]')
    }
    options = { throughQuarter: args[1] }
  }

  buildContent(options)
    .then((counts) => {
      console.log(`Validated and generated content: ${Object.entries(counts).map(([name, count]) => `${name}=${count}`).join(', ')}`)
    })
    .catch((error) => {
      console.error(error)
      process.exitCode = 1
    })
}
