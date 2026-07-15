'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import confetti from 'canvas-confetti';

// ── Types ──

interface HistoryItem {
  sentence: string;
  transcript: string;
  correct: boolean;
}

interface Scene {
  main: string;
  effect: string;
  bg: string[];
  items: [string, string][];
}

interface WordMatch {
  word: string;
  matched: boolean;
}

interface Course {
  id: string;
  name: string;
  emoji: string;
  sentences: number;
}

interface CourseProgress {
  completed: number;
  starsPerSentence: number[];
}

// ── Constants ──

const COURSES: Course[] = [
  { id: 'animals',     name: 'Animals',    emoji: '🐾',  sentences: 5 },
  { id: 'food',        name: 'Food',       emoji: '🍎',  sentences: 5 },
  { id: 'colors',      name: 'Colors',     emoji: '🎨',  sentences: 5 },
  { id: 'family',      name: 'Family',     emoji: '👨‍👩‍👧‍👦',sentences: 4 },
  { id: 'toys',        name: 'Toys & Play',emoji: '🧸',  sentences: 5 },
  { id: 'nature',      name: 'Nature',     emoji: '🌿',  sentences: 5 },
  { id: 'body',        name: 'My Body',    emoji: '💪',  sentences: 4 },
  { id: 'weather',     name: 'Weather',    emoji: '🌤️', sentences: 4 },
  { id: 'transport',   name: 'Transport',  emoji: '🚗',  sentences: 5 },
  { id: 'home',        name: 'At Home',    emoji: '🏠',  sentences: 5 },
];

function starsFor(feedback: string): number {
  switch (feedback) {
    case 'perfect': return 3;
    case 'great':   return 2;
    case 'almost':  return 1;
    default:        return 0;
  }
}

// ── Helpers ──

const ANIM_CLASSES: Record<string, string> = {
  blink: 'anim-blink', bounce: 'anim-bounce', shake: 'anim-shake',
  spin: 'anim-spin', float: 'anim-float', pulse: 'anim-pulse',
};

function SceneDisplay({ scene }: { scene: Scene | null }) {
  if (!scene) return <div style={s.cardEmoji}>🃏</div>;
  return (
    <div style={s.sceneC}>
      <div style={s.sceneBg}>
        {scene.bg.map((e, i) => (
          <span key={i} style={{ ...s.bgEmoji, left: `${25 + i * 25}%`, top: `${20 + (i % 2) * 40}%` }}>{e}</span>
        ))}
      </div>
      <div style={s.sceneMain}>
        <span className={ANIM_CLASSES[scene.effect] || 'anim-float'} style={s.mainEmoji}>{scene.main}</span>
      </div>
      <div style={s.sceneItems}>
        {scene.items.map(([e, a], i) => (
          <span key={i} className={ANIM_CLASSES[a] || 'anim-float'} style={{ ...s.itemEmoji, animationDelay: `${i * 0.3}s` }}>{e}</span>
        ))}
      </div>
    </div>
  );
}

function normalize(t: string) {
  return t.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function getWordMatches(sentence: string, transcript: string): WordMatch[] {
  const words = sentence.split(/\s+/).filter(Boolean);
  const spoken = new Set(transcript.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/));
  return words.map(w => ({ word: w, matched: spoken.has(w.toLowerCase().replace(/[^a-z0-9]/g, '')) }));
}

function wordSimilarity(a: string, b: string): number {
  const wa = a.replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
  const wb = b.replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
  if (!wa.length || !wb.length) return 0;
  const sb = new Set(wb);
  return wa.filter(w => sb.has(w)).length / Math.max(wa.length, wb.length);
}

type FB = 'perfect' | 'great' | 'almost' | 'wrong' | 'no_speech' | null;

const FB_MAP: Record<string, { emoji: string; text: string; cardBg: string; border: string; anim: string }> = {
  perfect:   { emoji: '🎉', text: 'Perfect! ⭐',      cardBg: '#4CAF50', border: '#388E3C', anim: 'fb-perfect' },
  great:     { emoji: '👏', text: 'Great job!',        cardBg: '#C8E6C9', border: '#4CAF50', anim: 'fb-great' },
  almost:    { emoji: '👍', text: 'Almost! Try again!', cardBg: '#FFF3E0', border: '#FF9800', anim: 'fb-almost' },
  wrong:     { emoji: '🤔', text: 'Not quite. Listen again!', cardBg: '#FFEBEE', border: '#EF5350', anim: 'fb-wrong' },
  no_speech: { emoji: '🤷', text: "I didn't hear anything. Try again!", cardBg: '#E3F2FD', border: '#42A5F5', anim: 'fb-none' },
};

type Phase = 'idle' | 'recording' | 'transcribing' | 'result';

// ── Component ──

export default function SpeakPage() {
  // course progress
  const [courseIdx, setCourseIdx] = useState(0);
  const [progress, setProgress] = useState<CourseProgress>(() => {
    if (typeof window === 'undefined') return { completed: 0, starsPerSentence: [] };
    try {
      const saved = localStorage.getItem('tf-progress');
      if (saved) return JSON.parse(saved);
    } catch {}
    return { completed: 0, starsPerSentence: [] };
  });
  const [showMap, setShowMap] = useState(false);

  const course = COURSES[courseIdx] || COURSES[0];
  const sentenceIdxInCourse = progress.starsPerSentence.length;
  const courseDone = sentenceIdxInCourse >= course.sentences;
  const totalStars = progress.starsPerSentence.reduce((a, b) => a + b, 0);
  const allCoursesDone = courseIdx >= COURSES.length - 1 && courseDone;

  // persist progress
  useEffect(() => {
    try { localStorage.setItem('tf-progress', JSON.stringify(progress)); } catch {}
  }, [progress]);

  // sentence state
  const [sentence, setSentence] = useState('');
  const [scene, setScene] = useState<Scene | null>(null);
  const [displayText, setDisplayText] = useState('');
  const [micSupported, setMicSupported] = useState(true);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState('');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [feedback, setFeedback] = useState<FB>(null);
  const [wordMatches, setWordMatches] = useState<WordMatch[] | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const latestTranscriptRef = useRef('');
  const synthRef = useRef<SpeechSynthesis | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') synthRef.current = window.speechSynthesis;
  }, []);

  useEffect(() => {
    return () => { if (audioUrl) URL.revokeObjectURL(audioUrl); };
  }, [audioUrl]);

  const playSentence = useCallback(() => {
    if (!synthRef.current || playing || !sentence) return;
    synthRef.current.cancel();
    const u = new SpeechSynthesisUtterance(sentence);
    u.lang = 'en-US';
    u.rate = 0.85;
    u.onstart = () => setPlaying(true);
    u.onend = () => setPlaying(false);
    u.onerror = () => setPlaying(false);
    synthRef.current.speak(u);
  }, [sentence, playing]);

  const correct = feedback === 'perfect' || feedback === 'great';

  const pickSentence = useCallback(async (topic?: string) => {
    setLoading(true);
    setApiError('');
    setDisplayText('');
    setFeedback(null);
    setWordMatches(null);
    setAudioUrl(null);
    setPhase('idle');
    latestTranscriptRef.current = '';

    try {
      const res = await fetch('/api/generate-sentence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history, topic }),
      });
      if (!res.ok) throw new Error('API error');
      const data = await res.json();
      setSentence(data.sentence);
      if (data.scene) setScene(data.scene);
    } catch {
      setApiError('生成句子失败，请点击重试');
    } finally {
      setLoading(false);
    }
  }, [history]);

  // first load
  useEffect(() => { pickSentence(course.name); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setMicSupported(false);
    }
  }, []);

  // ── Recording ──

  const stopMediaTracks = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  };

  const fireConfetti = () => {
    const end = Date.now() + 3000;
    const f = () => {
      confetti({ particleCount: 2, angle: 60, spread: 55, origin: { x: 0, y: 0.7 }, colors: ['#FFD700', '#00BFFF', '#FF69B4'] });
      confetti({ particleCount: 2, angle: 120, spread: 55, origin: { x: 1, y: 0.7 }, colors: ['#32CD32', '#FF4500', '#9370DB'] });
      if (Date.now() < end) requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
    setTimeout(() => confetti({ particleCount: 150, spread: 100, origin: { y: 0.5 }, colors: ['#FFD700', '#00BFFF', '#FF69B4', '#32CD32', '#FF4500'] }), 100);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };

      recorder.onstop = async () => {
        stopMediaTracks();
        setPhase('transcribing');
        setWordMatches(null);
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioUrl(URL.createObjectURL(blob));
        const fd = new FormData();
        fd.append('audio', blob, 'recording.webm');

        try {
          const res = await fetch('/api/transcribe', { method: 'POST', body: fd });
          const data = await res.json();
          const transcript = (data.transcript || '').trim();
          if (!transcript) { setFeedback('no_speech'); setPhase('result'); return; }

          setDisplayText(transcript);
          latestTranscriptRef.current = transcript;
          setWordMatches(getWordMatches(sentence, transcript));
          setPhase('result');

          const nt = normalize(transcript), ns = normalize(sentence);
          let fb: FB = 'wrong';

          if (nt === ns) {
            fb = 'perfect';
            setCounter(c => c + 1);
            setHistory(h => [...h, { sentence, transcript, correct: true }]);
            fireConfetti();
          } else if (nt.length > 0 && wordSimilarity(nt, ns) >= 0.6) {
            fb = 'almost';
            setHistory(h => [...h, { sentence, transcript, correct: false }]);
          } else {
            setHistory(h => [...h, { sentence, transcript, correct: false }]);
          }

          const star = starsFor(fb);
          if (star > 0 && !courseDone) {
            setProgress(p => {
              const next = { ...p, starsPerSentence: [...p.starsPerSentence, star] };
              if (next.starsPerSentence.length >= course.sentences) {
                next.completed = p.completed + 1;
              }
              return next;
            });
          }

          setFeedback(fb);
        } catch {
          setFeedback('no_speech');
          setPhase('result');
        }
      };

      recorder.start();
      setPhase('recording');
    } catch {
      setMicSupported(false);
      setPhase('idle');
    }
  };

  const [counter, setCounter] = useState(0);

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
  };

  const handleRecordClick = () => {
    if (phase === 'recording') { stopRecording(); return; }
    setFeedback(null); setWordMatches(null); setAudioUrl(null);
    setDisplayText('');
    latestTranscriptRef.current = '';
    startRecording();
  };

  const goNextCourse = () => {
    if (allCoursesDone) {
      setShowMap(true);
      return;
    }
    const next = courseIdx + 1;
    setCourseIdx(next >= COURSES.length ? COURSES.length - 1 : next);
    setProgress(p => ({ completed: p.completed, starsPerSentence: [] }));
    pickSentence(COURSES[next >= COURSES.length ? COURSES.length - 1 : next].name);
  };

  const handleNext = () => {
    if (courseDone) { goNextCourse(); return; }
    const transcript = latestTranscriptRef.current;
    if (transcript && !correct && phase === 'result') {
      setHistory(h => [...h, { sentence, transcript, correct: false }]);
    }
    pickSentence(course.name);
  };

  const jumpToCourse = (idx: number) => {
    setCourseIdx(idx);
    setProgress({ completed: 0, starsPerSentence: [] });
    setShowMap(false);
    pickSentence(COURSES[idx].name);
  };

  const btnConf = () => {
    if (phase === 'recording') return { label: '⏹ 停止录音', bg: '#FF6B6B', color: '#fff', dis: false };
    if (phase === 'transcribing') return { label: '🔄 识别中...', bg: '#CCC', color: '#666', dis: true };
    if (correct) return { label: '✅ 答对了', bg: '#4CAF50', color: '#fff', dis: true };
    return { label: '🎙 点击开始跟读', bg: '#FFD700', color: '#333', dis: false };
  };

  const btn = btnConf();
  const fb = feedback ? FB_MAP[feedback] : null;

  // ── Render ──

  return (
    <div style={s.wrapper}>
      <style>{`
        @keyframes af { 0%,100%{transform:translateY(0)scale(1)} 50%{transform:translateY(-16px)scale(1.08)} }
        @keyframes ab { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.3;transform:scale(.9)} }
        @keyframes abo { 0%,100%{transform:translateY(0)} 30%{transform:translateY(-24px)} 60%{transform:translateY(-8px)} }
        @keyframes ash { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-8px)rotate(-5deg)} 40%{transform:translateX(8px)rotate(5deg)} 60%{transform:translateX(-4px)rotate(-3deg)} 80%{transform:translateX(4px)rotate(3deg)} }
        @keyframes asp { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
        @keyframes ap { 0%,100%{transform:scale(1)} 50%{transform:scale(1.25)} }
        @keyframes pi { 0%{transform:scale(.3);opacity:0} 70%{transform:scale(1.1)} 100%{transform:scale(1);opacity:1} }
        @keyframes sp { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
        @keyframes pr { 0%,100%{box-shadow:0 0 0 0 rgba(255,107,107,.5)} 50%{box-shadow:0 0 0 12px rgba(255,107,107,0)} }
        @keyframes fa { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-6px)} 40%{transform:translateX(6px)} 60%{transform:translateX(-3px)} 80%{transform:translateX(3px)} }
        @keyframes fg { 0%,100%{transform:scale(1)rotate(0deg)} 50%{transform:scale(1.05)rotate(2deg)} }
        .anim-float{animation:af 3s ease-in-out infinite}
        .anim-blink{animation:ab 2s ease-in-out infinite}
        .anim-bounce{animation:abo 1.2s ease-in-out infinite}
        .anim-shake{animation:ash .8s ease-in-out infinite}
        .anim-spin{animation:asp 2s linear infinite}
        .anim-pulse{animation:ap 1.5s ease-in-out infinite}
        .fb-perfect{animation:pi .5s ease-out}
        .fb-great{animation:fg .6s ease-in-out}
        .fb-almost{animation:fa .5s ease-in-out}
        .fb-wrong{animation:ash .4s ease-in-out}
        .fb-none{animation:pi .4s ease-out}
        .ovl{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:99;display:flex;align-items:center;justify-content:center;animation:pi .3s ease-out}
        .ovl-card{background:#fff;border-radius:24px;padding:28px 20px;max-width:340px;width:90%;max-height:80vh;overflow-y:auto;text-align:center;box-shadow:0 12px 48px rgba(0,0,0,.25)}
      `}</style>

      {/* bubbles */}
      {[...Array(6)].map((_, i) => (
        <div key={i} style={{ ...s.bubble, width: 30 + i * 10, height: 30 + i * 10, top: `${10 + i * 14}%`, left: `${5 + i * 16}%`, background: ['#FFD700','#FF69B4','#87CEEB','#98FB98','#FFA07A','#DDA0DD'][i], animationDelay: `${i * .7}s`, animationDuration: `${3 + i * .6}s` }} />
      ))}

      {/* errors */}
      {!micSupported && <div style={s.err}>⚠️ 无法访问麦克风，请使用 HTTPS 或允许麦克风权限。</div>}
      {apiError && <div style={s.err}>⚠️ {apiError}</div>}

      {/* header */}
      <div style={s.header}>
        <h1 style={s.title}>🎤 英语口语小练习</h1>
        <p style={s.subtitle}>
          跟我一起大声读吧！🌟
          {totalStars > 0 && <span style={s.streak}> ⭐ {totalStars}</span>}
        </p>

        {/* course progress */}
        <div style={s.courseRow}>
          <button onClick={() => setShowMap(true)} style={s.courseBtn} title="切换课程">
            {course.emoji} {course.name}
          </button>
          {!courseDone && (
            <div style={s.progressBar}>
              <div style={{ ...s.progressFill, width: `${(sentenceIdxInCourse / course.sentences) * 100}%` }} />
            </div>
          )}
          <span style={s.progressText}>
            {courseDone ? '✅' : `${sentenceIdxInCourse}/${course.sentences}`}
          </span>
        </div>
      </div>

      {/* card */}
      <div style={{ ...s.card, backgroundColor: fb?.cardBg || '#FFF', borderColor: fb?.border || '#FFD700' }}>
        {loading ? (
          <div style={s.loadingC}>
            <div style={s.spinner} />
            <p style={s.loadingT}>AI 老师正在出题...</p>
          </div>
        ) : courseDone && phase === 'idle' ? (
          <div style={s.courseDoneC}>
            <div style={{ fontSize: 56, marginBottom: 8 }}>🎉</div>
            <p style={{ fontSize: 20, fontWeight: 'bold', color: '#4CAF50' }}>课程完成！</p>
            <div style={{ fontSize: 32, margin: '8px 0' }}>
              {Array.from({ length: totalStars }, (_, i) => (
                <span key={i} style={{ animation: `pi .3s ease-out ${i * 0.05}s both` }}>⭐</span>
              ))}
            </div>
            <p style={{ color: '#666', marginBottom: 12 }}>
              {totalStars}/{course.sentences * 3} 颗星
            </p>
            <button onClick={goNextCourse} style={{ ...s.nextBtn, borderColor: '#4CAF50', color: '#4CAF50', marginTop: 8 }}>
              {allCoursesDone ? '🏆 查看全部课程' : '➡️ 下一课程'}
            </button>
          </div>
        ) : (
          <>
            <SceneDisplay scene={scene} />
            <div style={s.cardInner}>
              <p style={s.sentenceT}>
                {wordMatches
                  ? wordMatches.map((wm, i) => (
                      <span key={i} style={{ color: wm.matched ? '#2E7D32' : '#333', fontWeight: wm.matched ? 700 : 400, textDecoration: wm.matched ? 'underline' : 'none', textDecorationColor: '#4CAF50', transition: 'all .3s ease' }}>
                        {wm.word}{i < wordMatches.length - 1 ? '\u00A0' : ''}
                      </span>
                    ))
                  : sentence}
              </p>
              <button onClick={playSentence} disabled={loading || playing} style={{ ...s.playBtn, opacity: loading ? .4 : 1, animation: playing ? 'pr 1s ease-in-out infinite' : 'none' }} title="听标准发音">
                {playing ? '🔊' : '🔈'}
              </button>
            </div>
            {displayText && (
              <div style={s.transcriptBox}>
                <span style={s.tl}>🗣 你说的：</span>
                <span style={s.tt}>{displayText}</span>
              </div>
            )}
            {audioUrl && phase === 'result' && (
              <div style={s.prc}>
                <button onClick={playSentence} style={s.prcBtn}>🔊 标准音</button>
                <button onClick={() => new Audio(audioUrl).play()} style={s.prcBtn}>▶ 我的录音</button>
              </div>
            )}
            {fb && (
              <div className={fb.anim} style={{ ...s.fbBanner, color: fb.border }}>
                <span style={s.fbEmoji}>{fb.emoji}</span>
                <span style={s.fbText}>{fb.text}</span>
              </div>
            )}
            {/* stars earned this round */}
            {feedback && starsFor(feedback) > 0 && !courseDone && (
              <div style={{ marginTop: 8 }}>
                {Array.from({ length: starsFor(feedback) }, (_, i) => (
                  <span key={i} style={{ fontSize: 20, animation: 'pi .3s ease-out' }}>⭐</span>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* buttons */}
      {!loading && !courseDone && (
        <button onClick={handleRecordClick} disabled={!micSupported || correct || !!apiError || btn.dis}
          style={{ ...s.listenBtn, backgroundColor: btn.bg, color: btn.color, opacity: !micSupported || correct || apiError || btn.dis ? .5 : 1, animation: phase === 'recording' ? 'pr 1.5s ease-in-out infinite' : 'none' }}>
          {btn.label}
        </button>
      )}

      {!loading && phase !== 'recording' && phase !== 'transcribing' && (
        <button onClick={handleNext} disabled={loading}
          style={{ ...s.nextBtn, opacity: loading ? .4 : 1, marginTop: correct || feedback ? 12 : 0 }}>
          {courseDone ? '➡️ 继续' : loading ? '⏳ 生成中...' : '➡️ 下一关'}
        </button>
      )}

      {/* course map overlay */}
      {showMap && (
        <div className="ovl" onClick={(e) => { if (e.target === e.currentTarget) setShowMap(false); }}>
          <div className="ovl-card">
            <p style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 16 }}>🏫 课程地图</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {COURSES.map((c, i) => {
                const isCurrent = i === courseIdx;
                const isPast = i < courseIdx;
                const isFuture = i > courseIdx;
                return (
                  <button key={c.id} onClick={() => jumpToCourse(i)}
                    style={{
                      ...s.mapBtn,
                      background: isCurrent ? '#FFF3E0' : isPast ? '#E8F5E9' : '#F5F5F5',
                      borderColor: isCurrent ? '#FF9800' : isPast ? '#4CAF50' : '#E0E0E0',
                      cursor: 'pointer',
                      opacity: isFuture ? 0.5 : 1,
                    }}>
                    <span style={{ fontSize: 24 }}>{c.emoji}</span>
                    <span style={{ flex: 1, fontWeight: isCurrent ? 700 : 400 }}>{c.name}</span>
                    {isPast && <span>✅</span>}
                    {isCurrent && <span>👈</span>}
                  </button>
                );
              })}
            </div>
            <div style={{ marginTop: 16, fontSize: 14, color: '#888' }}>
              ⭐ 共 {totalStars} 颗星
            </div>
            <button onClick={() => setShowMap(false)} style={{ ...s.nextBtn, marginTop: 16, borderColor: '#999', color: '#666' }}>
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Styles ──

const s: Record<string, React.CSSProperties> = {
  wrapper: {
    minHeight: '100dvh',
    background: 'linear-gradient(135deg,#87CEEB 0%,#FFFACD 50%,#FFE4B5 100%)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: '24px 20px',
    fontFamily: '"Comic Sans MS","Chalkboard SE","Segoe Print",cursive,sans-serif',
    position: 'relative', overflow: 'hidden',
  },
  bubble: { position: 'absolute', borderRadius: '50%', opacity: .25, animation: 'af 4s ease-in-out infinite', pointerEvents: 'none' },
  err: { background: '#FF6B6B', color: '#fff', padding: '12px 20px', borderRadius: 12, marginBottom: 20, textAlign: 'center', fontSize: 15, lineHeight: 1.5, maxWidth: 400, width: '100%' },
  header: { textAlign: 'center', marginBottom: 20, position: 'relative', zIndex: 1 },
  title: { fontSize: 26, color: '#FF6B00', marginBottom: 4, textShadow: '2px 2px 0 rgba(255,255,255,.7)', lineHeight: 1.3 },
  subtitle: { fontSize: 15, color: '#666' },
  streak: { color: '#FF6B00', fontWeight: 'bold', fontSize: 14 },
  courseRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  courseBtn: { padding: '6px 16px', fontSize: 14, fontWeight: 'bold', border: '2px solid #FF9800', borderRadius: 20, background: '#FFF3E0', color: '#E65100', cursor: 'pointer', WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' },
  progressBar: { width: 80, height: 8, borderRadius: 4, background: '#E0E0E0', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4, background: 'linear-gradient(90deg,#FFD700,#FF9800)', transition: 'width .5s ease' },
  progressText: { fontSize: 13, color: '#888', fontWeight: 'bold', minWidth: 36, textAlign: 'right' },
  card: { width: '100%', maxWidth: 400, borderRadius: 24, padding: '24px 24px 20px', boxShadow: '0 8px 32px rgba(0,0,0,.12)', textAlign: 'center', transition: 'background-color .5s ease,border-color .5s ease', border: '4px solid #FFD700', marginBottom: 20, position: 'relative', zIndex: 1, minHeight: 220, display: 'flex', flexDirection: 'column', justifyContent: 'center' },
  loadingC: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 },
  spinner: { width: 40, height: 40, border: '4px solid #FFD700', borderTopColor: '#FF6B00', borderRadius: '50%', animation: 'sp .8s linear infinite' },
  loadingT: { fontSize: 16, color: '#888' },
  courseDoneC: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0' },
  sceneC: { position: 'relative', minHeight: 120, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  sceneBg: { position: 'absolute', inset: 0, pointerEvents: 'none' },
  bgEmoji: { position: 'absolute', fontSize: 24, opacity: .5 },
  sceneMain: { display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2 },
  mainEmoji: { fontSize: 64, lineHeight: 1, display: 'inline-block' },
  sceneItems: { display: 'flex', justifyContent: 'center', gap: 12, marginTop: 4, zIndex: 2 },
  itemEmoji: { fontSize: 28, lineHeight: 1, display: 'inline-block' },
  cardEmoji: { fontSize: 48, marginBottom: 12, animation: 'pi .4s ease-out' },
  cardInner: { marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap' },
  playBtn: { background: 'none', border: '2px solid #DDD', borderRadius: '50%', width: 44, height: 44, fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .2s ease', WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation', flexShrink: 0 },
  sentenceT: { fontSize: 28, fontWeight: 'bold', color: '#333', lineHeight: 1.4, wordBreak: 'break-word' },
  transcriptBox: { fontSize: 17, color: '#555', background: '#F5F5F5', borderRadius: 14, padding: '12px 16px', border: '2px dashed #DDD', marginTop: 8, animation: 'pi .3s ease-out' },
  tl: { fontWeight: 'bold', color: '#888' },
  tt: { color: '#333' },
  fbBanner: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, padding: '10px 16px', borderRadius: 14, background: 'rgba(255,255,255,.85)', fontSize: 18, fontWeight: 'bold' },
  fbEmoji: { fontSize: 26 },
  fbText: { fontSize: 17 },
  prc: { display: 'flex', justifyContent: 'center', gap: 10, marginTop: 10 },
  prcBtn: { padding: '8px 18px', fontSize: 14, fontWeight: 'bold', border: '2px solid #DDD', borderRadius: 20, cursor: 'pointer', backgroundColor: '#fff', color: '#555', transition: 'all .2s ease', WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' },
  listenBtn: { padding: '16px 44px', fontSize: 20, fontWeight: 'bold', border: 'none', borderRadius: 50, cursor: 'pointer', boxShadow: '0 4px 15px rgba(0,0,0,.15)', transition: 'all .25s ease', marginBottom: 12, position: 'relative', zIndex: 1, minWidth: 220, WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' },
  nextBtn: { padding: '14px 40px', fontSize: 18, fontWeight: 'bold', border: '3px solid #4CAF50', borderRadius: 50, cursor: 'pointer', backgroundColor: '#fff', color: '#4CAF50', transition: 'all .25s ease', position: 'relative', zIndex: 1, WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' },
  mapBtn: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 14, border: '2px solid #E0E0E0', fontSize: 15, textAlign: 'left', transition: 'all .2s ease', WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' },
};
