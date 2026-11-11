import {ReactNode} from 'react';
import {useAccounts,useCategories,usePeople,useTransactions,useBudgets,useMonthlyClosings} from '@/hooks/useFinanceData';
import {Button} from '@/components/ui/button';
export default function FinanceBoundary({children}:{children:ReactNode}){
 const results=[useAccounts(),useCategories(),usePeople(),useTransactions(),useBudgets(),useMonthlyClosings()];
 if(results.some(q=>q.isError)) return <div role="alert" className="p-6 space-y-4"><h1 className="text-xl font-semibold">No se pudo verificar el historial completo</h1><p>Los saldos y acciones están pausados para evitar trabajar con datos incompletos. Revisa la conexión y la instalación de la base.</p><Button onClick={()=>results.forEach(q=>q.refetch())}>Volver a cargar</Button></div>;
 if(results.some(q=>q.isPending)) return <p className="p-6" role="status">Cargando y verificando tus datos…</p>;
 return children;
}
