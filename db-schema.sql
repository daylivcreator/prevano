-- Prevano — schéma de base de données
-- À exécuter une fois sur ta base Postgres (Neon, Supabase, Vercel Postgres, etc.)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id                              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email                           TEXT        UNIQUE NOT NULL,
  password_hash                   TEXT        NOT NULL,
  first_name                      TEXT,
  plan                            TEXT        NOT NULL DEFAULT 'free'
                                              CHECK (plan IN ('free','starter','pro','premium')),
  stripe_customer_id              TEXT        UNIQUE,
  stripe_subscription_id          TEXT        UNIQUE,
  subscription_status             TEXT,
  subscription_current_period_end TIMESTAMPTZ,
  reset_token_hash                TEXT,
  reset_token_expires             TIMESTAMPTZ,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at                   TIMESTAMPTZ
);

-- Index pour les lookups fréquents
CREATE INDEX IF NOT EXISTS users_email_idx ON users (email);
CREATE INDEX IF NOT EXISTS users_stripe_customer_idx ON users (stripe_customer_id);
CREATE INDEX IF NOT EXISTS users_stripe_sub_idx ON users (stripe_subscription_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- Starter : entrées budget mensuelles
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS budget_entries (
  id         SERIAL PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month      VARCHAR(7)  NOT NULL,  -- format 'YYYY-MM'
  data       JSONB       NOT NULL,  -- {revenus:{...}, depenses:{...}, epargne:n, objectif:n}
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, month)
);
CREATE INDEX IF NOT EXISTS budget_entries_user_idx ON budget_entries (user_id, month DESC);

-- ──────────────────────────────────────────────────────────────────────────────
-- Coach Pro : historique des messages IA
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coach_messages (
  id         SERIAL PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       VARCHAR(10) NOT NULL CHECK (role IN ('user', 'assistant')),
  content    TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS coach_messages_user_idx ON coach_messages (user_id, created_at DESC);

-- ──────────────────────────────────────────────────────────────────────────────
-- Daily Finance : progression des leçons quotidiennes
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_progress (
  id           SERIAL PRIMARY KEY,
  user_id      UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_date  DATE    NOT NULL,
  lesson_index INTEGER NOT NULL CHECK (lesson_index BETWEEN 0 AND 27),
  completed    BOOLEAN NOT NULL DEFAULT FALSE,
  quiz_correct BOOLEAN,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, lesson_date)
);
CREATE INDEX IF NOT EXISTS daily_progress_user_idx ON daily_progress (user_id, lesson_date DESC);
