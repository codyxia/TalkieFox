'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import confetti from 'canvas-confetti';

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

const ANIM_CLASSES: Record<string, string> = {
  blink: 'anim-blink',
  bounce: 'anim-bounce',
  shake: 'anim-shake',
  spin: 'anim-spin',
  float: 'anim-float',
  pulse: 'anim-pulse',
};

function SceneDisplay({ scene }: { scene: Scene | null }) {
  if (!scene) {
    return <div style={styles.cardEmoji}>🃏</div>;
  }
  return (
    <div style={styles.sceneContainer}>
      <div style={styles.sceneBg}>
        {scene.bg.map((emoji, i) => (
          <span key={i} style={{ ...styles.bgEmoji, left: `${25 + i * 25}%`, top: `${20 + (i % 2) * 40}%` }}>
            {emoji}
          </span>
        ))}
      </div>
      <div style={styles.sceneMain}>
        <span className={ANIM_CLASSES[scene.effect] || 'anim-float'} style={styles.mainEmoji}>
          {scene.main}
        </span>
      </div>
      <div style={styles.sceneItems}>
        {scene.items.map(([emoji, anim], i) => (
          <span
            key={i}
            className={ANIM_CLASSES[anim] || 'anim-float'}
            style={{ ...styles.itemEmoji, animationDelay: `${i * 0.3}s` }}
          >
            {emoji}
          </span>
        ))}
      </div>
    </div>
  );
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordSimilarity(a: string, b: string): number {
  const wordsA = a.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
  const wordsB = b.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
  if (wordsA.length === 0 || wordsB.length === 0) return 0;
  const setB = new Set(wordsB);
  const matchCount = wordsA.filter(w => setB.has(w)).length;
  return matchCount / Math.max(wordsA.length, wordsB.length);
}

type FeedbackType = 'perfect' | 'great' | 'almost' | 'wrong' | 'no_speech' | null;

interface FeedbackInfo {
  emoji: string;
  text: string;
  cardBg: string;
  borderColor: string;
  animClass: string;
}

const FEEDBACK: Record<string, FeedbackInfo> = {
  perfect: {
    emoji: '🎉',
    text: 'Perfect! ⭐',
    cardBg: '#4CAF50',
    borderColor: '#388E3C',
    animClass: 'fb-perfect',
  },
  great: {
    emoji: '👏',
    text: 'Great job!',
    cardBg: '#C8E6C9',
    borderColor: '#4CAF50',
    animClass: 'fb-great',
  },
  almost: {
    emoji: '👍',
    text: 'Almost! Try again!',
    cardBg: '#FFF3E0',
    borderColor: '#FF9800',
    animClass: 'fb-almost',
  },
  wrong: {
    emoji: '🤔',
    text: 'Not quite. Listen again!',
    cardBg: '#FFEBEE',
    borderColor: '#EF5350',
    animClass: 'fb-wrong',
  },
  no_speech: {
    emoji: '🤷',
    text: "I didn't hear anything. Try again!",
    cardBg: '#E3F2FD',
    borderColor: '#42A5F5',
    animClass: 'fb-none',
  },
};

type Phase = 'idle' | 'recording' | 'transcribing' | 'result';

export default function SpeakPage() {
  const [sentence, setSentence] = useState('');
  const [scene, setScene] = useState<Scene | null>(null);
  const [displayText, setDisplayText] = useState('');
  const [micSupported, setMicSupported] = useState(true);
  const [counter, setCounter] = useState(0);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState('');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [feedback, setFeedback] = useState<FeedbackType>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const latestTranscriptRef = useRef('');
  const [playing, setPlaying] = useState(false);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      synthRef.current = window.speechSynthesis;
    }
  }, []);

  const playSentence = useCallback(() => {
    if (!synthRef.current || playing || !sentence) return;
    synthRef.current.cancel();
    const utterance = new SpeechSynthesisUtterance(sentence);
    utterance.lang = 'en-US';
    utterance.rate = 0.85;
    utterance.onstart = () => setPlaying(true);
    utterance.onend = () => setPlaying(false);
    utterance.onerror = () => setPlaying(false);
    synthRef.current.speak(utterance);
  }, [sentence, playing]);

  const correct = feedback === 'perfect' || feedback === 'great';

  const pickSentence = useCallback(async () => {
    setLoading(true);
    setApiError('');
    setDisplayText('');
    setFeedback(null);
    setScene(null);
    setPhase('idle');
    latestTranscriptRef.current = '';

    try {
      const res = await fetch('/api/generate-sentence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history }),
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

  useEffect(() => {
    pickSentence();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setMicSupported(false);
    }
  }, []);

  const stopMediaTracks = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stopMediaTracks();

        setPhase('transcribing');
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.webm');

        try {
          const res = await fetch('/api/transcribe', {
            method: 'POST',
            body: formData,
          });

          const data = await res.json();
          const transcript = (data.transcript || '').trim();

          if (!transcript) {
            setDisplayText('');
            setFeedback('no_speech');
            setPhase('result');
            return;
          }

          setDisplayText(transcript);
          latestTranscriptRef.current = transcript;
          setPhase('result');

          const normT = normalize(transcript);
          const normS = normalize(sentence);

          if (normT === normS) {
            setFeedback('perfect');
            setCounter((c) => c + 1);
            setHistory((prev) => [...prev, { sentence, transcript, correct: true }]);
            fireConfetti();
          } else if (normT.length > 0 && wordSimilarity(normT, normS) >= 0.6) {
            setFeedback('almost');
            setHistory((prev) => [...prev, { sentence, transcript, correct: false }]);
          } else {
            setFeedback('wrong');
            setHistory((prev) => [...prev, { sentence, transcript, correct: false }]);
          }
        } catch {
          setDisplayText('');
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

  const fireConfetti = () => {
    const duration = 3000;
    const end = Date.now() + duration;
    const frame = () => {
      confetti({
        particleCount: 2,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.7 },
        colors: ['#FFD700', '#00BFFF', '#FF69B4'],
      });
      confetti({
        particleCount: 2,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.7 },
        colors: ['#32CD32', '#FF4500', '#9370DB'],
      });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    setTimeout(() => {
      confetti({
        particleCount: 150,
        spread: 100,
        origin: { y: 0.5 },
        colors: ['#FFD700', '#00BFFF', '#FF69B4', '#32CD32', '#FF4500'],
      });
    }, 100);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  const handleRecordClick = () => {
    if (phase === 'recording') {
      stopRecording();
    } else {
      setFeedback(null);
      setDisplayText('');
      latestTranscriptRef.current = '';
      startRecording();
    }
  };

  const handleNext = () => {
    const transcript = latestTranscriptRef.current;
    if (transcript && !correct && phase === 'result') {
      setHistory((prev) => [
        ...prev,
        { sentence, transcript, correct: false },
      ]);
    }
    pickSentence();
  };

  const getButtonConfig = () => {
    if (phase === 'recording') {
      return { label: '⏹ 停止录音', bg: '#FF6B6B', color: '#fff', disabled: false };
    }
    if (phase === 'transcribing') {
      return { label: '🔄 识别中...', bg: '#CCC', color: '#666', disabled: true };
    }
    if (correct) {
      return { label: '✅ 答对了', bg: '#4CAF50', color: '#fff', disabled: true };
    }
    return { label: '🎙 点击开始跟读', bg: '#FFD700', color: '#333', disabled: false };
  };

  const btn = getButtonConfig();
  const fb = feedback ? FEEDBACK[feedback] : null;

  return (
    <div style={styles.wrapper}>
      <style>{`
        @keyframes anim-float {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-16px) scale(1.08); }
        }
        @keyframes anim-blink {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.3; transform: scale(0.9); }
        }
        @keyframes anim-bounce {
          0%, 100% { transform: translateY(0); }
          30% { transform: translateY(-24px); }
          60% { transform: translateY(-8px); }
        }
        @keyframes anim-shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px) rotate(-5deg); }
          40% { transform: translateX(8px) rotate(5deg); }
          60% { transform: translateX(-4px) rotate(-3deg); }
          80% { transform: translateX(4px) rotate(3deg); }
        }
        @keyframes anim-spin {
          0% { transform: rotate(0deg) scale(1); }
          100% { transform: rotate(360deg) scale(1); }
        }
        @keyframes anim-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.25); }
        }
        @keyframes popIn {
          0% { transform: scale(0.3); opacity: 0; }
          70% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes pulse-record {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,107,107,0.5); }
          50% { box-shadow: 0 0 0 12px rgba(255,107,107,0); }
        }
        @keyframes fbAlm {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-3px); }
          80% { transform: translateX(3px); }
        }
        @keyframes fbGreat {
          0%, 100% { transform: scale(1) rotate(0deg); }
          50% { transform: scale(1.05) rotate(2deg); }
        }

        .anim-float    { animation: anim-float 3s ease-in-out infinite; }
        .anim-blink    { animation: anim-blink 2s ease-in-out infinite; }
        .anim-bounce   { animation: anim-bounce 1.2s ease-in-out infinite; }
        .anim-shake    { animation: anim-shake 0.8s ease-in-out infinite; }
        .anim-spin     { animation: anim-spin 2s linear infinite; }
        .anim-pulse    { animation: anim-pulse 1.5s ease-in-out infinite; }
        .fb-perfect    { animation: popIn 0.5s ease-out; }
        .fb-great      { animation: fbGreat 0.6s ease-in-out; }
        .fb-almost     { animation: fbAlm 0.5s ease-in-out; }
        .fb-wrong      { animation: anim-shake 0.4s ease-in-out; }
        .fb-none       { animation: popIn 0.4s ease-out; }
      `}</style>

      {[...Array(6)].map((_, i) => (
        <div
          key={i}
          style={{
            ...styles.floatBubble,
            width: 30 + (i * 10),
            height: 30 + (i * 10),
            top: `${10 + (i * 14)}%`,
            left: `${5 + (i * 16)}%`,
            background: [
              '#FFD700',
              '#FF69B4',
              '#87CEEB',
              '#98FB98',
              '#FFA07A',
              '#DDA0DD',
            ][i],
            animationDelay: `${i * 0.7}s`,
            animationDuration: `${3 + i * 0.6}s`,
          }}
        />
      ))}

      {!micSupported && (
        <div style={styles.errorBanner}>
          ⚠️ 无法访问麦克风，请使用 HTTPS 或允许麦克风权限。
        </div>
      )}

      {apiError && (
        <div style={styles.errorBanner}>
          ⚠️ {apiError}
        </div>
      )}

      <div style={styles.header}>
        <h1 style={styles.title}>🎤 英语口语小练习</h1>
        <p style={styles.subtitle}>
          跟我一起大声读吧！🌟
          {counter > 0 && (
            <span style={styles.streak}> 已通关 {counter} 关</span>
          )}
        </p>
      </div>

      <div
        style={{
          ...styles.card,
          backgroundColor: fb?.cardBg || '#FFFFFF',
          borderColor: fb?.borderColor || '#FFD700',
        }}
      >
        {loading ? (
          <div style={styles.loadingContainer}>
            <div style={styles.spinner} />
            <p style={styles.loadingText}>AI 老师正在出题...</p>
          </div>
        ) : (
          <>
            <SceneDisplay scene={scene} />

            <div style={styles.cardInner}>
              <p style={styles.sentenceText}>{sentence}</p>
              <button
                onClick={playSentence}
                disabled={loading || playing}
                style={{
                  ...styles.playBtn,
                  opacity: loading ? 0.4 : 1,
                  animation: playing ? 'pulse-record 1s ease-in-out infinite' : 'none',
                }}
              >
                {playing ? '🔊' : '🔈'}
              </button>
            </div>

            {displayText && (
              <div style={styles.transcriptBox}>
                <span style={styles.transcriptLabel}>🗣 你说的：</span>
                <span style={styles.transcriptText}>{displayText}</span>
              </div>
            )}

            {fb && (
              <div className={fb.animClass} style={{ ...styles.feedbackBanner, color: fb.borderColor }}>
                <span style={styles.feedbackEmoji}>{fb.emoji}</span>
                <span style={styles.feedbackText}>{fb.text}</span>
              </div>
            )}
          </>
        )}
      </div>

      {!loading && (
        <button
          onClick={handleRecordClick}
          disabled={!micSupported || correct || !!apiError || btn.disabled}
          style={{
            ...styles.listenBtn,
            backgroundColor: btn.bg,
            color: btn.color,
            opacity: !micSupported || correct || apiError || btn.disabled ? 0.5 : 1,
            animation: phase === 'recording' ? 'pulse-record 1.5s ease-in-out infinite' : 'none',
          }}
        >
          {btn.label}
        </button>
      )}

      <button
        onClick={handleNext}
        disabled={phase === 'recording' || loading || phase === 'transcribing'}
        style={{
          ...styles.nextBtn,
          opacity: phase === 'recording' || loading || phase === 'transcribing' ? 0.4 : 1,
        }}
      >
        {loading ? '⏳ 生成中...' : '➡️ 下一关'}
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    minHeight: '100dvh',
    background: 'linear-gradient(135deg, #87CEEB 0%, #FFFACD 50%, #FFE4B5 100%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 20px',
    fontFamily: '"Comic Sans MS", "Chalkboard SE", "Segoe Print", cursive, sans-serif',
    position: 'relative',
    overflow: 'hidden',
  },
  floatBubble: {
    position: 'absolute',
    borderRadius: '50%',
    opacity: 0.25,
    animation: 'anim-float 4s ease-in-out infinite',
    pointerEvents: 'none',
  },
  errorBanner: {
    background: '#FF6B6B',
    color: '#fff',
    padding: '12px 20px',
    borderRadius: 12,
    marginBottom: 20,
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 1.5,
    maxWidth: 400,
    width: '100%',
  },
  header: {
    textAlign: 'center',
    marginBottom: 28,
    position: 'relative',
    zIndex: 1,
  },
  title: {
    fontSize: 28,
    color: '#FF6B00',
    marginBottom: 6,
    textShadow: '2px 2px 0 rgba(255,255,255,0.7)',
    lineHeight: 1.3,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  streak: {
    color: '#FF6B00',
    fontWeight: 'bold',
    fontSize: 15,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    padding: '24px 24px 20px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
    textAlign: 'center',
    transition: 'background-color 0.5s ease, border-color 0.5s ease',
    border: '4px solid #FFD700',
    marginBottom: 24,
    position: 'relative',
    zIndex: 1,
    minHeight: 220,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  spinner: {
    width: 40,
    height: 40,
    border: '4px solid #FFD700',
    borderTopColor: '#FF6B00',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  loadingText: {
    fontSize: 16,
    color: '#888',
  },
  sceneContainer: {
    position: 'relative',
    minHeight: 120,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  sceneBg: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
  },
  bgEmoji: {
    position: 'absolute',
    fontSize: 24,
    opacity: 0.5,
  },
  sceneMain: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  mainEmoji: {
    fontSize: 64,
    lineHeight: 1,
    display: 'inline-block',
  },
  sceneItems: {
    display: 'flex',
    justifyContent: 'center',
    gap: 12,
    marginTop: 4,
    zIndex: 2,
  },
  itemEmoji: {
    fontSize: 28,
    lineHeight: 1,
    display: 'inline-block',
  },
  cardEmoji: {
    fontSize: 48,
    marginBottom: 12,
    animation: 'popIn 0.4s ease-out',
  },
  cardInner: {
    marginBottom: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  playBtn: {
    background: 'none',
    border: '2px solid #DDD',
    borderRadius: '50%',
    width: 44,
    height: 44,
    fontSize: 20,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
    WebkitTapHighlightColor: 'transparent',
    touchAction: 'manipulation',
    flexShrink: 0,
  },
  sentenceText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    lineHeight: 1.4,
    wordBreak: 'break-word',
  },
  transcriptBox: {
    fontSize: 17,
    color: '#555',
    background: '#F5F5F5',
    borderRadius: 14,
    padding: '12px 16px',
    border: '2px dashed #DDD',
    marginTop: 8,
    animation: 'popIn 0.3s ease-out',
  },
  transcriptLabel: {
    fontWeight: 'bold',
    color: '#888',
  },
  transcriptText: {
    color: '#333',
  },
  feedbackBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    padding: '10px 16px',
    borderRadius: 14,
    background: 'rgba(255,255,255,0.85)',
    fontSize: 18,
    fontWeight: 'bold',
  },
  feedbackEmoji: {
    fontSize: 26,
  },
  feedbackText: {
    fontSize: 17,
  },
  listenBtn: {
    padding: '16px 44px',
    fontSize: 20,
    fontWeight: 'bold',
    border: 'none',
    borderRadius: 50,
    cursor: 'pointer',
    boxShadow: '0 4px 15px rgba(0,0,0,0.15)',
    transition: 'all 0.25s ease',
    marginBottom: 16,
    position: 'relative',
    zIndex: 1,
    minWidth: 220,
    WebkitTapHighlightColor: 'transparent',
    touchAction: 'manipulation',
  },
  nextBtn: {
    padding: '14px 40px',
    fontSize: 18,
    fontWeight: 'bold',
    border: '3px solid #4CAF50',
    borderRadius: 50,
    cursor: 'pointer',
    backgroundColor: '#fff',
    color: '#4CAF50',
    transition: 'all 0.25s ease',
    position: 'relative',
    zIndex: 1,
    WebkitTapHighlightColor: 'transparent',
    touchAction: 'manipulation',
  },
};
