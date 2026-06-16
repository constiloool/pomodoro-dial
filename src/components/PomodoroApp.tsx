"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Maximize2,
  Minimize2,
  Palette,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  SkipForward,
  Volume2
} from "lucide-react";

type TimerMode = "focus" | "short" | "long";

type ThemeSettings = {
  background: string;
  primary: string;
  accent: string;
  text: string;
};

const durations: Record<TimerMode, number> = {
  focus: 25 * 60,
  short: 5 * 60,
  long: 15 * 60
};

const modeLabels: Record<TimerMode, string> = {
  focus: "Focus Session",
  short: "Short Break",
  long: "Long Break"
};

const presets: Array<{ name: string; settings: ThemeSettings }> = [
  {
    name: "Forest Focus",
    settings: { background: "#10221c", primary: "#67d8a3", accent: "#d7b56d", text: "#f1ebd8" }
  },
  {
    name: "Midnight",
    settings: { background: "#090d18", primary: "#46d9ff", accent: "#9d8cff", text: "#eef7ff" }
  },
  {
    name: "Sunset",
    settings: { background: "#24122a", primary: "#ff8b5c", accent: "#ffc65b", text: "#fff0e6" }
  },
  {
    name: "Minimal Dark",
    settings: { background: "#161719", primary: "#f5f7fb", accent: "#9097a3", text: "#f4f4f2" }
  }
];

const storageKey = "pomodoro-theme-settings";

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function getNextMode(currentMode: TimerMode, completedFocusSessions: number): TimerMode {
  if (currentMode === "focus") {
    return (completedFocusSessions + 1) % 4 === 0 ? "long" : "short";
  }

  return "focus";
}

function playFinishTone() {
  if (typeof window === "undefined") return;

  const AudioContextConstructor: typeof AudioContext | undefined =
    window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) return;

  const context = new AudioContextConstructor();
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(520, context.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(780, context.currentTime + 0.22);
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.42);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.45);
}

export function PomodoroApp() {
  const [mode, setMode] = useState<TimerMode>("focus");
  const [remainingSeconds, setRemainingSeconds] = useState(durations.focus);
  const [isRunning, setIsRunning] = useState(false);
  const [completedFocusSessions, setCompletedFocusSessions] = useState(0);
  const [theme, setTheme] = useState<ThemeSettings>(presets[0].settings);
  const [showSettings, setShowSettings] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [pulse, setPulse] = useState(false);
  const intervalRef = useRef<number | null>(null);

  const totalSeconds = durations[mode];
  const progress = Math.max(0, Math.min(1, remainingSeconds / totalSeconds));
  const elapsedDegrees = 360 - progress * 360;

  const themeStyle = useMemo(
    () =>
      ({
        "--app-bg": theme.background,
        "--timer-primary": theme.primary,
        "--timer-accent": theme.accent,
        "--timer-text": theme.text
      }) as React.CSSProperties,
    [theme]
  );

  const switchMode = useCallback((nextMode: TimerMode, keepRunning = false) => {
    setMode(nextMode);
    setRemainingSeconds(durations[nextMode]);
    setIsRunning(keepRunning);
  }, []);

  const completeSession = useCallback(() => {
    playFinishTone();
    setPulse(true);
    window.setTimeout(() => setPulse(false), 900);

    setCompletedFocusSessions((sessions) => {
      const updatedSessions = mode === "focus" ? sessions + 1 : sessions;
      const nextMode = getNextMode(mode, sessions);
      setMode(nextMode);
      setRemainingSeconds(durations[nextMode]);
      setIsRunning(false);
      return updatedSessions;
    });
  }, [mode]);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(storageKey);
    if (!savedTheme) return;

    try {
      setTheme(JSON.parse(savedTheme) as ThemeSettings);
    } catch {
      window.localStorage.removeItem(storageKey);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(theme));
  }, [theme]);

  useEffect(() => {
    if (!isRunning) {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = window.setInterval(() => {
      setRemainingSeconds((seconds) => {
        if (seconds <= 1) {
          if (intervalRef.current) window.clearInterval(intervalRef.current);
          window.setTimeout(completeSession, 0);
          return 0;
        }

        return seconds - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [completeSession, isRunning]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT") return;

      if (event.code === "Space") {
        event.preventDefault();
        setIsRunning((running) => !running);
      }

      if (event.key.toLowerCase() === "r") {
        setIsRunning(false);
        setRemainingSeconds(durations[mode]);
      }

      if (event.key.toLowerCase() === "f") {
        setIsFocusMode((value) => !value);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode]);

  const skipSession = () => {
    const nextMode = getNextMode(mode, completedFocusSessions);
    switchMode(nextMode, false);
  };

  const toggleFullscreen = async () => {
    setIsFocusMode((value) => !value);

    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // The in-app focus mode still works when browser fullscreen is blocked.
    }
  };

  return (
    <main className={`min-h-screen overflow-x-hidden px-4 py-5 text-[var(--timer-text)] sm:px-6 lg:px-8 ${isFocusMode ? "pomodoro-focus-mode" : ""}`} style={themeStyle}>
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,color-mix(in_srgb,var(--timer-primary)_28%,transparent),transparent_34%),radial-gradient(circle_at_bottom_right,color-mix(in_srgb,var(--timer-accent)_24%,transparent),transparent_38%),linear-gradient(135deg,var(--app-bg),#07080b_72%)]" />
      <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-7xl flex-col gap-5">
        <header className={`flex items-center justify-between gap-3 ${isFocusMode ? "opacity-0 pointer-events-none h-0 overflow-hidden" : ""}`}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color-mix(in_srgb,var(--timer-text)_68%,transparent)]">Pomodoro Dial</p>
            <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Deep Work Timer</h1>
          </div>
          <button className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/10 text-[var(--timer-text)] backdrop-blur transition hover:bg-white/16" onClick={() => setShowSettings((value) => !value)} aria-label="Color settings">
            <Settings2 size={20} />
          </button>
        </header>

        <section className="grid flex-1 items-center gap-5 lg:grid-cols-[1fr_360px]">
          <div className={`relative overflow-hidden rounded-[2rem] border border-white/12 bg-white/[0.08] p-4 shadow-2xl shadow-black/30 backdrop-blur-2xl sm:p-7 lg:p-10 ${pulse ? "pomodoro-pulse" : ""}`}>
            <div className="mx-auto flex max-w-3xl flex-col items-center">
              <div className={`mb-5 flex rounded-full border border-white/12 bg-black/20 p-1 ${isFocusMode ? "opacity-0 pointer-events-none absolute" : ""}`}>
                {(Object.keys(durations) as TimerMode[]).map((timerMode) => (
                  <button
                    key={timerMode}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${mode === timerMode ? "bg-[var(--timer-primary)] text-black shadow-lg shadow-black/20" : "text-[color-mix(in_srgb,var(--timer-text)_72%,transparent)] hover:text-[var(--timer-text)]"}`}
                    onClick={() => switchMode(timerMode)}
                  >
                    {timerMode === "focus" ? "Focus" : timerMode === "short" ? "Short" : "Long"}
                  </button>
                ))}
              </div>

              <p className="mb-4 rounded-full border border-white/12 bg-black/20 px-4 py-2 text-sm font-semibold text-[color-mix(in_srgb,var(--timer-text)_82%,transparent)]">{modeLabels[mode]}</p>

              <div className="relative grid aspect-square w-full max-w-[min(72vw,32rem)] place-items-center sm:max-w-[34rem]">
                <div
                  className="absolute inset-0 rounded-full shadow-[inset_0_1.2rem_2.8rem_rgba(255,255,255,0.12),inset_0_-2rem_3rem_rgba(0,0,0,0.34),0_2rem_4rem_rgba(0,0,0,0.3)]"
                  style={{
                    background: `conic-gradient(from -90deg, rgba(0,0,0,0.18) 0deg ${elapsedDegrees}deg, var(--timer-primary) ${elapsedDegrees}deg 360deg)`
                  }}
                />
                <div className="absolute inset-[7%] rounded-full border border-white/15 bg-[radial-gradient(circle_at_35%_24%,rgba(255,255,255,0.18),transparent_28%),linear-gradient(145deg,rgba(0,0,0,0.34),rgba(255,255,255,0.08))]" />
                <div className="absolute inset-[13%] rounded-full border border-black/25 bg-[color-mix(in_srgb,var(--app-bg)_78%,black)] shadow-[inset_0_1rem_2rem_rgba(0,0,0,0.38)]" />
                <div className="relative z-10 text-center">
                  <div className="font-mono text-[clamp(4.5rem,17vw,10rem)] font-bold leading-none tracking-normal text-[var(--timer-text)] drop-shadow-[0_0_2rem_color-mix(in_srgb,var(--timer-primary)_38%,transparent)]">{formatTime(remainingSeconds)}</div>
                  <p className="mt-4 text-sm font-semibold uppercase tracking-[0.24em] text-[color-mix(in_srgb,var(--timer-text)_62%,transparent)]">{Math.round(progress * 100)}% remaining</p>
                </div>
              </div>

              <div className="mt-7 flex w-full flex-wrap items-center justify-center gap-3">
                <button className="inline-flex h-13 min-h-12 items-center gap-2 rounded-full bg-[var(--timer-primary)] px-6 py-3 font-bold text-black shadow-xl shadow-black/25 transition hover:scale-[1.02]" onClick={() => setIsRunning((value) => !value)}>
                  {isRunning ? <Pause size={20} /> : <Play size={20} />}
                  {isRunning ? "Pause" : "Start"}
                </button>
                <button className="inline-flex min-h-12 items-center gap-2 rounded-full border border-white/14 bg-white/10 px-5 py-3 font-semibold backdrop-blur transition hover:bg-white/16" onClick={() => { setIsRunning(false); setRemainingSeconds(totalSeconds); }}>
                  <RotateCcw size={18} />
                  Reset
                </button>
                <button className="inline-flex min-h-12 items-center gap-2 rounded-full border border-white/14 bg-white/10 px-5 py-3 font-semibold backdrop-blur transition hover:bg-white/16" onClick={skipSession}>
                  <SkipForward size={18} />
                  Skip
                </button>
                <button className="inline-flex min-h-12 items-center gap-2 rounded-full border border-white/14 bg-white/10 px-5 py-3 font-semibold backdrop-blur transition hover:bg-white/16" onClick={toggleFullscreen}>
                  {isFocusMode ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                  {isFocusMode ? "Exit" : "Focus"}
                </button>
              </div>
            </div>
          </div>

          <aside className={`${isFocusMode ? "hidden" : "block"} rounded-[1.5rem] border border-white/12 bg-black/20 p-5 shadow-2xl shadow-black/20 backdrop-blur-2xl lg:self-stretch ${showSettings ? "block" : "hidden lg:block"}`}>
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[color-mix(in_srgb,var(--timer-text)_58%,transparent)]">Customize</p>
                <h2 className="mt-1 text-xl font-semibold">Timer Colors</h2>
              </div>
              <Palette size={22} />
            </div>

            <div className="grid gap-3">
              {presets.map((preset) => (
                <button key={preset.name} className="flex items-center justify-between rounded-2xl border border-white/12 bg-white/[0.06] p-3 text-left transition hover:bg-white/[0.1]" onClick={() => setTheme(preset.settings)}>
                  <span className="font-semibold">{preset.name}</span>
                  <span className="flex items-center gap-1">
                    {Object.values(preset.settings).map((color) => (
                      <span key={color} className="h-5 w-5 rounded-full border border-white/25" style={{ background: color }} />
                    ))}
                    {JSON.stringify(theme) === JSON.stringify(preset.settings) ? <Check size={18} /> : null}
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-6 grid gap-4">
              {[
                ["Background", "background"],
                ["Timer", "primary"],
                ["Accent", "accent"],
                ["Text", "text"]
              ].map(([label, key]) => (
                <label key={key} className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.05] p-3">
                  <span className="font-medium">{label}</span>
                  <input className="h-10 w-16 cursor-pointer rounded-lg border-0 bg-transparent" type="color" value={theme[key as keyof ThemeSettings]} onChange={(event) => setTheme((value) => ({ ...value, [key]: event.target.value }))} />
                </label>
              ))}
            </div>

            <div className="mt-6 rounded-2xl border border-white/12 bg-white/[0.05] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[color-mix(in_srgb,var(--timer-text)_78%,transparent)]">
                <Volume2 size={17} />
                Session tone enabled
              </div>
              <p className="mt-3 text-sm leading-6 text-[color-mix(in_srgb,var(--timer-text)_62%,transparent)]">After four focus sessions, the timer offers a longer reset interval automatically.</p>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
