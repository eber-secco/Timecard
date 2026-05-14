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
  const [isPlaying, setIsPlaying] = useState(true);

  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void invoke<Person | null>("get_person", {
      personId: parseInt(personId, 10),
    })
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

    void invoke<TimelineEvent[]>("get_events", {
      personId: parseInt(personId, 10),
    })
      .then((data) => {
        setEvents(data);
      })
      .catch((err) => {
        console.warn("Using Mock Events (Backend missing):", err);
        setEvents([
          {
            id: 1,
            person_id: 1,
            title: "First Steps",
            description:
              "Taking off in the living room for the very first time! She was so brave.",
            event_date: "2007-06-12",
            image_url:
              "https://images.unsplash.com/photo-1522771930-78848d9293e8?w=800&q=80",
          },
          {
            id: 2,
            person_id: 1,
            title: "Tummy Time Setup",
            description:
              "Testing out the new soft blue blanket in the nursery.",
            event_date: "2006-11-20",
            image_url:
              "https://images.unsplash.com/photo-1544126592-807ca20e29d7?w=800&q=80",
          },
          {
            id: 3,
            person_id: 1,
            title: "Smash Cake!",
            description: "First birthday party chaos at the park.",
            event_date: "2007-06-08",
            image_url:
              "https://images.unsplash.com/photo-1519689680058-324335c77eba?w=800&q=80",
          },
          {
            id: 4,
            person_id: 1,
            title: "Beach Day",
            description:
              "Summer trip to the coastal bay. Collected seashells all afternoon.",
            event_date: "2009-08-14",
            image_url:
              "https://images.unsplash.com/photo-1471286174890-9c112225d57b?w=800&q=80",
          },
        ]);
      });
  }, [personId]);

  // Slideshow Logic
  useEffect(() => {
    if (!isPlaying || events.length === 0) return;
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % events.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [isPlaying, events.length]);

  // Auto-scroll the strip to center the active item
  useEffect(() => {
    if (stripRef.current && events.length > 0) {
      const container = stripRef.current;
      const activeEl = container.children[activeIndex] as HTMLElement;
      if (activeEl) {
        const scrollLeft =
          activeEl.offsetLeft -
          container.offsetWidth / 2 +
          activeEl.offsetWidth / 2;
        container.scrollTo({ left: scrollLeft, behavior: "smooth" });
      }
    }
  }, [activeIndex, events.length]);

  if (!person) {
    return (
      <div className="min-h-screen bg-[#e0f2fe] text-slate-900 flex flex-col items-center justify-center">
        <h1 className="text-3xl text-cyan-700 animate-pulse font-bold tracking-widest uppercase">
          Loading Framework...
        </h1>
      </div>
    );
  }

  const activeEvent = events[activeIndex];

  // Helper for pseudo-random scattered heights for the collage effect
  const getScatteredOffset = (index: number) => {
    const offsets = ["-60px", "-20px", "20px", "60px", "0px", "-40px", "40px"];
    return offsets[index % offsets.length];
  };

  // Helper for pseudo-random scattered width widths
  const getScatteredSize = (index: number) => {
    const sizes = ["w-32 h-32", "w-48 h-32", "w-32 h-48", "w-40 h-40"];
    return sizes[index % sizes.length];
  };

  return (
    <div className="bg-[#e0f2fe] min-h-screen text-slate-800 font-sans overflow-hidden flex flex-col relative w-full h-full select-none cursor-default">
      {/* Background Grid Pattern (Subtle) */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjEiIGZpbGw9InJnYmEoMCwwLDAsMC4wNSkiLz48L3N2Zz4=')] opacity-50 z-0"></div>

      {activeEvent ? (
        <>
          {/* Top Focus Section */}
          <div className="absolute top-[8%] w-full flex justify-center z-20 transition-all duration-700 ease-in-out">
            <div className="flex gap-6 items-start max-w-3xl transform">
              <div className="relative">
                <img
                  src={activeEvent.image_url}
                  alt={activeEvent.title}
                  className="w-72 h-72 object-cover object-center bg-white p-3 pb-8 shadow-2xl transition-transform duration-700"
                  style={{ transform: "rotate(-2deg)" }}
                />
              </div>
              <div className="pt-4 max-w-sm">
                <h2 className="text-xl text-slate-600 font-medium mb-1">
                  {new Date(activeEvent.event_date).toLocaleDateString(
                    undefined,
                    { year: "numeric", month: "long", day: "numeric" },
                  )}
                </h2>
                <h3 className="text-2xl font-semibold text-slate-800 leading-tight mb-2">
                  {activeEvent.title}
                </h3>
                <p className="text-slate-500 text-base leading-relaxed line-clamp-4">
                  {activeEvent.description}
                </p>
              </div>
            </div>
          </div>

          {/* Thin Vertical Alignment Line */}
          <div className="absolute left-[50%] top-0 bottom-[20%] w-[1px] bg-red-400/50 z-10"></div>
        </>
      ) : (
        <div className="absolute top-[20%] w-full flex justify-center z-20">
          <p className="text-xl text-slate-400 italic">
            No memories uploaded yet.
          </p>
        </div>
      )}

      {/* Middle Scattered Photo Strip */}
      <div className="absolute top-[45%] w-full h-[25vh] z-30">
        <div
          ref={stripRef}
          className="w-full h-full flex items-center overflow-x-hidden"
          style={{ scrollBehavior: "smooth" }}
        >
          {/* Padding to allow centering of first and last items */}
          <div className="flex items-center gap-4 px-[50vw]">
            {events.map((event, i) => (
              <div
                key={event.id}
                className={`relative flex-shrink-0 cursor-pointer transition-all duration-500 ease-out hover:z-50 ${activeIndex === i ? "z-40 scale-110 shadow-cyan-900/20" : "z-20 opacity-80 hover:opacity-100 hover:scale-105"}`}
                style={{ marginTop: getScatteredOffset(i) }}
                onClick={() => {
                  setActiveIndex(i);
                  setIsPlaying(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    setActiveIndex(i);
                    setIsPlaying(false);
                  }
                }}
                tabIndex={0}
                role="button"
              >
                <img
                  src={event.image_url}
                  className={`${getScatteredSize(i)} object-cover border-4 ${activeIndex === i ? "border-sky-300" : "border-white"} shadow-lg`}
                  alt=""
                  draggable={false}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Floating Timeline Tick Marks */}
      <div className="absolute bottom-[22%] w-full flex justify-center z-10 opacity-40">
        <div className="flex gap-12 font-mono text-sm tracking-widest">
          {events.length > 0 &&
            Array.from(new Set(events.map((e) => e.event_date.split("-")[0])))
              .sort()
              .map((year) => (
                <span
                  key={year}
                  className="relative before:content-[''] before:absolute before:-top-4 before:left-[45%] before:w-[1px] before:h-2 before:bg-slate-800"
                >
                  {year}
                </span>
              ))}
        </div>
      </div>

      {/* Bottom Center Name Plate */}
      <div className="absolute bottom-[8%] w-full flex flex-col items-center z-20">
        <h1 className="text-2xl tracking-[0.2em] uppercase text-slate-600 font-semibold mb-1">
          {person.name}
        </h1>
        <p className="text-sm tracking-widest text-slate-400 font-medium">
          {new Date(person.birth_date).toLocaleDateString(undefined, {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
          {person.dead_date &&
            person.dead_date !== "Present" &&
            ` - ${new Date(person.dead_date).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}`}
        </p>
      </div>

      {/* Control Buttons Overlay */}
      <div className="absolute bottom-8 right-12 flex gap-8 z-50 text-xs tracking-widest uppercase font-semibold text-slate-400">
        <button
          type="button"
          className={`hover:text-slate-700 transition-colors ${isPlaying ? "text-cyan-600" : ""}`}
          onClick={() => setIsPlaying(!isPlaying)}
        >
          {isPlaying ? "Pause" : "Slideshow"}
        </button>
        <button
          type="button"
          className="hover:text-slate-700 transition-colors"
          onClick={() => {
            /* Placeholder */
          }}
        >
          Zoom In
        </button>
        <button
          type="button"
          className="hover:text-slate-700 transition-colors"
          onClick={() => {
            /* Placeholder */
          }}
        >
          Zoom Out
        </button>
      </div>
    </div>
  );
}
