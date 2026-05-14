import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";

export const Home: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    void invoke<number | null>("get_first_person_id")
      .then((id) => {
        if (id) {
          void navigate({ to: `/timecard/${id}`, replace: true });
        } else {
          void navigate({ to: "/connect", replace: true });
        }
      })
      .catch(() => {
        void navigate({ to: "/connect", replace: true });
      });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="animate-pulse text-cyan-600 font-bold text-xl">
        Loading Timecard...
      </div>
    </div>
  );
};

export const Route = createFileRoute("/")({
  component: Home,
});
