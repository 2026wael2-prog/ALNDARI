-- Migration: enable_realtime_cross_branch_notifications
-- Purpose: Add essential cross-branch transaction tables to supabase_realtime publication
-- to power live notifications and sound alerts across branches for:
-- 1. Inter-branch transfers (stock_transfers, stock_transfer_requests)
-- 2. Inter-branch chat messages (chat_messages)
-- 3. Sales & Purchases (invoices)
-- 4. Financial Bonds (payments)
-- 5. Quotations (quotations)
-- 6. Demanded Products / Requisitions (prc_purchase_requests)
-- 7. Cross-branch notifications (branch_notifications)

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE 
        public.invoices,
        public.payments,
        public.quotations,
        public.stock_transfers,
        public.stock_transfer_requests,
        public.prc_purchase_requests,
        public.chat_messages,
        public.branch_notifications;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END $$;

