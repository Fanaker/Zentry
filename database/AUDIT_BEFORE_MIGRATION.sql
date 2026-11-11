-- READ ONLY. Run on the current database, never change historical records automatically.
SELECT 'accounts' table_name,count(*) FROM public.accounts
UNION ALL SELECT 'transactions',count(*) FROM public.transactions
UNION ALL SELECT 'monthly_closings',count(*) FROM public.monthly_closings
UNION ALL SELECT 'budgets',count(*) FROM public.budgets;
SELECT id,tx_date,tx_type,amount_pen,amount_usd,currency FROM public.transactions
WHERE amount_pen<0 OR amount_usd<0 OR amount_pen+amount_usd<=0
OR (currency='PEN' AND amount_usd<>0) OR (currency='USD' AND amount_pen<>0);
SELECT t.id,t.tx_date,a.name origin,b.name destination,a.currency origin_currency,b.currency destination_currency
FROM public.transactions t JOIN public.accounts a ON a.id=t.origin_account_id JOIN public.accounts b ON b.id=t.destination_account_id
WHERE t.tx_type='transfer' AND a.currency<>b.currency;
SELECT t.id FROM public.transactions t JOIN public.accounts a ON a.id=t.payment_account_id WHERE t.owner_id<>a.owner_id;
