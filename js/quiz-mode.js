/**
 * Quiz Mode - Interactive Mock Test & Practice Engine
 * Allows users to take the extracted question paper as a live interactive test
 */

class QuizEngine {
  constructor() {
    this.questions = [];
    this.metadata = {};
    this.userAnswers = {}; // { qId: answerValue }
    this.flaggedQuestions = new Set();
    this.currentQuestionIndex = 0;
    this.timerInterval = null;
    this.timeRemainingSeconds = 0;
    this.timeElapsedSeconds = 0;
    this.isSubmitted = false;
  }

  /**
   * Initializes a quiz session
   */
  startQuiz(extractedData, durationMinutes = null) {
    this.questions = extractedData.questions || [];
    this.metadata = extractedData.metadata || {};
    this.userAnswers = {};
    this.flaggedQuestions.clear();
    this.currentQuestionIndex = 0;
    this.isSubmitted = false;
    this.timeElapsedSeconds = 0;

    // Parse duration
    if (durationMinutes) {
      this.timeRemainingSeconds = durationMinutes * 60;
    } else if (this.metadata.duration) {
      const match = this.metadata.duration.match(/(\d+(?:\.\d+)?)\s*(?:hrs?|hours?)/i);
      if (match) {
        this.timeRemainingSeconds = parseFloat(match[1]) * 3600;
      } else {
        const minMatch = this.metadata.duration.match(/(\d+)\s*(?:mins?|minutes?)/i);
        if (minMatch) {
          this.timeRemainingSeconds = parseInt(minMatch[1], 10) * 60;
        } else {
          this.timeRemainingSeconds = 1800; // default 30 mins
        }
      }
    } else {
      this.timeRemainingSeconds = (this.questions.length || 10) * 90; // 1.5 mins per question
    }

    this.startTimer();
  }

  startTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);

    this.timerInterval = setInterval(() => {
      if (this.timeRemainingSeconds > 0) {
        this.timeRemainingSeconds--;
        this.timeElapsedSeconds++;
        this.onTimerTick();
      } else {
        clearInterval(this.timerInterval);
        this.autoSubmit();
      }
    }, 1000);
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  onTimerTick() {
    const timerElem = document.getElementById('quiz-timer-display');
    if (timerElem) {
      const mins = Math.floor(this.timeRemainingSeconds / 60);
      const secs = this.timeRemainingSeconds % 60;
      timerElem.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      
      if (this.timeRemainingSeconds <= 300) { // < 5 mins
        timerElem.classList.add('text-red-600', 'animate-pulse');
      } else {
        timerElem.classList.remove('text-red-600', 'animate-pulse');
      }
    }
  }

  recordAnswer(qId, answer) {
    if (this.isSubmitted) return;
    this.userAnswers[qId] = answer;
  }

  toggleFlag(qId) {
    if (this.flaggedQuestions.has(qId)) {
      this.flaggedQuestions.delete(qId);
    } else {
      this.flaggedQuestions.add(qId);
    }
  }

  isFlagged(qId) {
    return this.flaggedQuestions.has(qId);
  }

  getCurrentQuestion() {
    return this.questions[this.currentQuestionIndex];
  }

  goToNext() {
    if (this.currentQuestionIndex < this.questions.length - 1) {
      this.currentQuestionIndex++;
      return true;
    }
    return false;
  }

  goToPrevious() {
    if (this.currentQuestionIndex > 0) {
      this.currentQuestionIndex--;
      return true;
    }
    return false;
  }

  goToIndex(index) {
    if (index >= 0 && index < this.questions.length) {
      this.currentQuestionIndex = index;
      return true;
    }
    return false;
  }

  autoSubmit() {
    if (this.isSubmitted) return;
    alert('Time has expired! Submitting your test automatically.');
    this.submitQuiz();
  }

  submitQuiz() {
    this.stopTimer();
    this.isSubmitted = true;
    return this.calculateResults();
  }

  calculateResults() {
    let totalScore = 0;
    let maxPossibleScore = 0;
    let correctCount = 0;
    let incorrectCount = 0;
    let unattemptedCount = 0;

    const questionResults = this.questions.map((q, idx) => {
      const userAns = this.userAnswers[q.id];
      const marks = Number(q.marks) || 1;
      maxPossibleScore += marks;

      let status = 'unattempted';
      let awardedMarks = 0;

      if (userAns !== undefined && userAns !== null && userAns !== '') {
        if (q.type === 'mcq' || q.type === 'true_false') {
          const isCorrect = q.correctAnswer && (String(userAns).trim().toUpperCase() === String(q.correctAnswer).trim().toUpperCase());
          if (isCorrect) {
            status = 'correct';
            awardedMarks = marks;
            correctCount++;
            totalScore += marks;
          } else {
            status = 'incorrect';
            incorrectCount++;
          }
        } else {
          // Descriptive / Self-Grading placeholder
          status = 'answered';
          awardedMarks = marks; // marked as attempted
          correctCount++;
          totalScore += marks;
        }
      } else {
        unattemptedCount++;
      }

      return {
        questionNumber: q.questionNumber || (idx + 1),
        questionText: q.questionText,
        type: q.type,
        marks: marks,
        awardedMarks: awardedMarks,
        userAnswer: userAns,
        correctAnswer: q.correctAnswer,
        status: status,
        image: q.image || null,
        options: q.options || [],
        explanation: q.explanation || ''
      };
    });

    const percentage = maxPossibleScore > 0 ? Math.round((totalScore / maxPossibleScore) * 100) : 0;

    return {
      totalQuestions: this.questions.length,
      correctCount,
      incorrectCount,
      unattemptedCount,
      totalScore,
      maxPossibleScore,
      percentage,
      timeTakenFormatted: this.formatTime(this.timeElapsedSeconds),
      questionResults
    };
  }

  formatTime(totalSecs) {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}m ${secs}s`;
  }
}

window.quizEngine = new QuizEngine();
