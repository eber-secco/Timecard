import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

  // 2-Stage Mac Dock State
  const [activeExpandedId, setActiveExpandedId] = useState<number | null>(null);
  const [focusMode, setFocusMode] = useState(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [pixelsPerYear, setPixelsPerYear] = useState(72);

  const stripRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const fetchPersonAndEvents = () => {
      // Sync active person state
      void invoke<Person | null>("get_current_display_state")
        .then((data) => {
          if (!data) return;
          setPerson(data);
          if (data.id.toString() !== personId) {
            void navigate({ to: `/timecard/${data.id}` });
          }
        })
        .catch(console.error);

      // Fetch Events
      void invoke<TimelineEvent[]>("get_events", {
        personId: parseInt(personId, 10),
      })
        .then((data) => {
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

  // Render Engine: Calculate Physical Geometry & Gap Spacing guarantees (Artifact 7/8 Fix)
  const renderedEvents = useMemo(() => {
    let lastX = -9999;
    const MINIMUM_GAP = 45; // Ensures no photo ever perfectly overlays another

    return events.map((event, i) => {
      const date = new Date(event.event_date);
      const year = date.getFullYear() + date.getMonth() / 12;

      let targetX = (year - startDecade) * pixelsPerYear;
      if (targetX < lastX + MINIMUM_GAP) {
        targetX = lastX + MINIMUM_GAP;
      }

      lastX = targetX;
      return {
        ...event,
        renderX: targetX,
        originalIndex: i,
        dateObj: date,
      };
    });
  }, [events, startDecade, pixelsPerYear]);

  const scrollToIndex = useCallback(
    (index: number) => {
      setActiveExpandedId(null);
      const ev = renderedEvents[index];
      if (ev && stripRef.current) {
        stripRef.current.scrollTo({ left: ev.renderX, behavior: "smooth" });
      }
    },
    [renderedEvents],
  );

  // Global Slideshow Interval (Now ignores focusMode entirely!)
  useEffect(() => {
    if (!isPlaying || renderedEvents.length === 0) return;
    const interval = setInterval(() => {
      const nextIdx = (activeIndex + 1) % renderedEvents.length;
      scrollToIndex(nextIdx);
    }, 4500);
    return () => clearInterval(interval);
  }, [isPlaying, renderedEvents, activeIndex, scrollToIndex]);

  // Tick generator logic scales dynamically into 5-year leaps at extensive zoom
  const ticks = [];
  const tickInterval = pixelsPerYear >= 60 ? 5 : 10;
  for (let y = startDecade; y <= endDecade; y += 1) {
    if (Math.abs(y % tickInterval) === 0) {
      ticks.push({ val: y, isMajor: true });
    } else {
      ticks.push({ val: y, isMajor: false });
    }
  }

  // Native Scroll Hooking directly to mapped rendering coordinates
  const handleScroll = () => {
    if (!stripRef.current || renderedEvents.length === 0) return;
    if (scrollTimeoutRef.current) {
      window.clearTimeout(scrollTimeoutRef.current);
    }

    // Collapse any opened menu items during drag coasting
    setActiveExpandedId(null);
    setIsPlaying(false);

    const scrollLeft = stripRef.current.scrollLeft;

    let closestIdx = activeIndex;
    let minDiff = Number.MAX_VALUE;
    renderedEvents.forEach((ev, idx) => {
      // Find whichever photo rendered position is closest to the physical scroll zero-bound (line)
      const diff = Math.abs(ev.renderX - scrollLeft);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = idx;
      }
    });

    if (closestIdx !== activeIndex) {
      setActiveIndex(closestIdx);
    }

    scrollTimeoutRef.current = window.setTimeout(() => {}, 150);
  };

  if (!person) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center font-serif cursor-none *:-cursor-none">
        <h1 className="text-3xl text-slate-400 animate-pulse uppercase tracking-[0.2em] font-light">
          Initializing Timecard...
        </h1>
      </div>
    );
  }

  const activeEvent = renderedEvents[activeIndex];

  return (
    <div className="bg-slate-50 min-h-screen text-slate-800 overflow-hidden flex flex-col relative w-full h-full select-none cursor-none pointer-events-auto">
      {/* Dev Close System */}
      <button
        type="button"
        onClick={() => void invoke("close_app")}
        className="absolute top-4 left-4 z-[300] opacity-0 hover:opacity-100 transition-opacity p-2 text-slate-300 hover:text-slate-600 pointer-events-auto cursor-none"
      >
        Close System
      </button>

      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjEiIGZpbGw9InJnYmEoMCwwLDAsMC4wNSkiLz48L3N2Zz4=')] opacity-[0.05] z-0 pointer-events-none"></div>

      {/* SHORTER OVERLAY RED LINE */}
      <div className="absolute top-[35%] bottom-[25%] left-1/2 -translate-x-1/2 w-[2px] bg-red-600 shadow-[0_0_15px_rgba(220,38,38,0.5)] z-[45] pointer-events-none transition-all">
        <div className="absolute top-[-4px] left-1/2 -translate-x-1/2 w-3 h-3 bg-red-600 rounded-full" />
        <div className="absolute bottom-[-4px] left-1/2 -translate-x-1/2 w-3 h-3 bg-red-600 rounded-full" />
      </div>

      {/* FULL IMMERSIVE SCROLLING WRAPPER */}
      <div
        className="absolute inset-0 z-30 touch-pan-x overflow-x-auto overflow-y-hidden no-scrollbar scroll-smooth snap-x snap-mandatory"
        ref={stripRef}
        onScroll={handleScroll}
      >
        <div className="h-full flex items-start w-max relative">
          <div className="w-[50vw] h-full flex-shrink-0" />

          {/* Main Track Dimension computed from final rendered point + buffer padding */}
          <div
            className="relative h-full flex-shrink-0"
            style={{
              width: `${(renderedEvents[renderedEvents.length - 1]?.renderX || (endDecade - startDecade) * pixelsPerYear) + 300}px`,
            }}
          >
            {/* RULER TICKS */}
            <div className="absolute bottom-[28%] w-full h-12 pointer-events-none z-[10]">
              {ticks.map((tick) => (
                <div
                  key={tick.val}
                  className="absolute bottom-0 flex flex-col items-center"
                  style={{
                    left: `${(tick.val - startDecade) * pixelsPerYear}px`,
                    transform: "translateX(-50%)",
                  }}
                >
                  {tick.isMajor ? (
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

            {/* PHOTOS */}
            {renderedEvents.map((event, i) => {
              const isActive = activeIndex === i;
              const isExpanded = activeExpandedId === event.id;

              return (
                <div
                  key={event.id}
                  className={`absolute pointer-events-none transition-all duration-[600ms] ease-[cubic-bezier(0.34,1.56,0.64,1)]
                    ${
                      isActive && isExpanded
                        ? // Active Tap Expanded
                          "scale-[2.8] -translate-y-24 -translate-x-[45%] z-[60] shadow-[0_30px_60px_rgba(0,0,0,0.15)] opacity-100"
                        : isActive && !isExpanded
                          ? // Active Hover Center Pop
                            "scale-[2.6] -translate-y-[4.5rem] translate-x-[15%] z-[50] shadow-2xl opacity-100"
                          : // Compressed Background State strictly above ticks
                            "scale-100 translate-y-0 -translate-x-1/2 z-[20] opacity-[0.8]"
                    }`}
                  style={{
                    left: `${event.renderX}px`,
                    // Tightly mapped between 40% an 70% height to flawlessly fit above bottom-28% ruler
                    top: `${(i % 3) * 15 + 40}%`,
                  }}
                >
                  {/* Photo Interaction Frame */}
                  <div
                    className="relative pointer-events-auto cursor-none outline-none"
                    onClick={() => {
                      if (isActive) {
                        if (!isExpanded) setActiveExpandedId(event.id);
                        else setFocusMode(true);
                      } else {
                        scrollToIndex(i);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        if (isActive && !isExpanded)
                          setActiveExpandedId(event.id);
                        else if (isActive && isExpanded) setFocusMode(true);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    {/* Note: blur has been officially stripped cleanly via User Order */}
                    <img
                      src={event.image_url}
                      className="w-20 h-20 object-cover border-[3px] border-white rounded shadow-sm bg-white"
                      alt=""
                    />
                  </div>

                  {/* Stage Hover Text Wrapper */}
                  {isActive && isExpanded && !focusMode && (
                    <div className="absolute top-1/2 -translate-y-1/2 left-[110%] w-[450px] bg-slate-50/95 backdrop-blur-sm p-4 border border-slate-200 shadow-xl scale-[0.4] origin-left pointer-events-auto animate-in fade-in slide-in-from-left-4 duration-500 cursor-none">
                      <p className="text-[12px] uppercase tracking-widest font-bold text-red-500 mb-1 border-b border-red-100 pb-1 w-max">
                        {event.dateObj.toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </p>
                      <h4 className="text-[28px] font-black leading-tight text-slate-800 mb-2 truncate font-sans tracking-tight">
                        {event.title}
                      </h4>
                      <p className="text-[20px] text-slate-600 leading-relaxed font-serif line-clamp-3">
                        {event.description}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="w-[50vw] h-full flex-shrink-0" />
        </div>
      </div>

      {/* Primary Interface Elements Base Overlay */}
      <div className="absolute bottom-[4%] w-full flex flex-col items-center z-[40] pointer-events-none">
        <h1 className="text-4xl tracking-[0.3em] uppercase text-slate-800 font-bold mb-2">
          {person.name}
        </h1>
        <p className="text-xl tracking-[0.2em] text-slate-500 italic font-light">
          {new Date(person.birth_date).getFullYear()} &bull;{" "}
          {person.dead_date === "Present"
            ? "Present"
            : new Date(person.dead_date).getFullYear()}
        </p>
      </div>

      {/* Explicit Fixed Text Zooming Actions */}
      <div className="absolute bottom-[4%] right-12 flex gap-8 text-slate-400 z-[50] pointer-events-auto font-light tracking-widest uppercase text-[12px] cursor-none tracking-widest">
        <button
          type="button"
          className="hover:text-slate-800 cursor-none"
          onClick={() => setPixelsPerYear((p) => Math.min(180, p + 20))}
        >
          Zoom In
        </button>
        <button
          type="button"
          className="hover:text-slate-800 cursor-none"
          onClick={() => setPixelsPerYear((p) => Math.max(24, p - 20))}
        >
          Zoom Out
        </button>
      </div>

      {/* Explicit Slideshow Toggle */}
      <div className="absolute bottom-[4%] left-12 text-slate-400 z-[50] pointer-events-auto font-light uppercase text-[12px] cursor-none tracking-widest">
        <button
          type="button"
          className="hover:text-red-700 cursor-none transition-colors"
          onClick={() => setIsPlaying(!isPlaying)}
        >
          {isPlaying ? "PAUSE" : "SLIDESHOW"}
        </button>
      </div>

      {/* FULLSCREEN FOCUS OVERLAY */}
      {focusMode && activeEvent && (
        <div className="fixed inset-0 bg-slate-50 z-[200] cursor-none relative pointer-events-auto">
          {/* Subtle Flat Text Close Function */}
          <button
            type="button"
            onClick={() => setFocusMode(false)}
            className="absolute top-10 right-10 text-slate-400 hover:text-red-700 tracking-[0.3em] uppercase text-[13px] font-bold p-4 pointer-events-auto transition-colors z-[210] cursor-none"
          >
            &#10005; Close
          </button>

          {/* Extreme Left Navigation Overlay (Arrow Title Tags stripped for tooltip error resolution) */}
          <button
            type="button"
            onClick={() =>
              scrollToIndex(
                activeIndex === 0 ? renderedEvents.length - 1 : activeIndex - 1,
              )
            }
            className="absolute left-6 lg:left-10 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600 p-4 transition-all z-[210] cursor-none"
          >
            {/* biome-ignore lint/a11y/noSvgWithoutTitle: Native tooltips cause errors on kiosk */}
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>

          {/* Extreme Right Navigation Overlay */}
          <button
            type="button"
            onClick={() =>
              scrollToIndex((activeIndex + 1) % renderedEvents.length)
            }
            className="absolute right-6 lg:right-10 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600 p-4 transition-all z-[210] cursor-none"
          >
            {/* biome-ignore lint/a11y/noSvgWithoutTitle: Native tooltips cause errors on kiosk */}
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>

          {/* FOCAL IMMERSION (Dead Exact Center Layout mapped natively) */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[205] flex items-center justify-center p-[6px] bg-[#f8f9fa] border border-[#e5e7eb] shadow-md max-w-[65vw]">
            <img
              src={activeEvent.image_url}
              className="w-auto h-auto max-h-[70vh] border border-[#d1d5db]"
              alt=""
            />
          </div>

          {/* ASYMETTRIC RIGHT INFO DOCK */}
          <div className="absolute right-12 lg:right-24 top-1/2 -translate-y-1/2 flex flex-col justify-center text-left z-[210] max-w-sm lg:max-w-md bg-white/70 backdrop-blur-sm p-8 rounded border border-slate-100 shadow-xl">
            <h1 className="text-3xl lg:text-4xl font-bold text-slate-800 leading-[1.1] mb-2 font-sans tracking-tight">
              {activeEvent.title}
            </h1>
            <h2 className="text-xl text-slate-500 italic mb-6 tracking-widest font-serif">
              {activeEvent.dateObj.toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </h2>
            <p className="text-[17px] lg:text-[20px] text-slate-600 leading-[1.65] font-light font-serif line-clamp-[12]">
              {activeEvent.description}
            </p>
          </div>

          {/* LOWER NAME AND DATE REPLICA */}
          <div className="absolute bottom-[4%] w-full flex flex-col items-center pointer-events-none z-[100]">
            <h1 className="text-3xl lg:text-4xl tracking-[0.4em] uppercase text-slate-800 font-bold mb-2">
              {person.name}
            </h1>
            <p className="text-xl tracking-[0.2em] text-slate-500 italic font-light">
              {new Date(person.birth_date).getFullYear()} &bull;{" "}
              {person.dead_date === "Present"
                ? "Present"
                : new Date(person.dead_date).getFullYear()}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
