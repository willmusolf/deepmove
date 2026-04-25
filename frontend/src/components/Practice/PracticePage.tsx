import { useEffect, useMemo, useState } from 'react'
import { Chess } from 'chess.js'
import type { Key } from 'chessground/types'
import ChessBoard, { type DrawShape } from '../Board/ChessBoard'
import EvalBar from '../Board/EvalBar'
import PlayerInfoBox from '../Board/PlayerInfoBox'
import { OPENING_PRACTICE_COURSES } from '../../chess/practice'
import { getSquareOverlayPosition } from '../../chess/boardGeometry'
import type { OpeningCourse, OpeningLine, PracticePosition } from '../../chess/practice'
import { summarizePracticeProgress, usePracticeStore, type PracticeProgressSummary } from '../../stores/practiceStore'

type PracticeView = 'library' | 'preview' | 'reps'
type PracticeFeedbackKind = 'correct' | 'incorrect' | 'revealed' | null

function flattenLinePositions(line: OpeningLine): PracticePosition[] {
  return line.practicePositions
}

function getLineStatusLabel(progress: PracticeProgressSummary | null | undefined): string {
  if (!progress) return 'New line'
  if (progress.total === 0) return 'Empty line'
  if (progress.solved === progress.total) return 'Complete'
  if (progress.solved + progress.inProgress > 0) return 'In progress'
  return 'New line'
}

function getTargetMoveHint(position: PracticePosition | null): { lastMove: [Key, Key], shapes: DrawShape[] } | null {
  if (!position) return null

  try {
    const chess = new Chess(position.fen)
    const move = chess.move(position.targetMove.san)
    if (!move) return null

    return {
      lastMove: [move.from as Key, move.to as Key],
      shapes: [{ orig: move.from as Key, dest: move.to as Key, brush: 'bestMove' }],
    }
  } catch {
    return null
  }
}

export default function PracticePage() {
  const selectedCourseId = usePracticeStore((state) => state.selectedCourseId)
  const selectedChapterId = usePracticeStore((state) => state.selectedChapterId)
  const selectedLineId = usePracticeStore((state) => state.selectedLineId)
  const currentStepIndex = usePracticeStore((state) => state.currentStepIndex)
  const positionProgress = usePracticeStore((state) => state.positionProgress)
  const selectCourse = usePracticeStore((state) => state.selectCourse)
  const selectChapter = usePracticeStore((state) => state.selectChapter)
  const selectLine = usePracticeStore((state) => state.selectLine)
  const setCurrentStepIndex = usePracticeStore((state) => state.setCurrentStepIndex)
  const recordAttempt = usePracticeStore((state) => state.recordAttempt)
  const markPositionRevealed = usePracticeStore((state) => state.markPositionRevealed)

  const [view, setView] = useState<PracticeView>('library')
  const [practiceBoardKey, setPracticeBoardKey] = useState(0)
  const [practiceFeedback, setPracticeFeedback] = useState<string | null>(null)
  const [practiceFeedbackKind, setPracticeFeedbackKind] = useState<PracticeFeedbackKind>(null)
  const [practiceSolved, setPracticeSolved] = useState(false)
  const [orientation, setOrientation] = useState<'white' | 'black'>('white')

  const selectedCourse = useMemo<OpeningCourse | null>(
    () => OPENING_PRACTICE_COURSES.find((course) => course.id === selectedCourseId) ?? OPENING_PRACTICE_COURSES[0] ?? null,
    [selectedCourseId],
  )

  useEffect(() => {
    if (!selectedCourse) return
    setOrientation(selectedCourse.studyAs)
  }, [selectedCourse])

  const selectedChapter = selectedCourse?.chapters.find((chapter) => chapter.id === selectedChapterId)
    ?? selectedCourse?.chapters[0]
    ?? null
  const selectedLine = selectedChapter?.lines.find((line) => line.id === selectedLineId)
    ?? selectedChapter?.lines[0]
    ?? null
  const lineSteps = useMemo(
    () => (selectedLine ? flattenLinePositions(selectedLine) : []),
    [selectedLine],
  )
  const currentStep = lineSteps[currentStepIndex] ?? null
  const progressLabel = lineSteps.length > 0 ? `${currentStepIndex + 1} / ${lineSteps.length}` : '0 / 0'
  const lineProgress = useMemo(
    () => summarizePracticeProgress(lineSteps, positionProgress),
    [lineSteps, positionProgress],
  )
  const lineSeen = lineProgress.solved + lineProgress.inProgress
  const lineComplete = lineProgress.total > 0 && lineProgress.solved === lineProgress.total
  const coursePositions = useMemo(
    () => selectedCourse?.chapters.flatMap((chapter) => chapter.lines.flatMap((line) => line.practicePositions)) ?? [],
    [selectedCourse],
  )
  const courseProgress = useMemo(
    () => summarizePracticeProgress(coursePositions, positionProgress),
    [coursePositions, positionProgress],
  )
  const courseSeen = courseProgress.solved + courseProgress.inProgress
  const lineProgressById = useMemo(
    () => Object.fromEntries(
      (selectedChapter?.lines ?? []).map((line) => [line.id, summarizePracticeProgress(line.practicePositions, positionProgress)]),
    ),
    [selectedChapter, positionProgress],
  )
  const showCoursePicker = OPENING_PRACTICE_COURSES.length > 1
  const showBoardHint = view === 'preview' || practiceFeedbackKind === 'revealed'
  const targetMoveHint = useMemo(() => getTargetMoveHint(currentStep), [currentStep])
  const boardShapes = showBoardHint ? (targetMoveHint?.shapes ?? []) : []
  const boardLastMove = showBoardHint ? targetMoveHint?.lastMove : undefined
  const topIsToMove = currentStep ? (
    orientation === 'white'
      ? currentStep.sideToMove === 'black'
      : currentStep.sideToMove === 'white'
  ) : false
  const libraryPrimaryLabel = lineSeen === 0
    ? 'Preview Line'
    : lineComplete
      ? 'Restart Reps'
      : 'Resume Reps'
  const librarySecondaryLabel = lineSeen === 0 ? 'Start Reps' : 'Preview Line'
  const libraryStatusCopy = lineSeen === 0
    ? 'Start with Preview if you want to see the line once, or jump straight into exact-move reps.'
    : lineComplete
      ? 'This line is fully recalled right now. Restart reps to run it again from the beginning.'
      : `Resume on step ${currentStepIndex + 1} of ${lineSteps.length}, or preview the line from the start.`
  const repsPromptValue = practiceSolved ? currentStep?.targetMove.san ?? '' : 'Find the exact move'
  const shouldShowAlternatives = view === 'reps'
    && (practiceFeedbackKind === 'incorrect' || practiceFeedbackKind === 'revealed')
    && Boolean(currentStep?.targetMove.acceptedAlternatives?.length)
  const boardStatusCopy = view === 'library'
    ? 'Choose a lesson, then preview it or start exact-move reps.'
    : view === 'preview'
      ? 'Preview shows the move and idea. Use the arrows to step through the line.'
      : practiceSolved
        ? 'Rep complete. Continue when you are ready for the next position.'
        : 'Play the exact course move. Reveal if you get stuck.'

  useEffect(() => {
    setPracticeBoardKey(0)
    setPracticeFeedback(null)
    setPracticeFeedbackKind(null)
    setPracticeSolved(false)
  }, [selectedCourseId, selectedChapterId, selectedLineId, currentStepIndex, view])

  function resetPracticeBoard() {
    setPracticeBoardKey((value) => value + 1)
  }

  function handlePreviewStart() {
    setCurrentStepIndex(0)
    setView('preview')
  }

  function handleRepsStart({ restart = false }: { restart?: boolean } = {}) {
    if (restart) {
      setCurrentStepIndex(0)
    }
    setView('reps')
  }

  function handlePrimaryLibraryAction() {
    if (lineSeen === 0) {
      handlePreviewStart()
      return
    }

    if (lineComplete) {
      handleRepsStart({ restart: true })
      return
    }

    handleRepsStart()
  }

  function handleSecondaryLibraryAction() {
    if (lineSeen === 0) {
      handleRepsStart({ restart: true })
      return
    }

    handlePreviewStart()
  }

  function handlePracticeMove(_from: string, _to: string, san: string) {
    if (!currentStep) return

    if (san === currentStep.targetMove.san) {
      recordAttempt(currentStep.id, true)
      setPracticeSolved(true)
      setPracticeFeedbackKind('correct')
      setPracticeFeedback(`Correct. ${currentStep.targetMove.explanation}`)
      return
    }

    const acceptedAlternative = currentStep.targetMove.acceptedAlternatives?.find((alternative) => alternative.san === san)
    if (acceptedAlternative) {
      recordAttempt(currentStep.id, false)
      setPracticeFeedbackKind('incorrect')
      setPracticeFeedback(acceptedAlternative.message)
      setPracticeSolved(false)
      resetPracticeBoard()
      return
    }

    recordAttempt(currentStep.id, false)
    setPracticeFeedbackKind('incorrect')
    setPracticeFeedback(`Not the course move here. In this line we want ${currentStep.targetMove.san}.`)
    setPracticeSolved(false)
    resetPracticeBoard()
  }

  function handleRevealMove() {
    if (!currentStep) return

    markPositionRevealed(currentStep.id)
    setPracticeFeedbackKind('revealed')
    setPracticeFeedback(`Reveal: ${currentStep.targetMove.san}. ${currentStep.targetMove.explanation}`)
    setPracticeSolved(true)
    resetPracticeBoard()
  }

  function handleAdvanceStep() {
    if (currentStepIndex < lineSteps.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1)
      return
    }

    setView('library')
  }

  if (!selectedCourse || !selectedChapter || !selectedLine || !currentStep) {
    return <div className="stub-page">Practice is loading.</div>
  }

  return (
    <div style={{ position: 'relative' }}>
      <div className="coming-soon-overlay">
        <div className="coming-soon-badge">
          <div className="coming-soon-badge__title">Coming Soon</div>
          <div className="coming-soon-badge__sub">Practice mode is under construction.</div>
        </div>
      </div>
      <>
      <div className="board-col">
        <div className="board-with-eval">
          <EvalBar evalCentipawns={0} orientation={orientation} hidden />

          <div className="board-and-players">
            <PlayerInfoBox
              username={selectedCourse.name}
              elo={selectedChapter.title}
              isWhite={selectedCourse.studyAs !== 'white'}
              isToMove={topIsToMove}
              currentFen={currentStep.fen}
              platform={null}
            />

            <div className="board-overlay-host">
              <ChessBoard
                key={`${selectedLine.id}-${currentStepIndex}-${view}-${practiceBoardKey}`}
                fen={currentStep.fen}
                orientation={orientation}
                interactive={view === 'reps' && !practiceSolved}
                pathKey={practiceBoardKey}
                shapes={boardShapes}
                lastMove={boardLastMove}
                onMove={view === 'reps' && !practiceSolved ? handlePracticeMove : undefined}
                onIllegalMove={view === 'reps' && !practiceSolved
                  ? () => setPracticeFeedback('That move is not legal in this position.')
                  : undefined}
              />
            {(() => {
              const _chess = new Chess(currentStep.fen)
              const _findKing = (c: 'w' | 'b'): string | null => {
                for (const f of 'abcdefgh') for (const r of '12345678') {
                  const p = _chess.get(`${f}${r}` as any)
                  if (p?.type === 'k' && p.color === c) return f + r
                }
                return null
              }
              if (_chess.isCheckmate()) {
                const sq = _findKing(_chess.turn())
                if (!sq) return null
                return <div className="board-result-badge board-result-badge--checkmate" style={getSquareOverlayPosition(sq, orientation)}>#</div>
              }
              if (_chess.isStalemate() || _chess.isInsufficientMaterial() || _chess.isThreefoldRepetition() || _chess.isDraw()) {
                const wSq = _findKing('w'), bSq = _findKing('b')
                return <>{wSq && <div className="board-result-badge board-result-badge--draw" style={getSquareOverlayPosition(wSq, orientation)}>½</div>}{bSq && <div className="board-result-badge board-result-badge--draw" style={getSquareOverlayPosition(bSq, orientation)}>½</div>}</>
              }
              return null
            })()}
            </div>

            <PlayerInfoBox
              username="You"
              elo={selectedCourse.studyAs === 'white' ? 'White repertoire' : 'Black repertoire'}
              isWhite={selectedCourse.studyAs === 'white'}
              isToMove={!topIsToMove}
              currentFen={currentStep.fen}
              platform={null}
            />
          </div>
        </div>

        <div className="board-controls practice-board-controls">
          <div className="board-controls__nav">
            {view === 'library' ? (
              <span className="move-counter">{selectedLine.practicePositions.length} reps in this line</span>
            ) : (
              <>
                <button
                  className="nav-btn"
                  onClick={() => setCurrentStepIndex(Math.max(0, currentStepIndex - 1))}
                  disabled={currentStepIndex === 0}
                >
                  ←
                </button>
                <span className="move-counter">{progressLabel}</span>
                <button
                  className="nav-btn"
                  onClick={() => {
                    if (view === 'preview') {
                      setCurrentStepIndex(Math.min(lineSteps.length - 1, currentStepIndex + 1))
                      return
                    }

                    if (practiceSolved && currentStepIndex < lineSteps.length - 1) {
                      setCurrentStepIndex(currentStepIndex + 1)
                    }
                  }}
                  disabled={view === 'preview'
                    ? currentStepIndex >= lineSteps.length - 1
                    : !practiceSolved || currentStepIndex >= lineSteps.length - 1}
                >
                  →
                </button>
              </>
            )}
          </div>

          <div className="board-controls__actions">
            <button
              className="btn btn-secondary board-control-btn"
              onClick={() => setOrientation((value) => value === 'white' ? 'black' : 'white')}
            >
              Flip
            </button>
            {view === 'preview' && (
              <button
                className="btn btn-secondary board-control-btn"
                onClick={() => handleRepsStart()}
              >
                Start Reps
              </button>
            )}
            {view === 'reps' && (
              <button
                className="btn btn-secondary board-control-btn"
                onClick={() => {
                  setPracticeFeedback(null)
                  setPracticeFeedbackKind(null)
                  setPracticeSolved(false)
                  resetPracticeBoard()
                }}
              >
                Reset
              </button>
            )}
          </div>

          <span className="board-control-status practice-mode-hint">
            {boardStatusCopy}
          </span>
        </div>

        <div className="opening-label">
          {selectedCourse.name} · {selectedChapter.title} · {selectedLine.title}
        </div>
      </div>

      <div className="side-col">
        <div className="side-panel-content practice-side-content">
          {view === 'library' && (
            <>
              <div className="practice-panel-card">
                <div className="practice-panel-card__eyebrow">Selected Lesson</div>
                <h2 className="practice-panel-card__title">{selectedLine.title}</h2>
                <p className="practice-panel-copy">
                  {selectedCourse.name} · {selectedChapter.title}
                </p>
                <p className="practice-panel-copy">{selectedLine.summary}</p>

                <div className="practice-panel-stats">
                  <div className="practice-panel-stat">
                    <span className="practice-panel-stat__label">Current Rep</span>
                    <span className="practice-panel-stat__value">{progressLabel}</span>
                  </div>
                  <div className="practice-panel-stat">
                    <span className="practice-panel-stat__label">Recalled</span>
                    <span className="practice-panel-stat__value">{lineProgress.solved}</span>
                  </div>
                  <div className="practice-panel-stat">
                    <span className="practice-panel-stat__label">Remaining</span>
                    <span className="practice-panel-stat__value">{lineProgress.remaining}</span>
                  </div>
                </div>

                <div className="practice-progress-pill">
                  {courseProgress.solved} recalled · {courseSeen} / {courseProgress.total} seen in {selectedCourse.name}
                </div>

                <div className="practice-panel-actions">
                  <button
                    type="button"
                    className="btn btn-primary board-control-btn practice-mode-toggle__btn"
                    onClick={handlePrimaryLibraryAction}
                  >
                    {libraryPrimaryLabel}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary board-control-btn practice-mode-toggle__btn"
                    onClick={handleSecondaryLibraryAction}
                  >
                    {librarySecondaryLabel}
                  </button>
                </div>

                <p className="practice-panel-copy">{libraryStatusCopy}</p>
              </div>

              <div className="practice-panel-card">
                <div className="practice-panel-section-label">Choose Lesson</div>
                <p className="practice-panel-copy">
                  Pick a chapter, then jump into one explicit line. Practice should feel like entering a lesson, not browsing a dashboard.
                </p>

                {showCoursePicker && (
                  <div className="practice-course-list">
                    {OPENING_PRACTICE_COURSES.map((course) => (
                      <button
                        key={course.id}
                        type="button"
                        className={`practice-course-card${course.id === selectedCourseId ? ' active' : ''}`}
                        onClick={() => {
                          selectCourse(course.id)
                          setView('library')
                        }}
                      >
                        <div className="practice-course-card__top">
                          <span className="practice-course-card__title">{course.name}</span>
                          <span className="practice-course-card__meta">{course.totalLines} lines</span>
                        </div>
                        <div className="practice-course-card__subtitle">{course.subtitle}</div>
                      </button>
                    ))}
                  </div>
                )}

                <div className="practice-panel-section-label">Chapters</div>
                <div className="practice-chip-row">
                  {selectedCourse.chapters.map((chapter) => (
                    <button
                      key={chapter.id}
                      type="button"
                      className={`practice-chip${chapter.id === selectedChapterId ? ' active' : ''}`}
                      onClick={() => {
                        selectChapter(chapter.id)
                        setView('library')
                      }}
                    >
                      {chapter.title}
                    </button>
                  ))}
                </div>

                <div className="practice-panel-section-label">Lines</div>
                <div className="practice-line-list">
                  {selectedChapter.lines.map((line) => {
                    const progress = lineProgressById[line.id]

                    return (
                      <button
                        key={line.id}
                        type="button"
                        className={`practice-line-card${line.id === selectedLineId ? ' active' : ''}`}
                        onClick={() => {
                          selectLine(line.id)
                          setView('library')
                        }}
                      >
                        <div className="practice-line-card__top">
                          <span className="practice-line-card__title">{line.title}</span>
                          <span className="practice-line-card__meta">
                            {progress?.solved ?? 0} / {line.practicePositions.length}
                          </span>
                        </div>
                        <div className="practice-line-card__summary">{line.summary}</div>
                        <div className="practice-line-card__status">
                          {getLineStatusLabel(progress)}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </>
          )}

          {view === 'preview' && (
            <>
              <div className="practice-panel-card">
                <div className="practice-panel-card__eyebrow">Preview Line</div>
                <h2 className="practice-panel-card__title">{selectedLine.title}</h2>
                <p className="practice-panel-copy">
                  {selectedCourse.name} · {selectedChapter.title}
                </p>

                <div className="practice-panel-stats">
                  <div className="practice-panel-stat">
                    <span className="practice-panel-stat__label">Step</span>
                    <span className="practice-panel-stat__value">{progressLabel}</span>
                  </div>
                  <div className="practice-panel-stat">
                    <span className="practice-panel-stat__label">Recalled</span>
                    <span className="practice-panel-stat__value">{lineProgress.solved}</span>
                  </div>
                  <div className="practice-panel-stat">
                    <span className="practice-panel-stat__label">Line Status</span>
                    <span className="practice-panel-stat__value">{getLineStatusLabel(lineProgress)}</span>
                  </div>
                </div>

                <div className="practice-panel-actions">
                  <button
                    type="button"
                    className="btn btn-primary board-control-btn practice-mode-toggle__btn"
                    onClick={() => handleRepsStart()}
                  >
                    Start Reps
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary board-control-btn practice-mode-toggle__btn"
                    onClick={() => setView('library')}
                  >
                    Back To Lessons
                  </button>
                </div>

                <p className="practice-panel-copy">
                  Preview is the guided pass: see the move, understand the idea, then switch into exact-move recall.
                </p>
              </div>

              <div className="practice-panel-card">
                <div className="practice-panel-section-label">Move To Learn</div>
                <div className="practice-target-move">{currentStep.targetMove.san}</div>
                <p className="practice-panel-copy">{currentStep.targetMove.explanation}</p>

                <div className="practice-history">
                  {currentStep.historySan.length === 0 ? (
                    <span className="practice-history__empty">Starting position</span>
                  ) : (
                    currentStep.historySan.map((san, index) => (
                      <span key={`${san}-${index}`} className="practice-history__move">{san}</span>
                    ))
                  )}
                </div>
              </div>
            </>
          )}

          {view === 'reps' && (
            <>
              <div className="practice-panel-card">
                <div className="practice-panel-card__eyebrow">Repertoire Reps</div>
                <h2 className="practice-panel-card__title">{selectedLine.title}</h2>
                <p className="practice-panel-copy">
                  {selectedCourse.name} · {selectedChapter.title}
                </p>

                <div className="practice-panel-stats">
                  <div className="practice-panel-stat">
                    <span className="practice-panel-stat__label">Step</span>
                    <span className="practice-panel-stat__value">{progressLabel}</span>
                  </div>
                  <div className="practice-panel-stat">
                    <span className="practice-panel-stat__label">Recalled</span>
                    <span className="practice-panel-stat__value">{lineProgress.solved}</span>
                  </div>
                  <div className="practice-panel-stat">
                    <span className="practice-panel-stat__label">Unseen</span>
                    <span className="practice-panel-stat__value">{lineProgress.remaining}</span>
                  </div>
                </div>

                <div className="practice-panel-actions">
                  <button
                    type="button"
                    className="btn btn-primary board-control-btn practice-mode-toggle__btn"
                    onClick={practiceSolved ? handleAdvanceStep : handleRevealMove}
                  >
                    {practiceSolved
                      ? currentStepIndex >= lineSteps.length - 1
                        ? 'Finish Line'
                        : 'Next Position'
                      : 'Reveal Move'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary board-control-btn practice-mode-toggle__btn"
                    onClick={() => setView('library')}
                  >
                    Back To Lessons
                  </button>
                </div>

                <p className="practice-panel-copy">
                  {practiceSolved
                    ? 'This rep is locked in. Continue to the next position when ready.'
                    : 'Play the exact course move on the board. Playable alternatives still count as incorrect in this trainer.'}
                </p>
              </div>

              <div className="practice-panel-card">
                <div className="practice-panel-section-label">{practiceSolved ? 'Answer' : 'Your Move'}</div>
                <div className="practice-target-move">{repsPromptValue}</div>
                <div className="practice-progress-pill">
                  {lineProgress.solved} recalled · {lineProgress.inProgress} in progress · {lineProgress.remaining} unseen
                </div>
                <p className="practice-panel-copy">
                  {practiceSolved
                    ? currentStep.targetMove.explanation
                    : 'Find the exact repertoire move from this position.'}
                </p>

                <div className={`practice-feedback${practiceSolved ? ' practice-feedback--success' : ''}`}>
                  {practiceFeedback ?? 'Your turn. Find the course move on the board.'}
                </div>

                {shouldShowAlternatives && (
                  <div className="practice-alt-box">
                    <div className="practice-alt-box__label">Playable alternatives</div>
                    {currentStep.targetMove.acceptedAlternatives?.map((alternative) => (
                      <div key={alternative.san} className="practice-alt-box__item">
                        <span className="practice-alt-box__move">{alternative.san}</span>
                        <span>{alternative.message}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="practice-history">
                  {currentStep.historySan.length === 0 ? (
                    <span className="practice-history__empty">Starting position</span>
                  ) : (
                    currentStep.historySan.map((san, index) => (
                      <span key={`${san}-${index}`} className="practice-history__move">{san}</span>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      </>
    </div>
  )
}
