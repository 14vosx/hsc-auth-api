ALTER TABLE magic_links
  ADD INDEX idx_magic_links_used_at (used_at);