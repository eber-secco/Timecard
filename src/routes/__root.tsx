import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";

export const RootComponent: React.FC = () => {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="antialiased">
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
};

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Tauri + TanStack Start",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),

  component: RootComponent,
  errorComponent: ({ error }) => {
    return (
      <div className="min-h-screen bg-red-50 text-red-900 p-8 flex flex-col items-center justify-center font-mono">
        <h1 className="text-3xl font-bold mb-4">CRITICAL UI ERROR</h1>
        <p className="text-xl mb-8">
          The interface crashed. Please take a photo of this screen.
        </p>
        <div className="bg-red-950 text-red-200 p-6 rounded-xl text-left w-full max-w-4xl overflow-auto shadow-2xl">
          <p className="font-bold mb-2">Error Message:</p>
          <p className="mb-6 break-words">{error.message}</p>
          <p className="font-bold mb-2">Stack Trace:</p>
          <pre className="text-xs whitespace-pre-wrap">{error.stack}</pre>
        </div>
      </div>
    );
  },
});
