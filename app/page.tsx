'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// ── Types ──
interface H { sentence: string; transcript: string; correct: boolean }
interface Sc { main: string; effect: string; bg: string[]; items: [string, string][] }
interface Wm { word: string; matched: boolean }
interface Co { id: string; name: string; emoji: string; sentences: number }
interface Cp { completed: number; starsPerSentence: number[] }

const COURSES: Co[] = [
  { id: 'animals', name: 'Animals', emoji: '🐾', sentences: 5 },
  { id: 'food', name: 'Food', emoji: '🍎', sentences: 5 },
  { id: 'colors', name: 'Colors', emoji: '🎨', sentences: 5 },
  { id: 'family', name: 'Family', emoji: '👨‍👩‍👧‍👦', sentences: 4 },
  { id: 'toys', name: 'Toys', emoji: '🧸', sentences: 5 },
  { id: 'nature', name: 'Nature', emoji: '🌿', sentences: 5 },
  { id: 'body', name: 'Body', emoji: '💪', sentences: 4 },
  { id: 'weather', name: 'Weather', emoji: '🌤️', sentences: 4 },
  { id: 'transport', name: 'Transport', emoji: '🚗', sentences: 5 },
  { id: 'home', name: 'At Home', emoji: '🏠', sentences: 5 },
];

const A: Record<string, string> = {
  blink: 'animate-[blink_2s_ease-in-out_infinite]',
  bounce: 'animate-[bounce_1.2s_ease-in-out_infinite]',
  shake: 'animate-[shake_0.8s_ease-in-out_infinite]',
  spin: 'animate-[spin_2s_linear_infinite]',
  float: 'animate-[float_3s_ease-in-out_infinite]',
  pulse: 'animate-[pulse_1.5s_ease-in-out_infinite]',
};

const FBM: Record<string, string> = {
  perfect: '🎉 Perfect!',
  great: '👏 Great!',
  almost: '👍 Close!',
  wrong: '🤔 Try again',
  no_speech: "🤷 Didn't hear",
};

function starCount(f: string) { return f === 'perfect' ? 3 : f === 'great' ? 2 : f === 'almost' ? 1 : 0 }

function nm(t: string) { return t.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim() }

function wm(s: string, t: string): Wm[] {
  const ws = s.split(/\s+/).filter(Boolean);
  const sp = new Set(t.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/));
  return ws.map(w => ({ word: w, matched: sp.has(w.toLowerCase().replace(/[^a-z0-9]/g, '')) }));
}

function wa(a: string, b: string): number {
  const wa = a.replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
  const wb = b.replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
  if (!wa.length || !wb.length) return 0;
  return wa.filter(w => new Set(wb).has(w)).length / Math.max(wa.length, wb.length);
}

function SceneCard({ sc }: { sc: Sc | null }) {
  if (!sc) return <div className="text-4xl text-center py-4">🃏</div>;
  return (
    <div className="relative min-h-[130px] flex flex-col items-center justify-center py-1">
      {sc.bg.map((e, i) => (
        <span key={i} className="absolute text-xl opacity-25 pointer-events-none select-none"
          style={{ left: `${15 + i * 30}%`, top: `${10 + (i % 2) * 50}%` }}>{e}</span>
      ))}
      <span className={`text-7xl leading-none z-10 ${A[sc.effect] || ''}`}>{sc.main}</span>
      <div className="flex justify-center gap-3 mt-0.5 z-10">
        {sc.items.map(([e, a], i) => (
          <span key={i} className={`text-2xl leading-none ${A[a] || ''}`} style={{ animationDelay: `${i * 0.25}s` }}>{e}</span>
        ))}
      </div>
    </div>
  );
}

type FB = 'perfect' | 'great' | 'almost' | 'wrong' | 'no_speech' | null;
type Ph = 'idle' | 'recording' | 'transcribing' | 'result';

export default function SpeakPage() {
  const [ci, setCi] = useState(0);
  const [pr, setPr] = useState<Cp>(() => {
    if (typeof window === 'undefined') return { completed: 0, starsPerSentence: [] };
    try { const p = localStorage.getItem('tf-p'); if (p) return JSON.parse(p) } catch {}
    return { completed: 0, starsPerSentence: [] };
  });
  const [mo, setMo] = useState(false);

  const course = COURSES[ci] || COURSES[0];
  const si = pr.starsPerSentence.length;
  const cd = si >= course.sentences;
  const ts = pr.starsPerSentence.reduce((a, b) => a + b, 0);
  const ad = ci >= COURSES.length - 1 && cd;

  useEffect(() => { try { localStorage.setItem('tf-p', JSON.stringify(pr)) } catch {} }, [pr]);

  const [sn, setSn] = useState('');
  const [sc, setSc] = useState<Sc | null>(null);
  const [dt, setDt] = useState('');
  const [mk, setMk] = useState(true);
  const [ld, setLd] = useState(true);
  const [ae, setAe] = useState('');
  const [hi, setHi] = useState<H[]>([]);
  const [ph, setPh] = useState<Ph>('idle');
  const [fb, setFb] = useState<FB>(null);
  const [wmV, setWmV] = useState<Wm[] | null>(null);
  const [au, setAu] = useState<string | null>(null);
  const [pl, setPl] = useState(false);
  const [ct, setCt] = useState(0);

  const mr = useRef<MediaRecorder | null>(null);
  const ac = useRef<Blob[]>([]);
  const str = useRef<MediaStream | null>(null);
  const ltr = useRef('');
  const sy = useRef<SpeechSynthesis | null>(null);

  useEffect(() => { if (typeof window !== 'undefined') sy.current = window.speechSynthesis }, []);
  useEffect(() => { return () => { if (au) URL.revokeObjectURL(au) } }, [au]);

  const tts = useCallback(() => {
    if (!sy.current || pl || !sn) return;
    sy.current.cancel();
    const u = new SpeechSynthesisUtterance(sn);
    u.lang = 'en-US'; u.rate = 0.85;
    u.onstart = () => setPl(true);
    u.onend = () => setPl(false);
    u.onerror = () => setPl(false);
    sy.current.speak(u);
  }, [sn, pl]);

  const cr = fb === 'perfect' || fb === 'great';

  const pk = useCallback(async (topic?: string) => {
    setLd(true); setAe(''); setDt(''); setFb(null); setWmV(null); setAu(null); setPh('idle'); ltr.current = '';
    try {
      const r = await fetch('/api/generate-sentence', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history: hi, topic }),
      });
      if (!r.ok) throw Error();
      const d = await r.json();
      setSn(d.sentence);
      if (d.scene) setSc(d.scene);
    } catch { setAe('出错了，点重试') }
    finally { setLd(false) }
  }, [hi]);

  useEffect(() => { pk(course.name) }, []); // eslint-disable-line
  useEffect(() => { if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) setMk(false) }, []);

  const sp = () => { str.current?.getTracks().forEach(t => t.stop()); str.current = null };

  const cf = () => {
    const end = Date.now() + 3000;
    const f = () => {
      confetti({ particleCount: 2, angle: 60, spread: 55, origin: { x: 0, y: 0.7 }, colors: ['#6C5CE7', '#FFD93D', '#00B894'] });
      confetti({ particleCount: 2, angle: 120, spread: 55, origin: { x: 1, y: 0.7 }, colors: ['#FF6B6B', '#6C5CE7', '#FFD93D'] });
      if (Date.now() < end) requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
    setTimeout(() => confetti({ particleCount: 100, spread: 100, origin: { y: 0.5 } }), 100);
  };

  const sr2 = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      str.current = stream;
      const rec = new MediaRecorder(stream);
      mr.current = rec; ac.current = [];
      rec.ondataavailable = e => { if (e.data.size > 0) ac.current.push(e.data) };
      rec.onstop = async () => {
        sp(); setPh('transcribing'); setWmV(null);
        const blob = new Blob(ac.current, { type: 'audio/webm' });
        setAu(URL.createObjectURL(blob));
        const fd = new FormData(); fd.append('audio', blob, 'r.webm');
        try {
          const r = await fetch('/api/transcribe', { method: 'POST', body: fd });
          const d = await r.json();
          const t = (d.transcript || '').trim();
          if (!t) { setFb('no_speech'); setPh('result'); return }
          setDt(t); ltr.current = t;
          setWmV(wm(sn, t));
          setPh('result');
          const nt = nm(t), ns = nm(sn);
          let f: FB = 'wrong';
          if (nt === ns) { f = 'perfect'; setCt(c => c + 1); setHi(h => [...h, { sentence: sn, transcript: t, correct: true }]); cf() }
          else if (nt.length > 0 && wa(nt, ns) >= 0.6) { f = 'almost'; setHi(h => [...h, { sentence: sn, transcript: t, correct: false }]) }
          else { setHi(h => [...h, { sentence: sn, transcript: t, correct: false }]) }
          const st = starCount(f);
          if (st > 0 && !cd) { setPr(p => { const n = { ...p, starsPerSentence: [...p.starsPerSentence, st] }; if (n.starsPerSentence.length >= course.sentences) n.completed = p.completed + 1; return n }) }
          setFb(f);
        } catch { setFb('no_speech'); setPh('result') }
      };
      rec.start(); setPh('recording');
    } catch { setMk(false); setPh('idle') }
  };

  const stp = () => { if (mr.current?.state === 'recording') mr.current.stop() };

  const hdl = () => {
    if (ph === 'recording') { stp(); return }
    setFb(null); setWmV(null); setAu(null); setDt(''); ltr.current = '';
    sr2();
  };

  const gn = () => {
    if (ad) { setMo(true); return }
    const i = ci + 1;
    setCi(i >= COURSES.length ? COURSES.length - 1 : i);
    setPr(p => ({ completed: p.completed, starsPerSentence: [] }));
    pk(COURSES[i >= COURSES.length ? COURSES.length - 1 : i].name);
  };

  const hn = () => {
    if (cd) { gn(); return }
    const t = ltr.current;
    if (t && !cr && ph === 'result') setHi(h => [...h, { sentence: sn, transcript: t, correct: false }]);
    pk(course.name);
  };

  const jp = (i: number) => { setCi(i); setPr({ completed: 0, starsPerSentence: [] }); setMo(false); pk(COURSES[i].name) };

  const filter = fb ? FBM[fb] : null;

  return (
    <div className="min-h-dvh bg-gradient-to-br from-white via-primary-light/20 to-white font-sans relative">
      <div className="max-w-[400px] mx-auto px-5 py-6 flex flex-col items-center min-h-dvh">

        {/* top bar */}
        <div className="w-full flex items-center justify-between mb-5">
          <button onClick={() => setMo(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-sm font-medium text-muted-foreground hover:bg-border transition-colors">
            {course.emoji} {course.name}
          </button>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            {ts > 0 && <span>⭐ {ts}</span>}
            {pr.completed > 0 && <span>🏆 {pr.completed}</span>}
          </div>
        </div>

        {/* progress */}
        {!cd && (
          <Progress value={(si / course.sentences) * 100} className="w-full h-1 mb-6" />
        )}

        {/* loading / course complete / main card */}
        {ld ? (
          <div className="flex flex-col items-center gap-4 py-20">
            <div className="w-9 h-9 border-[3px] border-primary/20 border-t-primary rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">出题中...</p>
          </div>
        ) : cd && ph === 'idle' ? (
          <Card className="w-full border-border/40 text-center py-10 px-6 shadow-sm">
            <div className="text-5xl mb-4 animate-[pop-in_0.5s_ease-out]">🎉</div>
            <h2 className="text-lg font-bold text-accent mb-1">Complete!</h2>
            <div className="text-2xl my-4 leading-relaxed">
              {Array.from({ length: ts }, (_, i) => (
                <span key={i} className="inline-block animate-[pop-in_0.3s_ease-out_both]" style={{ animationDelay: `${i * 0.05}s` }}>⭐</span>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mb-5">{ts}/{course.sentences * 3} stars</p>
            <Button className="rounded-lg bg-accent hover:bg-accent/90 text-white text-sm" onClick={gn}>
              {ad ? 'All courses →' : 'Next course →'}
            </Button>
          </Card>
        ) : (
          <>
            {/* sentence card */}
            <Card className="w-full border-border/40 text-center pt-5 pb-4 px-5 shadow-sm">
              <SceneCard sc={sc} />
              <div className="flex items-center justify-center gap-2 mt-1">
                <p className="text-[26px] font-bold text-foreground leading-snug">
                  {wmV
                    ? wmV.map((wm, i) => (
                        <span key={i} className={wm.matched ? 'text-accent font-bold underline decoration-accent/40 underline-offset-4' : ''}>
                          {wm.word}{i < wmV.length - 1 ? '\u00A0' : ''}
                        </span>
                      ))
                    : sn}
                </p>
                <button onClick={tts} disabled={ld || pl}
                  className={`w-9 h-9 rounded-lg border border-border bg-secondary flex items-center justify-center text-sm shrink-0 transition-all hover:bg-border disabled:opacity-40 ${pl ? 'animate-[pulse-ring_1s_ease-in-out_infinite]' : ''}`}>
                  {pl ? '🔊' : '🔈'}
                </button>
              </div>
            </Card>

            {/* record */}
            <Button size="lg"
              className={`w-full max-w-[220px] rounded-xl text-base font-semibold mt-6 shadow-sm transition-all
                ${ph === 'recording' ? 'bg-destructive text-white animate-[pulse-ring_1.5s_ease-in-out_infinite]' : ''}
                ${ph === 'transcribing' ? 'bg-muted text-muted-foreground' : ''}
                ${cr ? 'bg-accent text-white' : ''}
                ${ph === 'idle' || ph === 'result' ? 'bg-primary text-white hover:bg-primary/90' : ''}`}
              disabled={!mk || cr || !!ae || ph === 'transcribing'}
              onClick={hdl}>
              {ph === 'recording' ? '⏹ Stop' : ph === 'transcribing' ? '...' : cr ? '✅ Done' : '🎤 Speak'}
            </Button>

            {/* skip */}
            {!cr && ph !== 'recording' && ph !== 'transcribing' && (
              <Button variant="ghost" className="text-muted-foreground mt-3 text-xs" onClick={hn} disabled={ld}>
                Skip →
              </Button>
            )}
          </>
        )}

        {/* result area */}
        {(dt || filter) && !ld && !(cd && ph === 'idle') && (
          <div className="w-full mt-5 bg-white rounded-xl px-4 py-3.5 border border-border/50 shadow-sm animate-[pop-in_0.3s_ease-out]">
            {dt && (
              <div className="mb-2">
                <div className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-0.5">You said</div>
                <div className="text-base font-semibold text-foreground">{dt}</div>
              </div>
            )}
            {au && ph === 'result' && (
              <div className="flex gap-2 mb-2">
                <button onClick={tts} className="text-[11px] px-2.5 py-1 rounded-md bg-secondary text-muted-foreground hover:bg-border transition-colors">🔊 Model</button>
                <button onClick={() => new Audio(au).play()} className="text-[11px] px-2.5 py-1 rounded-md bg-secondary text-muted-foreground hover:bg-border transition-colors">▶ You</button>
              </div>
            )}
            {filter && (
              <div className="flex items-center gap-2 animate-[pop-in_0.3s_ease-out]">
                <span className="text-xl">{filter.split(' ')[0]}</span>
                <span className="text-sm text-muted-foreground font-medium">{filter.split(' ').slice(1).join(' ')}</span>
                {fb && starCount(fb) > 0 && !cd && (
                  <span className="ml-auto text-base">
                    {Array.from({ length: starCount(fb) }, (_, i) => (
                      <span key={i} className="inline-block animate-[pop-in_0.25s_ease-out_both]" style={{ animationDelay: `${i * 0.1}s` }}>⭐</span>
                    ))}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* errors */}
        {!mk && <p className="mt-3 text-xs text-destructive text-center">Microphone access needed</p>}
        {ae && <p className="mt-3 text-xs text-destructive text-center">{ae}</p>}

        {/* dialog */}
        <Dialog open={mo} onOpenChange={setMo}>
          <DialogContent className="rounded-xl max-w-[320px]">
            <DialogHeader>
              <DialogTitle className="text-base text-center">🏫 Courses</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-1.5 py-1">
              {COURSES.map((c, i) => {
                const cur = i === ci, past = i < ci;
                return (
                  <button key={c.id} onClick={() => jp(i)}
                    className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg border text-sm transition-all
                      ${cur ? 'bg-primary-light border-primary/30 font-medium text-primary' : past ? 'bg-accent-light border-accent/20 text-accent' : 'bg-secondary border-border/30 text-muted-foreground opacity-45'}`}>
                    <span className="text-lg">{c.emoji}</span>
                    <span className="flex-1 text-left">{c.name}</span>
                    {past && <span className="text-[10px]">✅</span>}
                    {cur && <span className="text-[10px] text-primary/60">active</span>}
                  </button>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
