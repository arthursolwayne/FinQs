#!/bin/bash

# Dataroom Filesystem API Test Script
# This script tests all major API endpoints

set -e

API_URL="http://localhost:3000/api"
TEST_EMAIL="test-$(date +%s)@example.com"
TEST_PASSWORD="testpassword123"
TOKEN=""
FILE_ID=""
FOLDER_ID=""

echo "======================================"
echo "Dataroom Filesystem API Tests"
echo "======================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print success
success() {
    echo -e "${GREEN}✓ $1${NC}"
}

# Function to print error
error() {
    echo -e "${RED}✗ $1${NC}"
    exit 1
}

# Function to print info
info() {
    echo -e "${YELLOW}→ $1${NC}"
}

# Check if server is running
info "Checking if server is running..."
if ! curl -s -f "${API_URL%/api}/health" > /dev/null 2>&1; then
    error "Server is not running at ${API_URL%/api}. Please start the server with 'npm start' or 'npm run dev'"
fi
success "Server is running"
echo ""

# Test 1: Register
info "Test 1: Register new user"
REGISTER_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${API_URL}/auth/register" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${TEST_EMAIL}\",\"password\":\"${TEST_PASSWORD}\"}")

HTTP_CODE=$(echo "$REGISTER_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$REGISTER_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "201" ]; then
    success "User registered successfully"
    echo "$RESPONSE_BODY" | jq '.' 2>/dev/null || echo "$RESPONSE_BODY"
else
    error "Registration failed with code $HTTP_CODE: $RESPONSE_BODY"
fi
echo ""

# Test 2: Login
info "Test 2: Login with credentials"
LOGIN_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${API_URL}/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${TEST_EMAIL}\",\"password\":\"${TEST_PASSWORD}\"}")

HTTP_CODE=$(echo "$LOGIN_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$LOGIN_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    success "Login successful"
    TOKEN=$(echo "$RESPONSE_BODY" | jq -r '.token')
    echo "Token: ${TOKEN:0:50}..."
else
    error "Login failed with code $HTTP_CODE: $RESPONSE_BODY"
fi
echo ""

# Test 3: Get current user
info "Test 3: Get current user info"
ME_RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "${API_URL}/auth/me" \
    -H "Authorization: Bearer ${TOKEN}")

HTTP_CODE=$(echo "$ME_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$ME_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    success "Got user info successfully"
    echo "$RESPONSE_BODY" | jq '.' 2>/dev/null || echo "$RESPONSE_BODY"
else
    error "Get user info failed with code $HTTP_CODE: $RESPONSE_BODY"
fi
echo ""

# Test 4: Create folder
info "Test 4: Create folder"
FOLDER_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${API_URL}/folders" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{"name":"Test Folder"}')

HTTP_CODE=$(echo "$FOLDER_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$FOLDER_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "201" ]; then
    success "Folder created successfully"
    FOLDER_ID=$(echo "$RESPONSE_BODY" | jq -r '.folder.id')
    echo "Folder ID: $FOLDER_ID"
else
    error "Folder creation failed with code $HTTP_CODE: $RESPONSE_BODY"
fi
echo ""

# Test 5: Create test file
info "Test 5: Create test file for upload"
TEST_FILE="/tmp/test-upload-$(date +%s).txt"
echo "This is a test file for the dataroom filesystem API" > "$TEST_FILE"
echo "Created at: $(date)" >> "$TEST_FILE"
success "Test file created at $TEST_FILE"
echo ""

# Test 6: Upload file
info "Test 6: Upload file"
UPLOAD_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${API_URL}/files/upload" \
    -H "Authorization: Bearer ${TOKEN}" \
    -F "file=@${TEST_FILE}")

HTTP_CODE=$(echo "$UPLOAD_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$UPLOAD_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "201" ]; then
    success "File uploaded successfully"
    FILE_ID=$(echo "$RESPONSE_BODY" | jq -r '.file.id')
    echo "File ID: $FILE_ID"
    echo "$RESPONSE_BODY" | jq '.file' 2>/dev/null || echo "$RESPONSE_BODY"
else
    error "File upload failed with code $HTTP_CODE: $RESPONSE_BODY"
fi
echo ""

# Test 7: List files
info "Test 7: List files"
LIST_RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "${API_URL}/files" \
    -H "Authorization: Bearer ${TOKEN}")

HTTP_CODE=$(echo "$LIST_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$LIST_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    success "Files listed successfully"
    FILE_COUNT=$(echo "$RESPONSE_BODY" | jq '.count')
    echo "Total files: $FILE_COUNT"
else
    error "List files failed with code $HTTP_CODE: $RESPONSE_BODY"
fi
echo ""

# Test 8: Get file metadata
info "Test 8: Get file metadata"
GET_FILE_RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "${API_URL}/files/${FILE_ID}" \
    -H "Authorization: Bearer ${TOKEN}")

HTTP_CODE=$(echo "$GET_FILE_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$GET_FILE_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    success "Got file metadata successfully"
    echo "$RESPONSE_BODY" | jq '.file' 2>/dev/null || echo "$RESPONSE_BODY"
else
    error "Get file metadata failed with code $HTTP_CODE: $RESPONSE_BODY"
fi
echo ""

# Test 9: Download file
info "Test 9: Download file"
DOWNLOAD_FILE="/tmp/downloaded-$(date +%s).txt"
HTTP_CODE=$(curl -s -w "%{http_code}" -o "$DOWNLOAD_FILE" -X GET "${API_URL}/files/${FILE_ID}/download" \
    -H "Authorization: Bearer ${TOKEN}")

if [ "$HTTP_CODE" = "200" ]; then
    success "File downloaded successfully to $DOWNLOAD_FILE"
    echo "Downloaded content:"
    cat "$DOWNLOAD_FILE"
else
    error "File download failed with code $HTTP_CODE"
fi
echo ""

# Test 10: Search files
info "Test 10: Search files"
SEARCH_RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "${API_URL}/search?q=test" \
    -H "Authorization: Bearer ${TOKEN}")

HTTP_CODE=$(echo "$SEARCH_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$SEARCH_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    success "Search completed successfully"
    RESULT_COUNT=$(echo "$RESPONSE_BODY" | jq '.count')
    echo "Search results: $RESULT_COUNT"
else
    error "Search failed with code $HTTP_CODE: $RESPONSE_BODY"
fi
echo ""

# Test 11: Get folder contents
info "Test 11: Get folder contents"
CONTENTS_RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "${API_URL}/folders/root/contents" \
    -H "Authorization: Bearer ${TOKEN}")

HTTP_CODE=$(echo "$CONTENTS_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$CONTENTS_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    success "Got folder contents successfully"
    echo "$RESPONSE_BODY" | jq '{folders: .folders | length, files: .files | length}' 2>/dev/null || echo "$RESPONSE_BODY"
else
    error "Get folder contents failed with code $HTTP_CODE: $RESPONSE_BODY"
fi
echo ""

# Test 12: Move file to folder
info "Test 12: Move file to folder"
MOVE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${API_URL}/files/${FILE_ID}/move" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"folderId\":\"${FOLDER_ID}\"}")

HTTP_CODE=$(echo "$MOVE_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$MOVE_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    success "File moved successfully"
else
    error "File move failed with code $HTTP_CODE: $RESPONSE_BODY"
fi
echo ""

# Test 13: Get storage statistics
info "Test 13: Get storage statistics"
STATS_RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "${API_URL}/files/stats/storage" \
    -H "Authorization: Bearer ${TOKEN}")

HTTP_CODE=$(echo "$STATS_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$STATS_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    success "Got storage statistics successfully"
    echo "$RESPONSE_BODY" | jq '.stats' 2>/dev/null || echo "$RESPONSE_BODY"
else
    error "Get storage stats failed with code $HTTP_CODE: $RESPONSE_BODY"
fi
echo ""

# Test 14: Delete file
info "Test 14: Delete file (soft delete)"
DELETE_RESPONSE=$(curl -s -w "\n%{http_code}" -X DELETE "${API_URL}/files/${FILE_ID}" \
    -H "Authorization: Bearer ${TOKEN}")

HTTP_CODE=$(echo "$DELETE_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$DELETE_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    success "File deleted successfully"
else
    error "File deletion failed with code $HTTP_CODE: $RESPONSE_BODY"
fi
echo ""

# Test 15: Restore file
info "Test 15: Restore deleted file"
RESTORE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${API_URL}/files/${FILE_ID}/restore" \
    -H "Authorization: Bearer ${TOKEN}")

HTTP_CODE=$(echo "$RESTORE_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$RESTORE_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    success "File restored successfully"
else
    error "File restoration failed with code $HTTP_CODE: $RESPONSE_BODY"
fi
echo ""

# Clean up
info "Cleaning up test files..."
rm -f "$TEST_FILE" "$DOWNLOAD_FILE"
success "Test files cleaned up"
echo ""

echo "======================================"
echo -e "${GREEN}All API tests passed! ✓${NC}"
echo "======================================"
echo ""
echo "Summary:"
echo "- Registration: ✓"
echo "- Authentication: ✓"
echo "- File Upload: ✓"
echo "- File Download: ✓"
echo "- File Management: ✓"
echo "- Folder Operations: ✓"
echo "- Search: ✓"
echo "- Storage Stats: ✓"
echo ""
