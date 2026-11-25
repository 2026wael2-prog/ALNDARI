# Smart Hover Preview Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide instant, high-contrast floating preview cards (hover cards) when hovering over products, customers/suppliers, invoices, bonds, or accounts anywhere across the ERP, showing rich summary metrics without navigating away or clicking.

**Architecture:** A portal-rendered `EntityHoverCard` and enhanced `EntityInfoDot` component powered by `@tanstack/react-query` and `fetchInspectedEntity`. Uses `createPortal` to render directly to `document.body` with automated viewport collision detection (never gets clipped by table overflows), a 300ms hover debounce timer, and cached data access.

**Tech Stack:** React 19, TypeScript, TanStack Query, Framer Motion / CSS Transitions, Tailwind CSS, Lucide Icons, Vitest, Testing Library.

**Spec:** User request: "عندما يمر الماوس فوق اي منتج او عميل او فاتوره او سند او اي شي يعطئ بيانات عنه"

## Global Constraints

- Never cause unwanted layout shifts or table re-renders on hover.
- Keep hover delay at 300ms to prevent accidental popups during regular mouse movement.
- Portal to `document.body` to prevent clipping by parent `overflow-hidden` or `overflow-x-auto` containers.
- Render high-contrast cards consistent with the active ERP theme (pure readable text, clean borders, zero eye fatigue).
- All new tests must pass (`npm test`), with zero TypeScript errors (`tsc --noEmit`) and no encoding mojibake.

## Review Focus

1. Viewport boundary collision: When hovering near the bottom or right edge of the screen, the card must automatically flip upward or reposition so it stays 100% visible inside the window.
2. Fast mouse movement: Moving the cursor rapidly across multiple rows in a table must not spam queries or cause visual flashing (clear timeout on `mouseLeave`).
3. Interactive card: If the user moves the mouse into the preview card itself (e.g. to copy a phone number or click "استعلام شامل"), the card must stay open until the mouse leaves the card.
4. Table overflow isolation: In wide scrollable tables (`overflow-x: auto`), the card must float above the table without altering column widths or scroll position.
5. Error or missing entity ID: If an ID is undefined, null, or empty, the hover listener must safely do nothing.

---

### Task 1: Create `EntityHoverCard` Component with Viewport Positioning and Query Integration

**Files:**
- Create: `src/features/entity-inspector/components/EntityHoverCard.tsx`
- Create: `src/features/entity-inspector/components/EntityHoverCard.test.tsx`
- Test: `src/features/entity-inspector/components/EntityHoverCard.test.tsx`

- [ ] **Step 1.1**: Write unit tests in `EntityHoverCard.test.tsx` testing hover delay, rendering card on hover, viewport positioning, query loading state, and clicking "استعلام شامل".
- [ ] **Step 1.2**: Implement `EntityHoverCard.tsx` with:
  - Portal mounting to `document.body`.
  - Coordinates calculation from `triggerRef.getBoundingClientRect()`.
  - Smart collision detection (detects right/left and bottom window boundaries).
  - 300ms hover delay on mouse enter, 150ms leave delay.
  - Integration with `fetchInspectedEntity` via TanStack Query (`staleTime: 60_000`).
  - Rich rendering for:
    - **Product**: Name, Part #, Manufacturer, Available Stock badge, Selling Price, Cost Price (if authorized).
    - **Party**: Name, Phone, Balances by Currency (SAR/YER), Status badge.
    - **Invoice**: Number, Date, Customer, Total, Paid, Balance, Status badge.
    - **Bond**: Voucher Number, Type, Date, Amount, Currency, Party, Cashbox.
  - Quick action: "فتح الاستعلام الشامل (i)" which calls `useEntityInspectorStore.getState().open(...)`.
- [ ] **Step 1.3**: Run `npm test -- src/features/entity-inspector/components/EntityHoverCard.test.tsx` to verify all tests pass.

---

### Task 2: Enhance `EntityInfoDot` with Built-in Hover Preview

**Files:**
- Modify: `src/features/entity-inspector/components/EntityInfoDot.tsx`
- Modify: `src/features/entity-inspector/index.ts`
- Test: `src/features/entity-inspector/components/EntityInfoDot.test.tsx`

- [ ] **Step 2.1**: Update `EntityInfoDot.tsx` to wrap the info dot button with `EntityHoverCard` by default (with an optional `disableHover` prop).
- [ ] **Step 2.2**: Export `EntityHoverCard` from `src/features/entity-inspector/index.ts`.
- [ ] **Step 2.3**: Write and run tests in `EntityInfoDot.test.tsx` verifying that hovering over the dot triggers the hover card while clicking opens the modal.

---

### Task 3: Enable Hover Cards Across Key System Views (Invoices, Products, Statements, Bonds)

**Files:**
- Modify: `src/features/sales/components/create/InvoiceRow.tsx` (product & row hover)
- Modify: `src/features/sales/components/list/useInvoiceListColumns.tsx` (invoice & customer hover)
- Modify: `src/features/inventory/components/products/ProductTableColumns.tsx` (product name hover)
- Modify: `src/features/bonds/components/list/BondsTableView.tsx` (bond & party hover)
- Modify: `src/features/parties/components/statement/StatementMovementRow.tsx` (reference invoice/bond hover)

- [ ] **Step 3.1**: In `InvoiceRow.tsx`, wrap the product name or cell with `EntityHoverCard` so hovering over the item name or its info dot previews full stock & price.
- [ ] **Step 3.2**: In `useInvoiceListColumns.tsx`, wrap the customer name with `type="party"` hover and invoice number with `type="invoice"` hover.
- [ ] **Step 3.3**: In `ProductTableColumns.tsx`, wrap the product name cell with `type="product"` hover.
- [ ] **Step 3.4**: In `BondsTableView.tsx`, wrap the voucher number and party name with hover preview.
- [ ] **Step 3.5**: In `StatementMovementRow.tsx`, enable hover card for referenced invoices and vouchers.

---

### Task 4: Comprehensive Verification & Build

**Files:**
- Check: All modified and created files
- Command: `npm run check:encoding`
- Command: `npm run type-check`
- Command: `npm test`
- Command: `npm run build`

- [ ] **Step 4.1**: Run `npm run check:encoding` to ensure no character encoding issues.
- [ ] **Step 4.2**: Run `npm run type-check` to verify TypeScript compile health.
- [ ] **Step 4.3**: Run `npm test` to verify all project test suites pass.
- [ ] **Step 4.4**: Run `npm run build` to confirm production bundle builds cleanly.
- [ ] **Step 4.5**: Commit and push changes to GitHub.
