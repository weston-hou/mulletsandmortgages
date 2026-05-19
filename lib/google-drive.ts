/**
 * lib/google-drive.ts
 * Google Drive + Docs API integration via service account.
 *
 * Requires GOOGLE_SERVICE_ACCOUNT_JSON env var (full JSON key file contents).
 * The service account needs domain-wide delegation with scopes:
 *   https://www.googleapis.com/auth/drive
 *   https://www.googleapis.com/auth/documents
 *
 * Impersonates zach@mulletsandmortgages.com so all files appear in his Drive.
 */

const IMPERSONATE_AS = "zach@mulletsandmortgages.com";
const DRIVE_API      = "https://www.googleapis.com/drive/v3";
const UPLOAD_API     = "https://www.googleapis.com/upload/drive/v3";
const TOKEN_URL      = "https://oauth2.googleapis.com/token";

// Folder names in Zach's Drive
const FOLDER_NAMES = {
  root:      "Mullets & Mortgages",
  videos:    "Video Uploads",
  documents: "Documents",
  signed:    "Signed Documents",
};

// ─── Service account JWT + token ─────────────────────────────────────────────

interface ServiceAccountKey {
  client_email: string;
  private_key:  string;
}

function getServiceAccount(): ServiceAccountKey {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not set");
  return JSON.parse(raw) as ServiceAccountKey;
}

/** Build a signed JWT for the service account */
async function buildJwt(sa: ServiceAccountKey, scope: string): Promise<string> {
  const now  = Math.floor(Date.now() / 1000);
  const header  = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const payload = btoa(JSON.stringify({
    iss: sa.client_email,
    sub: IMPERSONATE_AS,
    scope,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const signingInput = `${header}.${payload}`;

  // Import the RSA private key
  const pemBody = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const keyData = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", keyData.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"]
  );

  const sigBuffer = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  return `${signingInput}.${sig}`;
}

/** Exchange JWT for an access token */
async function getAccessToken(): Promise<string> {
  const sa    = getServiceAccount();
  const scope = "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/documents";
  const jwt   = await buildJwt(sa, scope);

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion:  jwt,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to get Google access token: ${text}`);
  }

  const data = await res.json() as { access_token: string };
  return data.access_token;
}

// ─── Drive helpers ────────────────────────────────────────────────────────────

async function driveGet(path: string, token: string) {
  const res = await fetch(`${DRIVE_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Drive GET ${path} failed: ${await res.text()}`);
  return res.json();
}

async function drivePost(path: string, body: unknown, token: string) {
  const res = await fetch(`${DRIVE_API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Drive POST ${path} failed: ${await res.text()}`);
  return res.json();
}

/** Find a folder by name under a parent (or root). Returns null if not found. */
async function findFolder(name: string, parentId: string | null, token: string): Promise<string | null> {
  const q = `mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false${parentId ? ` and '${parentId}' in parents` : " and 'root' in parents"}`;
  const data = await driveGet(`/files?q=${encodeURIComponent(q)}&fields=files(id,name)`, token);
  return data.files?.[0]?.id ?? null;
}

/** Find or create a folder. Returns the folder ID. */
async function ensureFolder(name: string, parentId: string | null, token: string): Promise<string> {
  const existing = await findFolder(name, parentId, token);
  if (existing) return existing;

  const body: Record<string, unknown> = {
    name,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parentId) body.parents = [parentId];

  const data = await drivePost("/files", body, token);
  return data.id as string;
}

/** Get or create the full folder structure. Returns folder IDs. */
export async function ensureFolders(): Promise<{
  root: string; videos: string; documents: string; signed: string; token: string;
}> {
  const token    = await getAccessToken();
  const rootId   = await ensureFolder(FOLDER_NAMES.root,      null,   token);
  const videosId = await ensureFolder(FOLDER_NAMES.videos,    rootId, token);
  const docsId   = await ensureFolder(FOLDER_NAMES.documents, rootId, token);
  const signedId = await ensureFolder(FOLDER_NAMES.signed,    docsId, token);
  return { root: rootId, videos: videosId, documents: docsId, signed: signedId, token };
}

// ─── File upload ──────────────────────────────────────────────────────────────

export interface UploadedFile {
  id:        string;
  name:      string;
  webViewLink: string;
  size:      number;
  mimeType:  string;
}

/**
 * Upload a file to Google Drive using multipart upload.
 * Returns the file metadata.
 */
export async function uploadFileToDrive(
  fileName:  string,
  mimeType:  string,
  buffer:    Buffer | Uint8Array,
  folderId:  string,
  token:     string,
): Promise<UploadedFile> {
  const metadata = JSON.stringify({ name: fileName, parents: [folderId] });
  const boundary = "pancake_boundary_" + Date.now();

  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    metadata,
    `--${boundary}`,
    `Content-Type: ${mimeType}`,
    "",
    "",
  ].join("\r\n");

  // Build multipart body as Uint8Array
  const encoder    = new TextEncoder();
  const bodyStart  = encoder.encode(body);
  const bodyEnd    = encoder.encode(`\r\n--${boundary}--`);
  const combined   = new Uint8Array(bodyStart.length + buffer.length + bodyEnd.length);
  combined.set(bodyStart, 0);
  combined.set(buffer instanceof Buffer ? new Uint8Array(buffer) : buffer, bodyStart.length);
  combined.set(bodyEnd, bodyStart.length + buffer.length);

  const res = await fetch(
    `${UPLOAD_API}/files?uploadType=multipart&fields=id,name,webViewLink,size,mimeType`,
    {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: combined,
    }
  );

  if (!res.ok) throw new Error(`Drive upload failed: ${await res.text()}`);
  return res.json() as Promise<UploadedFile>;
}

/**
 * Upload an HTML document to Drive as a Google Doc.
 */
export async function uploadHtmlAsGoogleDoc(
  title:    string,
  html:     string,
  folderId: string,
  token:    string,
): Promise<UploadedFile> {
  const buffer = new TextEncoder().encode(html);
  const metadata = JSON.stringify({
    name:     title,
    parents:  [folderId],
    mimeType: "application/vnd.google-apps.document",
  });

  const boundary = "pancake_boundary_" + Date.now();
  const bodyStr  = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    metadata,
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "",
    "",
  ].join("\r\n");

  const encoder   = new TextEncoder();
  const bodyStart = encoder.encode(bodyStr);
  const bodyEnd   = encoder.encode(`\r\n--${boundary}--`);
  const combined  = new Uint8Array(bodyStart.length + buffer.length + bodyEnd.length);
  combined.set(bodyStart, 0);
  combined.set(buffer, bodyStart.length);
  combined.set(bodyEnd, bodyStart.length + buffer.length);

  const res = await fetch(
    `${UPLOAD_API}/files?uploadType=multipart&fields=id,name,webViewLink,size,mimeType`,
    {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: combined,
    }
  );

  if (!res.ok) throw new Error(`Drive doc upload failed: ${await res.text()}`);
  return res.json() as Promise<UploadedFile>;
}
