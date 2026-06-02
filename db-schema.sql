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
