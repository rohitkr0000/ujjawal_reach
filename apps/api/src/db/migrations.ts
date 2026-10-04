/**
 * Database migrations, applied in order. Never edit a migration that has been released:
 * add a new one instead.
 */
export interface Migration {
  id: string;
  sql: string;
}

export const migrations: Migration[] = [
  {
    id: '001_core',
    sql: `
CREATE TABLE users (
  id uuid PRIMARY KEY,
  mobile text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE TABLE otp_requests (
  id uuid PRIMARY KEY,
  mobile text NOT NULL,
  code_hash text NOT NULL,
  ip text,
  attempts int NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX otp_requests_mobile_created ON otp_requests (mobile, created_at DESC);
CREATE INDEX otp_requests_ip_created ON otp_requests (ip, created_at DESC);

CREATE TABLE registrations (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  card_id text NOT NULL UNIQUE,
  mode text NOT NULL CHECK (mode IN ('personal', 'family')),
  state text NOT NULL,
  district text NOT NULL,
  house text NOT NULL,
  locality text NOT NULL,
  pincode text NOT NULL,
  family jsonb,
  consent_tracking boolean NOT NULL DEFAULT false,
  consent_at timestamptz NOT NULL DEFAULT now(),
  session_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX registrations_user ON registrations (user_id, created_at DESC);
CREATE INDEX registrations_created ON registrations (created_at);

CREATE TABLE family_members (
  id uuid PRIMARY KEY,
  registration_id uuid NOT NULL REFERENCES registrations (id) ON DELETE CASCADE,
  position int NOT NULL,
  name text NOT NULL,
  relation text NOT NULL,
  mobile text NOT NULL,
  gender text NOT NULL,
  age int NOT NULL,
  education text NOT NULL,
  occupation text NOT NULL,
  income int NOT NULL,
  category text NOT NULL,
  minority boolean NOT NULL DEFAULT false,
  special jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX family_members_registration ON family_members (registration_id, position);
`,
  },
  {
    id: '002_admin_schemes',
    sql: `
CREATE TABLE admins (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('super_admin', 'editor')),
  totp_secret text,
  totp_enabled boolean NOT NULL DEFAULT false,
  totp_last_step bigint NOT NULL DEFAULT 0,
  failed_attempts int NOT NULL DEFAULT 0,
  locked_until timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE TABLE schemes (
  id text PRIMARY KEY,
  state text NOT NULL,
  name text NOT NULL,
  sector text NOT NULL DEFAULT '',
  level text NOT NULL,
  scope text NOT NULL,
  gender_focus text NOT NULL,
  age_min int,
  age_max int,
  castes jsonb NOT NULL DEFAULT '[]'::jsonb,
  beneficiaries jsonb NOT NULL DEFAULT '[]'::jsonb,
  income_max int,
  education jsonb NOT NULL DEFAULT '[]'::jsonb,
  residence text NOT NULL,
  channel text NOT NULL,
  url text NOT NULL,
  description text NOT NULL DEFAULT '',
  description_hi text NOT NULL DEFAULT '',
  status text NOT NULL,
  last_verified text,
  source_note text NOT NULL DEFAULT '',
  review_status text NOT NULL,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE INDEX schemes_state_status ON schemes (state, status);

CREATE TABLE tags (
  tag text PRIMARY KEY,
  kind text NOT NULL DEFAULT 'auto',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE scheme_tags (
  scheme_id text NOT NULL REFERENCES schemes (id) ON DELETE CASCADE,
  tag text NOT NULL REFERENCES tags (tag) ON DELETE CASCADE,
  PRIMARY KEY (scheme_id, tag)
);
CREATE INDEX scheme_tags_tag ON scheme_tags (tag);

CREATE TABLE scheme_imports (
  id uuid PRIMARY KEY,
  state text,
  filename text NOT NULL,
  file_sha256 text NOT NULL,
  file_data bytea,
  admin_id uuid,
  status text NOT NULL CHECK (status IN ('preview', 'applied', 'cancelled', 'rolled_back', 'failed')),
  on_error text,
  rows_total int NOT NULL DEFAULT 0,
  rows_new int NOT NULL DEFAULT 0,
  rows_updated int NOT NULL DEFAULT 0,
  rows_unchanged int NOT NULL DEFAULT 0,
  rows_error int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz,
  rolled_back_at timestamptz
);
CREATE INDEX scheme_imports_created ON scheme_imports (created_at DESC);

CREATE TABLE scheme_import_rows (
  id bigserial PRIMARY KEY,
  import_id uuid NOT NULL REFERENCES scheme_imports (id) ON DELETE CASCADE,
  row_number int NOT NULL,
  scheme_id text,
  action text NOT NULL CHECK (action IN ('new', 'updated', 'unchanged', 'error')),
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  changed_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  data jsonb
);
CREATE INDEX scheme_import_rows_import ON scheme_import_rows (import_id, row_number);

CREATE TABLE scheme_versions (
  id bigserial PRIMARY KEY,
  scheme_id text NOT NULL,
  import_id uuid,
  admin_id uuid,
  action text NOT NULL CHECK (action IN ('insert', 'update', 'delete', 'rollback')),
  before jsonb,
  after jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX scheme_versions_scheme ON scheme_versions (scheme_id, id DESC);
CREATE INDEX scheme_versions_import ON scheme_versions (import_id);

CREATE TABLE published_schemes (
  state text PRIMARY KEY,
  version int NOT NULL,
  etag text NOT NULL,
  body text NOT NULL,
  built_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  ts timestamptz NOT NULL DEFAULT now(),
  admin_id uuid,
  admin_email text,
  action text NOT NULL,
  target text,
  details jsonb,
  ip text
);
CREATE INDEX audit_log_ts ON audit_log (ts DESC);
`,
  },
  {
    id: '003_analytics',
    sql: `
CREATE TABLE session_users (
  session_id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  linked_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE events (
  id bigserial PRIMARY KEY,
  ts timestamptz NOT NULL,
  session_id text NOT NULL,
  user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  type text NOT NULL,
  state text,
  scheme_id text,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  device text,
  props jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX events_ts ON events (ts);
CREATE INDEX events_type_ts ON events (type, ts);
CREATE INDEX events_scheme ON events (scheme_id, type);
CREATE INDEX events_session ON events (session_id);
CREATE INDEX events_user ON events (user_id, ts DESC);

CREATE TABLE daily_scheme_stats (
  day date NOT NULL,
  scheme_id text NOT NULL,
  state text,
  shown int NOT NULL DEFAULT 0,
  clicked int NOT NULL DEFAULT 0,
  PRIMARY KEY (day, scheme_id)
);

CREATE TABLE daily_tag_stats (
  day date NOT NULL,
  tag text NOT NULL,
  shown int NOT NULL DEFAULT 0,
  clicked int NOT NULL DEFAULT 0,
  PRIMARY KEY (day, tag)
);

CREATE TABLE daily_funnel_stats (
  day date NOT NULL,
  state text NOT NULL,
  step text NOT NULL,
  sessions int NOT NULL DEFAULT 0,
  PRIMARY KEY (day, state, step)
);
`,
  },
  {
    id: '004_no_otp',
    // Login by SMS was removed: people no longer sign in, they just submit the form.
    sql: `DROP TABLE IF EXISTS otp_requests;`,
  },
];
