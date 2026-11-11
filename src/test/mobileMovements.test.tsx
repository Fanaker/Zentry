import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import Movimientos from "@/pages/Movimientos";

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ isAdmin: true }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/components/TransactionFormDialog", () => ({ default: () => null }));
vi.mock("@/hooks/useFinanceData", () => ({
  useAccounts: () => ({ data: [] }),
  useCategories: () => ({ data: [] }),
  usePeople: () => ({ data: [] }),
  useTransactions: () => ({
    data: [
      { id: "expense", tx_type: "expense", tx_date: "2026-11-05", description: "Almuerzo", amount_pen: 25, amount_usd: 0 },
      { id: "income", tx_type: "income", tx_date: "2026-11-04", description: "Reembolso", amount_pen: 0, amount_usd: 12.5 },
    ],
  }),
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  delete window.ZentryAndroid;
});

function renderMovements() {
  return render(<QueryClientProvider client={new QueryClient()}>
    <MemoryRouter><Movimientos /></MemoryRouter>
  </QueryClientProvider>);
}

it("keeps search across both Android views and remembers the view", () => {
  window.ZentryAndroid = { showKeyboard: vi.fn(), saveFile: vi.fn() };
  const view = renderMovements();
  expect(screen.getByRole("button", { name: /Reembolso.*\$12\.50/ })).toBeTruthy();
  expect(screen.queryByRole("columnheader", { name: "Soles" })).toBeNull();
  fireEvent.change(screen.getByRole("textbox", { name: "Buscar por categoría o descripción" }), { target: { value: "Reembolso" } });
  fireEvent.click(screen.getByRole("button", { name: "Extendida" }));
  expect(screen.getByRole("columnheader", { name: "Medio de pago" })).toBeTruthy();
  expect(screen.getByRole("columnheader", { name: "Destino" })).toBeTruthy();
  expect(screen.getByText("Reembolso")).toBeTruthy();
  expect(screen.queryByText("Almuerzo")).toBeNull();
  view.unmount();
  renderMovements();
  expect(screen.getByRole("button", { name: "Extendida" }).getAttribute("aria-pressed")).toBe("true");
});

it("retains the desktop table and its original account column", () => {
  renderMovements();
  expect(screen.getByRole("columnheader", { name: "Cuenta" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Simple" })).toBeNull();
});
