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

  // Stages: Hover (active) -> Expanded (activeExpandedId) -> Focus (focusMode)
  const [activeExpandedId, setActiveExpandedId] = useState<number | null>(null);
  const [focusMode, setFocusMode] = useState(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [pixelsPerYear, setPixelsPerYear] = useState(72);

  const stripRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<number | null>(null);
  const isSlideshowDrivingRef = useRef<boolean>(false);

  useEffect(() => {
    const fetchPersonAndEvents = () => {
      void invoke<Person | null>("get_current_display_state")
        .then((data) => {
          if (!data) return;
          setPerson(data);
          if (data.id.toString() !== personId) {
            void navigate({ to: `/timecard/${data.id}` });
          }
        })
        .catch(console.error);

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
  const deadYear =
    person?.dead_date && person.dead_date !== "Present"
      ? parseInt(person.dead_date.substring(0, 4), 10)
      : new Date().getFullYear();

  const startDecade = birthYear;
  const endDecade = deadYear;

  // RENDER ENGINE: Mathematically pure mapping mapping photos purely to dates (Permits exact physical overapping)
  const renderedEvents = useMemo(() => {
    return events.map((event, i) => {
      const date = new Date(event.event_date);
      const year = date.getFullYear() + date.getMonth() / 12;
      const targetX = (year - startDecade) * pixelsPerYear;
      return {
        ...event,
        renderX: targetX,
        originalIndex: i,
        dateObj: date,
      };
    });
  }, [events, startDecade, pixelsPerYear]);

  // SCROLL TRIGGER: Drives physical alignment
  const scrollToIndex = useCallback(
    (index: number, isSlideshow = false) => {
      setActiveExpandedId(null);

      if (isSlideshow) {
        isSlideshowDrivingRef.current = true;
      }

      setActiveIndex(index);
      const ev = renderedEvents[index];
      if (ev && stripRef.current) {
        stripRef.current.scrollTo({ left: ev.renderX, behavior: "smooth" });

        if (isSlideshow) {
          window.setTimeout(() => {
            isSlideshowDrivingRef.current = false;
          }, 850);
        }
      }
    },
    [renderedEvents],
  );

  // AUTO-PLAY: Functions exclusively when fully immersed globally in Focus Mode per instruction
  useEffect(() => {
    if (!isPlaying || renderedEvents.length === 0 || !focusMode) return;
    const interval = setInterval(() => {
      const nextIdx = (activeIndex + 1) % renderedEvents.length;
      scrollToIndex(nextIdx, true);
    }, 4500);
    return () => clearInterval(interval);
  }, [isPlaying, renderedEvents, activeIndex, scrollToIndex, focusMode]);

  // TICKS: Explicit inclusion guarantees boundaries are permanently imprinted visually alongside 5/10 scales
  const ticks: { val: number; isMajor: boolean }[] = [];
  const tickInterval = pixelsPerYear >= 60 ? 5 : 10;

  for (let y = startDecade; y <= endDecade; y += 1) {
    if (
      y === startDecade ||
      y === endDecade ||
      Math.abs(y % tickInterval) === 0
    ) {
      ticks.push({ val: y, isMajor: true });
    } else {
      ticks.push({ val: y, isMajor: false });
    }
  }

  // NATIVE TRACKING: Resolves Overlapping Image paradoxes by allowing explicit selection without brutal overwrite.
  const handleScroll = () => {
    if (!stripRef.current || renderedEvents.length === 0) return;
    if (scrollTimeoutRef.current) window.clearTimeout(scrollTimeoutRef.current);

    if (!isSlideshowDrivingRef.current) {
      const scrollLeft = stripRef.current.scrollLeft;

      let closestIdx = activeIndex;
      let minDiff = Number.MAX_VALUE;
      renderedEvents.forEach((ev, idx) => {
        const diff = Math.abs(ev.renderX - scrollLeft);
        if (diff < minDiff) {
          minDiff = diff;
          closestIdx = idx;
        }
      });

      // BUG FIX: If user deliberately taps an overlapping identical-date polaroid making it active,
      // the physics tracker must not reset it to index 0 dynamically during scroll vibrations
      const activeX = renderedEvents[activeIndex]?.renderX;
      const closestX = renderedEvents[closestIdx]?.renderX;

      if (closestIdx !== activeIndex) {
        if (activeX !== closestX) {
          // Only overwrite state if they explicitly scroll to a mechanically different pixel coordinate
          setActiveExpandedId(null);
          setActiveIndex(closestIdx);
        }
      }
    }

    scrollTimeoutRef.current = window.setTimeout(() => {}, 200);
  };

  if (!person) {
    return (
      <div className="fixed inset-0 bg-slate-50 flex items-center justify-center font-serif cursor-none *:-cursor-none touch-none overflow-hidden overscroll-none">
        <h1 className="text-3xl text-slate-400 animate-pulse uppercase tracking-[0.2em] font-light">
          Initializing Timecard...
        </h1>
      </div>
    );
  }

  const activeEvent = renderedEvents[activeIndex];

  return (
    <div className="fixed inset-0 bg-slate-50 text-slate-800 overflow-hidden flex flex-col relative w-full h-full select-none cursor-none pointer-events-auto touch-none overscroll-none">
      {/* OVERLAY RED LINE - Dynamically hidden perfectly natively when inspecting items */}
      <div
        className={`absolute top-[25%] bottom-[15%] left-1/2 -translate-x-1/2 w-[2px] bg-red-600 shadow-[0_0_15px_rgba(220,38,38,0.5)] z-[45] pointer-events-none transition-opacity duration-300 ${activeExpandedId !== null || focusMode ? "opacity-0" : "opacity-100"}`}
      >
        <div className="absolute top-[-4px] left-1/2 -translate-x-1/2 w-3 h-3 bg-red-600 rounded-full" />
        <div className="absolute bottom-[-4px] left-1/2 -translate-x-1/2 w-3 h-3 bg-red-600 rounded-full" />
      </div>

      <div
        className="absolute inset-0 z-30 touch-pan-x overflow-x-auto overflow-y-hidden no-scrollbar scroll-smooth snap-x snap-mandatory"
        ref={stripRef}
        onScroll={handleScroll}
      >
        <div className="h-full flex items-start w-max relative">
          <div className="w-[50vw] h-full flex-shrink-0" />

          <div
            className="relative h-full flex-shrink-0"
            style={{
              width: `${renderedEvents[renderedEvents.length - 1]?.renderX || (endDecade - startDecade) * pixelsPerYear}px`,
            }}
          >
            <div className="absolute bottom-[28%] w-full h-12 pointer-events-none z-[10]">
              {ticks.map((tick, idx) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: Static array mapping
                  key={`${tick.val}-${idx}`}
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

            {/* PHOTOS (Dynamically stacked upwards precisely averting the tick boundaries strictly) */}
            {renderedEvents.map((event, i) => {
              const isActive = activeIndex === i;
              const isExpanded = activeExpandedId === event.id;

              return (
                <div
                  key={event.id}
                  className={`absolute pointer-events-none transition-all duration-[600ms] ease-[cubic-bezier(0.34,1.56,0.64,1)]
                    ${
                      isActive && isExpanded
                        ? // STAGE 2
                          "scale-[2.8] -translate-y-[8rem] -translate-x-[45%] z-[60] shadow-[0_30px_60px_rgba(0,0,0,0.15)] opacity-100"
                        : isActive && !isExpanded
                          ? // STAGE 1
                            "scale-[2.6] -translate-y-6 translate-x-[15%] z-[50] shadow-2xl opacity-100"
                          : // STAGE 0 (Background)
                            "scale-100 translate-y-0 -translate-x-1/2 z-[20] opacity-[0.8]"
                    }`}
                  style={{
                    left: `${event.renderX}px`,
                    // Built strictly upwards from a safe minimum boundary avoiding Ticks
                    bottom: `${35 + (i % 3) * 15}%`,
                  }}
                >
                  <div
                    className="relative pointer-events-auto cursor-none outline-none"
                    onClick={() => {
                      if (isActive) {
                        if (!isExpanded) setActiveExpandedId(event.id);
                        else setFocusMode(true);
                      } else {
                        // Crucially overrides manual interactions onto background photos forcing state identically
                        scrollToIndex(i, true);
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
                    <img
                      src={event.image_url}
                      className="w-20 h-20 object-cover border-[3px] border-white rounded shadow-sm bg-white"
                      alt=""
                    />
                  </div>

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

      <div className="absolute bottom-[4%] w-full flex flex-col items-center z-[40] pointer-events-none">
        <h1 className="text-4xl tracking-[0.3em] uppercase text-slate-800 font-bold mb-2">
          {person.name}
        </h1>
        <p className="text-xl tracking-[0.2em] text-slate-500 italic font-light">
          {birthYear} &bull;{" "}
          {person.dead_date === "Present" ? "Present" : deadYear}
        </p>
      </div>

      {/* Extreme Shield Node preventing Fat Thumb clicks from dragging physics */}
      <div className="absolute bottom-6 right-8 p-12 touch-none pointer-events-auto z-[50]">
        <div className="flex gap-8 text-slate-400 font-light tracking-widest uppercase text-[12px] cursor-none tracking-widest">
          <button
            type="button"
            className="hover:text-slate-800 cursor-none p-4 -m-4"
            onClick={() => setPixelsPerYear((p) => Math.min(240, p + 20))}
          >
            Zoom In
          </button>
          <button
            type="button"
            className="hover:text-slate-800 cursor-none p-4 -m-4"
            onClick={() => setPixelsPerYear((p) => Math.max(12, p - 20))}
          >
            Zoom Out
          </button>
        </div>
      </div>

      {/* FOCUS MODAL Overlay Native Structure */}
      {focusMode && activeEvent && (
        <div className="fixed inset-0 bg-slate-50/95 backdrop-blur-xl z-[200] cursor-none relative pointer-events-auto animate-in fade-in duration-300">
          <button
            type="button"
            onClick={() => {
              setFocusMode(false);
              setIsPlaying(false);
            }}
            className="absolute top-10 right-10 text-slate-400 hover:text-red-700 tracking-[0.3em] uppercase text-[13px] font-bold p-4 pointer-events-auto transition-colors z-[210] cursor-none"
          >
            &#10005; Close
          </button>

          <button
            type="button"
            onClick={() =>
              scrollToIndex(
                activeIndex === 0 ? renderedEvents.length - 1 : activeIndex - 1,
                true,
              )
            }
            className="absolute left-6 lg:left-10 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600 p-4 transition-all z-[210] cursor-none"
          >
            {/* biome-ignore lint/a11y/noSvgWithoutTitle: Natively Disabled */}
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

          <button
            type="button"
            onClick={() =>
              scrollToIndex((activeIndex + 1) % renderedEvents.length, true)
            }
            className="absolute right-6 lg:right-10 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600 p-4 transition-all z-[210] cursor-none"
          >
            {/* biome-ignore lint/a11y/noSvgWithoutTitle: Natively Disabled */}
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

          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[205] flex items-center justify-center p-[6px] bg-[#f8f9fa] border border-[#e5e7eb] shadow-md max-w-[65vw]">
            <img
              src={activeEvent.image_url}
              className="w-auto h-auto max-h-[70vh] border border-[#d1d5db]"
              alt=""
            />
          </div>

          {/* Explicitly positioned LEFT per directions */}
          <div className="absolute left-20 lg:left-32 top-1/2 -translate-y-1/2 flex flex-col justify-center text-left z-[210] max-w-sm lg:max-w-md">
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

          <div className="absolute bottom-[4%] w-full flex flex-col items-center pointer-events-none z-[100]">
            <h1 className="text-3xl lg:text-4xl tracking-[0.4em] uppercase text-slate-800 font-bold mb-2">
              {person.name}
            </h1>
            <p className="text-xl tracking-[0.2em] text-slate-500 italic font-light">
              {birthYear} &bull;{" "}
              {person.dead_date === "Present" ? "Present" : deadYear}
            </p>
          </div>

          {/* Slideshow toggler solely operated inside Focus Mode */}
          <div className="absolute bottom-10 left-10 text-slate-400 z-[210] pointer-events-auto font-light uppercase text-[12px] cursor-none tracking-widest">
            <button
              type="button"
              className="hover:text-red-700 cursor-none transition-colors p-4 -m-4"
              onClick={() => setIsPlaying(!isPlaying)}
            >
              {isPlaying ? "PAUSE" : "SLIDESHOW"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
