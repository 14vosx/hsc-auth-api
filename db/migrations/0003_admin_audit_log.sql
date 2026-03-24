CREATE TABLE IF NOT EXISTS admin_audit_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  route VARCHAR(255) NOT NULL,
  method VARCHAR(16) NOT NULL,
  action VARCHAR(100) NOT NULL,
  via ENUM('session','admin-key') NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_admin_audit_log_user_id (user_id),
  KEY idx_admin_audit_log_action (action),
  KEY idx_admin_audit_log_created_at (created_at),
  CONSTRAINT fk_admin_audit_log_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
