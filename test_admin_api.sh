#!/bin/bash

# Admin API Verification Script
# This script tests the admin API endpoints to verify they're working

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔍 Testing Admin API Endpoints${NC}"
echo ""

BASE_URL="https://zenith-hr-api.apps.infoservices.com/api"
TEST_EMAIL="jagadeesh.l@infoservices.com"

# Test 1: Health check
echo -e "${YELLOW}1. Testing health endpoint...${NC}"
if curl -s -f "$BASE_URL/../health" >/dev/null; then
    echo -e "${GREEN}✅ Health endpoint working${NC}"
else
    echo -e "${RED}❌ Health endpoint failed${NC}"
fi

# Test 2: Admin list endpoint
echo -e "${YELLOW}2. Testing admin list endpoint...${NC}"
ADMIN_RESPONSE=$(curl -s -w "%{http_code}" "$BASE_URL/admins/" -H "Accept: application/json" || echo "000")
HTTP_CODE="${ADMIN_RESPONSE: -3}"
RESPONSE_BODY="${ADMIN_RESPONSE%???}"

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ Admin list endpoint working (HTTP $HTTP_CODE)${NC}"
    ADMIN_COUNT=$(echo "$RESPONSE_BODY" | jq '. | length' 2>/dev/null || echo "unknown")
    echo "   Found $ADMIN_COUNT admin(s)"
else
    echo -e "${RED}❌ Admin list endpoint failed (HTTP $HTTP_CODE)${NC}"
    echo "   Response: $RESPONSE_BODY"
fi

# Test 3: Admin check endpoint
echo -e "${YELLOW}3. Testing admin check endpoint...${NC}"
CHECK_RESPONSE=$(curl -s -w "%{http_code}" "$BASE_URL/admins/check/$TEST_EMAIL" -H "Accept: application/json" || echo "000")
HTTP_CODE="${CHECK_RESPONSE: -3}"
RESPONSE_BODY="${CHECK_RESPONSE%???}"

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ Admin check endpoint working (HTTP $HTTP_CODE)${NC}"
    IS_ADMIN=$(echo "$RESPONSE_BODY" | jq -r '.is_admin' 2>/dev/null || echo "unknown")
    echo "   User $TEST_EMAIL is admin: $IS_ADMIN"
elif [ "$HTTP_CODE" = "404" ]; then
    echo -e "${YELLOW}⚠️  Admin check endpoint returned 404 (user not found)${NC}"
    echo "   This might be expected if the user is not in the admin table"
else
    echo -e "${RED}❌ Admin check endpoint failed (HTTP $HTTP_CODE)${NC}"
    echo "   Response: $RESPONSE_BODY"
fi

# Test 4: Test endpoint
echo -e "${YELLOW}4. Testing admin test endpoint...${NC}"
TEST_RESPONSE=$(curl -s -w "%{http_code}" "$BASE_URL/admins/test" -H "Accept: application/json" || echo "000")
HTTP_CODE="${TEST_RESPONSE: -3}"
RESPONSE_BODY="${TEST_RESPONSE%???}"

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ Admin test endpoint working (HTTP $HTTP_CODE)${NC}"
    echo "   Response: $RESPONSE_BODY"
else
    echo -e "${RED}❌ Admin test endpoint failed (HTTP $HTTP_CODE)${NC}"
    echo "   Response: $RESPONSE_BODY"
fi

echo ""
echo -e "${BLUE}📊 Summary:${NC}"
echo "Base URL: $BASE_URL"
echo "Test Email: $TEST_EMAIL"
echo ""
echo -e "${YELLOW}💡 If all tests pass, the admin router is working correctly!${NC}"
echo -e "${YELLOW}💡 If tests fail, check the deployment logs and ensure the latest image is deployed.${NC}"
