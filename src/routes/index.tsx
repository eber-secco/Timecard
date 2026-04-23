import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Home: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    void navigate({ to: "/connect", replace: true });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center cursor-none *:-cursor-none">
      <div className="animate-pulse text-cyan-600 font-bold text-xl">
        Loading Timecard...
      </div>
    </div>
  );
};

export const Route = createFileRoute("/")({
  component: Home,
});
