-- Dataroom Filesystem Database Schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    storage_quota BIGINT DEFAULT 5368709120, -- 5GB default
    storage_used BIGINT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Folders table
CREATE TABLE IF NOT EXISTS folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES folders(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    path TEXT NOT NULL,
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT unique_folder_path_per_user UNIQUE (user_id, path, is_deleted)
);

-- Files table
CREATE TABLE IF NOT EXISTS files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    folder_id UUID REFERENCES folders(id) ON DELETE SET NULL,
    original_name VARCHAR(500) NOT NULL,
    sanitized_name VARCHAR(500) NOT NULL,
    content_hash VARCHAR(64) NOT NULL, -- SHA-256
    storage_path VARCHAR(1000) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size BIGINT NOT NULL,
    extension VARCHAR(20),
    preview_path VARCHAR(1000),
    metadata JSONB DEFAULT '{}',
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Folder closure table for efficient hierarchy queries
CREATE TABLE IF NOT EXISTS folder_closure (
    ancestor_id UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
    descendant_id UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
    depth INT NOT NULL CHECK (depth >= 0),
    PRIMARY KEY (ancestor_id, descendant_id)
);

-- File shares table
CREATE TABLE IF NOT EXISTS file_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    shared_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    shared_with UUID REFERENCES users(id) ON DELETE CASCADE, -- NULL means public link
    permissions VARCHAR(50)[] DEFAULT ARRAY['read'],
    share_token VARCHAR(255) UNIQUE, -- For public sharing
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID NOT NULL,
    ip_address INET,
    user_agent TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_files_user_id ON files(user_id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_files_folder_id ON files(folder_id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_files_content_hash ON files(content_hash);
CREATE INDEX IF NOT EXISTS idx_files_is_deleted ON files(is_deleted);
CREATE INDEX IF NOT EXISTS idx_files_mime_type ON files(mime_type);
CREATE INDEX IF NOT EXISTS idx_files_created_at ON files(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_folders_user_id ON folders(user_id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_folders_path ON folders(path);
CREATE INDEX IF NOT EXISTS idx_folders_is_deleted ON folders(is_deleted);

CREATE INDEX IF NOT EXISTS idx_closure_descendant ON folder_closure(descendant_id);
CREATE INDEX IF NOT EXISTS idx_closure_ancestor ON folder_closure(ancestor_id);

CREATE INDEX IF NOT EXISTS idx_shares_file_id ON file_shares(file_id);
CREATE INDEX IF NOT EXISTS idx_shares_shared_with ON file_shares(shared_with);
CREATE INDEX IF NOT EXISTS idx_shares_token ON file_shares(share_token);

CREATE INDEX IF NOT EXISTS idx_audit_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at DESC);

-- Full-text search index on file names
CREATE INDEX IF NOT EXISTS idx_files_name_search ON files USING gin(to_tsvector('english', original_name));

-- Trigger to update folder closure table
CREATE OR REPLACE FUNCTION update_folder_closure()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Insert self-reference
        INSERT INTO folder_closure (ancestor_id, descendant_id, depth)
        VALUES (NEW.id, NEW.id, 0);

        -- Insert paths from ancestors
        IF NEW.parent_id IS NOT NULL THEN
            INSERT INTO folder_closure (ancestor_id, descendant_id, depth)
            SELECT ancestor_id, NEW.id, depth + 1
            FROM folder_closure
            WHERE descendant_id = NEW.parent_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_folder_closure
AFTER INSERT ON folders
FOR EACH ROW
EXECUTE FUNCTION update_folder_closure();

-- Trigger to update storage usage
CREATE OR REPLACE FUNCTION update_storage_usage()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.is_deleted = FALSE THEN
        UPDATE users
        SET storage_used = storage_used + NEW.size
        WHERE id = NEW.user_id;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.is_deleted = FALSE AND NEW.is_deleted = TRUE THEN
            -- File was deleted
            UPDATE users
            SET storage_used = storage_used - OLD.size
            WHERE id = OLD.user_id;
        ELSIF OLD.is_deleted = TRUE AND NEW.is_deleted = FALSE THEN
            -- File was restored
            UPDATE users
            SET storage_used = storage_used + NEW.size
            WHERE id = NEW.user_id;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.is_deleted = FALSE THEN
            UPDATE users
            SET storage_used = storage_used - OLD.size
            WHERE id = OLD.user_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_storage_usage
AFTER INSERT OR UPDATE OR DELETE ON files
FOR EACH ROW
EXECUTE FUNCTION update_storage_usage();

-- Function to get folder path
CREATE OR REPLACE FUNCTION get_folder_path(folder_uuid UUID)
RETURNS TEXT AS $$
DECLARE
    result TEXT;
BEGIN
    WITH RECURSIVE folder_path AS (
        SELECT id, name, parent_id, name AS path
        FROM folders
        WHERE id = folder_uuid

        UNION ALL

        SELECT f.id, f.name, f.parent_id, f.name || '/' || fp.path
        FROM folders f
        JOIN folder_path fp ON f.id = fp.parent_id
    )
    SELECT path INTO result
    FROM folder_path
    WHERE parent_id IS NULL;

    RETURN COALESCE(result, (SELECT name FROM folders WHERE id = folder_uuid));
END;
$$ LANGUAGE plpgsql;

-- Function to check storage quota
CREATE OR REPLACE FUNCTION check_storage_quota(user_uuid UUID, file_size BIGINT)
RETURNS BOOLEAN AS $$
DECLARE
    quota BIGINT;
    used BIGINT;
BEGIN
    SELECT storage_quota, storage_used INTO quota, used
    FROM users
    WHERE id = user_uuid;

    RETURN (used + file_size) <= quota;
END;
$$ LANGUAGE plpgsql;
