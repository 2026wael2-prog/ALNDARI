-- Migration: Wave 25 — Archive old random categories & professionally classify all auto spare parts
-- Date: 2026-11-23

CREATE OR REPLACE FUNCTION public.fn_extract_spare_part_category(p_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_clean text;
  v_words text[];
  v_ar_words text[] := '{}';
  v_tok text;
  v_w1 text;
  v_w2 text;
BEGIN
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RETURN 'غير مصنف';
  END IF;

  IF btrim(p_name) ~ '^(1[2-9]|2[0-2])\s*[/\\*]\s*[0-9]+' THEN
    RETURN 'كفرات وإطارات';
  END IF;

  IF p_name !~ '[ء-ي]' THEN
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
