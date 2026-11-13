import urllib.request
import json
import sys

with open(r"c:\Users\seens\OneDrive\Desktop\2027وائل\ALNDARI\audit-evidence\mojibake_fix.sql", "r", encoding="utf-8") as f:
    sql = f.read()

payload = json.dumps({"query": sql}).encode("utf-8")
req = urllib.request.Request(
    "https://api.supabase.com/v1/projects/dagfjncoullstrhbjssr/database/query",
    data=payload,
    headers={
        "Authorization": "Bearer ",
        "Content-Type": "application/json"
    },
    method="POST"
)
try:
    with urllib.request.urlopen(req, timeout=60) as resp:
        body = resp.read().decode("utf-8")
        print("OK:", body[:200])
except urllib.error.HTTPError as e:
    print("ERROR", e.code, e.read().decode("utf-8")[:500])
