ALTER TABLE admin_audit_log
  MODIFY COLUMN via ENUM('session','admin-key','system') NOT NULL,
  ADD COLUMN entity_type VARCHAR(50) NULL,
  ADD COLUMN entity_key VARCHAR(64) NULL;
