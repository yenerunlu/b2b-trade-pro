#!/bin/bash

echo "🧪 SMART SEARCH API TESTİ"
echo "=========================="

# Test 1: Health check
echo -e "\n1. 🔍 Health Check:"
curl -s -w "\nStatus: %{http_code}\n" http://localhost:8080/api/b2b/health

# Test 2: Smart search - OEM kodu
echo -e "\n2. 🔍 Smart Search (OEM Kodu: 171 407 153 D):"
curl -s -X POST http://localhost:8080/api/b2b/products/smart-search \
  -H "Content-Type: application/json" \
  -H "x-user-data-base64: $(echo -n '{"cari_kodu":"TEST123","firma":"TEST FIRMA"}' | base64)" \
  -d '{
    "searchTerm": "171 407 153 D",
    "customerCode": "TEST123",
    "limit": 10
  }' -w "\nStatus: %{http_code}\n"

# Test 3: Malzeme kodu
echo -e "\n3. 🔍 Smart Search (Malzeme Kodu: V-325):"
curl -s -X POST http://localhost:8080/api/b2b/products/smart-search \
  -H "Content-Type: application/json" \
  -H "x-user-data-base64: $(echo -n '{"cari_kodu":"TEST123","firma":"TEST FIRMA"}' | base64)" \
  -d '{
    "searchTerm": "V-325",
    "customerCode": "TEST123",
    "limit": 10
  }' -w "\nStatus: %{http_code}\n"

# Test 4: Üretici
echo -e "\n4. 🔍 Smart Search (Üretici: TEKNOROT):"
curl -s -X POST http://localhost:8080/api/b2b/products/smart-search \
  -H "Content-Type: application/json" \
  -H "x-user-data-base64: $(echo -n '{"cari_kodu":"TEST123","firma":"TEST FIRMA"}' | base64)" \
  -d '{
    "searchTerm": "TEKNOROT",
    "customerCode": "TEST123",
    "limit": 10
  }' -w "\nStatus: %{http_code}\n"

# Test 5: Karakter arama
echo -e "\n5. 🔍 Smart Search (Karakter: 171407):"
curl -s -X POST http://localhost:8080/api/b2b/products/smart-search \
  -H "Content-Type: application/json" \
  -H "x-user-data-base64: $(echo -n '{"cari_kodu":"TEST123","firma":"TEST FIRMA"}' | base64)" \
  -d '{
    "searchTerm": "171407",
    "customerCode": "TEST123",
    "limit": 10
  }' -w "\nStatus: %{http_code}\n"
