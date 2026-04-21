import { createFileRoute } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
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
  const [person, setPerson] = useState<Person | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false); // Default to false for scrubber experience
  const [focusMode, setFocusMode] = useState(false);
  const [interactionStarted, setInteractionStarted] = useState(false);

  // Scrubber State
  const [scrubberX, setScrubberX] = useState(window.innerWidth / 2);
  const [isDragging, setIsDragging] = useState(false);

  const stripRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void invoke<Person | null>("get_current_display_state")
      .then((data) => {
        setPerson(data);
      })
      .catch((err) => {
        console.warn("Using Mock Data (Backend missing):", err);
        setPerson({
          id: 1,
          name: "Madeline Eleanor Banks",
          birth_date: "2006-06-08",
          dead_date: "Present",
        });
      });

    const fetchEvents = () => {
      void invoke<TimelineEvent[]>("get_events", {
        personId: parseInt(personId, 10),
      })
        .then((data) => {
          setEvents(data);
        })
        .catch((err) => {
          console.warn("Using Mock Events:", err);
        });
    };

    fetchEvents();
    const interval = setInterval(fetchEvents, 5000);
    return () => clearInterval(interval);
  }, [personId]);

  const PIXELS_PER_YEAR = 12;
  const birthYear = person?.birth_date
    ? parseInt(person.birth_date.substring(0, 4), 10)
    : 1970;
  const startDecade = Math.floor(birthYear / 10) * 10 - 10;
  const endDecade = Math.ceil(new Date().getFullYear() / 10) * 10 + 10;

  // Generate Hierarchical Ticks (4 per year)
  const ticks = [];
  for (let y = startDecade; y <= endDecade; y += 0.25) {
    ticks.push({
      val: y,
      isDecade: Math.abs(y % 10) < 0.01,
      isYear: Math.abs(y % 1) < 0.01,
      isQuarter: true,
    });
  }

  // Handle Scrubber/Drag Logic
  useEffect(() => {
    if (!stripRef.current || events.length === 0) return;

    const container = stripRef.current;

    // Calculate fractional year based on scrubber position + scroll
    const scrollLeft = container.scrollLeft;
    const timelineOffset = scrubberX - window.innerWidth / 2 + scrollLeft;
    const currentYear = startDecade + timelineOffset / PIXELS_PER_YEAR;

    // Find closest event
    let closestIdx = 0;
    let minDiff = Number.MAX_VALUE;
    events.forEach((ev, idx) => {
      const evYear =
        new Date(ev.event_date).getFullYear() +
        new Date(ev.event_date).getMonth() / 12;
      const diff = Math.abs(evYear - currentYear);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = idx;
      }
    });

    if (closestIdx !== activeIndex) {
      setActiveIndex(closestIdx);
    }
  }, [scrubberX, events, activeIndex, startDecade]);

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    setInteractionStarted(true);
    setScrubberX(e.clientX);
    setIsPlaying(false);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isDragging) {
      setScrubberX(e.clientX);
    }
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  if (!person) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center font-serif">
        <h1 className="text-3xl text-slate-400 animate-pulse uppercase tracking-[0.2em] font-light">
          Initializing Timecard...
        </h1>
      </div>
    );
  }

  const activeEvent = events[activeIndex];

  return (
    <div
      ref={containerRef}
      className="bg-slate-50 min-h-screen text-slate-800 font-serif overflow-hidden flex flex-col relative w-full h-full select-none cursor-default"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Kiosk Exit Button (Top Left) */}
      <button
        type="button"
        onClick={() => {
          void invoke("close_app");
        }}
        className="absolute top-4 left-4 z-[300] opacity-0 hover:opacity-100 transition-opacity p-2 text-slate-300 hover:text-slate-600 cursor-pointer pointer-events-auto"
        title="Exit"
      >
        <svg
          role="img"
          aria-label="Exit"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <title>Exit</title>
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {/* Background Grid */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjEiIGZpbGw9InJnYmEoMCwwLDAsMC4wNSkiLz48L3N2Zz4=')] opacity-[0.05] z-0 pointer-events-none"></div>

      {/* Top Focus Section (Conditional) */}
      {interactionStarted && activeEvent && (
        <div className="absolute top-[5%] w-full flex justify-center z-20 pointer-events-none animate-in fade-in slide-in-from-top-4 duration-700">
          <div className="flex gap-8 items-start max-w-4xl transform">
            <div
              className="relative cursor-pointer pointer-events-auto transform transition-transform duration-300 hover:scale-105 active:scale-95 group"
              onClick={() => setFocusMode(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") setFocusMode(true);
              }}
              role="button"
              tabIndex={0}
            >
              <img
                src={activeEvent.image_url}
                alt=""
                className="w-60 h-60 object-cover bg-white p-3 pb-10 shadow-2xl transition-all duration-700 group-hover:shadow-cyan-900/10"
                style={{ transform: "rotate(-1.5deg)" }}
              />
              <div className="absolute bottom-4 left-0 w-full text-center text-slate-400 text-[10px] tracking-[0.3em] uppercase font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                Full Focus
              </div>
            </div>
            <div className="pt-6 max-w-sm">
              <h2 className="text-2xl text-slate-400 font-light italic mb-1">
                {new Date(activeEvent.event_date).toLocaleDateString(
                  undefined,
                  { year: "numeric", month: "long" },
                )}
              </h2>
              <h3 className="text-4xl font-bold text-slate-800 leading-tight mb-3">
                {activeEvent.title}
              </h3>
              <p className="text-slate-600 text-xl leading-relaxed font-light line-clamp-3">
                {activeEvent.description}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Scrubber Handles / Interaction Zone */}
      <div
        className="absolute inset-x-0 top-[35%] bottom-[15%] z-50 cursor-crosshair"
        onPointerDown={handlePointerDown}
      >
        <div
          className="absolute top-0 bottom-0 w-[2px] bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.3)] transition-all duration-75"
          style={{ left: `${scrubberX}px`, transform: "translateX(-50%)" }}
        >
          <div className="absolute top-[-10px] left-1/2 -translate-x-1/2 w-4 h-4 bg-red-500 rounded-full" />
          <div className="absolute bottom-[-10px] left-1/2 -translate-x-1/2 w-4 h-4 bg-red-500 rounded-full" />
        </div>
      </div>

      {/* Timeline Strip */}
      <div className="absolute top-[50%] w-full h-[35vh] z-30 pointer-events-none">
        <div
          ref={stripRef}
          className="w-full h-full overflow-x-hidden flex items-start pointer-events-auto no-scrollbar"
        >
          <div className="w-[50vw] h-full flex-shrink-0" />
          <div
            className="relative h-full flex-shrink-0"
            style={{
              width: `${(endDecade - startDecade) * PIXELS_PER_YEAR}px`,
            }}
          >
            {/* RULER */}
            <div className="absolute bottom-[10%] w-full h-24 pointer-events-none">
              {ticks.map((tick) => (
                <div
                  key={tick.val}
                  className="absolute bottom-0 flex flex-col items-center"
                  style={{
                    left: `${(tick.val - startDecade) * PIXELS_PER_YEAR}px`,
                    transform: "translateX(-50%)",
                  }}
                >
                  {tick.isDecade ? (
                    <div className="flex flex-col items-center">
                      <span className="text-sm font-bold text-slate-800 mb-2">
                        {tick.val}
                      </span>
                      <div className="w-[1.5px] h-12 bg-slate-800" />
                    </div>
                  ) : tick.isYear ? (
                    <div className="w-[1px] h-6 bg-slate-600 opacity-60" />
                  ) : (
                    <div className="w-[0.5px] h-3 bg-slate-400 opacity-40" />
                  )}
                </div>
              ))}
            </div>

            {/* COLLAGE PHOTOS (Clamped) */}
            <div className="absolute top-0 w-full h-[60%]">
              {events.map((event, i) => {
                const date = new Date(event.event_date);
                const year = date.getFullYear() + date.getMonth() / 12;
                return (
                  <div
                    key={event.id}
                    className={`absolute transform -translate-x-1/2 pointer-events-none transition-all duration-300 ${activeIndex === i ? "scale-110 opacity-100 z-10" : "scale-90 opacity-40 z-0"}`}
                    style={{
                      left: `${(year - startDecade) * PIXELS_PER_YEAR}px`,
                      top: `${(i % 3) * 20}%`,
                    }}
                  >
                    <img
                      src={event.image_url}
                      className="w-20 h-20 object-cover border-4 border-white shadow-md rounded-md"
                      alt=""
                    />
                  </div>
                );
              })}
            </div>
          </div>
          <div className="w-[50vw] h-full flex-shrink-0" />
        </div>
      </div>

      {/* Name Plate */}
      <div className="absolute bottom-[6%] w-full flex flex-col items-center z-10 pointer-events-none">
        <h1 className="text-3xl tracking-[0.3em] uppercase text-slate-800 font-bold font-serif mb-1">
          {person.name}
        </h1>
        <p className="text-lg tracking-widest text-slate-400 italic">
          {new Date(person.birth_date).getFullYear()} —{" "}
          {person.dead_date === "Present"
            ? "Present"
            : new Date(person.dead_date).getFullYear()}
        </p>
      </div>

      {/* FULLSCREEN OVERLAY */}
      {focusMode && activeEvent && (
        <div className="fixed inset-0 bg-slate-50 z-[200] flex flex-col items-center justify-center p-12">
          <div className="bg-white p-6 pb-16 shadow-2xl max-w-[80vw] animate-in zoom-in duration-500">
            <img
              src={activeEvent.image_url}
              className="max-h-[70vh] object-contain"
              alt=""
            />
            <div className="mt-8 flex justify-between items-baseline border-t pt-4 border-slate-100">
              <span className="text-3xl font-bold text-slate-800">
                {activeEvent.title}
              </span>
              <span className="text-2xl text-slate-400 font-light italic">
                {new Date(activeEvent.event_date).toLocaleDateString(
                  undefined,
                  { year: "numeric", month: "long" },
                )}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setFocusMode(false)}
            className="absolute top-12 right-12 text-slate-400 hover:text-slate-800 text-sm tracking-widest uppercase font-bold p-4"
          >
            Close Display
          </button>
          <h1 className="absolute bottom-12 text-3xl tracking-[0.4em] uppercase text-slate-500 font-bold opacity-30">
            {person.name}
          </h1>
        </div>
      )}
    </div>
  );
}
