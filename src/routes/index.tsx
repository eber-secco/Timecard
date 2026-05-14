import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

export const Home: React.FC = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState("Loading Timecard...");

  useEffect(() => {
    setStatus("Calling Rust backend...");
    void invoke<number | null>("get_first_person_id")
      .then((id) => {
        setStatus(`Got ID: ${id}. Navigating...`);
        if (id) {
          void navigate({ to: `/timecard/${id}`, replace: true });
        } else {
          void navigate({ to: "/connect", replace: true });
        }
      })
      .catch((e) => {
        setStatus(`Error from Rust: ${e}`);
        setTimeout(() => {
          void navigate({ to: "/connect", replace: true });
        }, 3000);
      });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8 text-center">
      <div className="text-cyan-600 font-bold text-2xl mb-4">{status}</div>
      <div className="text-slate-500 max-w-md">
        If you are stuck on this screen, please wait. We are debugging a
        connection issue.
      </div>
    </div>
  );
};

export const Route = createFileRoute("/")({
  component: Home,
});
