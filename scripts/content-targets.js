export function analyzeTargets(content, packs, targets) {
  const packQuarter = new Map(packs.map((pack) => [pack.lesson.id, pack.quarter]))
  const packByLesson = new Map(packs.map((pack) => [pack.lesson.id, pack]))
  const quarterOrder = new Map(targets.quarters.map((quarter, index) => [quarter.id, index]))
  const report = targets.quarters.map((quarter) => {
    const quarterWords = content.vocabulary.filter((word) => word.tags?.includes(quarter.id))
    const quarterPacks = packs.filter((pack) => pack.quarter === quarter.id)
    const categories = quarter.categories.map((category) => {
      const actual = quarterWords.filter((word) => word.tags?.includes(category.id)).length
      return { ...category, actual, complete: actual >= category.target }
    })
    const grammarTopics = quarter.grammar_topics.map((topic) => {
      const actual = content.grammar.filter((item) => item.tags?.includes(quarter.id)
        && item.tags.includes(topic)).length
      return { id: topic, actual, complete: actual > 0 }
    })
    const exerciseSentences = quarterPacks
      .flatMap((pack) => pack.exercises)
      .filter((exercise) => (typeof exercise.sentence_hu === 'string' && exercise.sentence_hu.trim())
        || (Array.isArray(exercise.accepted_orders) && exercise.accepted_orders.length))
      .length
    const stories = content.stories.filter((story) => packQuarter.get(story.curriculum_lesson_id) === quarter.id).length
    const requiredStories = Math.ceil(quarterWords.length / targets.stories_per_words)

    return {
      ...quarter,
      actualWords: quarterWords.length,
      categories,
      grammarTopics,
      exerciseSentences,
      stories,
      requiredStories,
      complete: quarterWords.length >= quarter.vocabulary_target
        && categories.every((category) => category.complete)
        && grammarTopics.every((topic) => topic.complete)
        && exerciseSentences >= quarter.exercise_sentence_target
        && stories >= requiredStories
        && quarterPacks.length > 0,
    }
  })

  const unassignedPacks = packs.filter((pack) => !targets.quarters.some((quarter) => quarter.id === pack.quarter))
  const orderedPacks = [...packs].sort((left, right) => left.order - right.order)
  const progressionIssues = []
  for (const [index, pack] of orderedPacks.entries()) {
    if (index > 0 && quarterOrder.get(pack.quarter) < quarterOrder.get(orderedPacks[index - 1].quarter)) {
      progressionIssues.push(`${pack.lesson.id} is out of quarter order.`)
    }
    for (const prerequisiteId of pack.lesson.prerequisite_lesson_ids) {
      const prerequisite = packByLesson.get(prerequisiteId)
      if (prerequisite && (prerequisite.order >= pack.order
        || quarterOrder.get(prerequisite.quarter) > quarterOrder.get(pack.quarter))) {
        progressionIssues.push(`${pack.lesson.id} has a backward prerequisite: ${prerequisiteId}.`)
      }
    }
  }

  return {
    quarters: report,
    unassignedPacks: unassignedPacks.map((pack) => pack.lesson.id),
    progressionIssues,
    complete: report.every((quarter) => quarter.complete)
      && unassignedPacks.length === 0
      && progressionIssues.length === 0,
  }
}

export function assertTargetsSatisfied(report, requiredQuarterIds = report.quarters.map(({ id }) => id)) {
  const requiredIds = new Set(requiredQuarterIds)
  const requiredQuarters = report.quarters.filter((quarter) => requiredIds.has(quarter.id))
  if (requiredQuarters.length !== requiredIds.size) {
    throw new Error('Export target includes an unknown quarter.')
  }
  if (requiredQuarters.every((quarter) => quarter.complete)
    && report.unassignedPacks.length === 0
    && report.progressionIssues.length === 0) return

  const deficits = []
  for (const quarter of requiredQuarters) {
    if (quarter.actualWords < quarter.vocabulary_target) {
      deficits.push(`${quarter.id}: vocabulary ${quarter.actualWords}/${quarter.vocabulary_target}`)
    }
    for (const category of quarter.categories) {
      if (!category.complete) deficits.push(`${quarter.id}/${category.id}: ${category.actual}/${category.target}`)
    }
    for (const topic of quarter.grammarTopics) {
      if (!topic.complete) deficits.push(`${quarter.id}/grammar ${topic.id}: missing`)
    }
    if (quarter.exerciseSentences < quarter.exercise_sentence_target) {
      deficits.push(`${quarter.id}: exercise sentences ${quarter.exerciseSentences}/${quarter.exercise_sentence_target}`)
    }
    if (quarter.stories < quarter.requiredStories) {
      deficits.push(`${quarter.id}: stories ${quarter.stories}/${quarter.requiredStories}`)
    }
  }
  if (report.unassignedPacks.length) deficits.push(`Packs without a valid quarter: ${report.unassignedPacks.join(', ')}`)
  if (report.progressionIssues.length) deficits.push(...report.progressionIssues)

  throw new Error(`Design-document targets are incomplete; app JSON was not generated:\n- ${deficits.join('\n- ')}`)
}
