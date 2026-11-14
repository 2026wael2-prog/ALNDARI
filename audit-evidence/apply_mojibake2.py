import urllib.request
import json
import re
import os

ACCESS_TOKEN = os.environ.get("SUPABASE_ACCESS_TOKEN", "")
BASE_URL = "https://api.supabase.com/v1/projects/dagfjncoullstrhbjssr/database/query"

def run_sql(sql):
    sql = sql.lstrip('\ufeff').strip()
    payload = json.dumps({"query": sql}).encode("utf-8")
    req = urllib.request.Request(
        BASE_URL,
        data=payload,
        headers={"Authorization": f"Bearer {ACCESS_TOKEN}", "Content-Type": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return True, resp.read().decode("utf-8")[:100]
    except urllib.error.HTTPError as e:
        return False, e.read().decode("utf-8")[:300]

with open(r"c:\Users\seens\OneDrive\Desktop\2027وائل\ALNDARI\audit-evidence\mojibake_fix.sql", "r", encoding="utf-8-sig") as f:
    content = f.read()

# Split on CREATE OR REPLACE FUNCTION boundaries
functions = re.split(r'(?=CREATE OR REPLACE FUNCTION public\.)', content.strip())
functions = [f.strip() for f in functions if f.strip().startswith('CREATE')]

print(f"Found {len(functions)} functions")
for fn in functions:
    fname = re.search(r'CREATE OR REPLACE FUNCTION public\.(\w+)', fn)
    name = fname.group(1) if fname else "unknown"
    ok, msg = run_sql(fn)
    print(f"  {'OK' if ok else 'FAIL'}: {name} | {msg[:80]}")
