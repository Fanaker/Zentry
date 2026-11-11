import { StrictMode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import QuickAddFab from "@/components/QuickAddFab";
import Capturas from "@/pages/Capturas";

const backend = vi.hoisted(() => ({
  upsert: vi.fn(async () => ({ error: null })),
  rpc: vi.fn(async () => ({ error: null })),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ isAdmin: true, user: { id: "owner" } }) }));
vi.mock("@/hooks/useFinanceData", () => {
  const accounts = [
    { id: "yape", name: "BCP-YAPE", currency: "PEN", account_type: "debit", is_active: true },
    { id: "credit", name: "Visa BCP", currency: "PEN", account_type: "credit", is_active: true },
  ];
  const categories = [
    { id: "food", name: "Alimentación", tx_type: "expense", is_active: true },
    { id: "cinema", name: "Entretenimiento", tx_type: "expense", is_active: true },
    { id: "loan", name: "Préstamos / Deudas", tx_type: "expense", is_active: true, system_code: "loan_given" },
  ];
  const people = [{id:"andrea",name:"Andrea"},{id:"joaquin",name:"Joaquín"}];
  return {
    useAccounts: () => ({ data: accounts }),
    useCategories: () => ({ data: categories }),
    usePeople: () => ({ data: people }),
  };
});
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      upsert: backend.upsert,
      select() { return this; },
      eq() { return this; },
      order() { return this; },
      range: async () => ({ data: [], error: null }),
    }),
    rpc: backend.rpc,
  },
}));
vi.mock("@/components/TransactionFormDialog", () => ({
  default: ({ open }: { open: boolean }) => open ? <div role="dialog">Formulario de movimiento</div> : null,
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  delete window.ZentryAndroid;
  delete window.zentryCleanupResult;
  vi.clearAllMocks();
});

function renderQuickAdd() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<StrictMode><QueryClientProvider client={client}><MemoryRouter>
    <QuickAddFab />
    <Routes><Route path="/" element={<p>Inicio</p>} /><Route path="/por-confirmar" element={<Capturas />} /></Routes>
  </MemoryRouter></QueryClientProvider></StrictMode>);
}

it("opens the manual form from the Android action menu", () => {
  const showKeyboard = vi.fn();
  window.ZentryAndroid = { showKeyboard, saveFile: vi.fn() };
  renderQuickAdd();
  fireEvent.click(screen.getByRole("button", { name: "Agregar movimiento rápido" }));
  expect(screen.getByRole("group", { name: "Registrar movimiento" }).textContent).toBe("");
  fireEvent.click(screen.getByRole("button", { name: "Escribir" }));
  expect(screen.getByRole("dialog").textContent).toBe("Formulario de movimiento");
  expect(showKeyboard).not.toHaveBeenCalled();
});

it("opens the keyboard and only registers after the final confirmation", async () => {
  localStorage.setItem("zentry.voice.owner.auto","true");
  const showKeyboard = vi.fn();
  window.ZentryAndroid = { showKeyboard, saveFile: vi.fn() };
  renderQuickAdd();
  fireEvent.click(screen.getByRole("button", { name: "Agregar movimiento rápido" }));
  fireEvent.click(screen.getByRole("button", { name: "Dictar" }));
  const input=await screen.findByRole("textbox",{name:"Texto del movimiento"});
  await waitFor(()=>expect(showKeyboard).toHaveBeenCalledTimes(1));
  expect(document.activeElement).toBe(input);
  fireEvent.change(input,{target:{value:"Gasté 25 soles en almuerzo con Yape"}});
  fireEvent.click(screen.getByRole("button",{name:"Completar formulario"}));
  expect(backend.upsert).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"Aceptar movimiento"}));
  expect(backend.rpc).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"Confirmar y registrar"}));
  await waitFor(()=>expect(backend.rpc).toHaveBeenCalledWith("post_capture",expect.objectContaining({
    p_payload:expect.objectContaining({payment_account_id:"yape",amount_pen:25}),
  })));
  expect(backend.upsert).toHaveBeenCalledTimes(1);
  expect(backend.rpc).toHaveBeenCalledTimes(1);
});

it("keeps the desktop shortcut opening the manual form directly", () => {
  renderQuickAdd();
  fireEvent.click(screen.getByRole("button", { name: "Agregar movimiento rápido" }));
  expect(screen.queryByRole("dialog")).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Dictar" })).toBeNull();
});

it("saves a compound dictation as distinct drafts even with automatic registration enabled", async () => {
  localStorage.setItem("zentry.voice.owner.auto", "true");
  const transcript = "Fui al cine y pagué mi entrada por siete soles con tarjeta de crédito BCP para Andrea le hice un préstamo para su entrada de siete soles con esa tarjeta y para Joaquín también pagué con esa tarjeta";
  window.ZentryAndroid = { showKeyboard: vi.fn(), saveFile: vi.fn() };
  renderQuickAdd();
  fireEvent.click(screen.getByRole("button", { name: "Agregar movimiento rápido" }));
  fireEvent.click(screen.getByRole("button", { name: "Dictar" }));
  fireEvent.change(await screen.findByRole("textbox",{name:"Texto del movimiento"}),{target:{value:transcript}});
  fireEvent.click(screen.getByRole("button",{name:"Completar formulario"}));
  const button = screen.getByRole("button", { name: "Guardar para revisar" });
  expect(backend.rpc).not.toHaveBeenCalled();
  expect(backend.upsert).not.toHaveBeenCalled();
  fireEvent.click(button);
  await waitFor(() => expect(backend.upsert).toHaveBeenCalledWith([
    expect.objectContaining({payload:expect.objectContaining({category_id:"cinema",amount_pen:7})}),
    expect.objectContaining({payload:expect.objectContaining({category_id:"loan",person_id:"andrea",amount_pen:7})}),
    expect.objectContaining({payload:expect.objectContaining({category_id:"loan",person_id:"joaquin",amount_pen:0})}),
  ], {onConflict:"id",ignoreDuplicates:true}));
  expect(backend.rpc).not.toHaveBeenCalled();
});

it("cleans only the former model cache and hides the action after success", async () => {
  const removeEntry = vi.fn(async()=>{});
  const previous = Object.getOwnPropertyDescriptor(navigator,"storage");
  Object.defineProperty(navigator,"storage",{configurable:true,value:{getDirectory:async()=>({removeEntry})}});
  const confirm = vi.spyOn(window,"confirm").mockReturnValue(true);
  try {
    localStorage.setItem("zentry.connection.v2","connection");
    localStorage.setItem("zentry.voice.owner.aliases","[]");
    window.ZentryAndroid = { showKeyboard:vi.fn(), saveFile:vi.fn(), removeLegacyModels:()=>window.zentryCleanupResult?.("") };
    renderQuickAdd();
    fireEvent.click(screen.getByRole("button",{name:"Agregar movimiento rápido"}));
    fireEvent.click(screen.getByRole("button",{name:"Dictar"}));
    fireEvent.click(await screen.findByRole("button",{name:"Limpiar modelos anteriores"}));
    await waitFor(()=>expect(screen.queryByRole("button",{name:"Limpiar modelos anteriores"})).toBeNull());
    expect(removeEntry).toHaveBeenCalledWith("cache",{recursive:true});
    expect(localStorage.getItem("zentry.connection.v2")).toBe("connection");
    expect(localStorage.getItem("zentry.voice.owner.aliases")).toBe("[]");
  } finally {
    confirm.mockRestore();
    if(previous)Object.defineProperty(navigator,"storage",previous);
    else Reflect.deleteProperty(navigator,"storage");
  }
});
