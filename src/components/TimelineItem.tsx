import { useState } from "react";

export interface TimelineEvent {
  id: number;
  event_date: string;
  title: string;
  description: string;
  image_url: string;
  audio_url?: string;
}

interface TimelineItemProps {
  event: TimelineEvent;
  isLeft: boolean;
}

export function TimelineItem({ event, isLeft }: TimelineItemProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  return (
    <>
      <div
        className={`mb-8 flex justify-between items-center w-full ${isLeft ? "flex-row-reverse left-timeline" : "right-timeline"}`}
      >
        <div className="order-1 w-5/12"></div>

        <div className="z-20 flex items-center order-1 bg-cyan-500 shadow-xl w-8 h-8 rounded-full">
          <h1 className="mx-auto text-white font-semibold text-lg hover:animate-ping cursor-pointer">
            •
          </h1>
        </div>

        <div
          onClick={() => setIsModalOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") setIsModalOpen(true);
          }}
          role="button"
          tabIndex={0}
          className="order-1 bg-white hover:bg-slate-50 transition-colors shadow-xl w-5/12 px-6 py-4 rounded-lg border border-slate-200 cursor-pointer"
        >
          <h3 className="mb-1 font-bold text-gray-800 text-xl">
            {event.title}
          </h3>
          <p className="text-sm leading-snug tracking-wide text-cyan-600 mb-2 font-mono">
            {event.event_date}
          </p>

          {event.image_url && (
            <img
              src={event.image_url}
              alt={event.title}
              className="w-full h-48 object-cover rounded-md mb-3"
              onError={(e) => {
                // Hide broken images gracefully if test URLs fail
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          )}

          <p className="text-sm leading-snug tracking-wide text-gray-700 text-opacity-100">
            {event.description}
          </p>
        </div>
      </div>

      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setIsModalOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") setIsModalOpen(false);
          }}
          role="button"
          tabIndex={0}
        >
          <div
            className="max-w-4xl w-full bg-white rounded-xl overflow-hidden flex flex-col md:flex-row shadow-2xl relative cursor-default"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="presentation"
          >
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 bg-black/50 text-white hover:bg-black/80 rounded-full w-8 h-8 flex items-center justify-center z-10 transition-colors"
            >
              ✕
            </button>
            {event.image_url && (
              <div className="md:w-3/5 bg-black flex items-center justify-center">
                <img
                  src={event.image_url}
                  alt={event.title}
                  className="max-h-[80vh] w-auto object-contain"
                />
              </div>
            )}
            <div
              className={`p-8 flex flex-col ${event.image_url ? "md:w-2/5" : "w-full"} max-h-[80vh] overflow-y-auto`}
            >
              <h2 className="text-3xl font-bold mb-2 text-gray-800">
                {event.title}
              </h2>
              <p className="text-cyan-600 font-mono mb-6 font-semibold">
                {event.event_date}
              </p>
              <p className="text-gray-700 text-lg leading-relaxed whitespace-pre-wrap">
                {event.description}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
