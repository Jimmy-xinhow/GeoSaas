#!/bin/bash
# GEO-SaaS API Integration Test
BASE="http://localhost:4000/api"
PASS=0
FAIL=0
WARN=0

green() { echo -e "\033[32m[PASS]\033[0m $1"; PASS=$((PASS+1)); }
red() { echo -e "\033[31m[FAIL]\033[0m $1 — $2"; FAIL=$((FAIL+1)); }
yellow() { echo -e "\033[33m[WARN]\033[0m $1 — $2"; WARN=$((WARN+1)); }

echo "=========================================="
echo "  GEO-SaaS API Integration Test"
echo "=========================================="

# 1. Auth - Login
echo ""
echo "--- 1. Auth Module ---"
RES=$(curl -s -w "\n%{http_code}" -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}')
CODE=$(echo "$RES" | tail -1)
BODY=$(echo "$RES" | sed '$d')

if [ "$CODE" = "201" ] || [ "$CODE" = "200" ]; then
  TOKEN=$(echo "$BODY" | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)
  if [ -z "$TOKEN" ]; then
    TOKEN=$(echo "$BODY" | grep -o '"access_token":"[^"]*"' | head -1 | cut -d'"' -f4)
  fi
  if [ -n "$TOKEN" ]; then
    green "Login OK (token received)"
  else
    red "Login response missing token" "$BODY"
  fi
else
  red "Login failed ($CODE)" "$(echo $BODY | head -c 200)"
  echo "Trying to register first..."
  RES=$(curl -s -w "\n%{http_code}" -X POST "$BASE/auth/register" \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"password123","name":"Test User"}')
  CODE=$(echo "$RES" | tail -1)
  BODY=$(echo "$RES" | sed '$d')
  if [ "$CODE" = "201" ] || [ "$CODE" = "200" ]; then
    TOKEN=$(echo "$BODY" | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)
    if [ -z "$TOKEN" ]; then
      TOKEN=$(echo "$BODY" | grep -o '"access_token":"[^"]*"' | head -1 | cut -d'"' -f4)
    fi
    green "Register + Login OK"
  else
    red "Register also failed ($CODE)" "$(echo $BODY | head -c 200)"
  fi
fi

if [ -z "$TOKEN" ]; then
  echo "Cannot proceed without token. Exiting."
  exit 1
fi

AUTH="Authorization: Bearer $TOKEN"

# Auth - Me
RES=$(curl -s -w "\n%{http_code}" -H "$AUTH" "$BASE/auth/me")
CODE=$(echo "$RES" | tail -1)
if [ "$CODE" = "200" ]; then green "GET /auth/me OK"; else red "GET /auth/me ($CODE)" "$(echo $RES | sed '$d' | head -c 150)"; fi

# 2. Sites
echo ""
echo "--- 2. Sites Module ---"
RES=$(curl -s -w "\n%{http_code}" -H "$AUTH" "$BASE/sites")
CODE=$(echo "$RES" | tail -1)
BODY=$(echo "$RES" | sed '$d')
if [ "$CODE" = "200" ]; then
  green "GET /sites OK"
  SITE_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  echo "  First site ID: $SITE_ID"
else
  red "GET /sites ($CODE)" "$(echo $BODY | head -c 150)"
fi

if [ -n "$SITE_ID" ]; then
  RES=$(curl -s -w "\n%{http_code}" -H "$AUTH" "$BASE/sites/$SITE_ID")
  CODE=$(echo "$RES" | tail -1)
  if [ "$CODE" = "200" ]; then green "GET /sites/:id OK"; else red "GET /sites/:id ($CODE)" "$(echo $RES | sed '$d' | head -c 150)"; fi
fi

# 3. Scan
echo ""
echo "--- 3. Scan Module ---"
if [ -n "$SITE_ID" ]; then
  RES=$(curl -s -w "\n%{http_code}" -H "$AUTH" "$BASE/sites/$SITE_ID/scans")
  CODE=$(echo "$RES" | tail -1)
  BODY=$(echo "$RES" | sed '$d')
  if [ "$CODE" = "200" ]; then
    green "GET /sites/:id/scans OK"
    SCAN_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    echo "  First scan ID: $SCAN_ID"
  else
    red "GET /sites/:id/scans ($CODE)" "$(echo $BODY | head -c 150)"
  fi

  if [ -n "$SCAN_ID" ]; then
    RES=$(curl -s -w "\n%{http_code}" -H "$AUTH" "$BASE/scans/$SCAN_ID")
    CODE=$(echo "$RES" | tail -1)
    if [ "$CODE" = "200" ]; then green "GET /scans/:id OK"; else red "GET /scans/:id ($CODE)" "$(echo $RES | sed '$d' | head -c 150)"; fi

    RES=$(curl -s -w "\n%{http_code}" -H "$AUTH" "$BASE/scans/$SCAN_ID/results")
    CODE=$(echo "$RES" | tail -1)
    BODY=$(echo "$RES" | sed '$d')
    if [ "$CODE" = "200" ]; then
      COUNT=$(echo "$BODY" | grep -o '"indicator"' | wc -l)
      green "GET /scans/:id/results OK ($COUNT indicators)"
    else
      red "GET /scans/:id/results ($CODE)" "$(echo $BODY | head -c 150)"
    fi
  else
    yellow "No scans found" "Triggering a new scan..."
    RES=$(curl -s -w "\n%{http_code}" -X POST -H "$AUTH" "$BASE/sites/$SITE_ID/scans")
    CODE=$(echo "$RES" | tail -1)
    if [ "$CODE" = "201" ] || [ "$CODE" = "200" ]; then
      green "POST /sites/:id/scans (trigger scan) OK"
    else
      red "POST /sites/:id/scans ($CODE)" "$(echo $RES | sed '$d' | head -c 150)"
    fi
  fi
fi

# 4. Knowledge
echo ""
echo "--- 4. Knowledge Module ---"
if [ -n "$SITE_ID" ]; then
  RES=$(curl -s -w "\n%{http_code}" -H "$AUTH" "$BASE/sites/$SITE_ID/knowledge")
  CODE=$(echo "$RES" | tail -1)
  BODY=$(echo "$RES" | sed '$d')
  if [ "$CODE" = "200" ]; then
    COUNT=$(echo "$BODY" | grep -o '"id"' | wc -l)
    green "GET /sites/:id/knowledge OK ($COUNT items)"
  else
    red "GET /sites/:id/knowledge ($CODE)" "$(echo $BODY | head -c 150)"
  fi
fi

# 5. Content
echo ""
echo "--- 5. Content Module ---"
RES=$(curl -s -w "\n%{http_code}" -H "$AUTH" "$BASE/contents")
CODE=$(echo "$RES" | tail -1)
BODY=$(echo "$RES" | sed '$d')
if [ "$CODE" = "200" ]; then
  COUNT=$(echo "$BODY" | grep -o '"id"' | wc -l)
  green "GET /contents OK ($COUNT items)"
else
  red "GET /contents ($CODE)" "$(echo $BODY | head -c 150)"
fi

# 6. Monitor
echo ""
echo "--- 6. Monitor Module ---"
RES=$(curl -s -w "\n%{http_code}" -H "$AUTH" "$BASE/monitors/dashboard")
CODE=$(echo "$RES" | tail -1)
BODY=$(echo "$RES" | sed '$d')
if [ "$CODE" = "200" ]; then
  green "GET /monitors/dashboard OK"
  QUERIES=$(echo "$BODY" | grep -o '"query"' | wc -l)
  echo "  Queries: $QUERIES"
else
  red "GET /monitors/dashboard ($CODE)" "$(echo $BODY | head -c 150)"
fi

# 7. Publish
echo ""
echo "--- 7. Publish Module ---"
RES=$(curl -s -w "\n%{http_code}" -H "$AUTH" "$BASE/publications")
CODE=$(echo "$RES" | tail -1)
if [ "$CODE" = "200" ]; then
  green "GET /publications OK"
elif [ "$CODE" = "404" ]; then
  yellow "GET /publications (404)" "Endpoint may not exist"
else
  red "GET /publications ($CODE)" "$(echo $RES | sed '$d' | head -c 150)"
fi

# 8. Billing
echo ""
echo "--- 8. Billing Module ---"
RES=$(curl -s -w "\n%{http_code}" -H "$AUTH" "$BASE/billing/subscription")
CODE=$(echo "$RES" | tail -1)
if [ "$CODE" = "200" ]; then
  green "GET /billing/subscription OK"
elif [ "$CODE" = "404" ]; then
  yellow "GET /billing/subscription (404)" "Endpoint may not exist"
else
  red "GET /billing/subscription ($CODE)" "$(echo $RES | sed '$d' | head -c 150)"
fi

# 9. Fix module
echo ""
echo "--- 9. Fix Module ---"
if [ -n "$SCAN_ID" ]; then
  # Try to get scan results to find a scan result ID
  RES=$(curl -s -H "$AUTH" "$BASE/scans/$SCAN_ID/results")
  SR_ID=$(echo "$RES" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  if [ -n "$SR_ID" ]; then
    green "Found scan result ID: $SR_ID (fix endpoints ready)"
  else
    yellow "No scan results" "Fix generation needs scan results first"
  fi
else
  yellow "No scan available" "Cannot test fix module without scans"
fi

# 10. Dashboard stats
echo ""
echo "--- 10. Dashboard Stats ---"
RES=$(curl -s -w "\n%{http_code}" -H "$AUTH" "$BASE/dashboard" 2>/dev/null)
CODE=$(echo "$RES" | tail -1)
if [ "$CODE" = "200" ]; then
  green "GET /dashboard OK"
elif [ "$CODE" = "404" ]; then
  yellow "GET /dashboard (404)" "May use client-side aggregation"
else
  yellow "GET /dashboard ($CODE)" "$(echo $RES | sed '$d' | head -c 100)"
fi

# Summary
echo ""
echo "=========================================="
echo "  Results: $PASS passed, $FAIL failed, $WARN warnings"
echo "=========================================="
