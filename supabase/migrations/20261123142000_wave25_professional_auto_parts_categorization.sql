-- Migration: Wave 25 — Archive old random categories & professionally classify all auto spare parts across all branches
-- Date: 2026-11-23

CREATE OR REPLACE FUNCTION public.fn_extract_spare_part_category(p_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_clean text;
  v_code text;
  v_words text[];
  v_ar_words text[] := '{}';
  v_tok text;
  v_w1 text;
  v_w2 text;
BEGIN
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RETURN 'غير مصنف';
  END IF;

  v_code := UPPER(btrim(p_name));

  -- Tire sizes e.g. 15/70/255 or 16/750/8
  IF v_code ~ '^(1[2-9]|2[0-2])\s*[/\\*]\s*[0-9]+' THEN
    RETURN 'كفرات وإطارات';
  END IF;

  -- Belt codes e.g. 4PK920, 6PK1915, 7PK2120
  IF v_code ~ '\b[3-9]PK\s*[0-9]{3,4}\b' THEN
    RETURN 'سير مروحة';
  END IF;

  -- If no Arabic letters at all, classify by Automotive OEM Part Number Prefix Rules
  IF p_name !~ '[ء-ي]' THEN
    IF v_code ~ '^(04465|D1060|D106M|58101|AN-|DB[0-9]|GDB)' THEN RETURN 'كنويس امامي'; END IF;
    IF v_code ~ '^(04466|04495|58302|58305|FN-)' THEN RETURN 'كنويس خلفي'; END IF;
    IF v_code ~ '^(90311|90310|BH-|AH[0-9]|MUS|POS|21443|43119)' THEN RETURN 'لمدة كرين'; END IF;
    IF v_code ~ '^(45046|45047|56820|SE-|CE-|TE-|ES[0-9])' THEN RETURN 'راس ذراع'; END IF;
    IF v_code ~ '^(45503|57724|SR-|CR-)' THEN RETURN 'ركبة ذراع'; END IF;
    IF v_code ~ '^(43330|43340|43310|43350|43360|54530|51220|SB-|CB-|JB-)' THEN RETURN 'جوزة مقص'; END IF;
    IF v_code ~ '^(48810|48820|48830|48819|54830|55530|SL-|CL-)' THEN RETURN 'مسمار توازن'; END IF;
    IF v_code ~ '^(48654|48655|48725|54551|54584|55118)' THEN RETURN 'بوش مقص'; END IF;
    IF v_code ~ '^(48815|54813|55513)' THEN RETURN 'بوش عمود'; END IF;
    IF v_code ~ '^(48066|48067|48068|48069|48610|48630|54500|54501)' THEN RETURN 'مقص'; END IF;
    IF v_code ~ '^(48510|48511|48520|54650|54660|333[0-9]{3}|334[0-9]{3}|339[0-9]{3}|341[0-9]{3})' THEN RETURN 'لعابة امامي'; END IF;
    IF v_code ~ '^(48530|48531|55300|55310|343[0-9]{3}|344[0-9]{3}|349[0-9]{3}|443[0-9]{3}|444[0-9]{3})' THEN RETURN 'لعابة خلفي'; END IF;
    IF v_code ~ '^(11115|11116|22311|11044)' THEN RETURN 'باكن راس'; END IF;
    IF v_code ~ '^(04111|20910|A1010|FS-)' THEN RETURN 'طقم باكنات'; END IF;
    IF v_code ~ '^(11213|11214|22441|13270)' THEN RETURN 'باكن غطاء'; END IF;
    IF v_code ~ '^(12361|12305|12371|12372|21810|21830|21910|21930|11210|11220)' THEN RETURN 'كرسي مكينة'; END IF;
    IF v_code ~ '^(16100|25100|21010|GWT-|GWM-|GWN-|GWH-|GWS-|GWIS|WPT-)' THEN RETURN 'بمب ماء'; END IF;
    IF v_code ~ '^(23220|23221|GIP-|EP-|FPD-|FPB-|31111|17040)' THEN RETURN 'بمب بترول'; END IF;
    IF v_code ~ '^(90919-01|18814|18817|22401|BKR|K20|K16|SC20)' THEN RETURN 'بلاكات'; END IF;
    IF v_code ~ '^(90919-02|27301|22448)' THEN RETURN 'كويل'; END IF;
    IF v_code ~ '^(90919-22|27501)' THEN RETURN 'اسلاك بلاكات'; END IF;
    IF v_code ~ '^(31210|41300|TYC-|MTC-|NSC-|SZC-|HDC-|DHC-)' THEN RETURN 'موسم كليش'; END IF;
    IF v_code ~ '^(31250|41100|TYD-|MBD-|NSD-|SZD-|HDD-|DHD-|ISD-|D-[0-9])' THEN RETURN 'صحن كليش'; END IF;
    IF v_code ~ '^(31230|41421|RCT|RCTS|TK[0-9])' THEN RETURN 'فحمة كليش'; END IF;
    IF v_code ~ '^(31410|31420|31470|41600|41700|30610|30620)' THEN RETURN 'علبة كليش'; END IF;
    IF v_code ~ '^(04311|04313|SK-)' THEN RETURN 'اصلاح كليش'; END IF;
    IF v_code ~ '^(47201|58510|46010)' THEN RETURN 'علبة بريك'; END IF;
    IF v_code ~ '^(04493|04479|WK-)' THEN RETURN 'اصلاح بريك'; END IF;
    IF v_code ~ '^(43512|51712|40206)' THEN RETURN 'هوب امامي'; END IF;
    IF v_code ~ '^(90363|90369|43550|43560|42410|42450|51720|DAC[0-9]|DU[0-9]|620[0-9]|630[0-9]|622[0-9]|302[0-9]{2}|320[0-9]{2}|322[0-9]{2})' THEN RETURN 'بيرنج هبس'; END IF;
    IF v_code ~ '^(17801|28113|16546)' THEN RETURN 'فلتر هواء'; END IF;
    IF v_code ~ '^(90915|15601|26300|15208|C-[0-9]{3,4})' THEN RETURN 'فلتر زيت'; END IF;
    IF v_code ~ '^(23300|23390|31911|16400|FC-[0-9]{3,4})' THEN RETURN 'فلتر بترول'; END IF;
    IF v_code ~ '^(04438|04427|04428|FB-[0-9]{4})' THEN RETURN 'ربلة عكس'; END IF;
    IF v_code ~ '^(13011|23040|358[0-9]{2}|359[0-9]{2}|SWT|SDM|SWN|SWM|TP-|NPR-)' THEN RETURN 'رنجات مكينة'; END IF;
    IF v_code ~ '^(11701|11704|21020|M[0-9]{3,4}[A-Z])' THEN RETURN 'براصات ثابت'; END IF;
    IF v_code ~ '^(13041|13204|23060|R[0-9]{3,4}[A-Z])' THEN RETURN 'براصات متحرك'; END IF;
    IF v_code ~ '^(H1|H3|H4|H7|H11|9005|9006)\b' THEN RETURN 'لمبة كشافة'; END IF;
    RETURN 'أرقام قطع (بدون مسمى)';
  END IF;

  v_clean := regexp_replace(btrim(p_name), '[-_/\\()+*.,=:"]+', ' ', 'g');
  v_clean := regexp_replace(v_clean, '\s+', ' ', 'g');
  v_words := regexp_split_to_array(btrim(v_clean), ' ');

  FOREACH v_tok IN ARRAY v_words LOOP
    IF v_tok ~ '^[ء-ي]+$' AND length(v_tok) >= 2 THEN
      v_ar_words := array_append(v_ar_words, v_tok);
      IF array_length(v_ar_words, 1) >= 3 THEN
        EXIT;
      END IF;
    ELSIF array_length(v_ar_words, 1) >= 1 THEN
      EXIT;
    END IF;
  END LOOP;

  IF array_length(v_ar_words, 1) IS NULL OR array_length(v_ar_words, 1) = 0 THEN
    RETURN 'غير مصنف';
  END IF;

  v_w1 := v_ar_words[1];
  v_w2 := CASE WHEN array_length(v_ar_words, 1) >= 2 THEN v_ar_words[2] ELSE NULL END;

  -- Normalize w1
  v_w1 := CASE v_w1
    WHEN 'لعابه' THEN 'لعابة'
    WHEN 'جوزه' THEN 'جوزة'
    WHEN 'علبه' THEN 'علبة'
    WHEN 'فحمه' THEN 'فحمة'
    WHEN 'ركبه' THEN 'ركبة'
    WHEN 'كشافه' THEN 'كشافة'
    WHEN 'كشافات' THEN 'كشافة'
    WHEN 'ربله' THEN 'ربلة'
    WHEN 'ربلات' THEN 'ربلة'
    WHEN 'مكره' THEN 'مكرة'
    WHEN 'قفشه' THEN 'قفشة'
    WHEN 'مسطره' THEN 'مسطرة'
    WHEN 'قاعده' THEN 'قاعدة'
    WHEN 'طرمبه' THEN 'طرمبة'
    WHEN 'لمد' THEN 'لمدة'
    WHEN 'لمده' THEN 'لمدة'
    WHEN 'رووس' THEN 'راس'
    WHEN 'رؤوس' THEN 'راس'
    WHEN 'روؤس' THEN 'راس'
    WHEN 'رأس' THEN 'راس'
    WHEN 'بوشات' THEN 'بوش'
    WHEN 'بطاريه' THEN 'بطارية'
    WHEN 'مرايه' THEN 'مرايا'
    WHEN 'مراية' THEN 'مرايا'
    WHEN 'دبه' THEN 'دبة'
    WHEN 'شبكه' THEN 'شبكة'
    WHEN 'ساعه' THEN 'ساعة'
    WHEN 'ماطور' THEN 'ماتور'
    WHEN 'كويلات' THEN 'كويل'
    WHEN 'بلكات' THEN 'بلاكات'
    WHEN 'شمعه' THEN 'شمعة'
    WHEN 'شمعات' THEN 'شمعة'
    WHEN 'لمبه' THEN 'لمبة'
    WHEN 'لمبات' THEN 'لمبة'
    WHEN 'صاجه' THEN 'صاجة'
    ELSE v_w1
  END;

  IF v_w2 IS NOT NULL THEN
    v_w2 := CASE v_w2
      WHEN 'مكينه' THEN 'مكينة'
      WHEN 'امامى' THEN 'امامي'
      WHEN 'أمامي' THEN 'امامي'
      WHEN 'اماميه' THEN 'امامي'
      WHEN 'امامية' THEN 'امامي'
      WHEN 'خلفى' THEN 'خلفي'
      WHEN 'خلفيه' THEN 'خلفي'
      WHEN 'خلفية' THEN 'خلفي'
      WHEN 'هبس' THEN 'هبس'
      WHEN 'هب' THEN 'هبس'
      WHEN 'دركسون' THEN 'سكان'
      WHEN 'كلتش' THEN 'كليش'
      WHEN 'فرامل' THEN 'بريك'
      WHEN 'بنزين' THEN 'بترول'
      WHEN 'ماي' THEN 'ماء'
      WHEN 'داخلية' THEN 'داخلي'
      WHEN 'داخليه' THEN 'داخلي'
      WHEN 'خارجية' THEN 'خارجي'
      WHEN 'خارجيه' THEN 'خارجي'
      WHEN 'علويه' THEN 'فوق'
      WHEN 'علوي' THEN 'فوق'
      WHEN 'سفليه' THEN 'تحت'
      WHEN 'سفلي' THEN 'تحت'
      ELSE v_w2
    END;
  END IF;

  IF v_w1 IN ('بلاكات', 'كويل', 'سلف', 'دينمو', 'رديتر', 'كمبروسر', 'بطارية', 'كفر', 'بلف', 'ثرموستات') THEN
    RETURN v_w1;
  END IF;

  IF v_w2 IS NULL 
     OR v_w2 IN (
       'كرولا', 'كورولا', 'هيلكس', 'هايلكس', 'تويوتا', 'تيوتا', 'تيوتاء', 'نيسان', 'كامري', 'صالون', 'شاص', 'برادو', 'يارس', 
       'باص', 'دباب', 'النترا', 'سوناتا', 'اكسنت', 'توسان', 'سنتافي', 'باجيرو', 'كنتر', 'فيتارا', 'فيتاراء', 'ليانا', 
       'راف', 'فوكس', 'نوها', 'نها', 'زيزو', 'دينة', 'حوض', 'غمارة', 'غمارتين', 'سفاري', 'باترول', 'بترول', 'لكزس', 'لكزز',
       'مازدا', 'مازداء', 'هوندا', 'هونداي', 'هيونداي', 'كيا', 'ميتسوبيشي', 'ميستوبيشي', 'سوزوكي', 'ايسوزو', 'دايهاتسو', 'فورد',
       'عام', 'اصلي', 'ممتاز', 'وكالة', 'وكاله', 'ياباني', 'كوري', 'صيني', 'تايواني', 'تايلندي', 'هندي', 'ماليزي', 'امريكي', 'الماني',
       'موكل', 'مقبلي', 'تاهو', 'تايهو', 'ديبو', 'اوسكا', 'يمين', 'يسار', 'شمال', 'طقم', 'كامل', 'صغير', 'كبير', 'وسط'
     ) THEN
    IF v_w2 = 'بترول' AND v_w1 IN ('بمب', 'فلتر', 'صفاية', 'صفايه', 'لي', 'هوز', 'تانكي', 'ساعة', 'عوامة', 'عوامه', 'غطاس', 'طرمبة', 'غطاء') THEN
      RETURN v_w1 || ' بترول';
    END IF;
    RETURN CASE v_w1
      WHEN 'رنجات' THEN 'رنجات مكينة'
      WHEN 'عكس' THEN 'عكس كامل'
      ELSE v_w1
    END;
  END IF;

  RETURN v_w1 || ' ' || v_w2;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_trg_auto_categorize_product()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_cat_name text;
  v_cat_id uuid;
BEGIN
  IF NEW.category_id IS NOT NULL OR NEW.company_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_cat_name := public.fn_extract_spare_part_category(NEW.name_ar);
  IF v_cat_name IS NULL OR btrim(v_cat_name) = '' THEN
    v_cat_name := 'قطع غيار متنوعة';
  END IF;

  SELECT id INTO v_cat_id
  FROM public.product_categories
  WHERE company_id = NEW.company_id
    AND name = v_cat_name
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_cat_id IS NULL THEN
    INSERT INTO public.product_categories (company_id, name, description, created_at, updated_at)
    VALUES (NEW.company_id, v_cat_name, 'تصنيف آلي احترافي لقطع الغيار', now(), now())
    ON CONFLICT (company_id, name) DO UPDATE
    SET deleted_at = NULL, updated_at = now()
    RETURNING id INTO v_cat_id;
  END IF;

  NEW.category_id := v_cat_id;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'trg_auto_categorize_product'
      AND tgrelid = 'public.products'::regclass
  ) THEN
    CREATE TRIGGER trg_auto_categorize_product
      BEFORE INSERT OR UPDATE OF name_ar, category_id
      ON public.products
      FOR EACH ROW
      WHEN (NEW.category_id IS NULL)
      EXECUTE FUNCTION public.fn_trg_auto_categorize_product();
  END IF;
END $$;
