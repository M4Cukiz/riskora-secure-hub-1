ALTER TABLE public.suppliers
ADD COLUMN supplier_type TEXT NOT NULL DEFAULT 'IT'
CHECK (supplier_type IN ('IT', 'Non-IT'));
