import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { TimelineEvent } from "../components/TimelineItem";

export const Route = createFileRoute("/timecard/$personId")({
  component: TimecardDisplay,
});

export interface Person {
  id: number;
  name: string;
  birth_date: string;
  dead_date: string;
}

export function TimecardDisplay() {
  const { personId } = Route.useParams();
  const navigate = useNavigate();
  const [person, setPerson] = useState<Person | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [pixelsPerYear, setPixelsPerYear] = useState(48);

  const stripRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<number | null>(null);

  // Sync the Active Person & Fetch Events
  useEffect(() => {
    const fetchPersonAndEvents = () => {
      // 1. Sync active person state directly with DB
      void invoke<Person | null>("get_current_display_state")
        .then((data) => {
          if (!data) return;
          // Must overwrite local state unconditionally to avoid stale UI closures
          setPerson(data);
          if (data.id.toString() !== personId) {
            void navigate({ to: `/timecard/${data.id}` });
          }
        })
        .catch(console.error);

      // 2. Fetch Events for current personId
      void invoke<TimelineEvent[]>("get_events", {
        personId: parseInt(personId, 10),
      })
        .then((data) => {
          // Sort events by date to ensure proper timeline progression
          const sorted = data.sort(
            (a, b) =>
              new Date(a.event_date).getTime() -
              new Date(b.event_date).getTime(),
          );
          setEvents(sorted);
        })
        .catch(console.error);
    };

    fetchPersonAndEvents();
    const interval = setInterval(fetchPersonAndEvents, 3000);
    return () => clearInterval(interval);
  }, [personId, navigate]);

  const birthYear = person?.birth_date
    ? parseInt(person.birth_date.substring(0, 4), 10)
    : 1970;
  const startDecade = Math.floor(birthYear / 10) * 10 - 10;
  const endDecade = Math.ceil(new Date().getFullYear() / 10) * 10 + 10;

  // Slideshow (Auto-advance) & Scroll Logic Helper
  const scrollToIndex = useCallback(
    (index: number) => {
      const ev = events[index];
      if (ev && stripRef.current) {
        const date = new Date(ev.event_date);
        const evYear = date.getFullYear() + date.getMonth() / 12;
        const targetScroll = (evYear - startDecade) * pixelsPerYear;
        stripRef.current.scrollTo({ left: targetScroll, behavior: "smooth" });
      }
    },
    [events, startDecade, pixelsPerYear],
  );

  useEffect(() => {
    if (!isPlaying || events.length === 0 || focusMode) return;
    const interval = setInterval(() => {
      const nextIdx = (activeIndex + 1) % events.length;
      scrollToIndex(nextIdx);
    }, 4500);
    return () => clearInterval(interval);
  }, [isPlaying, events, activeIndex, scrollToIndex, focusMode]);

  const ticks = [];
  for (let y = startDecade; y <= endDecade; y += 1) {
    ticks.push({ val: y, isDecade: Math.abs(y % 10) === 0 });
  }

  // Native Scroll Handler
  const handleScroll = () => {
    if (!stripRef.current || events.length === 0) return;
    if (scrollTimeoutRef.current) {
      window.clearTimeout(scrollTimeoutRef.current);
    }

    // Pause slideshow if manually sliding
    setIsPlaying(false);

    const scrollLeft = stripRef.current.scrollLeft;
    // 50vw offset means when scrollLeft is 0, startDecade is naturally at the red center line.
    const currentYear = startDecade + scrollLeft / pixelsPerYear;

    let closestIdx = activeIndex;
    let minDiff = Number.MAX_VALUE;
    events.forEach((ev, idx) => {
      const date = new Date(ev.event_date);
      const evYear = date.getFullYear() + date.getMonth() / 12;
      const diff = Math.abs(evYear - currentYear);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = idx;
      }
    });

    if (closestIdx !== activeIndex) {
      setActiveIndex(closestIdx);
    }

    // Debounced resumption logic could go here if requested
    scrollTimeoutRef.current = window.setTimeout(() => {}, 150);
  };

  if (!person) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center font-serif cursor-none">
        <h1 className="text-3xl text-slate-400 animate-pulse uppercase tracking-[0.2em] font-light">
          Initializing Timecard...
        </h1>
      </div>
    );
  }

  const activeEvent = events[activeIndex];

  return (
    <div className="bg-slate-50 min-h-screen text-slate-800 overflow-hidden flex flex-col relative w-full h-full select-none cursor-none pointer-events-auto">
      {/* Kiosk App Escape (Hidden heavily to prevent accidental touch) */}
      <button
        type="button"
        onClick={() => void invoke("close_app")}
        className="absolute top-4 left-4 z-[300] opacity-0 hover:opacity-100 transition-opacity p-2 text-slate-300 hover:text-slate-600 pointer-events-auto"
      >
        Close System
      </button>

      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjEiIGZpbGw9InJnYmEoMCwwLDAsMC4wNSkiLz48L3N2Zz4=')] opacity-[0.05] z-0 pointer-events-none"></div>

      {/* FIXED RED LINE AT CENTER */}
      {/* Now spans dramatically and confidently overlaid atop background pictures */}
      <div className="absolute top-[25%] bottom-[15%] left-1/2 -translate-x-1/2 w-[2px] bg-red-600 shadow-[0_0_15px_rgba(220,38,38,0.5)] z-[45] pointer-events-none transition-all">
        <div className="absolute top-[-4px] left-1/2 -translate-x-1/2 w-3 h-3 bg-red-600 rounded-full" />
        <div className="absolute bottom-[-4px] left-1/2 -translate-x-1/2 w-3 h-3 bg-red-600 rounded-full" />
      </div>

      {/* MAC DOCK TIMELINE STRIP */}
      {/* touch-pan-x overrides custom Javascript locks, natively sliding purely horizontal on touch screens! */}
      <div
        className="absolute top-[25%] w-full h-[60vh] z-30 touch-pan-x overflow-x-auto overflow-y-hidden no-scrollbar scroll-smooth snap-x snap-mandatory"
        ref={stripRef}
        onScroll={handleScroll}
      >
        <div className="h-full flex items-start w-max">
          <div className="w-[50vw] h-full flex-shrink-0" />

          <div
            className="relative h-full flex-shrink-0"
            style={{ width: `${(endDecade - startDecade) * pixelsPerYear}px` }}
          >
            {/* RULER TICKS */}
            <div className="absolute bottom-[25%] w-full h-16 pointer-events-none z-[10]">
              {ticks.map((tick) => (
                <div
                  key={tick.val}
                  className="absolute bottom-0 flex flex-col items-center"
                  style={{
                    left: `${(tick.val - startDecade) * pixelsPerYear}px`,
                    transform: "translateX(-50%)",
                  }}
                >
                  {tick.isDecade ? (
                    <div className="flex flex-col items-center">
                      <span className="text-xl font-bold text-slate-700 mb-2">
                        {tick.val}
                      </span>
                      <div className="w-[2px] h-12 bg-slate-500 shadow-sm" />
                    </div>
                  ) : (
                    <div className="w-[1px] h-6 bg-slate-300" />
                  )}
                </div>
              ))}
            </div>

            {/* PHOTOS (Mac Dock Engine) */}
            <div className="absolute top-[10%] w-full h-[55%]">
              {events.map((event, i) => {
                const date = new Date(event.event_date);
                const year = date.getFullYear() + date.getMonth() / 12;
                const isActive = activeIndex === i;

                return (
                  <div
                    key={event.id}
                    className={`absolute pointer-events-none transition-all duration-[600ms] ease-[cubic-bezier(0.34,1.56,0.64,1)]
                      ${
                        isActive
                          ? "scale-[2.8] -translate-y-[85%] translate-x-12 z-[50] shadow-[0_30px_60px_rgba(0,0,0,0.15)] opacity-100"
                          : "scale-100 translate-y-0 -translate-x-1/2 z-[20] opacity-[0.65] blur-[1px] grayscale-[0.2]"
                      }`}
                    style={{
                      left: `${(year - startDecade) * pixelsPerYear}px`,
                      top: `${(i % 4) * 20}%`,
                    }}
                  >
                    {/* The Polaroid */}
                    <div
                      className="relative pointer-events-auto cursor-pointer"
                      onClick={() => setFocusMode(true)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ")
                          setFocusMode(true);
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <img
                        src={event.image_url}
                        className="w-20 h-20 object-cover border-[3px] border-white rounded shadow-sm bg-white"
                        alt=""
                      />
                    </div>

                    {/* Pop-out Info Card (Only visible when magnified) */}
                    {isActive && !focusMode && (
                      <div className="absolute top-1/2 -translate-y-1/2 left-[120%] w-[380px] bg-slate-50/95 backdrop-blur-sm p-5 border border-slate-200 rounded-xl shadow-xl scale-[0.4] origin-left pointer-events-auto animate-in fade-in slide-in-from-left-4 duration-500 delay-150">
                        <p className="text-[14px] uppercase tracking-widest font-bold text-red-500 mb-1 border-b border-red-100 pb-1 w-max">
                          {date.toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </p>
                        <h4 className="text-[28px] font-black leading-tight text-slate-800 mb-2 truncate">
                          {event.title}
                        </h4>
                        <p className="text-[18px] text-slate-600 leading-relaxed line-clamp-3 font-light">
                          {event.description}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="w-[50vw] h-full flex-shrink-0" />
        </div>
      </div>

      {/* Main Screen Controls & Dashboard Plating */}
      <div className="absolute bottom-[6%] w-full flex flex-col items-center z-[40] pointer-events-none">
        {/* Slideshow Control */}
        <div className="flex gap-4 items-center mb-6 pointer-events-auto bg-slate-100/90 backdrop-blur px-8 py-3 rounded-full border border-slate-200 shadow-sm transition-opacity opacity-80 hover:opacity-100">
          <button
            type="button"
            onClick={() => setIsPlaying(!isPlaying)}
            className="text-slate-700 hover:text-red-700 font-bold tracking-widest uppercase text-base p-2 w-32 text-center"
          >
            {isPlaying ? "Pause \u23F8" : "Play Slideshow \u25B6"}
          </button>
        </div>

        <h1 className="text-4xl tracking-[0.3em] uppercase text-slate-800 font-bold mb-2">
          {person.name}
        </h1>
        <p className="text-xl tracking-[0.2em] text-slate-400 italic">
          {new Date(person.birth_date).getFullYear()} &bull;{" "}
          {person.dead_date === "Present"
            ? "Present"
            : new Date(person.dead_date).getFullYear()}
        </p>
      </div>

      {/* Fixed Layout Zoom Controls (Bottom Right) */}
      <div className="absolute bottom-12 right-12 flex gap-6 text-slate-400 z-[40] pointer-events-auto font-light tracking-widest uppercase text-sm">
        <button
          className="hover:text-slate-800"
          type="button"
          onClick={() => setPixelsPerYear((p) => Math.min(120, p + 16))}
        >
          Zoom In
        </button>
        <button
          className="hover:text-slate-800"
          type="button"
          onClick={() => setPixelsPerYear((p) => Math.max(24, p - 16))}
        >
          Zoom Out
        </button>
      </div>

      {/* SPLIT SCREEN FOCUS MODE */}
      {focusMode && activeEvent && (
        <div className="fixed inset-0 bg-slate-50 z-[200] flex flex-row items-center justify-center p-8 md:p-16 lg:p-24 gap-12 lg:gap-24 animate-in fade-in duration-500 cursor-none relative pointer-events-auto">
          <button
            type="button"
            onClick={() => setFocusMode(false)}
            className="absolute top-10 right-10 text-slate-400 hover:text-red-700 tracking-widest uppercase font-bold p-4 pointer-events-auto transition-colors z-[210] border border-slate-200 rounded-full bg-white shadow-sm"
          >
            &#10005; Close
          </button>

          {/* Left/Right Navigation Flow Arrows */}
          <button
            type="button"
            onClick={() =>
              scrollToIndex(
                activeIndex === 0 ? events.length - 1 : activeIndex - 1,
              )
            }
            className="absolute left-8 lg:left-14 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600 hover:bg-slate-200/50 p-6 rounded-xl transition-all z-[210]"
          >
            <svg
              role="img"
              aria-label="Previous"
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <title>Previous</title>
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>

          <button
            type="button"
            onClick={() => scrollToIndex((activeIndex + 1) % events.length)}
            className="absolute right-8 lg:right-14 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600 hover:bg-slate-200/50 p-6 rounded-xl transition-all z-[210]"
          >
            <svg
              role="img"
              aria-label="Next"
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <title>Next</title>
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>

          {/* Central Left Content: The Framed Photo */}
          <div className="flex-1 flex flex-col justify-center items-center h-full max-h-[85vh] w-1/2 ml-20 relative">
            <div className="p-4 bg-white border border-[#d1d5db] shadow-[0_4px_16px_rgba(0,0,0,0.08),0_inset_0_2px_4px_rgba(255,255,255,0.5)]">
              <img
                src={activeEvent.image_url}
                className="w-full object-contain max-h-[65vh] shadow-[inset_0_2px_8px_rgba(0,0,0,0.1)] border border-slate-200"
                alt=""
              />
            </div>
            {/* Small Title | Date Plate directly under the image per mockup */}
            <div className="mt-8 text-center px-12 border-b border-slate-200 pb-6 min-w-[60%]">
              <span className="text-xl lg:text-2xl font-light tracking-wide text-slate-700">
                {activeEvent.title}
              </span>
              <span className="mx-4 lg:mx-6 text-slate-300">|</span>
              <span className="text-xl lg:text-2xl font-bold tracking-widest text-slate-500">
                {new Date(activeEvent.event_date).toLocaleDateString(
                  undefined,
                  { year: "numeric", month: "long", day: "numeric" },
                )}
              </span>
            </div>
          </div>

          {/* Right Content: Deep Description and Vast Data */}
          <div className="flex-1 flex flex-col justify-center max-w-2xl text-left pl-8 h-full max-h-[85vh] w-1/2 mr-20 z-[205]">
            <p className="text-2xl md:text-3xl text-slate-600 leading-[1.8] font-light font-serif">
              {activeEvent.description}
            </p>
          </div>

          {/* Persistent Nameplate at the stark bottom exactly per Mockup */}
          <h1 className="absolute bottom-8 left-1/2 -translate-x-1/2 text-3xl tracking-[0.5em] uppercase text-slate-800 font-bold z-[205]">
            {person.name}
          </h1>
        </div>
      )}
    </div>
  );
}
