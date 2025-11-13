# Dataroom Filesystem Architecture

## Overview

A production-ready filesystem with file upload, hierarchy navigation, and comprehensive preview capabilities for dataroom filetypes.

## Technology Stack

### Backend
- **Runtime**: Node.js 18+
- **Framework**: Express.js 4.x
- **Database**: PostgreSQL 15+ (metadata storage)
- **File Storage**: Content-addressable storage on local filesystem
- **File Upload**: Multer with custom validation
- **Authentication**: JWT with bcrypt
- **Security**: Helmet, express-rate-limit
- **Validation**: express-validator
- **File Type Detection**: file-type
- **Preview Generation**:
  - PDFs: pdf-poppler (server-side thumbnails)
  - Office docs: mammoth (DOCX to HTML)
  - Images: sharp (thumbnail generation)

### Frontend
- **Framework**: React 18+
- **Build Tool**: Vite
- **UI Components**: shadcn/ui + Radix UI
- **Styling**: Tailwind CSS
- **File Upload**: react-dropzone
- **PDF Preview**: react-pdf (PDF.js)
- **Spreadsheet Preview**: xlsx + react-data-grid
- **Code Highlighting**: highlight.js
- **CSV Parsing**: Papa Parse
- **HTTP Client**: Axios
- **State Management**: React Context + hooks
- **Icons**: lucide-react

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         FRONTEND                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ File     │  │ File     │  │ Preview  │  │ Upload   │   │
│  │ Browser  │  │ Tree     │  │ Panel    │  │ Manager  │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
                    ┌───────┴───────┐
                    │   REST API    │
                    │  (Express.js) │
                    └───────┬───────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
   ┌────▼────┐      ┌───────▼────────┐   ┌─────▼─────┐
   │ Auth    │      │ File Service   │   │ Preview   │
   │ Service │      │                │   │ Service   │
   └────┬────┘      └───────┬────────┘   └─────┬─────┘
        │                   │                   │
        │           ┌───────┼───────┐          │
        │           │       │       │          │
   ┌────▼────┐  ┌──▼───┐ ┌─▼──┐ ┌──▼──────────▼────┐
   │  Users  │  │Files │ │Path│ │  File Storage   │
   │  Table  │  │Table │ │Table│ │  (CAS + Shards) │
   └─────────┘  └──────┘ └────┘ └─────────────────┘
                    │
              ┌─────▼─────┐
              │PostgreSQL │
              └───────────┘
```

## Database Schema

### users
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'user',
    storage_quota BIGINT DEFAULT 5368709120, -- 5GB
    storage_used BIGINT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### files
```sql
CREATE TABLE files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    folder_id UUID REFERENCES folders(id) ON DELETE CASCADE,
    original_name VARCHAR(500) NOT NULL,
    sanitized_name VARCHAR(500) NOT NULL,
    content_hash VARCHAR(64) UNIQUE NOT NULL, -- SHA-256
    storage_path VARCHAR(1000) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size BIGINT NOT NULL,
    extension VARCHAR(20),
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_files_user_id ON files(user_id);
CREATE INDEX idx_files_folder_id ON files(folder_id);
CREATE INDEX idx_files_content_hash ON files(content_hash);
CREATE INDEX idx_files_is_deleted ON files(is_deleted);
CREATE INDEX idx_files_mime_type ON files(mime_type);
```

### folders
```sql
CREATE TABLE folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES folders(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    path TEXT NOT NULL,
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_folders_user_id ON folders(user_id);
CREATE INDEX idx_folders_parent_id ON folders(parent_id);
CREATE INDEX idx_folders_path ON folders(path);
CREATE INDEX idx_folders_is_deleted ON folders(is_deleted);
```

### folder_closure (for efficient hierarchy queries)
```sql
CREATE TABLE folder_closure (
    ancestor_id UUID REFERENCES folders(id) ON DELETE CASCADE,
    descendant_id UUID REFERENCES folders(id) ON DELETE CASCADE,
    depth INT NOT NULL,
    PRIMARY KEY (ancestor_id, descendant_id)
);

CREATE INDEX idx_closure_descendant ON folder_closure(descendant_id);
```

### file_shares
```sql
CREATE TABLE file_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID REFERENCES files(id) ON DELETE CASCADE,
    shared_by UUID REFERENCES users(id) ON DELETE CASCADE,
    shared_with UUID REFERENCES users(id) ON DELETE CASCADE,
    permissions VARCHAR(50)[] DEFAULT ARRAY['read'], -- read, write, delete
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_shares_file_id ON file_shares(file_id);
CREATE INDEX idx_shares_shared_with ON file_shares(shared_with);
```

### audit_logs
```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(50) NOT NULL, -- upload, download, delete, share, etc.
    resource_type VARCHAR(50) NOT NULL, -- file, folder
    resource_id UUID NOT NULL,
    ip_address INET,
    user_agent TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_created_at ON audit_logs(created_at);
```

## File Storage Strategy

### Content-Addressable Storage (CAS)
- Files stored by SHA-256 hash
- Automatic deduplication (saves 20-40% storage)
- Structure: `/uploads/{first2chars}/{next2chars}/{hash}.{ext}`
- Example: SHA-256 `a1b2c3d4...` → `/uploads/a1/b2/a1b2c3d4....pdf`

### Sharding Formula
```
depth = ceil(log(file_count / 20000, 256))
For 100M files: depth = 2 (supports up to ~1.3B files)
```

### Storage Organization
```
/uploads/
├── a1/
│   ├── b2/
│   │   ├── a1b2c3d4e5f6.pdf
│   │   └── a1b2f7g8h9i0.docx
│   └── c3/
├── a2/
└── metadata.json (per directory)
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login (returns JWT)
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user

### Files
- `POST /api/files/upload` - Upload file
- `GET /api/files/:id` - Get file metadata
- `GET /api/files/:id/download` - Download file
- `GET /api/files/:id/preview` - Get preview data
- `DELETE /api/files/:id` - Soft delete file
- `POST /api/files/:id/restore` - Restore deleted file
- `PUT /api/files/:id` - Update file metadata
- `POST /api/files/:id/move` - Move to different folder

### Folders
- `POST /api/folders` - Create folder
- `GET /api/folders/:id` - Get folder contents
- `GET /api/folders/:id/tree` - Get folder tree
- `DELETE /api/folders/:id` - Soft delete folder
- `PUT /api/folders/:id` - Rename folder
- `POST /api/folders/:id/move` - Move folder

### Search
- `GET /api/search?q=query&type=file&folder=/path` - Search files/folders

### Sharing
- `POST /api/shares` - Share file with user
- `GET /api/shares` - Get shared files
- `DELETE /api/shares/:id` - Remove share

## Security Features

### Upload Validation
1. **File Size**: Max 100MB per file
2. **MIME Type Whitelist**:
   - Documents: `application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.*`
   - Images: `image/jpeg`, `image/png`, `image/webp`, `image/tiff`
   - Spreadsheets: `application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
   - Text: `text/plain`, `text/csv`, `application/json`, `application/xml`
   - Archives: `application/zip`, `application/x-rar-compressed`
3. **Magic Byte Verification**: Check file headers match declared type
4. **Filename Sanitization**: Remove path traversal, special chars
5. **Content Scanning**: Reject files with embedded scripts/macros

### Rate Limiting
- **Upload**: 10 files/hour per IP, 100 files/day per user
- **Download**: 100 files/hour per user
- **API**: 1000 requests/hour per user

### Access Control
- **Authentication**: JWT tokens (24hr expiry)
- **Authorization**: User can only access their own files
- **Sharing**: Explicit permission grants
- **Audit**: All operations logged

### Path Traversal Prevention
- Validate all paths are within user directory
- Reject `..`, `~`, null bytes
- Use path.resolve() and verify prefix

## File Preview Strategy

### Supported Types

#### Documents
- **PDF**: Return metadata + first page thumbnail
  - Client: Use react-pdf for rendering
  - Server: Generate thumbnail with pdf-poppler

#### Office Documents
- **DOCX**: Convert to HTML with mammoth.js
  - Return HTML for preview
- **XLSX**: Parse with xlsx, return JSON
  - Client: Render with react-data-grid
- **PPTX**: Extract first slide as image
  - Return image URL

#### Images
- **JPEG/PNG/WebP/TIFF**: Generate thumbnails with sharp
  - Sizes: 200x200 (thumb), 800x800 (preview)
  - Return thumbnail URL for list view
  - Return full image for preview panel

#### Text Files
- **TXT/CSV/JSON/XML**: Return raw content (max 1MB)
  - Client: Syntax highlighting with highlight.js
  - CSV: Parse with Papa Parse, show as table

#### Videos
- **MP4**: Extract thumbnail frame
  - Return thumbnail + video URL
  - Client: HTML5 video player

#### Archives
- **ZIP/RAR**: List contents
  - Return file tree without extracting

### Preview API
```
GET /api/files/:id/preview?size=medium&type=thumbnail
Response:
{
  "type": "pdf",
  "thumbnailUrl": "/uploads/previews/...",
  "pages": 10,
  "previewData": {...}
}
```

## Frontend Components

### Core Components
1. **FileExplorer**: Main container component
2. **FileList**: List/grid/tree view switcher
3. **FileUploader**: Drag-drop zone + progress
4. **PreviewPanel**: Side panel with file preview
5. **Breadcrumbs**: Navigation breadcrumbs
6. **ContextMenu**: Right-click operations
7. **SearchBar**: File search interface
8. **FileTree**: Folder hierarchy tree

### Component Hierarchy
```
<FileExplorer>
  <Header>
    <SearchBar />
    <UserMenu />
  </Header>
  <Main>
    <Sidebar>
      <FileTree />
      <StorageIndicator />
    </Sidebar>
    <Content>
      <Breadcrumbs />
      <Toolbar>
        <ViewSwitcher />
        <UploadButton />
      </Toolbar>
      <FileList view={listView} />
      <FileUploader />
    </Content>
    <PreviewPanel file={selectedFile} />
  </Main>
</FileExplorer>
```

## Performance Optimizations

### Backend
- Connection pooling (pg-pool)
- Redis caching for metadata (5min TTL)
- Streaming large files (no full memory load)
- Lazy loading folder contents
- Background jobs for thumbnail generation

### Frontend
- Virtual scrolling for large lists (react-window)
- Lazy loading images (Intersection Observer)
- Code splitting (React.lazy)
- Thumbnail CDN with aggressive caching
- Debounced search (300ms)
- Optimistic UI updates

## Deployment

### Environment Variables
```env
DATABASE_URL=postgresql://user:pass@localhost:5432/dataroom
JWT_SECRET=random-secret-key
UPLOAD_DIR=/var/dataroom/uploads
MAX_FILE_SIZE=104857600
NODE_ENV=production
PORT=3000
CORS_ORIGIN=https://app.example.com
```

### Docker Setup
```yaml
version: '3.8'
services:
  postgres:
    image: postgres:15
    volumes:
      - pgdata:/var/lib/postgresql/data

  api:
    build: ./backend
    depends_on:
      - postgres
    volumes:
      - uploads:/var/dataroom/uploads
    ports:
      - "3000:3000"

  frontend:
    build: ./frontend
    ports:
      - "80:80"
```

## Monitoring

### Metrics to Track
- Upload success/failure rate
- Average upload time
- Storage usage per user
- API response times
- Error rates by endpoint
- Active users
- File preview generation time

### Logging
- Winston logger with log rotation
- Log levels: error, warn, info, debug
- Structured JSON logs
- Separate audit log file

## Testing Strategy

### Backend Tests
- Unit tests: Services, utilities
- Integration tests: API endpoints with test DB
- Security tests: Upload validation, auth
- Load tests: Concurrent uploads (Artillery)

### Frontend Tests
- Unit tests: Components (Vitest + React Testing Library)
- Integration tests: User flows (Playwright)
- Visual regression: Screenshots (Percy/Chromatic)

### Test Coverage Goals
- Backend: >80% coverage
- Frontend: >70% coverage
- E2E: Critical user flows covered

## Future Enhancements

1. **Real-time Collaboration**: WebSocket for live updates
2. **Version History**: Track file versions
3. **Advanced Search**: Full-text search with Elasticsearch
4. **File Comments**: Annotations and comments
5. **Activity Feed**: User activity timeline
6. **Mobile App**: React Native app
7. **OCR**: Extract text from images/PDFs
8. **AI Search**: Semantic search with embeddings
9. **Watermarking**: Auto-watermark sensitive docs
10. **External Storage**: S3/Azure Blob integration
