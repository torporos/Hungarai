import { useEffect, useMemo, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { loadProgress, saveProgress, recordAnswer, isLessonUnlocked, getDueVocabulary } from './lib/progress.js'
import { loadContent } from './lib/content.js'

const views = [
  { id: 'home', label: 'Přehled', icon: '⌂' },
  { id: 'lessons', label: 'Lekce', icon: '▤' },
  { id: 'grammar', label: 'Gramatika', icon: 'Gr' },
  { id: 'dictionary', label: 'Slovníček', icon: 'Aa' },
  { id: 'stories', label: 'Příběhy', icon: '▧' },
]

function shuffle(items) {
  const shuffled = [...items]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
  }
  return shuffled
}

function normalizeAnswer(value) {
  return value.trim().toLocaleLowerCase('hu').replace(/[.!?]+$/u, '').replace(/\s+/gu, ' ')
}

function normalizeSearch(value) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('cs')
}

const reviewLesson = { id: 'review', title_cs: 'Opakování slov' }

function App() {
  const [view, setView] = useState('home')
  const [content, setContent] = useState(null)
  const [contentError, setContentError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(true)
  const [progress, setProgress] = useState(loadProgress)
  const [storageWarning, setStorageWarning] = useState(() => progress.storage_error || '')
  const [lessonId, setLessonId] = useState(null)
  const [questionIndex, setQuestionIndex] = useState(0)
  const [questionDeck, setQuestionDeck] = useState([])
  const [answer, setAnswer] = useState(null)
  const [selectedWord, setSelectedWord] = useState(null)
  const [selectedGrammarId, setSelectedGrammarId] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    let active = true

    loadContent({ signal: controller.signal })
      .then((loadedContent) => {
        if (active) {
          setContent(loadedContent)
          setIsRefreshing(false)
        }
      })
      .catch((error) => {
        if (active && !controller.signal.aborted) {
          setContentError(error instanceof Error ? error.message : 'Nepodařilo se načíst obsah z GitHubu.')
          setIsRefreshing(false)
        }
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [loadAttempt])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined

    let active = true
    let listener
    CapacitorApp.addListener('backButton', () => {
      if (view === 'practice') {
        if (lessonId === reviewLesson.id) {
          setLessonId(null)
          setView('home')
        } else {
          setView('lesson-intro')
        }
      } else if (view === 'lesson-intro') {
        setLessonId(null)
        setView('lessons')
      } else if (view !== 'home') {
        setLessonId(null)
        setView('home')
      } else {
        void CapacitorApp.exitApp()
      }
    }).then((handle) => {
      if (active) listener = handle
      else void handle.remove()
    })

    return () => {
      active = false
      if (listener) void listener.remove()
    }
  }, [lessonId, view])

  const contentData = useMemo(() => {
    if (!content) return null
    const vocabularyByForm = new Map(content.vocabulary.flatMap((word) => [word.word, ...(word.forms || []).map((form) => form.form_hu)]
      .map((form) => [form.toLocaleLowerCase('hu'), word])))
    return { ...content, vocabularyByForm }
  }, [content])

  const lesson = lessonId === reviewLesson.id ? reviewLesson : contentData?.lessons.find((item) => item.id === lessonId)
  const lessonExercises = questionDeck
  const question = lessonExercises[questionIndex]
  const completedLessons = progress.completed_lessons || []

  function updateProgress(nextProgress) {
    const savedProgress = { ...nextProgress }
    delete savedProgress.storage_error
    setProgress(savedProgress)
    setStorageWarning(saveProgress(savedProgress) ? '' : 'Pokrok se nepodařilo uložit. Zkontrolujte úložiště prohlížeče.')
  }

  function startLesson(item) {
    if (!contentData || !isLessonUnlocked(item, progress)) return
    const deck = shuffle(item.exercise_ids.map((id) => contentData.exercises.find((exercise) => exercise.id === id)))
      .map((exercise) => {
        if (exercise.options_cs) {
          const options = shuffle(exercise.options_cs.map((text, index) => ({ text, correct: index === exercise.answer_index })))
          return { ...exercise, options_cs: options.map((option) => option.text), answer_index: options.findIndex((option) => option.correct) }
        }
        if (exercise.words_hu) return { ...exercise, words_hu: shuffle(exercise.words_hu) }
        return exercise
      })
    setLessonId(item.id)
    setQuestionDeck(deck)
    setQuestionIndex(0)
    setAnswer(null)
    setView('lesson-intro')
  }

  function startReview() {
    if (!contentData) return
    const dueWords = getDueVocabulary(progress, contentData.vocabulary)
    if (!dueWords.length) return
    const deck = shuffle(dueWords.map((word) => ({
      id: `review-${word.id}`,
      type: 'recall',
      type_label_cs: 'Opakování · aktivní vybavení',
      vocabulary_id: word.id,
      prompt_cs: `Napište maďarsky základní tvar slova „${word.translation_cs}“.`,
      accepted_answers: [word.word],
      explanation_cs: `${word.word} znamená ${word.translation_cs}. Zapište základní tvar bez koncovky.`,
    })))
    setLessonId(reviewLesson.id)
    setQuestionDeck(deck)
    setQuestionIndex(0)
    setAnswer(null)
    setView('practice')
  }

  function submitAnswer(value) {
    if (answer || !question) return
    const correct = question.type === 'recall'
      ? question.accepted_answers.some((expected) => normalizeAnswer(expected) === normalizeAnswer(value))
      : question.type === 'order'
        ? question.accepted_orders.some((expected) => expected.map(normalizeAnswer).join(' ') === value.map(normalizeAnswer).join(' '))
        : value === question.answer_index
    setAnswer({ value, correct })
    updateProgress(recordAnswer(progress, question.vocabulary_id, correct))
  }

  function nextQuestion() {
    if (questionIndex + 1 < lessonExercises.length) {
      setQuestionIndex((index) => index + 1)
      setAnswer(null)
      return
    }

    const next = {
      ...progress,
      completed_lessons: lesson.id === reviewLesson.id ? completedLessons : [...new Set([...completedLessons, lesson.id])],
    }
    updateProgress(next)
    setLessonId(null)
    setView('lessons')
  }

  function openGrammar(id) {
    setSelectedGrammarId(id)
    setView('grammar')
  }

  function refreshContent() {
    setContentError('')
    setIsRefreshing(true)
    setLoadAttempt((attempt) => attempt + 1)
  }

  function speak(text) {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'hu-HU'
    utterance.rate = 0.82
    window.speechSynthesis.speak(utterance)
  }

  if (!contentData) {
    return (
      <main className="content-state">
        <section className="content-state-card" role={contentError ? 'alert' : 'status'}>
          <p className="eyebrow">HUNGARAI · OBSAH Z GITHUBU</p>
          <h1>{contentError ? 'Obsah se nepodařilo načíst' : 'Načítáme lekce'}</h1>
          <p>{contentError || 'Stahujeme slovíčka, gramatiku, cvičení a příběhy z repozitáře Hungarai.'}</p>
          {contentError && <button className="button primary" onClick={() => { setContentError(''); setLoadAttempt((attempt) => attempt + 1) }}>Zkusit znovu <span>›</span></button>}
        </section>
      </main>
    )
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setView('home')} aria-label="Hungarai – přehled">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span><strong>HUNGARAI</strong><small>maďarština pro každý den</small></span>
        </button>
        <div className="top-actions">
          <div
            className={`top-status ${storageWarning || contentError || contentData.loadWarning ? 'warning' : ''}`}
            title={storageWarning || contentError || contentData.loadWarning || ''}
          >
            <span className="status-light" />
            {storageWarning || contentError || contentData.loadWarning || (contentData.source === 'github'
              ? 'Obsah z GitHubu · pokrok v tomto zařízení'
              : contentData.source === 'cache' ? 'Offline · poslední uložený obsah' : 'Offline · obsah v aplikaci')}
          </div>
          <button
            className="refresh-content-button"
            onClick={refreshContent}
            disabled={isRefreshing || ['practice', 'lesson-intro'].includes(view)}
            title={['practice', 'lesson-intro'].includes(view) ? 'Nejprve dokončete nebo opusťte lekci.' : 'Načíst nejnovější JSON z GitHubu'}
          >
            <span aria-hidden="true">↻</span><span className="refresh-content-label">{isRefreshing ? 'Aktualizuji…' : 'Aktualizovat'}</span>
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <p className="sidebar-caption">PRACOVNÍ PLOCHA</p>
          <nav aria-label="Hlavní navigace">
            {views.map((item) => (
              <button
                key={item.id}
                className={`nav-item ${view === item.id || (['practice', 'lesson-intro'].includes(view) && item.id === 'lessons') ? 'active' : ''}`}
                onClick={() => { setView(item.id); setLessonId(null) }}
              >
                <span className="nav-icon" aria-hidden="true">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>
          <div className="sidebar-foot">
            <span className="mini-flag" aria-hidden="true"><i /><i /><i /></span>
            <span>Maďarsko <small>HU → CS</small></span>
          </div>
        </aside>

        <main className="main-panel">
          {(storageWarning || contentError || contentData.loadWarning) && (
            <p className="storage-warning" role={storageWarning ? 'alert' : 'status'}>{storageWarning || contentError || contentData.loadWarning}</p>
          )}
          {view === 'home' && (
            <Dashboard content={contentData} progress={progress} onStart={() => setView('lessons')} onReview={startReview} onNavigate={setView} />
          )}
          {view === 'lessons' && (
            <LessonList content={contentData} progress={progress} onStart={startLesson} />
          )}
          {view === 'lesson-intro' && lesson && (
            <LessonIntroduction
              lesson={lesson}
              content={contentData}
              completedLessons={completedLessons}
              onSpeak={speak}
              onBegin={() => setView('practice')}
              onBack={() => { setLessonId(null); setView('lessons') }}
            />
          )}
          {view === 'practice' && lesson && question && (
            <Practice
              lesson={lesson}
              content={contentData}
              question={question}
              index={questionIndex}
              total={lessonExercises.length}
              answer={answer}
              onAnswer={submitAnswer}
              onNext={nextQuestion}
              onSpeak={speak}
              onOpenGrammar={openGrammar}
            />
          )}
          {view === 'practice' && (!lesson || !question) && (
            <LessonList content={contentData} progress={progress} onStart={startLesson} />
          )}
          {view === 'dictionary' && (
            <Dictionary content={contentData} selectedWord={selectedWord} onSelect={setSelectedWord} onSpeak={speak} onOpenGrammar={openGrammar} progress={progress} />
          )}
          {view === 'grammar' && (
            <GrammarSection content={contentData} selectedId={selectedGrammarId} progress={progress} />
          )}
          {view === 'stories' && (
            <StoryReader content={contentData} progress={progress} onSelectWord={(id) => { setSelectedWord(id); setView('dictionary') }} />
          )}
          <footer className="footer-note">HUNGARAI <span>•</span> Učení bez rušivých prvků</footer>
        </main>
      </div>
    </div>
  )
}

function PageHeading({ eyebrow, title, description, aside }) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {aside}
    </div>
  )
}

function MascotNote({ title, text, image = '/images/honved.png', className = '' }) {
  return (
    <aside className={`mascot-note ${className}`}>
      <img src={image} alt="" />
      <div><span>HONVÉDŮV TIP</span><strong>{title}</strong><p>{text}</p></div>
    </aside>
  )
}

function Dashboard({ content, progress, onStart, onReview, onNavigate }) {
  const { lessons, vocabulary } = content
  const nextLesson = lessons.find((item) => !progress.completed_lessons?.includes(item.id) && isLessonUnlocked(item, progress))
    || lessons.find((item) => !progress.completed_lessons?.includes(item.id))
  const dueWords = getDueVocabulary(progress, vocabulary)
  const studied = Object.keys(progress.reviews || {}).length
  const nextMilestone = lessons.find((item) => item.xp_required > progress.xp)
  const xpTarget = nextMilestone?.xp_required || (Math.floor(progress.xp / 100) + 1) * 100
  const percent = Math.min(100, Math.round((progress.xp / xpTarget) * 100))

  return (
    <>
      <PageHeading eyebrow="JÓ NAPOT · DOBRÝ DEN" title="Učte se svým tempem." description="Praktická maďarština, po malých a srozumitelných krocích." />
      <section className="welcome-panel">
        <div className="welcome-copy">
          <span className="panel-kicker">VAŠE DALŠÍ LEKCE</span>
          <h2>{nextLesson ? nextLesson.title_cs : 'Všechny lekce máte hotové'}</h2>
          <p>{nextLesson ? `${nextLesson.new_vocabulary_ids.length} nových slov · ${nextLesson.grammar_label_cs}` : 'Vraťte se k hotovým lekcím, procvičte slovíčka nebo si přečtěte příběh.'}</p>
          <button className="button primary" onClick={() => nextLesson ? onStart() : onNavigate('dictionary')}>{nextLesson ? 'Otevřít lekce' : 'Prozkoumat slovníček'} <span>›</span></button>
        </div>
        <div className="welcome-art" role="img" aria-label="Honvéd, maďarský voják z první světové války, průvodce aplikací">
          <span className="mascot-ribbon"><i /><i /><i /></span>
          <img className="mascot-figure" src="/images/honved.png" alt="" />
          <div className="mascot-caption"><strong>Honvéd</strong><span>váš průvodce · 1914</span></div>
        </div>
      </section>

      <section className="stats-grid" aria-label="Průběh učení">
        <article className="stat-card"><span className="stat-label">ZKUŠENOSTI</span><strong>{progress.xp} <small>XP</small></strong><div className="meter"><i style={{ width: `${percent}%` }} /></div><span className="stat-hint">{progress.xp} / {xpTarget} XP k dalšímu milníku</span></article>
        <article className="stat-card"><span className="stat-label">SLOVÍČKA V OPAKOVÁNÍ</span><strong>{studied.toString().padStart(2, '0')}</strong><span className="stat-hint">Uložená v místním rozvrhu</span></article>
        <article className="stat-card"><span className="stat-label">DOKONČENÉ LEKCE</span><strong>{(progress.completed_lessons || []).length}<small> / {lessons.length}</small></strong><span className="stat-hint">Pokrok zůstává v tomto zařízení</span></article>
      </section>

      <section className="section-block">
        <div className="section-title"><div><p className="eyebrow">JAK POKRAČOVAT</p><h2>Vyberte si, co dnes procvičíte</h2></div></div>
        <div className="shortcut-grid">
          <button className="shortcut-card" onClick={() => onNavigate('lessons')}><span className="shortcut-icon red">01</span><span><strong>Krátké cvičení</strong><small>Slovní zásoba a gramatika</small></span><b>›</b></button>
          <button className="shortcut-card" onClick={() => onNavigate('dictionary')}><span className="shortcut-icon green">Aa</span><span><strong>Slovníček</strong><small>Výslovnost a stavba slov</small></span><b>›</b></button>
          <button className="shortcut-card" onClick={() => onNavigate('stories')}><span className="shortcut-icon white">▧</span><span><strong>Čtení s porozuměním</strong><small>Příběh se slovními tipy a otázkami</small></span><b>›</b></button>
          <button className="shortcut-card" onClick={() => onNavigate('grammar')}><span className="shortcut-icon green">Gr</span><span><strong>Gramatika</strong><small>Pravidla a příklady</small></span><b>›</b></button>
          <button className="shortcut-card" onClick={onReview} disabled={!dueWords.length}><span className="shortcut-icon blue">↻</span><span><strong>Opakování slov</strong><small>{dueWords.length ? `${dueWords.length} slov čeká na procvičení` : 'Zatím žádná slova k opakování'}</small></span><b>›</b></button>
        </div>
      </section>
    </>
  )
}

function LessonList({ content, progress, onStart }) {
  const { lessons } = content
  const themes = [...new Map(lessons.map((lesson) => [lesson.theme_id, lesson.theme_title_cs])).entries()]
  return (
    <>
      <PageHeading
        eyebrow="VÝUKOVÁ CESTA"
        title="Tematické lekce"
        description="Každé téma má několik úrovní. S každou další úrovní se odemknou nová slovíčka a navazující gramatika."
        aside={<MascotNote image="/images/honved-lesson-coach.png" title="Postupujte po krocích" text="Nejdřív si osvojte základní tvary; další slova a koncovky přijdou v navazující úrovni." />}
      />
      <div className="lesson-themes">
        {themes.map(([themeId, themeTitle], themeIndex) => {
          const themeLessons = lessons
            .filter((lesson) => lesson.theme_id === themeId)
            .sort((first, second) => first.module_number - second.module_number)
          return (
            <section className="lesson-theme" key={themeId}>
              <div className="lesson-theme-heading"><span>TÉMA {String(themeIndex + 1).padStart(2, '0')}</span><h2>{themeTitle}</h2></div>
              <div className="lesson-list">
                {themeLessons.map((lesson) => {
                  const unlocked = isLessonUnlocked(lesson, progress)
                  const done = progress.completed_lessons?.includes(lesson.id)
                  const lockReason = progress.xp < lesson.xp_required
                    ? `Zamčeno · ${lesson.xp_required} XP`
                    : 'Nejprve dokončete předchozí úroveň'
                  return (
                    <article className={`lesson-card ${unlocked ? '' : 'locked'}`} key={lesson.id}>
                      <div className={`lesson-number ${done ? 'done' : ''}`}>{done ? '✓' : String(lesson.module_number).padStart(2, '0')}</div>
                      <div className="lesson-info"><div className="lesson-meta"><span>ÚROVEŇ {lesson.module_number}</span><span>{lesson.level}</span><span>{lesson.duration_min} MIN</span></div><h3>{lesson.module_title_cs}</h3><p>{lesson.description}</p><div className="lesson-tags"><strong>{lesson.new_vocabulary_ids.length} nových slov</strong><span>·</span>{lesson.exercise_ids.length} cvičení <span>·</span> {lesson.grammar_label_cs}</div></div>
                      <div className="lesson-action">{unlocked ? <button className="button secondary" onClick={() => onStart(lesson)}>{done ? 'Procvičit úroveň' : 'Otevřít úroveň'} <span>›</span></button> : <span className="lock-label">{lockReason}</span>}</div>
                    </article>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
      <p className="quiet-note">Dokončením úrovně se odemknou další slova a pravidla v tématu. Dokončené úrovně lze kdykoli opakovat.</p>
    </>
  )
}

function LessonIntroduction({ lesson, content, completedLessons, onSpeak, onBegin, onBack }) {
  const { lessons, vocabulary, grammar, vocabularyByForm } = content
  const knownVocabularyIds = new Set(lessons
    .filter((item) => completedLessons.includes(item.id) || item.id === lesson.id)
    .flatMap((item) => item.new_vocabulary_ids))
  const lessonVocabulary = lesson.new_vocabulary_ids
    .map((id) => vocabulary.find((word) => word.id === id))
    .filter(Boolean)
  const lessonGrammar = lesson.grammar_ids
    .map((id) => grammar.find((topic) => topic.id === id))
    .filter(Boolean)
  const commonGrammarWords = new Set(['a', 'az', 'egy', 'és', 'is', 'van'])

  function exampleFitsLesson(text) {
    const ids = (text.match(/[\p{L}\p{M}]+/gu) || [])
      .map((token) => vocabularyByForm.get(token.toLocaleLowerCase('hu'))?.id)
      .filter((id) => id && !commonGrammarWords.has(vocabulary.find((word) => word.id === id)?.word))
    return ids.length > 0 && ids.every((id) => knownVocabularyIds.has(id))
  }

  return (
    <section className="lesson-intro">
      <button className="text-button" onClick={onBack}>‹ Zpět na lekce</button>
      <PageHeading
        eyebrow={`LEKCE · ${lesson.level}`}
        title={lesson.title_cs}
        description="Nejdřív si projděte nová slova a pravidla. Pak si je vyzkoušíte v krátkých cvičeních."
        aside={<MascotNote image="/images/honved-lesson-coach.png" title="Všímejte si základního tvaru" text="Koncovky se budou měnit, slovníkové heslo ale zůstává stejné." />}
      />
      <section className="lesson-intro-section">
        <div className="lesson-intro-heading"><span>01</span><div><h2>Nová slovíčka</h2><p>Základní tvary, které se v lekci naučíte.</p></div></div>
        <div className="lesson-vocabulary-grid">
          {lessonVocabulary.map((word) => {
            const lessonForms = (word.forms || []).filter((form) => form.lesson_id === lesson.id)
            return (
              <article className="lesson-vocabulary-card" key={word.id}>
                <div className="lesson-vocabulary-word"><div><strong>{word.word}</strong><span>{word.part_of_speech_cs}</span></div><button className="icon-button" onClick={() => onSpeak(word.word)} aria-label={`Přehrát ${word.word}`}>▶</button></div>
                <p>{word.translation_cs}</p>
                {lessonForms.length > 0 && <div className="lesson-vocabulary-forms">{lessonForms.map((form) => <span key={form.form_hu}><strong>{form.form_hu}</strong> · {form.translation_cs}</span>)}</div>}
              </article>
            )
          })}
        </div>
      </section>
      <section className="lesson-intro-section">
        <div className="lesson-intro-heading"><span>02</span><div><h2>Gramatika před cvičením</h2><p>{lesson.grammar_label_cs}</p></div></div>
        <div className="lesson-intro-rules">
          {lessonGrammar.map((topic) => {
            const examples = topic.groups.flatMap((group) => group.examples)
              .filter((example) => exampleFitsLesson(example.form_hu))
              .slice(0, 4)
            return (
              <article className="lesson-intro-rule" key={topic.id}>
                <h3>{topic.title_cs}</h3>
                <p className="lesson-intro-summary">{topic.summary_cs}</p>
                <p className="lesson-intro-rule-text">{topic.rule_cs}</p>
                {examples.length > 0 && <div className="lesson-intro-examples">{examples.map((example) => <div key={example.form_hu}><strong>{example.form_hu}</strong><span>{example.translation_cs}</span></div>)}</div>}
              </article>
            )
          })}
        </div>
      </section>
      <div className="lesson-intro-actions">
        <button className="button primary" onClick={onBegin}>Začít cvičení <span>›</span></button>
      </div>
    </section>
  )
}

function Practice({ lesson, question, index, total, answer, onAnswer, onNext, onSpeak, onOpenGrammar, content }) {
  const { vocabulary } = content
  const word = vocabulary.find((item) => item.id === question.vocabulary_id)
  const expectedAnswer = question.type === 'recall'
    ? question.accepted_answers.join(' / ')
    : question.type === 'order'
      ? question.accepted_orders[0].join(' ')
      : ''
  const feedback = answer?.correct
    ? question.explanation_cs
    : `${question.explanation_cs}${expectedAnswer ? ` Správná odpověď: ${expectedAnswer}.` : ''}`

  return (
    <section className="practice-wrap">
      <div className="practice-top"><button className="text-button" onClick={onNext} disabled={!answer}>Přeskočit na další otázku</button><span>{lesson.title_cs}</span></div>
      <div className="progress-track"><i style={{ width: `${((index + (answer ? 1 : 0)) / total) * 100}%` }} /></div>
      <div className="practice-card">
        <div className="question-count">CVIČENÍ {String(index + 1).padStart(2, '0')} <span>/ {String(total).padStart(2, '0')}</span><span className="exercise-type">{question.type_label_cs}</span></div>
        <h1>{question.prompt_cs}</h1>
        {(question.type === 'phonetics' || question.type === 'listening') && <button className="sound-button" onClick={() => onSpeak(question.audio_text)}><span>▶</span> Přehrát maďarsky <small>HU · TTS</small></button>}
        {question.type === 'cloze' && <p className="cloze-sentence">{question.sentence_hu}</p>}
        {question.type === 'recall' && question.sentence_hu && <p className="cloze-sentence">{question.sentence_hu}</p>}
        {question.type === 'harmony' && word && <div className="word-focus"><strong>{word.word}</strong><span>{word.translation_cs}</span></div>}
        {question.type === 'phonetics' && <p className="phonetic-hint">{question.context_cs}</p>}
        {question.type === 'recall' && <RecallAnswer key={question.id} disabled={Boolean(answer)} onSubmit={onAnswer} />}
        {question.type === 'order' && <SentenceOrder key={question.id} words={question.words_hu} disabled={Boolean(answer)} onSubmit={onAnswer} />}
        {['harmony', 'cloze', 'vocabulary', 'phonetics', 'listening'].includes(question.type) && <div className="answer-list">
          {question.options_cs.map((option, choiceIndex) => {
            const chosen = answer?.value === choiceIndex
            const stateClass = answer ? (choiceIndex === question.answer_index ? 'correct' : chosen ? 'incorrect' : 'muted') : ''
            return <button key={option} className={`answer-option ${stateClass}`} onClick={() => onAnswer(choiceIndex)} disabled={Boolean(answer)}><span className="option-marker">{String.fromCharCode(65 + choiceIndex)}</span>{option}<span className="option-check">{choiceIndex === question.answer_index && answer ? '✓' : chosen && answer ? '×' : ''}</span></button>
          })}
        </div>}
        {answer && <div className={`feedback ${answer.correct ? 'positive' : 'negative'}`} role="status"><strong>{answer.correct ? 'Výborně' : 'Ještě jednou si to zapamatujte'}</strong><span>{feedback}</span>{question.grammar_id && <button className="grammar-link" onClick={() => onOpenGrammar(question.grammar_id)}>Otevřít související pravidlo ›</button>}</div>}
        {answer && <button className="button primary continue-button" onClick={onNext}>{index + 1 === total ? 'Dokončit lekci' : 'Pokračovat'} <span>›</span></button>}
      </div>
    </section>
  )
}

function RecallAnswer({ disabled, onSubmit }) {
  const [value, setValue] = useState('')
  return (
    <form className="recall-form" onSubmit={(event) => { event.preventDefault(); if (value.trim()) onSubmit(value) }}>
      <label htmlFor="recall-answer">Vaše odpověď <span>· napište maďarsky</span></label>
      <input id="recall-answer" autoComplete="off" autoCapitalize="none" spellCheck="false" value={value} onChange={(event) => setValue(event.target.value)} disabled={disabled} />
      <button className="button primary" type="submit" disabled={disabled || !value.trim()}>Zkontrolovat <span>›</span></button>
    </form>
  )
}

function SentenceOrder({ words, disabled, onSubmit }) {
  const [order, setOrder] = useState([])
  const available = words.map((word, index) => ({ word, index })).filter((item) => !order.includes(item.index))
  return (
    <div className="order-exercise">
      <p className="order-label">Klepáním na slova sestavte větu:</p>
      <div className="word-chips selected-chips" aria-label="Vaše pořadí">
        {order.length ? order.map((wordIndex, index) => <button key={`${wordIndex}-${index}`} disabled={disabled} onClick={() => setOrder((current) => current.filter((_, position) => position !== index))}>{words[wordIndex]}</button>) : <span>Věta se zobrazí zde</span>}
      </div>
      <div className="word-chips available-chips" aria-label="Dostupná slova">
        {available.map(({ word, index }) => <button key={`${word}-${index}`} disabled={disabled} onClick={() => setOrder((current) => [...current, index])}>{word}</button>)}
      </div>
      <button className="button primary" disabled={disabled || order.length !== words.length} onClick={() => onSubmit(order.map((index) => words[index]))}>Zkontrolovat větu <span>›</span></button>
    </div>
  )
}

function Dictionary({ selectedWord, onSelect, onSpeak, onOpenGrammar, progress, content }) {
  const { lessons, vocabulary } = content
  const [query, setQuery] = useState('')
  const [sortBy, setSortBy] = useState('theme')
  const availableLessons = lessons.filter((item) => isLessonUnlocked(item, progress))
  const availableWordIds = new Set(availableLessons.flatMap((item) => item.vocabulary_ids))
  const availableVocabulary = vocabulary.filter((item) => availableWordIds.has(item.id))
  const availableLessonIds = new Set(availableLessons.map((item) => item.id))
  const selected = availableVocabulary.find((item) => item.id === selectedWord)
  const themeOrder = new Map([...new Set(lessons.map((lesson) => lesson.theme_id))]
    .map((themeId, index) => [themeId, index]))
  const orderedLessons = [...lessons].sort((first, second) =>
    (themeOrder.get(first.theme_id) ?? 0) - (themeOrder.get(second.theme_id) ?? 0)
    || first.module_number - second.module_number)
  const lessonOrder = new Map()
  orderedLessons.forEach((lesson, index) => {
    lesson.new_vocabulary_ids.forEach((id) => {
      if (!lessonOrder.has(id)) lessonOrder.set(id, index)
    })
  })
  const searchTerm = normalizeSearch(query.trim())
  const matchingVocabulary = availableVocabulary.filter((item) => {
    const searchableText = [
      item.word,
      item.translation_cs,
      item.part_of_speech_cs,
      ...(item.forms || []).map((form) => `${form.form_hu} ${form.translation_cs}`),
    ].map(normalizeSearch).join(' ')
    return searchableText.includes(searchTerm)
  })
  const sortedVocabulary = [...matchingVocabulary].sort((first, second) => {
    if (sortBy === 'czech') return first.translation_cs.localeCompare(second.translation_cs, 'cs')
    if (sortBy === 'hungarian') return first.word.localeCompare(second.word, 'hu')
    return (lessonOrder.get(first.id) ?? 0) - (lessonOrder.get(second.id) ?? 0)
      || first.word.localeCompare(second.word, 'hu')
  })
  return (
    <>
      <PageHeading
        eyebrow="SLOVNÍ ZÁSOBA"
        title="Slovníček"
        description="Hledejte podle maďarského slova, českého významu nebo probraného tvaru."
        aside={<MascotNote image="/images/honved_dictionary_guide.png" title="Tip k hledání" text="Stačí napsat i část slova. Diakritiku můžete vynechat." />}
      />
      <div className="dictionary-layout">
        <div className="dictionary-browser">
          <div className="dictionary-controls">
            <label className="dictionary-search">
              <span>HLEDAT SLOVO</span>
              <input
                type="search"
                value={query}
                onChange={(event) => { setQuery(event.target.value); onSelect(null) }}
                placeholder="např. dům, házban..."
                aria-label="Hledat slovíčko v maďarštině nebo češtině"
              />
            </label>
            <label className="dictionary-sort">
              <span>ŘADIT</span>
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} aria-label="Řadit slovíčka">
                <option value="theme">Podle tématu</option>
                <option value="hungarian">Maďarsky A–Z</option>
                <option value="czech">Česky A–Z</option>
              </select>
            </label>
          </div>
          <p className="dictionary-result-count">{sortedVocabulary.length} {sortedVocabulary.length === 1 ? 'slovíčko' : sortedVocabulary.length < 5 ? 'slovíčka' : 'slovíček'}</p>
          <div className="word-list">
            {sortedVocabulary.length > 0
              ? sortedVocabulary.map((item) => <button key={item.id} className={`word-row ${selected?.id === item.id ? 'selected' : ''}`} onClick={() => onSelect(item.id)}><span><strong>{item.word}</strong><small>{item.part_of_speech_cs}</small></span><span>{item.translation_cs}</span></button>)
              : <p className="word-empty">{query ? 'Žádné slovíčko neodpovídá hledání.' : 'Slovíčka se zobrazí po odemčení první úrovně.'}</p>}
          </div>
        </div>
        <div className="word-detail">
          {selected ? (
            <>
              <div className="detail-heading"><div><p className="eyebrow">MAĎARSKY · {selected.part_of_speech_cs.toUpperCase()}</p><h2>{selected.word}</h2><p>{selected.translation_cs}</p></div><button className="icon-button" onClick={() => onSpeak(selected.word)} aria-label={`Přehrát výslovnost: ${selected.word}`}>▶</button></div>
              <div className="harmony-note"><span className={`harmony-dot ${selected.vowel_harmony}`} /> Samohlásková harmonie: <strong>{{ back: 'zadní', front: 'přední', mixed: 'smíšená', none: 'neuplatňuje se' }[selected.vowel_harmony] || 'neuvedena'}</strong></div>
              {selected.forms?.filter((form) => !form.lesson_id || availableLessonIds.has(form.lesson_id)).length > 0 && <><h3>Tvary podle probraných pravidel</h3><div className="word-forms">{selected.forms.filter((form) => !form.lesson_id || availableLessonIds.has(form.lesson_id)).map((form) => <div className="word-form" key={form.form_hu}><button onClick={() => onSpeak(form.form_hu)}><strong>{form.form_hu}</strong><span>▶</span></button><small>{form.translation_cs}</small>{form.grammar_id && <button className="form-rule-link" onClick={() => onOpenGrammar(form.grammar_id)}>pravidlo ›</button>}</div>)}</div></>}
              <h3>Stavba slova</h3>
              <div className="morphology">{selected.morphemes.map((part, index) => <span className={`morpheme ${part.kind}`} key={`${part.form}-${index}`}><strong>{part.form}</strong><small>{part.translation_cs}</small></span>)}</div>
              <div className="example-box"><span>PŘÍKLAD</span><p>{selected.example_hu}</p><small>{selected.example_cs}</small></div>
            </>
          ) : <p className="empty-detail">Vyberte slovo ze seznamu.</p>}
        </div>
      </div>
    </>
  )
}

function GrammarSection({ selectedId, progress, content }) {
  const { lessons, grammar } = content
  const availableGrammarIds = new Set(lessons.filter((lesson) => isLessonUnlocked(lesson, progress)).flatMap((lesson) => lesson.grammar_ids))
  const availableGrammar = grammar.filter((topic) => availableGrammarIds.has(topic.id))
  return (
    <>
      <PageHeading eyebrow="JAZYKOVÁ PRAVIDLA" title="Gramatika" description="Pravidla přibývají postupně spolu s lekcemi, od samohláskové harmonie k pádovým koncovkám a časování." />
      <div className="grammar-list">
        {availableGrammar.map((topic) => (
          <article className={`grammar-card ${selectedId === topic.id ? 'highlighted' : ''}`} id={topic.id} key={topic.id}>
            <div className="grammar-heading"><div><p className="eyebrow">{topic.level}</p><h2>{topic.title_cs}</h2><p>{topic.summary_cs}</p></div></div>
            <p className="grammar-rule">{topic.rule_cs}</p>
            <div className="grammar-groups">
              {topic.groups.map((group) => (
                <section className="grammar-group" key={group.name_cs}>
                  <div className="grammar-group-heading"><h3>{group.name_cs}</h3><span>{group.suffix_hu}</span></div>
                  {group.vowels_hu && <p className="vowel-set"><span>Samohlásky</span>{group.vowels_hu.map((vowel) => <b key={vowel}>{vowel}</b>)}</p>}
                  <div className="grammar-examples">{group.examples.map((example) => <div className="grammar-example" key={example.form_hu}><strong>{example.form_hu}</strong><span>{example.translation_cs}</span></div>)}</div>
                </section>
              ))}
            </div>
            <ul className="grammar-notes">{topic.notes_cs.map((note) => <li key={note}>{note}</li>)}</ul>
          </article>
        ))}
      </div>
    </>
  )
}

function StoryReader({ onSelectWord, progress, content }) {
  const { lessons, stories } = content
  const completedLessons = new Set(progress.completed_lessons || [])
  const knownVocabularyIds = new Set(lessons
    .filter((lesson) => completedLessons.has(lesson.id))
    .flatMap((lesson) => lesson.new_vocabulary_ids))
  const availableStories = stories
    .filter((story) => story.prerequisite_lesson_ids.every((id) => completedLessons.has(id)))
    .map((story) => {
      const knownWordCount = story.vocabulary_ids.filter((id) => knownVocabularyIds.has(id)).length
      return { ...story, knownWordPercent: Math.round(knownWordCount / story.vocabulary_ids.length * 100) }
    })
    .sort((first, second) => second.knownWordPercent - first.knownWordPercent)
  return (
    <>
      <PageHeading
        eyebrow="ČTENÍ S POROZUMĚNÍM"
        title="Příběhy"
        description="Příběhy řadíme podle odhadovaného podílu známé slovní zásoby. Najetím na zvýrazněné slovo zobrazíte jeho význam i tvar."
        aside={<MascotNote image="/images/honved-story-reader.png" title="Čtěte vlastním tempem" text="Najetím na zelené slovo otevřete slovní nápovědu; kliknutím zobrazíte celé heslo." />}
      />
      <div className="stories-list">
        {availableStories.length === 0
          ? <p className="quiet-note">Příběhy se odemykají po dokončení příslušných tematických lekcí.</p>
          : availableStories.map((story) => <StoryCard key={story.id} story={story} content={content} onSelectWord={onSelectWord} />)}
      </div>
    </>
  )
}

function StoryCard({ story, onSelectWord, content }) {
  const { vocabulary, vocabularyByForm } = content
  const [answers, setAnswers] = useState({})
  const [questions] = useState(() => story.questions.map((question) => {
    const options = shuffle(question.options_cs.map((text, index) => ({ text, correct: index === question.answer_index })))
    return { ...question, options_cs: options.map((option) => option.text), answer_index: options.findIndex((option) => option.correct) }
  }))
  const quizComplete = questions.every((question) => answers[question.id] !== undefined)
  const correctAnswers = questions.filter((question) => answers[question.id] === question.answer_index).length

  function answerQuestion(questionId, answerIndex) {
    if (quizComplete) return
    setAnswers((current) => ({ ...current, [questionId]: answerIndex }))
  }

  function renderWord(text, word, key) {
    const matchedForm = word.forms?.find((form) => normalizeSearch(form.form_hu) === normalizeSearch(text))
    const accessibleHint = matchedForm
      ? `${word.word}, ${word.translation_cs}, tvar ${text}: ${matchedForm.translation_cs}`
      : `${word.word}, ${word.translation_cs}, ${word.part_of_speech_cs}`
    return (
      <span className="story-word-anchor" key={key}>
        <button className="story-word" aria-label={`${text}: ${accessibleHint}`} onClick={() => onSelectWord(word.id)}>{text}</button>
        <span className="story-word-popover" aria-hidden="true">
          <span className="story-word-popover-heading"><strong>{word.word}</strong><small>{word.part_of_speech_cs}</small></span>
          <span className="story-word-popover-translation">{word.translation_cs}</span>
          {matchedForm
            ? <span className="story-word-popover-form"><small>TVAR V PŘÍBĚHU</small><strong>{text}</strong><span>{matchedForm.translation_cs}</span></span>
            : <span className="story-word-popover-form"><small>PŘÍKLAD</small><strong>{word.example_hu}</strong><span>{word.example_cs}</span></span>}
          <span className="story-word-popover-footer">Kliknutím otevřete celé heslo</span>
        </span>
      </span>
    )
  }

  function renderSegment(segment, segmentIndex) {
    if (segment.vocabulary_id) {
      const word = vocabulary.find((item) => item.id === segment.vocabulary_id)
      return renderWord(segment.text, word, `${segment.text}-${segmentIndex}`)
    }
    return segment.text.split(/([\p{L}\p{M}]+)/gu).map((part, partIndex) => {
      const word = vocabularyByForm.get(part.toLocaleLowerCase('hu'))
      return word
        ? renderWord(part, word, `${part}-${segmentIndex}-${partIndex}`)
        : <span key={`${part}-${segmentIndex}-${partIndex}`}>{part}</span>
    })
  }

  return (
    <article className="story-card">
      <div className="story-meta"><span>{story.level}</span><span>{story.reading_time_min} MIN ČTENÍ</span><span>≈ {story.knownWordPercent}% známých slov</span></div>
      <h2>{story.title_cs}</h2>
      <p className="story-subtitle">{story.title_hu}</p>
      <div className="story-text">{story.segments.map(renderSegment)}</div>
      <section className="story-quiz" aria-label="Otázky k příběhu">
        <h3>Porozumění příběhu</h3>
        {questions.map((question, questionIndex) => (
          <fieldset className="story-question" key={question.id} disabled={quizComplete}>
            <legend>{questionIndex + 1}. {question.prompt_cs}</legend>
            <div className="story-options">
              {question.options_cs.map((option, answerIndex) => {
                const isSelected = answers[question.id] === answerIndex
                const isCorrect = quizComplete && answerIndex === question.answer_index
                const isIncorrectSelection = quizComplete && isSelected && !isCorrect
                const className = [
                  'story-option',
                  isSelected ? 'is-selected' : '',
                  isCorrect ? 'is-correct' : '',
                  isIncorrectSelection ? 'is-incorrect' : '',
                ].filter(Boolean).join(' ')
                return (
                  <button className={className} key={option} onClick={() => answerQuestion(question.id, answerIndex)}>
                    {option}
                  </button>
                )
              })}
            </div>
            {quizComplete && <p className="story-feedback">{question.feedback_cs}</p>}
          </fieldset>
        ))}
        {quizComplete && (
          <div className="story-result">
            <strong>Výsledek: {correctAnswers} / {story.questions.length}</strong>
            <p className="story-translation">{story.translation_cs}</p>
          </div>
        )}
      </section>
    </article>
  )
}

export default App
