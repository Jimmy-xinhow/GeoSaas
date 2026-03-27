#!/bin/bash
BASE="http://localhost:4000/api"
PASS=0; FAIL=0; WARN=0

green() { echo -e "\033[32m[PASS]\033[0m $1"; PASS=$((PASS+1)); }
red() { echo -e "\033[31m[FAIL]\033[0m $1 — $2"; FAIL=$((FAIL+1)); }
yellow() { echo -e "\033[33m[WARN]\033[0m $1 — $2"; WARN=$((WARN+1)); }

echo "=========================================="
echo "  GEO-SaaS Full API Test"
echo "=========================================="

# ── 1. Auth ──
echo ""
echo "── 1. Auth Module ──"
RES=$(curl -s -w "\n%{http_code}" -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"tttmtst@gmail.com","password":"12345678"}')
CODE=$(echo "$RES" | tail -1)
BODY=$(echo "$RES" | sed '$d')
TOKEN=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('token','') or d.get('token',''))" 2>/dev/null)
if [ -z "$TOKEN" ]; then
  TOKEN=$(echo "$BODY" | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)
fi

if [ -n "$TOKEN" ] && [ "$TOKEN" != "" ]; then
  green "Login OK"
else
  red "Login failed ($CODE)" "$(echo $BODY | head -c 200)"
  exit 1
fi
AUTH="Authorization: Bearer $TOKEN"

# Me
RES=$(curl -s -w "\n%{http_code}" -H "$AUTH" "$BASE/auth/me")
CODE=$(echo "$RES" | tail -1)
BODY=$(echo "$RES" | sed '$d')
if [ "$CODE" = "200" ]; then
  NAME=$(echo "$BODY" | grep -o '"name":"[^"]*"' | head -1 | cut -d'"' -f4)
  green "GET /auth/me → $NAME"
else red "GET /auth/me ($CODE)" ""; fi

# ── 2. Sites ──
echo ""
echo "── 2. Sites Module ──"
RES=$(curl -s -H "$AUTH" "$BASE/sites")
SITE_ID=$(echo "$RES" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
SITE_COUNT=$(echo "$RES" | grep -o '"id"' | wc -l)
if [ -n "$SITE_ID" ]; then
  green "GET /sites → $SITE_COUNT site(s), using: $SITE_ID"
else
  red "GET /sites" "No sites found";
fi

if [ -n "$SITE_ID" ]; then
  RES=$(curl -s -w "\n%{http_code}" -H "$AUTH" "$BASE/sites/$SITE_ID")
  CODE=$(echo "$RES" | tail -1)
  BODY=$(echo "$RES" | sed '$d')
  SITE_NAME=$(echo "$BODY" | grep -o '"name":"[^"]*"' | head -1 | cut -d'"' -f4)
  SITE_URL=$(echo "$BODY" | grep -o '"url":"[^"]*"' | head -1 | cut -d'"' -f4)
  if [ "$CODE" = "200" ]; then
    green "GET /sites/:id → $SITE_NAME ($SITE_URL)"
  else red "GET /sites/:id ($CODE)" ""; fi
fi

# ── 3. Scans ──
echo ""
echo "── 3. Scan Module ──"
if [ -n "$SITE_ID" ]; then
  RES=$(curl -s -H "$AUTH" "$BASE/sites/$SITE_ID/scans")
  SCAN_COUNT=$(echo "$RES" | grep -o '"id"' | wc -l)
  SCAN_ID=$(echo "$RES" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

  if [ -n "$SCAN_ID" ]; then
    green "GET /sites/:id/scans → $SCAN_COUNT scan(s)"

    # Scan detail
    RES=$(curl -s -w "\n%{http_code}" -H "$AUTH" "$BASE/scans/$SCAN_ID")
    CODE=$(echo "$RES" | tail -1)
    BODY=$(echo "$RES" | sed '$d')
    SCAN_STATUS=$(echo "$BODY" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
    SCAN_SCORE=$(echo "$BODY" | grep -o '"overallScore":[0-9]*' | head -1 | cut -d: -f2)
    if [ "$CODE" = "200" ]; then
      green "GET /scans/:id → status=$SCAN_STATUS, score=$SCAN_SCORE"
    else red "GET /scans/:id ($CODE)" ""; fi

    # Scan results (8 indicators)
    RES=$(curl -s -w "\n%{http_code}" -H "$AUTH" "$BASE/scans/$SCAN_ID/results")
    CODE=$(echo "$RES" | tail -1)
    BODY=$(echo "$RES" | sed '$d')
    if [ "$CODE" = "200" ]; then
      INDICATORS=$(echo "$BODY" | grep -o '"indicator":"[^"]*"' | cut -d'"' -f4)
      IND_COUNT=$(echo "$INDICATORS" | wc -l)
      green "GET /scans/:id/results → $IND_COUNT indicators"
      echo "$INDICATORS" | while read ind; do
        SCORE=$(echo "$BODY" | grep -A2 "\"$ind\"" | grep -o '"score":[0-9]*' | head -1 | cut -d: -f2)
        PASS_VAL=$(echo "$BODY" | grep -A3 "\"$ind\"" | grep -o '"pass":[a-z]*' | head -1 | cut -d: -f2)
        printf "    %-25s score=%-3s pass=%s\n" "$ind" "$SCORE" "$PASS_VAL"
      done

      # Get a scan result ID for fix testing
      SR_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    else red "GET /scans/:id/results ($CODE)" ""; fi
  else
    yellow "No existing scans" "Triggering new scan..."
    RES=$(curl -s -w "\n%{http_code}" -X POST -H "$AUTH" "$BASE/sites/$SITE_ID/scans")
    CODE=$(echo "$RES" | tail -1)
    if [ "$CODE" = "201" ] || [ "$CODE" = "200" ]; then
      green "POST trigger scan OK (runs in background)"
    else red "POST trigger scan ($CODE)" "$(echo $RES | sed '$d' | head -c 150)"; fi
  fi
fi

# ── 4. Fix Module ──
echo ""
echo "── 4. Fix Module ──"

# 4a. JSON-LD generate
RES=$(curl -s -w "\n%{http_code}" -X POST -H "$AUTH" -H "Content-Type: application/json" \
  "$BASE/fix/json-ld/generate" \
  -d "{\"type\":\"Organization\",\"name\":\"$SITE_NAME\",\"url\":\"$SITE_URL\",\"description\":\"Test description\"}")
CODE=$(echo "$RES" | tail -1)
BODY=$(echo "$RES" | sed '$d')
if [ "$CODE" = "200" ] || [ "$CODE" = "201" ]; then
  green "POST /fix/json-ld/generate OK"
else red "POST /fix/json-ld/generate ($CODE)" "$(echo $BODY | head -c 150)"; fi

# 4b. llms.txt generate
RES=$(curl -s -w "\n%{http_code}" -X POST -H "$AUTH" -H "Content-Type: application/json" \
  "$BASE/fix/llms-txt/generate" \
  -d "{\"title\":\"$SITE_NAME\",\"description\":\"Test description\",\"url\":\"$SITE_URL\",\"links\":[]}")
CODE=$(echo "$RES" | tail -1)
BODY=$(echo "$RES" | sed '$d')
if [ "$CODE" = "200" ] || [ "$CODE" = "201" ]; then
  green "POST /fix/llms-txt/generate OK"
else red "POST /fix/llms-txt/generate ($CODE)" "$(echo $BODY | head -c 150)"; fi

# 4c. OG tags generate
RES=$(curl -s -w "\n%{http_code}" -X POST -H "$AUTH" -H "Content-Type: application/json" \
  "$BASE/fix/og-tags/generate" \
  -d "{\"title\":\"$SITE_NAME\",\"description\":\"Test description\",\"url\":\"$SITE_URL\",\"type\":\"website\"}")
CODE=$(echo "$RES" | tail -1)
BODY=$(echo "$RES" | sed '$d')
if [ "$CODE" = "200" ] || [ "$CODE" = "201" ]; then
  green "POST /fix/og-tags/generate OK"
else red "POST /fix/og-tags/generate ($CODE)" "$(echo $BODY | head -c 150)"; fi

# 4d. FAQ schema generate
RES=$(curl -s -w "\n%{http_code}" -X POST -H "$AUTH" -H "Content-Type: application/json" \
  "$BASE/fix/faq-schema/generate" \
  -d '{"faqs":[{"question":"What is this?","answer":"This is a test FAQ for schema generation."}]}')
CODE=$(echo "$RES" | tail -1)
BODY=$(echo "$RES" | sed '$d')
if [ "$CODE" = "200" ] || [ "$CODE" = "201" ]; then
  green "POST /fix/faq-schema/generate OK"
else red "POST /fix/faq-schema/generate ($CODE)" "$(echo $BODY | head -c 150)"; fi

# ── 5. Knowledge ──
echo ""
echo "── 5. Knowledge Module ──"
if [ -n "$SITE_ID" ]; then
  RES=$(curl -s -w "\n%{http_code}" -H "$AUTH" "$BASE/sites/$SITE_ID/knowledge")
  CODE=$(echo "$RES" | tail -1)
  BODY=$(echo "$RES" | sed '$d')
  if [ "$CODE" = "200" ]; then
    QA_COUNT=$(echo "$BODY" | grep -o '"id"' | wc -l)
    CAT_BRAND=$(echo "$BODY" | grep -o '"category":"brand"' | wc -l)
    CAT_INDUSTRY=$(echo "$BODY" | grep -o '"category":"industry"' | wc -l)
    CAT_PRODUCT=$(echo "$BODY" | grep -o '"category":"product"' | wc -l)
    CAT_CONSUMER=$(echo "$BODY" | grep -o '"category":"consumer"' | wc -l)
    CAT_EDUCATION=$(echo "$BODY" | grep -o '"category":"education"' | wc -l)
    green "GET /knowledge → $QA_COUNT items (brand=$CAT_BRAND, industry=$CAT_INDUSTRY, product=$CAT_PRODUCT, consumer=$CAT_CONSUMER, education=$CAT_EDUCATION)"
  else red "GET /knowledge ($CODE)" ""; fi

  # Test create
  RES=$(curl -s -w "\n%{http_code}" -X POST -H "$AUTH" -H "Content-Type: application/json" \
    "$BASE/sites/$SITE_ID/knowledge" \
    -d '{"question":"API test question","answer":"This is an automated API test answer to verify CRUD operations work correctly. It needs to be long enough to pass quality checks.","category":"brand"}')
  CODE=$(echo "$RES" | tail -1)
  BODY=$(echo "$RES" | sed '$d')
  if [ "$CODE" = "201" ] || [ "$CODE" = "200" ]; then
    NEW_QA_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    green "POST /knowledge create OK (id=$NEW_QA_ID)"

    # Test update
    RES=$(curl -s -w "\n%{http_code}" -X PUT -H "$AUTH" -H "Content-Type: application/json" \
      "$BASE/sites/$SITE_ID/knowledge/$NEW_QA_ID" \
      -d '{"question":"API test question (updated)"}')
    CODE=$(echo "$RES" | tail -1)
    if [ "$CODE" = "200" ]; then green "PUT /knowledge/:id update OK"; else red "PUT /knowledge/:id ($CODE)" ""; fi

    # Test delete
    RES=$(curl -s -w "\n%{http_code}" -X DELETE -H "$AUTH" "$BASE/sites/$SITE_ID/knowledge/$NEW_QA_ID")
    CODE=$(echo "$RES" | tail -1)
    if [ "$CODE" = "200" ]; then green "DELETE /knowledge/:id OK"; else red "DELETE /knowledge/:id ($CODE)" ""; fi
  else red "POST /knowledge ($CODE)" "$(echo $BODY | head -c 150)"; fi
fi

# ── 6. Content ──
echo ""
echo "── 6. Content Module ──"
RES=$(curl -s -w "\n%{http_code}" -H "$AUTH" "$BASE/contents")
CODE=$(echo "$RES" | tail -1)
BODY=$(echo "$RES" | sed '$d')
if [ "$CODE" = "200" ]; then
  CONTENT_COUNT=$(echo "$BODY" | grep -o '"id"' | wc -l)
  green "GET /contents → $CONTENT_COUNT items"
  CONTENT_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  if [ -n "$CONTENT_ID" ]; then
    RES2=$(curl -s -w "\n%{http_code}" -H "$AUTH" "$BASE/contents/$CONTENT_ID")
    CODE2=$(echo "$RES2" | tail -1)
    if [ "$CODE2" = "200" ]; then green "GET /contents/:id OK"; else red "GET /contents/:id ($CODE2)" ""; fi
  fi
else red "GET /contents ($CODE)" ""; fi

# ── 7. Monitor ──
echo ""
echo "── 7. Monitor Module ──"
RES=$(curl -s -w "\n%{http_code}" -H "$AUTH" "$BASE/monitors/dashboard")
CODE=$(echo "$RES" | tail -1)
BODY=$(echo "$RES" | sed '$d')
if [ "$CODE" = "200" ]; then
  Q_COUNT=$(echo "$BODY" | grep -o '"query"' | wc -l)
  green "GET /monitors/dashboard → $Q_COUNT queries"
  # Show platform rates
  for P in ChatGPT Claude Perplexity Gemini; do
    RATE=$(echo "$BODY" | grep -A5 "\"$P\"" | grep -o '"rate":[0-9]*' | head -1 | cut -d: -f2)
    TOTAL=$(echo "$BODY" | grep -A5 "\"$P\"" | grep -o '"total":[0-9]*' | head -1 | cut -d: -f2)
    MENTIONED=$(echo "$BODY" | grep -A5 "\"$P\"" | grep -o '"mentioned":[0-9]*' | head -1 | cut -d: -f2)
    printf "    %-12s rate=%s%% mentioned=%s/%s\n" "$P" "$RATE" "$MENTIONED" "$TOTAL"
  done
else red "GET /monitors/dashboard ($CODE)" ""; fi

# ── 8. Publish ──
echo ""
echo "── 8. Publish Module ──"
RES=$(curl -s -w "\n%{http_code}" -H "$AUTH" "$BASE/publications")
CODE=$(echo "$RES" | tail -1)
if [ "$CODE" = "200" ]; then
  PUB_COUNT=$(echo "$RES" | sed '$d' | grep -o '"id"' | wc -l)
  green "GET /publications → $PUB_COUNT records"
else red "GET /publications ($CODE)" ""; fi

# ── 9. Billing ──
echo ""
echo "── 9. Billing Module ──"
RES=$(curl -s -w "\n%{http_code}" -H "$AUTH" "$BASE/billing/subscription")
CODE=$(echo "$RES" | tail -1)
BODY=$(echo "$RES" | sed '$d')
if [ "$CODE" = "200" ]; then
  PLAN=$(echo "$BODY" | grep -o '"plan":"[^"]*"' | head -1 | cut -d'"' -f4)
  green "GET /billing/subscription → plan=$PLAN"
else red "GET /billing/subscription ($CODE)" "$(echo $BODY | head -c 100)"; fi

# ── 10. Auth profile update ──
echo ""
echo "── 10. Profile & Password ──"
RES=$(curl -s -w "\n%{http_code}" -X PATCH -H "$AUTH" -H "Content-Type: application/json" \
  "$BASE/auth/profile" -d '{"name":"Jimmy Yang"}')
CODE=$(echo "$RES" | tail -1)
if [ "$CODE" = "200" ]; then green "PATCH /auth/profile OK"; else red "PATCH /auth/profile ($CODE)" ""; fi

# Summary
echo ""
echo "=========================================="
echo "  Results: $PASS passed, $FAIL failed, $WARN warnings"
echo "=========================================="
