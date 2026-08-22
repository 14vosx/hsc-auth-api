-- Membership Plans and Entitlements foundation catalogue.
--
-- Entitlements define granular feature access rights.
-- Membership plans group entitlements under a plan_code.
-- player_memberships.plan_code is intentionally decoupled (no foreign key constraint in this phase).

CREATE TABLE IF NOT EXISTS membership_plans (
  plan_code VARCHAR(64) PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  description VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT UTC_TIMESTAMP(),
  updated_at DATETIME NOT NULL
    DEFAULT UTC_TIMESTAMP()
    ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS entitlements (
  entitlement_key VARCHAR(64) PRIMARY KEY,
  description VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT UTC_TIMESTAMP(),
  updated_at DATETIME NOT NULL
    DEFAULT UTC_TIMESTAMP()
    ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS membership_plan_entitlements (
  plan_code VARCHAR(64) NOT NULL,
  entitlement_key VARCHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT UTC_TIMESTAMP(),

  PRIMARY KEY (plan_code, entitlement_key),

  KEY idx_membership_plan_entitlements_entitlement (entitlement_key),

  CONSTRAINT fk_membership_plan_entitlements_plan
    FOREIGN KEY (plan_code)
    REFERENCES membership_plans(plan_code)
    ON DELETE CASCADE,

  CONSTRAINT fk_membership_plan_entitlements_entitlement
    FOREIGN KEY (entitlement_key)
    REFERENCES entitlements(entitlement_key)
    ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- Baseline Plan: member
INSERT INTO membership_plans (plan_code, name, description)
VALUES ('member', 'Member', 'Baseline HSC membership plan')
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- Baseline Entitlements
INSERT INTO entitlements (entitlement_key, description)
VALUES
  ('portal.theme.select', 'Select portal theme'),
  ('mix.create', 'Create mix match rooms'),
  ('mix.participate', 'Participate in mix match rooms'),
  ('server.join', 'Join dedicated game servers'),
  ('analytics.advanced', 'Access advanced player analytics'),
  ('profile.premium', 'Premium profile customization'),
  ('season.participate', 'Participate in competitive seasons'),
  ('discord.member', 'Discord member role and access')
ON DUPLICATE KEY UPDATE description = VALUES(description);

-- Baseline Plan Entitlements: member -> 8 entitlements
INSERT INTO membership_plan_entitlements (plan_code, entitlement_key)
VALUES
  ('member', 'portal.theme.select'),
  ('member', 'mix.create'),
  ('member', 'mix.participate'),
  ('member', 'server.join'),
  ('member', 'analytics.advanced'),
  ('member', 'profile.premium'),
  ('member', 'season.participate'),
  ('member', 'discord.member')
ON DUPLICATE KEY UPDATE plan_code = VALUES(plan_code);
