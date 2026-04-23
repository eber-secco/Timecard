import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import QRCode from "react-qr-code";

export const Connect: React.FC = () => {
  const [kioskUrl, setKioskUrl] = useState<string>("http://192.168.0.103:8080");
  const [serverStatus, setServerStatus] = useState<string>("Starting...");
  const navigate = useNavigate();

  useEffect(() => {
    void invoke<string>("get_kiosk_url")
      .then((url) => setKioskUrl(url))
      .catch(console.error);

    const checkStatus = () => {
      void invoke<string>("get_server_status")
        .then((s) => setServerStatus(s))
        .catch((e) => setServerStatus(`Tauri Error: ${e}`));
    };

    checkStatus();
    const statusInterval = setInterval(checkStatus, 3000);

    const interval = setInterval(() => {
      void invoke("get_current_display_state")
        .then((person: { id?: string | number } | unknown) => {
          const p = person as { id?: string | number };
          if (p?.id) {
            // @ts-expect-error Ignore type if route strictness complains before gen
            void navigate({ to: `/timecard/${person.id}` });
          }
        })
        .catch(console.error);
    }, 2000);

    return () => {
      clearInterval(statusInterval);
      clearInterval(interval);
    };
  }, [navigate]);

  return (
    <div className="min-h-screen bg-slate-50 p-8 pb-20 font-serif flex flex-col items-center justify-center cursor-none *:-cursor-none">
      <header className="mb-12 w-full flex flex-col items-center max-w-3xl">
        <h1 className="text-4xl md:text-6xl text-center font-black text-slate-800 mb-8 tracking-tight">
          Timecard
        </h1>
        <p className="text-xl text-slate-500 mb-4 font-medium text-center">
          Connect Your Phone to begin.
        </p>

        {/* Server Status Warning */}
        {serverStatus !== "Running" && (
          <div className="w-full bg-red-50 border-2 border-red-200 p-6 rounded-2xl mb-8 flex flex-col items-center animate-pulse">
            <h3 className="text-red-700 font-bold text-xl mb-1">
              ⚠️ Connection Problem
            </h3>
            <p className="text-red-600 font-medium">{serverStatus}</p>
            <p className="text-red-500 text-sm mt-2 font-mono">
              Check if another app is using port 8080
            </p>
          </div>
        )}

        <div className="bg-white p-8 md:p-12 rounded-3xl shadow-2xl shadow-cyan-900/10 border border-slate-200 flex flex-col md:flex-row items-center gap-12 my-6 w-full justify-between">
          <div className="flex flex-col items-center md:items-start text-center md:text-left">
            <h2 className="text-3xl font-bold text-slate-800 mb-6 font-serif">
              Create a Profile
            </h2>
            <div className="flex flex-col gap-6 text-xl">
              <p className="text-slate-600">
                <span className="font-black text-slate-700 text-2xl mr-3">
                  1.
                </span>
                Join Wi-Fi:{" "}
                <strong className="text-slate-800 bg-slate-100 px-4 py-2 rounded-lg ml-1">
                  makerspacenet
                </strong>
              </p>
              <p className="text-slate-600">
                <span className="font-black text-slate-700 text-2xl mr-3">
                  2.
                </span>
                Open Camera & scan QR code!
              </p>
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-lg border border-slate-100 flex-shrink-0 flex flex-col items-center gap-4">
            <QRCode value={kioskUrl} size={200} />
            <div className="text-sm font-mono font-medium text-slate-600 bg-slate-100 px-3 py-1 rounded-lg">
              {kioskUrl}
            </div>
          </div>
        </div>
      </header>
    </div>
  );
};

export const Route = createFileRoute("/connect")({
  component: Connect,
});
