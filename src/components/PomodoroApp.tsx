"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Clock3,
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

type TimeSettings = {
  focus: number;
  short: number;
  long: number;
  longBreakAfter: number;
};

type TimeSettingKey = keyof TimeSettings;

const defaultTimeSettings: TimeSettings = {
  focus: 25,
  short: 5,
  long: 15,
  longBreakAfter: 4
};

const timeSettingMeta: Record<TimeSettingKey, { label: string; min: number; max: number; suffix: string }> = {
  focus: { label: "Focus time", min: 1, max: 180, suffix: "min" },
  short: { label: "Short break", min: 1, max: 60, suffix: "min" },
  long: { label: "Long break", min: 1, max: 90, suffix: "min" },
  longBreakAfter: { label: "Long break after", min: 1, max: 12, suffix: "sessions" }
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

const themeStorageKey = "pomodoro-theme-settings";
const timeStorageKey = "pomodoro-time-settings";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function sanitizeTimeSettings(settings: Partial<TimeSettings>): TimeSettings {
  return (Object.keys(defaultTimeSettings) as TimeSettingKey[]).reduce((nextSettings, key) => {
    const meta = timeSettingMeta[key];
    const rawValue = Number(settings[key]);
    const value = Number.isFinite(rawValue) ? Math.round(rawValue) : defaultTimeSettings[key];

    return {
      ...nextSettings,
      [key]: clamp(value, meta.min, meta.max)
    };
  }, defaultTimeSettings);
}

function getDurationSeconds(mode: TimerMode, settings: TimeSettings) {
  return settings[mode] * 60;
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function getNextMode(currentMode: TimerMode, completedFocusSessions: number, settings: TimeSettings): TimerMode {
  if (currentMode === "focus") {
    return (completedFocusSessions + 1) % settings.longBreakAfter === 0 ? "long" : "short";
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
  const [timeSettings, setTimeSettings] = useState<TimeSettings>(defaultTimeSettings);
  const [mode, setMode] = useState<TimerMode>("focus");
  const [remainingSeconds, setRemainingSeconds] = useState(getDurationSeconds("focus", defaultTimeSettings));
  const [activeDurationSeconds, setActiveDurationSeconds] = useState(getDurationSeconds("focus", defaultTimeSettings));
  const [isRunning, setIsRunning] = useState(false);
  const [completedFocusSessions, setCompletedFocusSessions] = useState(0);
  const [theme, setTheme] = useState<ThemeSettings>(presets[0].settings);
  const [showSettings, setShowSettings] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [hasLoadedSettings, setHasLoadedSettings] = useState(false);
  const intervalRef = useRef<number | null>(null);
  const timerContainerRef = useRef<HTMLElement | null>(null);

  const progress = Math.max(0, Math.min(1, remainingSeconds / activeDurationSeconds));
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

  const resetCurrentMode = useCallback(() => {
    const duration = getDurationSeconds(mode, timeSettings);
    setIsRunning(false);
    setActiveDurationSeconds(duration);
    setRemainingSeconds(duration);
  }, [mode, timeSettings]);

  const switchMode = useCallback(
    (nextMode: TimerMode, keepRunning = false) => {
      const duration = getDurationSeconds(nextMode, timeSettings);
      setMode(nextMode);
      setActiveDurationSeconds(duration);
      setRemainingSeconds(duration);
      setIsRunning(keepRunning);
    },
    [timeSettings]
  );

  const updateTimeSetting = (key: TimeSettingKey, inputValue: string) => {
    const meta = timeSettingMeta[key];
    const numericValue = Number(inputValue);
    const nextValue = Number.isFinite(numericValue) ? clamp(Math.round(numericValue), meta.min, meta.max) : defaultTimeSettings[key];

    setTimeSettings((settings) => ({
      ...settings,
      [key]: nextValue
    }));

    if (!isRunning && (key === mode || (key === "longBreakAfter" && mode === "focus"))) {
      const nextSettings = { ...timeSettings, [key]: nextValue };
      if (key !== "longBreakAfter") {
        const duration = getDurationSeconds(mode, nextSettings);
        setActiveDurationSeconds(duration);
        setRemainingSeconds(duration);
      }
    }
  };

  const clearFullscreenSideEffects = useCallback(() => {
    document.body.classList.remove("fullscreen-active");
    document.body.style.overflow = "";
    document.body.style.cursor = "";
    document.documentElement.style.overflow = "";
    document.documentElement.style.cursor = "";
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }

      setShowSettings(false);
      await (timerContainerRef.current ?? document.documentElement).requestFullscreen();
    } catch {
      setIsFullscreen(Boolean(document.fullscreenElement));
      if (!document.fullscreenElement) {
        clearFullscreenSideEffects();
      }
    }
  }, [clearFullscreenSideEffects]);

  const completeSession = useCallback(() => {
    playFinishTone();
    setPulse(true);
    window.setTimeout(() => setPulse(false), 900);

    setCompletedFocusSessions((sessions) => {
      const updatedSessions = mode === "focus" ? sessions + 1 : sessions;
      const nextMode = getNextMode(mode, sessions, timeSettings);
      const duration = getDurationSeconds(nextMode, timeSettings);
      setMode(nextMode);
      setActiveDurationSeconds(duration);
      setRemainingSeconds(duration);
      setIsRunning(false);
      return updatedSessions;
    });
  }, [mode, timeSettings]);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(themeStorageKey);
    if (savedTheme) {
      try {
        setTheme(JSON.parse(savedTheme) as ThemeSettings);
      } catch {
        window.localStorage.removeItem(themeStorageKey);
      }
    }

    const savedTimes = window.localStorage.getItem(timeStorageKey);
    if (savedTimes) {
      try {
        const restoredSettings = sanitizeTimeSettings(JSON.parse(savedTimes) as Partial<TimeSettings>);
        const duration = getDurationSeconds("focus", restoredSettings);
        setTimeSettings(restoredSettings);
        setActiveDurationSeconds(duration);
        setRemainingSeconds(duration);
      } catch {
        window.localStorage.removeItem(timeStorageKey);
      }
    }

    setHasLoadedSettings(true);
  }, []);

  useEffect(() => {
    if (!hasLoadedSettings) return;
    window.localStorage.setItem(themeStorageKey, JSON.stringify(theme));
  }, [hasLoadedSettings, theme]);

  useEffect(() => {
    if (!hasLoadedSettings) return;
    window.localStorage.setItem(timeStorageKey, JSON.stringify(timeSettings));
  }, [hasLoadedSettings, timeSettings]);

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
    const handleFullscreenChange = () => {
      const nextIsFullscreen = Boolean(document.fullscreenElement);
      setIsFullscreen(nextIsFullscreen);

      if (nextIsFullscreen) {
        setShowSettings(false);
        document.body.classList.add("fullscreen-active");
        return;
      }

      clearFullscreenSideEffects();
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    handleFullscreenChange();

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      clearFullscreenSideEffects();
    };
  }, [clearFullscreenSideEffects]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT") return;

      if (event.code === "Space") {
        event.preventDefault();
        setIsRunning((running) => !running);
      }

      if (event.key.toLowerCase() === "r") {
        resetCurrentMode();
      }

      if (event.key.toLowerCase() === "f") {
        void toggleFullscreen();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [resetCurrentMode, toggleFullscreen]);

  const skipSession = () => {
    const nextMode = getNextMode(mode, completedFocusSessions, timeSettings);
    switchMode(nextMode, false);
  };

  return (
    <main ref={timerContainerRef} className={`min-h-screen overflow-x-hidden px-4 py-5 text-[var(--timer-text)] sm:px-6 lg:px-8 ${isFullscreen ? "pomodoro-focus-mode fixed inset-0 !p-0" : ""}`} style={themeStyle}>
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,color-mix(in_srgb,var(--timer-primary)_28%,transparent),transparent_34%),radial-gradient(circle_at_bottom_right,color-mix(in_srgb,var(--timer-accent)_24%,transparent),transparent_38%),linear-gradient(135deg,var(--app-bg),#07080b_72%)]" />
      <div className={`${isFullscreen ? "grid h-screen w-screen place-items-center overflow-hidden" : "mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-7xl flex-col gap-5"}`}>
        <header className={`flex items-center justify-between gap-3 ${isFullscreen ? "hidden" : ""}`}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color-mix(in_srgb,var(--timer-text)_68%,transparent)]">Pomodoro Dial</p>
            <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Deep Work Timer</h1>
          </div>
          <button className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/10 text-[var(--timer-text)] backdrop-blur transition hover:bg-white/16" onClick={() => setShowSettings((value) => !value)} aria-label="Settings">
            <Settings2 size={20} />
          </button>
        </header>

        <section className={`${isFullscreen ? "relative grid h-screen w-screen place-items-center overflow-hidden" : "grid flex-1 items-center gap-5 lg:grid-cols-[1fr_380px]"}`}>
          <div className={`${pulse ? "pomodoro-pulse" : ""} ${isFullscreen ? "grid h-screen w-screen place-items-center overflow-hidden bg-transparent p-0" : "relative overflow-hidden rounded-[2rem] border border-white/12 bg-white/[0.08] p-4 shadow-2xl shadow-black/30 backdrop-blur-2xl sm:p-7 lg:p-10"}`}>
            <div className={`mx-auto flex flex-col items-center ${isFullscreen ? "h-screen w-screen justify-center" : "max-w-3xl"}`}>
              <div className={`mb-5 flex rounded-full border border-white/12 bg-black/20 p-1 ${isFullscreen ? "hidden" : ""}`}>
                {(["focus", "short", "long"] as TimerMode[]).map((timerMode) => (
                  <button
                    key={timerMode}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${mode === timerMode ? "bg-[var(--timer-primary)] text-black shadow-lg shadow-black/20" : "text-[color-mix(in_srgb,var(--timer-text)_72%,transparent)] hover:text-[var(--timer-text)]"}`}
                    onClick={() => switchMode(timerMode)}
                  >
                    {timerMode === "focus" ? "Focus" : timerMode === "short" ? "Short" : "Long"}
                  </button>
                ))}
              </div>

              <p className={`${isFullscreen ? "absolute top-8 text-base md:top-10" : "mb-4 text-sm"} rounded-full border border-white/12 bg-black/20 px-4 py-2 font-semibold text-[color-mix(in_srgb,var(--timer-text)_82%,transparent)]`}>{modeLabels[mode]}</p>

              <div className={`relative grid aspect-square place-items-center ${isFullscreen ? "pomodoro-focus-dial" : "w-full max-w-[min(72vw,32rem)] sm:max-w-[34rem]"}`}>
                <div
                  className="absolute inset-0 rounded-full shadow-[inset_0_1.2rem_2.8rem_rgba(255,255,255,0.12),inset_0_-2rem_3rem_rgba(0,0,0,0.34),0_2rem_4rem_rgba(0,0,0,0.3)]"
                  style={{
                    background: `conic-gradient(from -90deg, rgba(0,0,0,0.18) 0deg ${elapsedDegrees}deg, var(--timer-primary) ${elapsedDegrees}deg 360deg)`
                  }}
                />
                <div className="absolute inset-[7%] rounded-full border border-white/15 bg-[radial-gradient(circle_at_35%_24%,rgba(255,255,255,0.18),transparent_28%),linear-gradient(145deg,rgba(0,0,0,0.34),rgba(255,255,255,0.08))]" />
                <div className="absolute inset-[13%] rounded-full border border-black/25 bg-[color-mix(in_srgb,var(--app-bg)_78%,black)] shadow-[inset_0_1rem_2rem_rgba(0,0,0,0.38)]" />
                <div className="relative z-10 text-center">
                  <div className={`font-mono font-bold leading-none tracking-normal text-[var(--timer-text)] drop-shadow-[0_0_2rem_color-mix(in_srgb,var(--timer-primary)_38%,transparent)] ${isFullscreen ? "text-[clamp(5rem,18vmin,13rem)]" : "text-[clamp(4.5rem,17vw,10rem)]"}`}>{formatTime(remainingSeconds)}</div>
                  <p className={`${isFullscreen ? "mt-5 text-base" : "mt-4 text-sm"} font-semibold uppercase tracking-[0.24em] text-[color-mix(in_srgb,var(--timer-text)_62%,transparent)]`}>{Math.round(progress * 100)}% remaining</p>
                </div>
              </div>

              <div className={`${isFullscreen ? "pomodoro-focus-controls absolute bottom-6 left-1/2 -translate-x-1/2" : "mt-7"} flex w-full flex-wrap items-center justify-center gap-3`}>
                <button className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[var(--timer-primary)] px-6 py-3 font-bold text-black shadow-xl shadow-black/25 transition hover:scale-[1.02]" onClick={() => setIsRunning((value) => !value)}>
                  {isRunning ? <Pause size={20} /> : <Play size={20} />}
                  {isRunning ? "Pause" : "Start"}
                </button>
                <button className="inline-flex min-h-12 items-center gap-2 rounded-full border border-white/14 bg-white/10 px-5 py-3 font-semibold backdrop-blur transition hover:bg-white/16" onClick={resetCurrentMode}>
                  <RotateCcw size={18} />
                  Reset
                </button>
                <button className={`min-h-12 items-center gap-2 rounded-full border border-white/14 bg-white/10 px-5 py-3 font-semibold backdrop-blur transition hover:bg-white/16 ${isFullscreen ? "hidden sm:inline-flex" : "inline-flex"}`} onClick={skipSession}>
                  <SkipForward size={18} />
                  Skip
                </button>
                <button className="inline-flex min-h-12 items-center gap-2 rounded-full border border-white/14 bg-white/10 px-5 py-3 font-semibold backdrop-blur transition hover:bg-white/16" onClick={toggleFullscreen} aria-label={isFullscreen ? "Exit focus mode" : "Enter focus mode"}>
                  {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                  {isFullscreen ? "Exit" : "Focus"}
                </button>
              </div>
            </div>
          </div>

          <aside className={`${isFullscreen ? "hidden" : showSettings ? "block" : "hidden lg:block"} rounded-[1.5rem] border border-white/12 bg-black/20 p-5 shadow-2xl shadow-black/20 backdrop-blur-2xl lg:self-stretch`}>
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[color-mix(in_srgb,var(--timer-text)_58%,transparent)]">Customize</p>
                <h2 className="mt-1 text-xl font-semibold">Settings</h2>
              </div>
              <Settings2 size={22} />
            </div>

            <section>
              <div className="mb-3 flex items-center gap-2">
                <Clock3 size={18} />
                <h3 className="font-semibold">Timer Settings</h3>
              </div>
              <div className="grid gap-3">
                {(Object.keys(timeSettingMeta) as TimeSettingKey[]).map((key) => {
                  const meta = timeSettingMeta[key];

                  return (
                    <label key={key} className="grid gap-2 rounded-2xl border border-white/10 bg-white/[0.05] p-3">
                      <span className="flex items-center justify-between gap-3 text-sm font-medium">
                        {meta.label}
                        <span className="text-xs text-[color-mix(in_srgb,var(--timer-text)_58%,transparent)]">
                          {meta.min}-{meta.max} {meta.suffix}
                        </span>
                      </span>
                      <input
                        className="h-11 rounded-xl border border-white/12 bg-black/25 px-3 text-base font-semibold outline-none transition focus:border-[var(--timer-primary)]"
                        min={meta.min}
                        max={meta.max}
                        step={1}
                        type="number"
                        value={timeSettings[key]}
                        onChange={(event) => updateTimeSetting(key, event.target.value)}
                      />
                    </label>
                  );
                })}
              </div>
              <p className="mt-3 rounded-2xl border border-white/10 bg-white/[0.05] p-3 text-sm leading-6 text-[color-mix(in_srgb,var(--timer-text)_68%,transparent)]">
                Saved changes apply immediately while paused. During a running session, use Reset, Skip, or the next phase to start with the new timing.
              </p>
            </section>

            <section className="mt-7">
              <div className="mb-3 flex items-center gap-2">
                <Palette size={18} />
                <h3 className="font-semibold">Color Settings</h3>
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

              <div className="mt-4 grid gap-3">
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
            </section>

            <div className="mt-6 rounded-2xl border border-white/12 bg-white/[0.05] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[color-mix(in_srgb,var(--timer-text)_78%,transparent)]">
                <Volume2 size={17} />
                Session tone enabled
              </div>
              <p className="mt-3 text-sm leading-6 text-[color-mix(in_srgb,var(--timer-text)_62%,transparent)]">
                Long break starts after {timeSettings.longBreakAfter} focus {timeSettings.longBreakAfter === 1 ? "session" : "sessions"}.
              </p>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
