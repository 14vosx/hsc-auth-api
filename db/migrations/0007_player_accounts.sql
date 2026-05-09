-- Player Auth is separate from Admin Auth users/sessions.
CREATE TABLE IF NOT EXISTS player_accounts (
  id CHAR(36) PRIMARY KEY,
  status ENUM('active','disabled') NOT NULL DEFAULT 'active',
  display_name VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT UTC_TIMESTAMP(),
  updated_at DATETIME NOT NULL DEFAULT UTC_TIMESTAMP() ON UPDATE CURRENT_TIMESTAMP,
  disabled_at DATETIME NULL,
  KEY idx_player_accounts_status (status),
  KEY idx_player_accounts_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
