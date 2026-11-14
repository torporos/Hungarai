const STORAGE_KEY = 'hungarai-progress-v1'

const initialProgress = {
  xp: 0,
  completed_lessons: [],
  reviews: {},
}

export function loadProgress() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (!stored || typeof stored !== 'object') return initialProgress
    return {
      ...initialProgress,
      ...stored,
      xp: Number.isFinite(stored.xp) ? stored.xp : 0,
      completed_lessons: Array.isArray(stored.completed_lessons) ? stored.completed_lessons : [],
      reviews: stored.reviews && typeof stored.reviews === 'object' ? stored.reviews : {},
    }
  } catch {
    const error = 'Uložený pokrok se nepodařilo načíst. Začínáte s čistým rozvrhem.'
    console.error(error)
    return { ...initialProgress, storage_error: error }
  }
}

export function saveProgress(progress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress))
    return true
  } catch (error) {
    console.error('Pokrok se nepodařilo uložit do místního úložiště.', error)
    return false
  }
}

export function recordAnswer(progress, vocabularyId, correct) {
  const previous = progress.reviews[vocabularyId] || { stability: 1, difficulty: 5, repetitions: 0 }
  const difficulty = Math.max(1, Math.min(10, previous.difficulty + (correct ? -0.2 : 0.8)))
  const stability = correct
    ? Math.max(1, previous.stability * (1.45 + (10 - difficulty) * 0.06))
    : Math.max(0.25, previous.stability * 0.35)

  return {
    ...progress,
    xp: progress.xp + (correct ? 10 : 0),
    reviews: {
      ...progress.reviews,
      [vocabularyId]: {
        stability,
        difficulty,
        repetitions: previous.repetitions + 1,
        last_reviewed: new Date().toISOString(),
        due_at: new Date(Date.now() + stability * 24 * 60 * 60 * 1000).toISOString(),
      },
    },
  }
}

export function isLessonUnlocked(lesson, progress) {
  const completedLessons = progress.completed_lessons || []
  const prerequisitesMet = (lesson.prerequisite_lesson_ids || []).every((id) => completedLessons.includes(id))
  return progress.xp >= lesson.xp_required && prerequisitesMet
}

export function getDueVocabulary(progress, words, now = Date.now()) {
  return words.filter((word) => {
    const dueAt = progress.reviews[word.id]?.due_at
    return typeof dueAt === 'string' && Number.isFinite(Date.parse(dueAt)) && Date.parse(dueAt) <= now
  })
}
