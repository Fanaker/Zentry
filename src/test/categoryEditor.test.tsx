import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {MemoryRouter} from "react-router-dom";
import {afterEach,expect,it,vi} from "vitest";
import Configuracion from "@/pages/Configuracion";

const backend = vi.hoisted(()=>({
  usage:vi.fn(async()=>({data:[{id:"movement"}],error:null})),
  update:vi.fn(),
}));

vi.mock("@/hooks/useAuth",()=>({useAuth:()=>({isAdmin:true,user:{id:"owner"}})}));
vi.mock("@/components/SecurityTools",()=>({default:()=>null}));
vi.mock("@/components/DeviceLockControl",()=>({default:()=>null}));
vi.mock("@/hooks/useFinanceData",()=>({
  useAccounts:()=>({data:[]}),
  useCategories:()=>({data:[
    {id:"others",name:"Otros",tx_type:"expense",is_active:true},
    {id:"archived",name:"Antigua",tx_type:"expense",is_active:false},
    {id:"mobility",name:"Movilidád",tx_type:"expense",is_active:true},
    {id:"income",name:"Otros ingresos",tx_type:"income",is_active:true},
  ]}),
}));
vi.mock("@/integrations/supabase/client",()=>({
  supabase:{from:(table:string)=>{
    if(table==="transactions")return {select:()=>({eq:()=>({limit:backend.usage})})};
    const chain={eq:()=>chain,select:()=>chain,maybeSingle:async()=>({data:{id:"others"},error:null})};
    return {update:(changes:unknown)=>{backend.update(changes);return chain;}};
  }},
}));

afterEach(()=>{cleanup();vi.clearAllMocks();});

function openCategories(){
  render(<QueryClientProvider client={new QueryClient()}>
    <MemoryRouter><Configuracion /></MemoryRouter>
  </QueryClientProvider>);
  fireEvent.mouseDown(screen.getByRole("tab",{name:"Categorías"}),{button:0});
}

it("sorts active categories, groups inactive categories and searches without accents",()=>{
  openCategories();
  expect(screen.getByRole("button",{name:"Editar Movilidád"}).compareDocumentPosition(screen.getByRole("button",{name:"Editar Otros"})) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByText("Inactivas (1)").closest("details")?.hasAttribute("open")).toBe(false);
  fireEvent.change(screen.getByRole("textbox",{name:"Buscar categoría"}),{target:{value:"movilidad"}});
  expect(screen.getByRole("button",{name:"Editar Movilidád"})).toBeTruthy();
  expect(screen.queryByRole("button",{name:"Editar Otros"})).toBeNull();
});

it("locks the type of a used category and saves the name alone",async()=>{
  openCategories();
  fireEvent.click(screen.getByRole("button",{name:"Editar Otros"}));
  await screen.findByText("Esta categoría tiene movimientos. Puedes cambiar el nombre.");
  expect(screen.getByRole("combobox",{name:"Tipo de categoría"}).hasAttribute("disabled")).toBe(true);
  fireEvent.change(screen.getByRole("textbox",{name:"Nombre"}),{target:{value:"Otros gastos"}});
  fireEvent.click(screen.getByRole("button",{name:"Guardar"}));
  await waitFor(()=>expect(backend.update).toHaveBeenCalledWith({name:"Otros gastos"}));
});
