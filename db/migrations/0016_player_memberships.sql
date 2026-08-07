-- HSC membership is separate from player account/authentication/profile data.
--
-- A player account may exist without a membership row.
-- When a membership exists, there is at most one lifecycle record per account.
-- Business transition rules are enforced by the application layer.

CREATE TABLE IF NOT EXISTS player_memberships (
  id CHAR(36) PRIMARY KEY,
  player_account_id CHAR(36) NOT NULL,

  status ENUM(
    'inactive',
    'active',
    'suspended',
    'expired',
    'cancelled'
  ) NOT NULL DEFAULT 'inactive',

  plan_code VARCHAR(64) NOT NULL,

  source ENUM(
    'manual',
    'staff',
    'promotion',
    'subscription'
  ) NOT NULL,

  started_at DATETIME NULL,
  expires_at DATETIME NULL,
  suspended_at DATETIME NULL,
  cancelled_at DATETIME NULL,

  created_at DATETIME NOT NULL DEFAULT UTC_TIMESTAMP(),
  updated_at DATETIME NOT NULL
    DEFAULT UTC_TIMESTAMP()
    ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uniq_player_memberships_player_account_id (player_account_id),

  KEY idx_player_memberships_status (status),
  KEY idx_player_memberships_plan_code (plan_code),
  KEY idx_player_memberships_expires_at (expires_at),

  CONSTRAINT fk_player_memberships_player_account
    FOREIGN KEY (player_account_id)
    REFERENCES player_accounts(id)
    ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
