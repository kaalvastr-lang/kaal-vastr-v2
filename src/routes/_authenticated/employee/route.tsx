import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PosProvider } from "@/lib/pos/pos-context";
import { AuthProvider } from "@/lib/auth";

/**
 * Employee panel layout. Authentication is already handled by the parent
 * `_authenticated` gate; this layer only supplies the POS cart + profile
 * context shared by every employee screen.
 */
export const Route = createFileRoute("/_authenticated/employee")({
  component: EmployeeLayout,
});

function EmployeeLayout() {
  return (
    <AuthProvider>
      <PosProvider>
        <Outlet />
      </PosProvider>
    </AuthProvider>
  );
}