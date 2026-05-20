-- Table: stock_items
CREATE TABLE IF NOT EXISTS public.stock_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    name TEXT NOT NULL,
    quantity NUMERIC NOT NULL DEFAULT 0,
    unit TEXT NOT NULL DEFAULT 'unidades',
    description TEXT,
    min_quantity NUMERIC NOT NULL DEFAULT 0
);

-- Enable RLS on stock_items
ALTER TABLE public.stock_items ENABLE ROW LEVEL SECURITY;

-- Policies for stock_items
CREATE POLICY "Cualquier autenticado puede ver stock_items"
    ON public.stock_items FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Cualquier autenticado puede modificar stock_items"
    ON public.stock_items FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Table: stock_transactions
CREATE TABLE IF NOT EXISTS public.stock_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    item_id UUID NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- 'addition' (buying/adding) or 'usage' (using/consuming)
    quantity NUMERIC NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    user_name TEXT NOT NULL,
    note TEXT
);

-- Enable RLS on stock_transactions
ALTER TABLE public.stock_transactions ENABLE ROW LEVEL SECURITY;

-- Policies for stock_transactions
CREATE POLICY "Cualquier autenticado puede ver stock_transactions"
    ON public.stock_transactions FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Cualquier autenticado puede insertar stock_transactions"
    ON public.stock_transactions FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Create a database trigger to keep stock_items.quantity in sync automatically!
CREATE OR REPLACE FUNCTION public.update_stock_quantity()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        IF NEW.type = 'addition' THEN
            UPDATE public.stock_items
            SET quantity = quantity + NEW.quantity
            WHERE id = NEW.item_id;
        ELSIF NEW.type = 'usage' THEN
            UPDATE public.stock_items
            SET quantity = quantity - NEW.quantity
            WHERE id = NEW.item_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER trg_update_stock_quantity
AFTER INSERT ON public.stock_transactions
FOR EACH ROW
EXECUTE FUNCTION public.update_stock_quantity();
