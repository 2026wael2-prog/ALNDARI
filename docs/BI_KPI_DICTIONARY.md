# قاموس مؤشرات الأداء الرسمي (Enterprise BI KPI Dictionary)

> **المعمارية المعتمدة:** جميع الحسابات والتجميعات والتحويلات تتم داخل دوال PostgreSQL RPC فقط (`supabase/migrations/`). الواجهة الأمامية طبقة عرض وتفاعل فقط.  
> **قاعدة المستندات المعتمدة:** لا يُحتسب أي مستند ما لم يكن `status = 'posted' AND deleted_at IS NULL`.  
> **سياسة العملات:** تُحوّل جميع المبالغ إلى العملة الأساسية للشركة باستخدام `public.fn_invoice_to_base_amount(currency_code, amount, exchange_rate)` للفواتير و `public.fn_to_base_amount(currency_code, amount, exchange_rate)` للمدفوعات.  
> **سياسة التحويلات:** تُستبعد التحويلات بين الفروع (`stock_transfers`) بالكامل من حسابات المبيعات والمشتريات، وتُعرض بشكل مستقل في مركز تحليلات المخزون.

---

## 1. مؤشرات لوحة القيادة التنفيذية والمبيعات (`get_executive_bi_summary`, `get_sales_bi_analytics`)

| الاسم العربي | الاسم التقني | المعادلة المعتمدة | الجداول والأعمدة المصدرية | معالجة المرتجعات والخصومات |
|---|---|---|---|---|
| **إجمالي المبيعات** | `total_sales` / `gross_sales` | $\sum \text{fn\_invoice\_to\_base\_amount}(total\_amount)$ حيث `type = 'sale'` | `invoices` (`total_amount`, `currency_code`, `exchange_rate`, `type`, `status`, `issue_date`) | لا يشمل المرتجعات |
| **مرتجعات المبيعات** | `total_returns` / `returns_amount` | $\sum \text{fn\_invoice\_to\_base\_amount}(total\_amount)$ حيث `type = 'sale_return'` | `invoices` | يُجمع بشكل مستقل |
| **صافي المبيعات** | `net_sales` | `total_sales - total_returns` | `invoices` | يُخصم المرتجع، والخصم مُنعكس مسبقاً في `total_amount` |
| **تكلفة البضاعة المباعة** | `cogs` | $\sum (\text{cost\_price} \times \text{quantity})$ للبيع ناقصاً المرتجع | `invoice_items` (`cost_price`, `quantity`) + `invoices` | تُطرح تكلفة المرتجعات |
| **مجمل الربح** | `gross_profit` | `net_sales - cogs` | مشتق من `invoices` و `invoice_items` | يعكس صافي المبيعات بعد المرتجع والتكلفة |
| **هامش الربح الإجمالي %** | `gross_margin_percent` | $(\text{gross\_profit} / \text{net\_sales}) \times 100$ | مشتق | يعيد `0` إذا كان `net_sales <= 0` |
| **نسبة النمو %** | `growth_pct` / `sales_growth_pct` | $((\text{current} - \text{previous}) / \text{previous}) \times 100$ | مقارنة الفترة الحالية بالفترة المماثلة السابقة | يعيد `100` إذا كانت السابقة `0` والحالية `> 0`، و`0` لخيار كل الفترات |
| **السيولة النقدية** | `cash_liquidity` | $\sum \text{account\_balances.balance}$ للصناديق النشطة | `cashboxes` (`account_id`, `is_active`) + `account_balances` (`balance`) | رصيد حي من القيود |
| **ذمم العملاء / الموردين** | `receivables` / `payables` | `balance > 0` للعملاء، `ABS(balance)` حيث `balance < 0` للموردين | `party_balances` (`party_id`, `company_id`, `balance`) | رصيد دفتري حي |

---

## 2. مؤشرات تحليلات وولاء العملاء (`get_customer_bi_analytics`)

| الاسم العربي | الاسم التقني | المعادلة / القاعدة المعتمدة | الجداول والأعمدة المصدرية |
|---|---|---|---|
| **صافي مشتريات العميل** | `total_revenue` | صافي فواتير البيع ناقص المرتجع للعميل خلال الفترة | `invoices` |
| **الربح المحقق من العميل** | `gross_profit` | `total_revenue - total_cost` | `invoices` + `invoice_items` |
| **متوسط قيمة الفاتورة** | `avg_invoice_value` | `total_revenue / invoices_count` | `invoices` |
| **الرصيد المتأخر الفعلي** | `overdue_balance` | مجموع `(total_amount - paid_amount)` للفواتير التي تجاوزت `due_date < CURRENT_DATE` | `invoices` (`due_date`, `total_amount`, `paid_amount`) |
| **نسبة التحصيل %** | `collection_rate` | $\min(100, (\text{period\_payments} / \text{net\_revenue}) \times 100)$ | `payments` (`type = 'receipt'`) + `invoices` |
| **تصنيف الولاء (RFM)** | `loyalty_segment` | - `churned`: لم يشترِ مطلقاً أو انقطع `> 120` يوماً<br>- `new`: أول فاتورة له ضمن الفترة المختارة<br>- `champions`: $\ge 4$ فواتير وآخر شراء $\le 30$ يوماً<br>- `loyal`: $\ge 2$ فاتورة وآخر شراء $\le 60$ يوماً<br>- `returning`: اشترى في الفترة بعد انقطاع تاريخي `> 90` يوماً<br>- `at_risk`: آخر شراء بين `60` و `120` يوماً | `invoices` (`issue_date`) |

---

## 3. مؤشرات تحليلات الموردين ومقارنة الأسعار (`get_supplier_bi_analytics`, `get_supplier_price_comparison`)

| الاسم العربي | الاسم التقني | المعادلة / القاعدة المعتمدة | الجداول والأعمدة المصدرية |
|---|---|---|---|
| **صافي المشتريات من المورد** | `total_purchases` | فواتير `purchase` ناقص `purchase_return` | `invoices` |
| **عدد الأصناف المتنوعة** | `distinct_products_count` | `COUNT(DISTINCT item.product_id)` | `invoice_items` + `invoices` |
| **نسبة السداد %** | `payment_ratio` | $\min(100, (\text{disbursements} / \text{net\_purchases}) \times 100)$ | `payments` (`type = 'disbursement'`) |
| **آخر / أقل / أعلى / متوسط سعر** | `last_purchase_price`, `min_price`, `max_price`, `avg_price` | سعر الوحدة المحول للعملة الأساسية: `item.total / item.quantity` | `invoice_items` + `invoices` |

---

## 4. مؤشرات حركة وربحية المنتجات والمخزون (`get_product_bi_analytics`, `get_inventory_bi_analytics`)

| الاسم العربي | الاسم التقني | المعادلة / القاعدة المعتمدة | الجداول والأعمدة المصدرية |
|---|---|---|---|
| **مرات البيع** | `times_sold` | `COUNT(DISTINCT inv.id)` لفواتير البيع التي تحتوي الصنف | `invoice_items` + `invoices` |
| **صافي الكمية المباعة** | `net_quantity_sold` | `quantity_sold - quantity_returned` | `invoice_items` |
| **معدل دوران المخزون** | `turnover_ratio` | `net_quantity_sold / current_stock` | `invoice_items` + `product_stock` |
| **أيام بقاء المخزون (DSI)** | `days_sales_inventory` | `current_stock / (net_quantity_sold / period_days)` | `product_stock` + `invoice_items` |
| **تصنيف الحركة** | `movement_classification` | - `dead`: مخزون `> 0` ولم يُبع منذ `180` يوماً<br>- `stockout_risk`: مخزون $\le$ الحد الأدنى مع وجود مبيعات<br>- `fast`: $\ge 10$ مرات بيع أو دوران $\ge 2.0$<br>- `slow`: أيام بقاء المخزون `> 90` يوماً<br>- `medium`: باقي الأصناف النشطة | `product_stock` + `products` + `invoice_items` |
| **نسبة المرتجعات %** | `return_rate_percent` | $(\text{qty\_returned} / (\text{qty\_sold} + \text{qty\_returned})) \times 100$ | `invoice_items` |
| **قيمة المخزون بالتكلفة** | `stock_valuation_cost` / `total_valuation` | `current_stock * COALESCE(cost_price, purchase_price, 0)` | `product_stock` + `products` |
| **فروقات الجرد** | `audit_variance_qty`, `audit_variance_value` | $\sum (\text{counted\_quantity} - \text{expected\_quantity})$ وبتكلفة الصنف | `audit_sessions` + `audit_items` + `products` |
