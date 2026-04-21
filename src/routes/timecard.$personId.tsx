import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
  const navigate = useNavigate();
  const [person, setPerson] = useState<Person | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [pixelsPerYear, setPixelsPerYear] = useState(24);

  // Drag-to-scroll State
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [scrollStartX, setScrollStartX] = useState(0);

  const stripRef = useRef<HTMLDivElement>(null);

  const birthYear = person?.birth_date
    ? parseInt(person.birth_date.substring(0, 4), 10)
    : 1970;
  const startDecade = Math.floor(birthYear / 10) * 10 - 10;
  const endDecade = Math.ceil(new Date().getFullYear() / 10) * 10 + 10;

  // Sync the Active Person & Fetch Events
  useEffect(() => {
    let _timeoutId: number;

    const fetchPersonAndEvents = () => {
      // 1. Check if the active person changed on the backend
      void invoke<Person | null>("get_current_display_state")
        .then((data) => {
          if (data && data.id.toString() !== personId) {
            void navigate({ to: `/timecard/${data.id}` });
          } else if (data && !person) {
            setPerson(data);
          }
        })
        .catch(console.error);

      // 2. Fetch Events for current personId
      void invoke<TimelineEvent[]>("get_events", {
        personId: parseInt(personId, 10),
      })
        .then((data) => {
          setEvents(data);
        })
        .catch(console.error);
    };

    fetchPersonAndEvents();
    const interval = setInterval(fetchPersonAndEvents, 3000);
    return () => clearInterval(interval);
  }, [personId, navigate, person]);

  // Slideshow (Auto-advance)
  useEffect(() => {
    if (!isPlaying || events.length === 0 || isDragging) return;
    const interval = setInterval(() => {
      const nextIdx = (activeIndex + 1) % events.length;
      setActiveIndex(nextIdx);
      const ev = events[nextIdx];
      if (ev && stripRef.current) {
        const evYear =
          new Date(ev.event_date).getFullYear() +
          new Date(ev.event_date).getMonth() / 12;
        const targetScroll = (evYear - startDecade) * pixelsPerYear;
        if (!isDragging) {
          stripRef.current.scrollTo({ left: targetScroll, behavior: "smooth" });
        }
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [isPlaying, events, activeIndex, isDragging, pixelsPerYear, startDecade]);

  const ticks = [];
  for (let y = startDecade; y <= endDecade; y += 1) {
    ticks.push({
      val: y,
      isDecade: Math.abs(y % 10) === 0,
    });
  }

  function scrollToIndex(index: number) {
    const ev = events[index];
    if (ev && stripRef.current) {
      const evYear =
        new Date(ev.event_date).getFullYear() +
        new Date(ev.event_date).getMonth() / 12;
      const targetScroll = (evYear - startDecade) * pixelsPerYear;
      // Don't override if currently dragging!
      if (!isDragging) {
        stripRef.current.scrollTo({ left: targetScroll, behavior: "smooth" });
      }
    }
  }

  // Handle Pan / Scroll logic tracking active timeline event
  const handleScroll = () => {
    if (!stripRef.current || events.length === 0 || isPlaying) return;
    const scrollLeft = stripRef.current.scrollLeft;
    // The fixed red line is conceptually at scrollLeft (since we center the content using massive 50vw padding)
    const currentYear = startDecade + scrollLeft / pixelsPerYear;

    let closestIdx = activeIndex;
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
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!stripRef.current) return;
    // Prevents default behavior taking over on touch scrub
    if (e.cancelable) e.preventDefault();
    setIsDragging(true);
    setIsPlaying(false);
    setDragStartX(e.clientX);
    setScrollStartX(stripRef.current.scrollLeft);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !stripRef.current) return;
    const dx = e.clientX - dragStartX;
    // Reverse movement for standard mapping feeling (push left to show right)
    stripRef.current.scrollLeft = scrollStartX - dx;
  };

  const handlePointerUp = () => {
    setIsDragging(false);
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
    <div
      className="bg-slate-50 min-h-screen text-slate-800 overflow-hidden flex flex-col relative w-full h-full select-none cursor-none pointer-events-auto"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <button
        type="button"
        onClick={() => void invoke("close_app")}
        className="absolute top-4 left-4 z-[300] opacity-0 hover:opacity-100 transition-opacity p-2 text-slate-300 hover:text-slate-600 pointer-events-auto"
      >
        Close
      </button>

      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjEiIGZpbGw9InJnYmEoMCwwLDAsMC4wNSkiLz48L3N2Zz4=')] opacity-[0.05] z-0 pointer-events-none"></div>

      {/* FIXED RED LINE AT CENTER */}
      <div className="absolute top-[35%] bottom-[15%] left-1/2 -translate-x-1/2 w-[2px] bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.3)] z-50 pointer-events-none">
        <div className="absolute top-[-10px] left-1/2 -translate-x-1/2 w-4 h-4 bg-red-500 rounded-full" />
        <div className="absolute bottom-[-10px] left-1/2 -translate-x-1/2 w-4 h-4 bg-red-500 rounded-full" />
      </div>

      {/* Top Preview Section (Fades nicely out of the way when dragging) */}
      {!focusMode && activeEvent && (
        <div
          className={`absolute top-[8%] w-full flex justify-center z-20 pointer-events-none transition-opacity duration-300 ${isDragging ? "opacity-30" : "opacity-100"}`}
        >
          <div className="flex flex-col items-center max-w-4xl transform">
            <div
              className="relative cursor-pointer pointer-events-auto transform transition-transform duration-300 hover:scale-[1.02] active:scale-95 group mb-6"
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
                className="w-48 h-48 lg:w-64 lg:h-64 object-cover border-8 border-white shadow-2xl transition-all duration-700 block"
                style={{ transform: "rotate(-1.5deg)" }}
              />
            </div>
            <div className="text-center px-4">
              <h2 className="text-xl text-slate-500 font-light italic mb-1">
                {new Date(activeEvent.event_date).toLocaleDateString(
                  undefined,
                  { year: "numeric", month: "long", day: "numeric" },
                )}
              </h2>
              <h3 className="text-3xl font-bold text-slate-800 leading-tight">
                {activeEvent.title}
              </h3>
            </div>
          </div>
        </div>
      )}

      {/* DRAG ZONE */}
      <div
        className="absolute inset-x-0 top-[35%] bottom-[15%] z-40 touch-none pointer-events-auto"
        onPointerDown={handlePointerDown}
      />

      {/* Timeline Strip */}
      <div className="absolute top-[50%] w-full h-[35vh] z-30 pointer-events-none">
        <div
          ref={stripRef}
          onScroll={handleScroll}
          className="w-full h-full overflow-x-hidden flex items-start pointer-events-auto no-scrollbar scroll-smooth"
        >
          <div className="w-[50vw] h-full flex-shrink-0" />
          <div
            className="relative h-full flex-shrink-0"
            style={{ width: `${(endDecade - startDecade) * pixelsPerYear}px` }}
          >
            {/* RULER */}
            <div className="absolute bottom-[20%] w-full h-16 pointer-events-none">
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
                      <span className="text-lg font-bold text-slate-600 mb-2">
                        {tick.val}
                      </span>
                      <div className="w-[2px] h-10 bg-slate-500" />
                    </div>
                  ) : (
                    <div className="w-[1px] h-6 bg-slate-300" />
                  )}
                </div>
              ))}
            </div>

            {/* PHOTOS */}
            <div className="absolute top-0 w-full h-[60%]">
              {events.map((event, i) => {
                const date = new Date(event.event_date);
                const year = date.getFullYear() + date.getMonth() / 12;
                return (
                  <div
                    key={event.id}
                    className={`absolute transform -translate-x-1/2 pointer-events-none transition-all duration-300 ${activeIndex === i ? "scale-110 opacity-100 z-10" : "scale-90 opacity-40 z-0"}`}
                    style={{
                      left: `${(year - startDecade) * pixelsPerYear}px`,
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

      {/* Controls & Name Plate */}
      <div className="absolute bottom-[4%] w-full flex flex-col items-center z-50 pointer-events-none">
        {/* Navigation & Slideshow Controls */}
        <div className="flex gap-6 items-center mb-4 pointer-events-auto bg-slate-100/90 backdrop-blur px-6 py-2 rounded-full border border-slate-200 shadow-sm opacity-60 hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={() => setPixelsPerYear((p) => Math.max(12, p - 6))}
            className="text-xl px-2 text-slate-500 hover:text-slate-800 transition-colors"
          >
            −
          </button>

          <div className="flex gap-4 items-center border-l border-r border-slate-300 px-6 mx-2">
            <button
              type="button"
              onClick={() => {
                setIsPlaying(false);
                const prev =
                  activeIndex === 0 ? events.length - 1 : activeIndex - 1;
                setActiveIndex(prev);
                scrollToIndex(prev);
              }}
              className="text-slate-500 hover:text-slate-800 text-sm font-bold uppercase tracking-widest p-2"
            >
              &larr; Prev
            </button>

            <button
              type="button"
              onClick={() => setIsPlaying(!isPlaying)}
              className="text-slate-600 hover:text-red-700 font-bold tracking-widest uppercase text-sm p-2 w-20 text-center"
            >
              {isPlaying ? "Pause" : "Play"}
            </button>

            <button
              type="button"
              onClick={() => {
                setIsPlaying(false);
                const next = (activeIndex + 1) % events.length;
                setActiveIndex(next);
                scrollToIndex(next);
              }}
              className="text-slate-500 hover:text-slate-800 text-sm font-bold uppercase tracking-widest p-2"
            >
              Next &rarr;
            </button>
          </div>

          <button
            type="button"
            onClick={() => setPixelsPerYear((p) => Math.min(72, p + 6))}
            className="text-xl px-2 text-slate-500 hover:text-slate-800 transition-colors"
          >
            +
          </button>
        </div>

        <h1 className="text-3xl tracking-[0.3em] uppercase text-slate-800 font-bold mb-1">
          {person.name}
        </h1>
        <p className="text-lg tracking-widest text-slate-500 italic">
          {new Date(person.birth_date).getFullYear()} —{" "}
          {person.dead_date === "Present"
            ? "Present"
            : new Date(person.dead_date).getFullYear()}
        </p>
      </div>

      {/* SPLIT SCREEN FOCUS MODE */}
      {focusMode && activeEvent && (
        <div className="fixed inset-0 bg-slate-50 z-[200] flex flex-row items-center justify-center p-8 md:p-16 lg:p-24 gap-12 lg:gap-24 animate-in fade-in duration-500 cursor-none relative pointer-events-auto">
          <button
            type="button"
            onClick={() => setFocusMode(false)}
            className="absolute top-8 right-8 text-slate-400 hover:text-slate-800 tracking-widest uppercase font-bold p-4 pointer-events-auto"
          >
            &#10005; Close
          </button>

          {/* Left: Maximized Image */}
          <div className="flex-1 flex justify-end items-center h-full max-h-[85vh] w-1/2">
            <img
              src={activeEvent.image_url}
              className="w-full h-full object-contain shadow-[0_20px_50px_rgba(0,0,0,0.1)] rounded-md border border-slate-100"
              alt=""
            />
          </div>

          {/* Right: Details Formatted Nice and Large */}
          <div className="flex-1 flex flex-col justify-center max-w-2xl text-left border-l border-slate-200 pl-12 h-full max-h-[85vh] w-1/2">
            <h2 className="text-3xl md:text-4xl text-slate-400 italic mb-6">
              {new Date(activeEvent.event_date).toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </h2>
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-slate-800 leading-none mb-10 tracking-tight">
              {activeEvent.title}
            </h1>
            <p className="text-2xl md:text-3xl text-slate-600 leading-relaxed font-light line-clamp-6">
              {activeEvent.description}
            </p>
          </div>

          {/* Persistent Nameplate faintly in the background/bottom */}
          <h1 className="absolute bottom-4 left-1/2 -translate-x-1/2 text-2xl tracking-[0.4em] uppercase text-slate-300 font-bold opacity-50 z-0">
            {person.name}
          </h1>
        </div>
      )}
    </div>
  );
}
