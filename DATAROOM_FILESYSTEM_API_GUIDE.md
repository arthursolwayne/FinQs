# Dataroom Filesystem REST API Implementation Guide
## Security, Compliance, and Best Practices for Secure Document Management

---

## Overview

A dataroom filesystem API must balance ease of access with stringent security, compliance, and audit requirements. This guide provides specific patterns and recommendations for implementing a secure document management system.

---

## 1. Security Considerations for Datarooms

### 1.1 File Type Restrictions

**Whitelist Allowed File Types:**

```json
{
  "allowedMimeTypes": {
    "documents": [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "application/msword",
      "text/plain",
      "text/csv"
    ],
    "presentations": [
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.ms-powerpoint"
    ],
    "archives": [
      "application/zip",
      "application/x-rar-compressed",
      "application/x-tar"
    ]
  },
  "blockedMimeTypes": [
    "application/x-msdownload",
    "application/x-msdos-program",
    "application/x-executable",
    "application/x-elf",
    "application/x-sharedlib"
  ],
  "blockedExtensions": [
    ".exe",
    ".dll",
    ".com",
    ".bat",
    ".cmd",
    ".scr",
    ".vbs",
    ".js",
    ".jar"
  ]
}
```

**Validation Implementation:**

```python
# validation.py
import magic
from fastapi import HTTPException

ALLOWED_MIME_TYPES = {...}
MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024  # 5GB

async def validate_file_upload(
    file_content: bytes,
    filename: str,
    user_id: str
) -> dict:
    """
    Validate file before upload
    """
    # Check file extension
    ext = filename.split('.')[-1].lower()
    if ext in BLOCKED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "INVALID_FILE_TYPE",
                "message": f"File extension '.{ext}' is not allowed",
                "allowedTypes": list(ALLOWED_MIME_TYPES.keys())
            }
        )

    # Check file size
    if len(file_content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail={
                "code": "FILE_TOO_LARGE",
                "message": f"File exceeds maximum size of {MAX_FILE_SIZE} bytes"
            }
        )

    # Check MIME type using magic bytes
    mime = magic.from_buffer(file_content, mime=True)
    is_allowed = any(
        mime in types for types in ALLOWED_MIME_TYPES.values()
    )

    if not is_allowed:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "INVALID_MIME_TYPE",
                "message": f"MIME type '{mime}' is not allowed",
                "detectedType": mime,
                "allowedTypes": ALLOWED_MIME_TYPES
            }
        )

    # Scan for malware (integration with antivirus)
    is_clean = await scan_for_malware(file_content, filename)
    if not is_clean:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "MALWARE_DETECTED",
                "message": "File contains potential malware and cannot be uploaded"
            }
        )

    return {
        "valid": True,
        "mimeType": mime,
        "size": len(file_content),
        "filename": filename
    }

async def scan_for_malware(content: bytes, filename: str) -> bool:
    """
    Integration with ClamAV or VirusTotal
    """
    # Example: ClamAV integration
    import pyclamd
    clam = pyclamd.ClamServer('localhost')
    result = clam.scan_stream(content)
    return result is None
```

### 1.2 Encryption

**At-Rest Encryption:**

```python
# encryption.py
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2
import os
import base64

class FileEncryption:
    def __init__(self, master_key: str):
        """Initialize with master encryption key"""
        self.master_key = master_key

    def encrypt_file(self, content: bytes, file_id: str) -> bytes:
        """
        Encrypt file content before storage
        """
        # Derive encryption key from master key and file ID
        kdf = PBKDF2(
            algorithm=hashes.SHA256(),
            length=32,
            salt=file_id.encode(),
            iterations=100000,
        )
        key = base64.urlsafe_b64encode(kdf.derive(self.master_key.encode()))

        fernet = Fernet(key)
        return fernet.encrypt(content)

    def decrypt_file(self, encrypted_content: bytes, file_id: str) -> bytes:
        """
        Decrypt file content before serving
        """
        kdf = PBKDF2(
            algorithm=hashes.SHA256(),
            length=32,
            salt=file_id.encode(),
            iterations=100000,
        )
        key = base64.urlsafe_b64encode(kdf.derive(self.master_key.encode()))

        fernet = Fernet(key)
        return fernet.decrypt(encrypted_content)
```

**File Upload with Encryption:**

```python
@app.post("/api/v1/files/upload")
async def upload_file_encrypted(
    file: UploadFile = File(...),
    parentFolderId: str = None,
    user = Depends(require_permission("file:write"))
):
    """Upload file with encryption"""
    content = await file.read()

    # Validate file
    validation = await validate_file_upload(content, file.filename, user["id"])

    # Generate file ID
    file_id = str(uuid.uuid4())

    # Encrypt content
    encryptor = FileEncryption(os.getenv("MASTER_ENCRYPTION_KEY"))
    encrypted_content = encryptor.encrypt_file(content, file_id)

    # Save encrypted file
    os.makedirs(f"./uploads/{parentFolderId}", exist_ok=True)
    with open(f"./uploads/{parentFolderId}/{file_id}.enc", "wb") as f:
        f.write(encrypted_content)

    return {
        "id": file_id,
        "name": file.filename,
        "size": len(content),
        "encrypted": True,
        "encryptionAlgorithm": "AES-256-CBC",
        "uploadedAt": datetime.now().isoformat()
    }
```

### 1.3 Transport Security

**API Configuration:**

```python
# security_config.py
from starlette.middleware.https import HTTPSMiddleware
from starlette.middleware.cors import CORSMiddleware

app = FastAPI()

# Force HTTPS
app.add_middleware(HTTPSMiddleware, enforce_https=True)

# CORS configuration (restrictive)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://app.example.com"],  # Whitelist specific domains
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
    max_age=3600,
    expose_headers=["X-Request-ID", "X-RateLimit-Limit"]
)

# Security headers
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Content-Security-Policy"] = "default-src 'self'"
    return response
```

---

## 2. Compliance and Audit Requirements

### 2.1 Comprehensive Audit Logging

**Audit Log Model:**

```python
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class AuditLog(BaseModel):
    id: str
    itemId: str
    itemType: str  # "file" or "folder"
    userId: str
    userEmail: str
    action: str  # "create", "read", "update", "delete", "download", "share"
    status: str  # "success" or "failure"
    timestamp: datetime
    ipAddress: str
    userAgent: str
    resourceBefore: Optional[dict] = None
    resourceAfter: Optional[dict] = None
    reason: Optional[str] = None
    duration: Optional[int] = None  # in milliseconds
    errorCode: Optional[str] = None
    errorMessage: Optional[str] = None

class AuditLogDB(BaseModel):
    """Database model with additional compliance fields"""
    id: str
    itemId: str
    itemType: str
    userId: str
    userEmail: str
    action: str
    status: str
    timestamp: datetime
    ipAddress: str
    userAgent: str
    resourceBefore: Optional[dict] = None
    resourceAfter: Optional[dict] = None
    reason: Optional[str] = None
    duration: Optional[int] = None
    errorCode: Optional[str] = None
    errorMessage: Optional[str] = None
    # Compliance fields
    complianceFlags: list  # ["GDPR", "SOX", "HIPAA", etc.]
    retentionPolicyApplied: str
    retentionExpiryDate: Optional[datetime] = None
    immutable: bool = True  # Audit logs should be immutable
    signedHash: Optional[str] = None  # For digital signature verification
```

**Audit Logging Implementation:**

```python
# audit.py
from datetime import datetime, timedelta
import hashlib
import logging

class AuditLogger:
    def __init__(self, db_connection):
        self.db = db_connection
        self.logger = logging.getLogger("audit")

    async def log_action(
        self,
        item_id: str,
        item_type: str,
        user_id: str,
        user_email: str,
        action: str,
        status: str,
        request: Request,
        resource_before: Optional[dict] = None,
        resource_after: Optional[dict] = None,
        duration: Optional[int] = None,
        error_code: Optional[str] = None
    ):
        """Log an action to audit trail"""

        audit_entry = {
            "id": str(uuid.uuid4()),
            "itemId": item_id,
            "itemType": item_type,
            "userId": user_id,
            "userEmail": user_email,
            "action": action,
            "status": status,
            "timestamp": datetime.utcnow(),
            "ipAddress": request.client.host,
            "userAgent": request.headers.get("user-agent"),
            "resourceBefore": resource_before,
            "resourceAfter": resource_after,
            "duration": duration,
            "errorCode": error_code,
            "complianceFlags": self._determine_compliance_flags(
                action, item_type, resource_after
            ),
            "retentionPolicyApplied": "7years",  # Default retention
            "immutable": True
        }

        # Calculate digital signature for immutability
        audit_entry["signedHash"] = self._sign_audit_entry(audit_entry)

        # Store in database
        await self.db.audit_logs.insert_one(audit_entry)

        # Log to external service (e.g., Splunk, ELK)
        self.logger.info(f"Audit: {action} on {item_type} {item_id} by {user_email}")

    def _determine_compliance_flags(
        self,
        action: str,
        item_type: str,
        resource: Optional[dict]
    ) -> list:
        """Determine which compliance frameworks apply"""
        flags = ["GENERAL"]

        if resource:
            metadata = resource.get("metadata", {})
            classification = metadata.get("classification", "")

            if classification == "confidential":
                flags.extend(["SOX", "HIPAA"])
            if "pii" in str(resource).lower():
                flags.append("GDPR")

        # Download actions always trigger compliance flag
        if action == "download":
            flags.append("ACCESS_LOG")

        return list(set(flags))

    def _sign_audit_entry(self, entry: dict) -> str:
        """Create digital signature for audit entry"""
        # Create deterministic string representation
        entry_str = str(entry)
        return hashlib.sha256(entry_str.encode()).hexdigest()
```

**Audit Query Endpoints:**

```python
@app.get("/api/v1/audit/logs")
async def get_audit_logs(
    itemId: Optional[str] = Query(None),
    userId: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    fromDate: Optional[str] = Query(None),
    toDate: Optional[str] = Query(None),
    limit: int = Query(100),
    offset: int = Query(0),
    user = Depends(require_permission("audit:read"))
):
    """
    Retrieve audit logs with filtering
    Restricted to compliance/audit team members
    """
    query = {}

    if itemId:
        query["itemId"] = itemId
    if userId:
        query["userId"] = userId
    if action:
        query["action"] = action

    if fromDate or toDate:
        date_range = {}
        if fromDate:
            date_range["$gte"] = datetime.fromisoformat(fromDate)
        if toDate:
            date_range["$lte"] = datetime.fromisoformat(toDate)
        query["timestamp"] = date_range

    # Fetch logs with pagination
    logs = await db.audit_logs.find(query).skip(offset).limit(limit).to_list(limit)
    total = await db.audit_logs.count_documents(query)

    return {
        "logs": logs,
        "pagination": {
            "total": total,
            "limit": limit,
            "offset": offset
        }
    }

@app.get("/api/v1/audit/report/compliance")
async def get_compliance_report(
    complianceFramework: str = Query(...),  # SOX, GDPR, HIPAA
    month: str = Query(...),  # YYYY-MM format
    user = Depends(require_permission("audit:read"))
):
    """Generate compliance report for specific framework"""

    start_date = datetime.fromisoformat(f"{month}-01")
    if month.endswith("12"):
        end_date = datetime.fromisoformat(f"{int(month[:4]) + 1}-01-01")
    else:
        next_month = f"{int(month[:7]):02d}".zfill(2)
        end_date = datetime.fromisoformat(f"{month[:4]}-{next_month}-01")

    flagged_logs = await db.audit_logs.find({
        "complianceFlags": complianceFramework,
        "timestamp": {
            "$gte": start_date,
            "$lt": end_date
        }
    }).to_list(None)

    return {
        "framework": complianceFramework,
        "period": month,
        "totalActions": len(flagged_logs),
        "actions": {
            action: len([l for l in flagged_logs if l["action"] == action])
            for action in set(l["action"] for l in flagged_logs)
        },
        "users": {
            email: len([l for l in flagged_logs if l["userEmail"] == email])
            for email in set(l["userEmail"] for l in flagged_logs)
        },
        "logs": flagged_logs
    }
```

### 2.2 Data Retention and Deletion Policies

**Retention Policy Model:**

```python
class RetentionPolicy(BaseModel):
    id: str
    name: str
    retentionDays: int
    description: str
    applicableMetadata: dict  # e.g., {"classification": "confidential"}
    action: str  # "delete", "archive", "quarantine"
    notifyDaysBeforeDeletion: int = 30
    enabled: bool = True

@app.post("/api/v1/retention-policies")
async def create_retention_policy(
    policy: RetentionPolicy,
    user = Depends(require_permission("retention:manage"))
):
    """Create a retention policy"""
    policy.id = str(uuid.uuid4())
    await db.retention_policies.insert_one(policy.dict())
    return policy

@app.delete("/api/v1/items/{itemId}")
async def delete_item(
    itemId: str,
    permanentDelete: bool = Query(False),
    reason: Optional[str] = Query(None),
    user = Depends(require_permission("file:delete"))
):
    """
    Delete item with soft-delete by default
    Requires explicit confirmation for permanent deletion
    """
    item = await db.files.find_one({"_id": itemId})

    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    if permanentDelete:
        # Require additional authorization for permanent deletion
        if "file:delete_permanent" not in user["permissions"]:
            raise HTTPException(
                status_code=403,
                detail="Permission 'file:delete_permanent' required for permanent deletion"
            )

        # Permanently delete
        await db.files.delete_one({"_id": itemId})
        await audit_logger.log_action(
            itemId, "file", user["id"], user["email"],
            "permanent_delete", "success",
            reason=reason
        )

        return {"status": "permanently_deleted", "itemId": itemId}

    else:
        # Soft delete
        await db.files.update_one(
            {"_id": itemId},
            {
                "$set": {
                    "status": "deleted",
                    "deletedAt": datetime.utcnow(),
                    "deletedBy": user["id"],
                    "deletionReason": reason,
                    "recoveryAvailableUntil": datetime.utcnow() + timedelta(days=30)
                }
            }
        )

        await audit_logger.log_action(
            itemId, "file", user["id"], user["email"],
            "soft_delete", "success",
            reason=reason
        )

        return {
            "status": "deleted",
            "itemId": itemId,
            "recoveryAvailableUntil": (datetime.utcnow() + timedelta(days=30)).isoformat()
        }
```

---

## 3. Dataroom-Specific Features

### 3.1 Document Versioning

**Version Control:**

```python
class DocumentVersion(BaseModel):
    id: str
    fileId: str
    versionNumber: int
    fileName: str
    size: int
    uploadedAt: datetime
    uploadedBy: str
    uploadedByEmail: str
    changesSummary: Optional[str] = None
    checksum: str
    isCurrent: bool

@app.post("/api/v1/files/{fileId}/new-version")
async def upload_new_version(
    fileId: str,
    file: UploadFile = File(...),
    changesSummary: Optional[str] = None,
    user = Depends(require_permission("file:write"))
):
    """
    Upload a new version of an existing file
    Previous versions are retained for audit and recovery
    """
    current_file = await db.files.find_one({"_id": fileId})

    if not current_file:
        raise HTTPException(status_code=404, detail="File not found")

    # Mark current version as historical
    current_version = {
        "id": str(uuid.uuid4()),
        "fileId": fileId,
        "versionNumber": (current_file.get("currentVersion", 0) or 0) + 1,
        "fileName": current_file["name"],
        "size": current_file["size"],
        "uploadedAt": current_file["createdAt"],
        "uploadedBy": current_file["createdBy"],
        "uploadedByEmail": current_file["createdByEmail"],
        "checksum": current_file["checksum"]["value"],
        "isCurrent": False
    }

    # Store previous version
    await db.file_versions.insert_one(current_version)

    # Update current file
    content = await file.read()
    new_checksum = calculate_checksum(content)

    await db.files.update_one(
        {"_id": fileId},
        {
            "$set": {
                "name": file.filename,
                "size": len(content),
                "mimeType": file.content_type,
                "checksum": {"algorithm": "SHA256", "value": new_checksum},
                "updatedAt": datetime.utcnow(),
                "updatedBy": user["id"],
                "updatedByEmail": user["email"],
                "currentVersion": current_version["versionNumber"],
                "changesSummary": changesSummary
            }
        }
    )

    return {
        "fileId": fileId,
        "versionNumber": current_version["versionNumber"],
        "previousVersionArchived": True,
        "updatedAt": datetime.utcnow().isoformat()
    }

@app.get("/api/v1/files/{fileId}/versions")
async def get_file_versions(
    fileId: str,
    user = Depends(require_permission("file:read"))
):
    """Get all versions of a file"""

    versions = await db.file_versions.find(
        {"fileId": fileId}
    ).sort("versionNumber", -1).to_list(None)

    current_file = await db.files.find_one({"_id": fileId})
    current_version = {
        "id": fileId,
        "fileId": fileId,
        "versionNumber": current_file["currentVersion"],
        "fileName": current_file["name"],
        "size": current_file["size"],
        "uploadedAt": current_file["updatedAt"],
        "uploadedBy": current_file["updatedBy"],
        "uploadedByEmail": current_file["updatedByEmail"],
        "checksum": current_file["checksum"]["value"],
        "isCurrent": True
    }

    return {
        "fileId": fileId,
        "currentVersion": current_version,
        "previousVersions": versions
    }

@app.post("/api/v1/files/{fileId}/restore-version/{versionId}")
async def restore_previous_version(
    fileId: str,
    versionId: str,
    user = Depends(require_permission("file:write"))
):
    """Restore a previous version"""

    version = await db.file_versions.find_one({"_id": versionId})

    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    # Store current version as historical
    current_file = await db.files.find_one({"_id": fileId})
    new_version_number = (current_file.get("currentVersion", 0) or 0) + 1

    current_version = {
        "id": str(uuid.uuid4()),
        "fileId": fileId,
        "versionNumber": new_version_number,
        "fileName": current_file["name"],
        "size": current_file["size"],
        "uploadedAt": current_file["updatedAt"],
        "uploadedBy": current_file["updatedBy"],
        "uploadedByEmail": current_file["updatedByEmail"],
        "checksum": current_file["checksum"]["value"],
        "isCurrent": False,
        "changesSummary": f"Automated: Restored from version {version['versionNumber']}"
    }

    await db.file_versions.insert_one(current_version)

    # Restore previous version
    await db.files.update_one(
        {"_id": fileId},
        {
            "$set": {
                "name": version["fileName"],
                "size": version["size"],
                "checksum": {"algorithm": "SHA256", "value": version["checksum"]},
                "updatedAt": datetime.utcnow(),
                "updatedBy": user["id"],
                "updatedByEmail": user["email"],
                "currentVersion": new_version_number,
                "changesSummary": f"Restored from version {version['versionNumber']}"
            }
        }
    )

    await audit_logger.log_action(
        fileId, "file", user["id"], user["email"],
        "restore_version", "success",
        reason=f"Restored version {version['versionNumber']}"
    )

    return {
        "fileId": fileId,
        "restoredVersionNumber": version["versionNumber"],
        "newCurrentVersionNumber": new_version_number,
        "restoredAt": datetime.utcnow().isoformat()
    }
```

### 3.2 Watermarking and Digital Rights

**Watermarking Implementation:**

```python
from PIL import Image
import pypdf

class DocumentWatermark:
    @staticmethod
    async def add_watermark_to_pdf(
        pdf_content: bytes,
        watermark_text: str,
        user_email: str
    ) -> bytes:
        """Add text watermark to PDF"""
        from PyPDF2 import PdfReader, PdfWriter
        from reportlab.pdfgen import canvas
        from reportlab.lib.pagesizes import letter
        from io import BytesIO

        reader = PdfReader(BytesIO(pdf_content))
        writer = PdfWriter()

        # Create watermark
        watermark_buffer = BytesIO()
        c = canvas.Canvas(watermark_buffer, pagesize=letter)
        c.setFontSize(60)
        c.setFillAlpha(0.3)
        c.rotate(45)
        c.drawString(200, 100, f"Downloaded by: {user_email}")
        c.save()
        watermark_buffer.seek(0)

        watermark_pdf = PdfReader(watermark_buffer)
        watermark_page = watermark_pdf.pages[0]

        # Apply to each page
        for page in reader.pages:
            page.merge_page(watermark_page)
            writer.add_page(page)

        output = BytesIO()
        writer.write(output)
        return output.getvalue()

    @staticmethod
    async def add_watermark_to_image(
        image_content: bytes,
        watermark_text: str,
        user_email: str
    ) -> bytes:
        """Add text watermark to image"""
        from PIL import Image, ImageDraw, ImageFont
        from io import BytesIO

        img = Image.open(BytesIO(image_content))
        draw = ImageDraw.Draw(img, "RGBA")

        # Add watermark
        text = f"Downloaded by: {user_email}"
        font_size = int(img.width / 10)
        draw.text(
            (img.width // 2, img.height // 2),
            text,
            font=ImageFont.load_default(),
            fill=(128, 128, 128, 128),
            anchor="mm"
        )

        output = BytesIO()
        img.save(output, format="PNG")
        return output.getvalue()

@app.get("/api/v1/files/{fileId}/download-watermarked")
async def download_with_watermark(
    fileId: str,
    user = Depends(require_permission("file:read"))
):
    """Download file with watermark indicating who downloaded it"""

    file_record = await db.files.find_one({"_id": fileId})

    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")

    # Fetch encrypted file
    file_path = f"./uploads/{file_record['parentFolderId']}/{fileId}.enc"
    with open(file_path, "rb") as f:
        encrypted_content = f.read()

    # Decrypt
    encryptor = FileEncryption(os.getenv("MASTER_ENCRYPTION_KEY"))
    original_content = encryptor.decrypt_file(encrypted_content, fileId)

    # Add watermark based on file type
    mime_type = file_record["mimeType"]

    if mime_type == "application/pdf":
        watermarked = await DocumentWatermark.add_watermark_to_pdf(
            original_content,
            "Downloaded",
            user["email"]
        )
    elif mime_type.startswith("image/"):
        watermarked = await DocumentWatermark.add_watermark_to_image(
            original_content,
            "Downloaded",
            user["email"]
        )
    else:
        watermarked = original_content

    # Log download
    await audit_logger.log_action(
        fileId, "file", user["id"], user["email"],
        "download_watermarked", "success",
        duration=None
    )

    return StreamingResponse(
        iter([watermarked]),
        media_type=mime_type,
        headers={"Content-Disposition": f"attachment; filename=\"{file_record['name']}\""}
    )
```

### 3.3 Document Expiration and Viewing Limits

**Expiring Access Model:**

```python
class ExpiringAccess(BaseModel):
    fileId: str
    recipientEmail: str
    expiresAt: datetime
    maxDownloads: Optional[int] = None
    allowPrint: bool = False
    allowCopy: bool = False
    allowScreenshot: bool = False

@app.post("/api/v1/files/{fileId}/share-expiring")
async def share_with_expiration(
    fileId: str,
    request: ExpiringAccess,
    user = Depends(require_permission("file:share"))
):
    """Share file with expiring access"""

    share_link = str(uuid.uuid4())

    access_grant = {
        "id": share_link,
        "fileId": fileId,
        "sharedBy": user["id"],
        "sharedByEmail": user["email"],
        "recipientEmail": request.recipientEmail,
        "createdAt": datetime.utcnow(),
        "expiresAt": request.expiresAt,
        "maxDownloads": request.maxDownloads,
        "downloadCount": 0,
        "allowPrint": request.allowPrint,
        "allowCopy": request.allowCopy,
        "allowScreenshot": request.allowScreenshot,
        "viewingHistory": []
    }

    await db.expiring_access.insert_one(access_grant)

    return {
        "shareLink": f"https://api.example.com/public/access/{share_link}",
        "expiresAt": request.expiresAt.isoformat(),
        "maxDownloads": request.maxDownloads
    }

@app.get("/api/v1/public/access/{shareLink}/file")
async def access_shared_file(
    shareLink: str,
    userEmail: Optional[str] = Query(None)
):
    """Access file via expiring share link"""

    access = await db.expiring_access.find_one({"id": shareLink})

    if not access:
        raise HTTPException(status_code=404, detail="Share link not found")

    # Check expiration
    if datetime.utcnow() > access["expiresAt"]:
        raise HTTPException(status_code=410, detail="Share link expired")

    # Check download limit
    if access.get("maxDownloads") and access["downloadCount"] >= access["maxDownloads"]:
        raise HTTPException(status_code=403, detail="Download limit exceeded")

    # Log viewing
    access["viewingHistory"].append({
        "timestamp": datetime.utcnow(),
        "userEmail": userEmail,
        "action": "view"
    })

    # Increment download count
    await db.expiring_access.update_one(
        {"id": shareLink},
        {
            "$set": {
                "viewingHistory": access["viewingHistory"],
                "downloadCount": access["downloadCount"] + 1
            }
        }
    )

    # Return file
    file_record = await db.files.find_one({"_id": access["fileId"]})

    # Apply restrictions
    response_headers = {
        "Content-Disposition": f"attachment; filename=\"{file_record['name']}\"",
        "Content-Type": file_record["mimeType"]
    }

    if not access["allowPrint"]:
        response_headers["X-Print-Restricted"] = "true"
    if not access["allowCopy"]:
        response_headers["X-Copy-Restricted"] = "true"
    if not access["allowScreenshot"]:
        response_headers["X-Screenshot-Restricted"] = "true"

    # Decrypt and return
    with open(f"./uploads/{file_record['parentFolderId']}/{access['fileId']}.enc", "rb") as f:
        encrypted_content = f.read()

    encryptor = FileEncryption(os.getenv("MASTER_ENCRYPTION_KEY"))
    content = encryptor.decrypt_file(encrypted_content, access["fileId"])

    return StreamingResponse(
        iter([content]),
        media_type=file_record["mimeType"],
        headers=response_headers
    )
```

---

## 4. Performance Optimization for Datarooms

### 4.1 Indexing Strategy

```sql
-- Create indexes for common queries
CREATE INDEX idx_files_folder ON files(parent_folder_id);
CREATE INDEX idx_files_owner ON files(owner_id);
CREATE INDEX idx_files_created ON files(created_at DESC);
CREATE INDEX idx_files_status ON files(status);
CREATE INDEX idx_files_metadata ON files USING GIN (metadata);

-- Composite indexes for common filters
CREATE INDEX idx_files_search ON files(
    parent_folder_id,
    status,
    created_at DESC
);

-- Indexes for audit logs
CREATE INDEX idx_audit_item ON audit_logs(item_id);
CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX idx_audit_action ON audit_logs(action);

-- JSONB path indexes for metadata queries
CREATE INDEX idx_files_metadata_classification
    ON files USING GIN (metadata jsonb_path_ops);
```

### 4.2 Caching Strategy

```python
import redis
from functools import wraps
import json

redis_client = redis.Redis(host='localhost', port=6379, db=0)

def cache_result(ttl_seconds=3600):
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Create cache key from function name and parameters
            cache_key = f"{func.__name__}:{json.dumps(kwargs, sort_keys=True)}"

            # Try to get from cache
            cached = redis_client.get(cache_key)
            if cached:
                return json.loads(cached)

            # Execute function
            result = await func(*args, **kwargs)

            # Store in cache
            redis_client.setex(cache_key, ttl_seconds, json.dumps(result))

            return result
        return wrapper
    return decorator

@app.get("/api/v1/folders/{folderId}/items")
@cache_result(ttl_seconds=300)  # Cache for 5 minutes
async def get_folder_items(
    folderId: str,
    limit: int = 20,
    offset: int = 0,
    user = Depends(require_permission("file:read"))
):
    """Get folder contents with caching"""
    # Implementation here
    pass
```

---

## Summary: Dataroom Implementation Checklist

### Security
- [ ] Implement file type validation (whitelist MIME types)
- [ ] Encrypt files at rest using AES-256
- [ ] Enforce HTTPS/TLS for all connections
- [ ] Implement rate limiting and DDoS protection
- [ ] Scan uploads for malware (ClamAV/VirusTotal)
- [ ] Validate all inputs and sanitize

### Compliance & Audit
- [ ] Log all actions with immutable audit trail
- [ ] Track who accessed, modified, and deleted files
- [ ] Store file metadata including creator, editor history
- [ ] Implement retention policies and automatic deletion
- [ ] Generate compliance reports (SOX, GDPR, HIPAA)
- [ ] Sign audit logs digitally for integrity

### Features
- [ ] Support file versioning and restoration
- [ ] Add watermarking to downloaded files
- [ ] Implement expiring share links
- [ ] Support document-level permissions
- [ ] Track download/access metrics
- [ ] Prevent unauthorized file type modifications

### Performance
- [ ] Create appropriate database indexes
- [ ] Implement caching for frequently accessed items
- [ ] Use CDN for static content
- [ ] Optimize search with Elasticsearch/Algolia
- [ ] Support pagination for large result sets
- [ ] Compress responses with gzip

### Monitoring & Operations
- [ ] Set up comprehensive logging
- [ ] Monitor API performance and latency
- [ ] Alert on suspicious access patterns
- [ ] Track storage usage and costs
- [ ] Regular security audits and penetration testing
- [ ] Automated backups and disaster recovery
