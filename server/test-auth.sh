#!/bin/bash

echo "🧪 Testing Reifuu Room Authentication API"
echo "=========================================="
echo ""

BASE_URL="http://localhost:3000"

# Test 1: Register
echo "📝 Test 1: Register new user"
REGISTER_RESPONSE=$(curl -s -X POST $BASE_URL/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"testuser$(date +%s)\",\"email\":\"test$(date +%s)@example.com\",\"password\":\"password123\"}")

echo "Response: $REGISTER_RESPONSE"
echo ""

# Test 2: Login
echo "🔑 Test 2: Login with testuser2"
LOGIN_RESPONSE=$(curl -s -X POST $BASE_URL/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser2","password":"password123"}')

echo "Response: $LOGIN_RESPONSE"
echo ""

# Extract tokens
ACCESS_TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
REFRESH_TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"refreshToken":"[^"]*' | cut -d'"' -f4)

if [ -n "$ACCESS_TOKEN" ]; then
  echo "✅ Access Token: ${ACCESS_TOKEN:0:50}..."
  echo "✅ Refresh Token: ${REFRESH_TOKEN:0:50}..."
  echo ""

  # Test 3: Access protected endpoint
  echo "🔒 Test 3: Access protected endpoint (/auth/me)"
  ME_RESPONSE=$(curl -s -X GET $BASE_URL/auth/me \
    -H "Authorization: Bearer $ACCESS_TOKEN")
  echo "Response: $ME_RESPONSE"
  echo ""

  # Test 4: Refresh token
  echo "🔄 Test 4: Refresh access token"
  REFRESH_RESPONSE=$(curl -s -X POST $BASE_URL/auth/refresh \
    -H "Content-Type: application/json" \
    -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}")
  echo "Response: $REFRESH_RESPONSE"
  echo ""

  # Test 5: Logout
  echo "👋 Test 5: Logout"
  LOGOUT_RESPONSE=$(curl -s -X POST $BASE_URL/auth/logout \
    -H "Authorization: Bearer $ACCESS_TOKEN")
  echo "Response: $LOGOUT_RESPONSE"
  echo ""
else
  echo "❌ Login failed, cannot proceed with other tests"
fi

echo "=========================================="
echo "✅ All tests completed!"
