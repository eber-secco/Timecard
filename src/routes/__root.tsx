import { createRootRoute, Outlet } from "@tanstack/react-router";
import "../styles.css";

export const RootComponent: React.FC = () => {
  return (
    <div className="antialiased min-h-screen">
      <Outlet />
    </div>
  );
};

export const Route = createRootRoute({
  component: RootComponent,
});
