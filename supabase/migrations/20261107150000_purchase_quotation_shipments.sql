-- ============================================================================
-- Migration: 20261107150000_purchase_quotation_shipments.sql
-- Description: تتبع شحنات عروض الشراء عبر مكاتب شركات الشحن (خط صنعاء - المهرة)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.purchase_quotation_shipments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
    
    -- بيانات مكتب / شركة الشحن
    shipping_company_name TEXT NOT NULL,
    shipping_office_phone TEXT,
    shipping_office_address TEXT,
    waybill_number TEXT NOT NULL, -- رقم البوليصة / سند الإرسالية

    -- المسار الجغرافي (صنعاء ➔ المهرة)
    origin_city TEXT NOT NULL DEFAULT 'صنعاء',
    origin_hub TEXT, -- مثل: فرع الحصبة / مذبح / شارع خولان
    destination_city TEXT NOT NULL DEFAULT 'المهرة (الغيضة)',
    destination_hub TEXT, -- مثل: فرع الغيضة (شارع المطار) / منفذ شحن
    destination_branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    destination_warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,

    -- بيانات الناقل والسائق
    driver_name TEXT,
    driver_phone TEXT,
    vehicle_plate_number TEXT,
    vehicle_type TEXT DEFAULT 'دينا', -- دينا، قاطرة، شاحنة متوسطة، ونيت

    -- تفاصيل الحمولة والطرود
    parcel_count INTEGER NOT NULL DEFAULT 1,
    weight_kg NUMERIC(10, 2) DEFAULT 0,
    cargo_description TEXT,

    -- التكاليف وأجور الشحن
    shipping_cost NUMERIC(15, 2) NOT NULL DEFAULT 0,
    shipping_currency TEXT NOT NULL DEFAULT 'YER', -- YER أو SAR
    payment_method TEXT NOT NULL DEFAULT 'collect_on_delivery', -- collect_on_delivery / prepaid_by_supplier / on_company_account

    -- التواريخ
    shipping_date DATE DEFAULT CURRENT_DATE,
    expected_arrival_date DATE,
    actual_arrival_date DATE,
    received_date DATE,
    received_by TEXT,

    -- الحالة ومسار التتبع
    tracking_status TEXT NOT NULL DEFAULT 'pending_dispatch',
    -- pending_dispatch / handed_to_office / in_transit / arrived_at_office / received_at_warehouse / cancelled
    timeline JSONB NOT NULL DEFAULT '[]'::jsonb,
    notes TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    CONSTRAINT uq_quotation_shipment UNIQUE (company_id, quotation_id)
);

-- الفهارس لتحسين سرعة الاستعلامات والبحث
CREATE INDEX IF NOT EXISTS idx_pqs_company_quotation ON public.purchase_quotation_shipments (company_id, quotation_id);
CREATE INDEX IF NOT EXISTS idx_pqs_waybill ON public.purchase_quotation_shipments (company_id, waybill_number);
CREATE INDEX IF NOT EXISTS idx_pqs_tracking_status ON public.purchase_quotation_shipments (company_id, tracking_status);
CREATE INDEX IF NOT EXISTS idx_pqs_shipping_date ON public.purchase_quotation_shipments (company_id, shipping_date DESC);

-- تفعيل أمان مستوى الصف (RLS)
ALTER TABLE public.purchase_quotation_shipments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own company shipments" ON public.purchase_quotation_shipments;
CREATE POLICY "Users can view own company shipments"
    ON public.purchase_quotation_shipments
    FOR SELECT
    TO authenticated
    USING (
        company_id IN (
            SELECT company_id FROM public.users WHERE id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can insert own company shipments" ON public.purchase_quotation_shipments;
CREATE POLICY "Users can insert own company shipments"
    ON public.purchase_quotation_shipments
    FOR INSERT
    TO authenticated
    WITH CHECK (
        company_id IN (
            SELECT company_id FROM public.users WHERE id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can update own company shipments" ON public.purchase_quotation_shipments;
CREATE POLICY "Users can update own company shipments"
    ON public.purchase_quotation_shipments
    FOR UPDATE
    TO authenticated
    USING (
        company_id IN (
            SELECT company_id FROM public.users WHERE id = auth.uid()
        )
    )
    WITH CHECK (
        company_id IN (
            SELECT company_id FROM public.users WHERE id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can delete own company shipments" ON public.purchase_quotation_shipments;
CREATE POLICY "Users can delete own company shipments"
    ON public.purchase_quotation_shipments
    FOR DELETE
    TO authenticated
    USING (
        company_id IN (
            SELECT company_id FROM public.users WHERE id = auth.uid()
        )
    );

COMMENT ON TABLE public.purchase_quotation_shipments IS 'تتبع شحنات عروض الشراء عبر مكاتب الشحن البري بين صنعاء والمهرة';

