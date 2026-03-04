# HSC — MariaDB Schema Snapshot

- snapshot_date_utc: 2026-03-04
- tag: localtest
- db: hsc@127.0.0.1:3307/hsc_auth
- env_file: .env.local

## Server Version
```
11.4.10-MariaDB-ubu2404
```

## Collations (collation%)
```
Variable_name	Value
collation_connection	utf8mb3_general_ci
collation_database	utf8mb4_uca1400_ai_ci
collation_server	utf8mb4_uca1400_ai_ci
```

## Tables (ordered)

- `admin_audit_log`
- `magic_links`
- `news`
- `profiles`
- `schema_meta`
- `seasons`
- `sessions`
- `users`

## Critical tables check

- [OK] `users`
- [OK] `sessions`
- [OK] `magic_links`
- [OK] `news`
- [OK] `seasons`
- [OK] `admin_audit_log`
- [OK] `schema_meta`
- [MISSING] `active_season`

## DDL (SHOW CREATE TABLE)

### `admin_audit_log`
```sql
*************************** 1. row ***************************
       Table: admin_audit_log
Create Table: CREATE TABLE `admin_audit_log` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `route` varchar(255) NOT NULL,
  `method` varchar(10) NOT NULL,
  `action` varchar(100) NOT NULL,
  `via` enum('session','admin-key') NOT NULL,
  `created_at` datetime NOT NULL DEFAULT utc_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_admin_audit_created_at` (`created_at`),
  KEY `idx_admin_audit_route` (`route`),
  KEY `idx_admin_audit_user_id` (`user_id`),
  CONSTRAINT `fk_admin_audit_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci
```

### `magic_links`
```sql
*************************** 1. row ***************************
       Table: magic_links
Create Table: CREATE TABLE `magic_links` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `token_hash` char(64) NOT NULL,
  `expires_at` datetime NOT NULL,
  `used_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT utc_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_magic_links_token_hash` (`token_hash`),
  KEY `idx_magic_links_expires_at` (`expires_at`),
  KEY `idx_magic_links_user_id` (`user_id`),
  CONSTRAINT `fk_magic_links_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci
```

### `news`
```sql
*************************** 1. row ***************************
       Table: news
Create Table: CREATE TABLE `news` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `slug` varchar(255) NOT NULL,
  `title` varchar(255) NOT NULL,
  `excerpt` text DEFAULT NULL,
  `content` longtext NOT NULL,
  `image_url` varchar(500) DEFAULT NULL,
  `status` enum('draft','published') DEFAULT 'draft',
  `published_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci
```

### `profiles`
```sql
*************************** 1. row ***************************
       Table: profiles
Create Table: CREATE TABLE `profiles` (
  `user_id` int(11) NOT NULL,
  `bio` text DEFAULT NULL,
  `discord` varchar(255) DEFAULT NULL,
  `role_in_game` varchar(100) DEFAULT NULL,
  `favorite_map` varchar(100) DEFAULT NULL,
  `favorite_weapon` varchar(100) DEFAULT NULL,
  `bio_public` tinyint(1) DEFAULT 1,
  `discord_public` tinyint(1) DEFAULT 0,
  `timezone` varchar(100) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_profiles_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci
```

### `schema_meta`
```sql
*************************** 1. row ***************************
       Table: schema_meta
Create Table: CREATE TABLE `schema_meta` (
  `version` int(11) NOT NULL,
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci
```

### `seasons`
```sql
*************************** 1. row ***************************
       Table: seasons
Create Table: CREATE TABLE `seasons` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `slug` varchar(64) NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `start_at` datetime NOT NULL,
  `end_at` datetime NOT NULL,
  `status` enum('draft','active','closed') DEFAULT 'draft',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `slug` (`slug`),
  KEY `idx_seasons_status` (`status`),
  KEY `idx_seasons_start_at` (`start_at`),
  KEY `idx_seasons_end_at` (`end_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci
```

### `sessions`
```sql
*************************** 1. row ***************************
       Table: sessions
Create Table: CREATE TABLE `sessions` (
  `id` char(36) NOT NULL,
  `user_id` int(11) NOT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT utc_timestamp(),
  `ip_address` varchar(64) DEFAULT NULL,
  `user_agent` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_sessions_user_id` (`user_id`),
  KEY `idx_sessions_expires_at` (`expires_at`),
  CONSTRAINT `fk_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci
```

### `users`
```sql
*************************** 1. row ***************************
       Table: users
Create Table: CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `email` varchar(255) NOT NULL,
  `display_name` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `steamid64` varchar(32) DEFAULT NULL,
  `role` enum('user','editor','admin') NOT NULL DEFAULT 'user',
  `premium` tinyint(1) NOT NULL DEFAULT 0,
  `bio` text DEFAULT NULL,
  `favorite_map` varchar(64) DEFAULT NULL,
  `favorite_weapon` varchar(64) DEFAULT NULL,
  `game_role` varchar(64) DEFAULT NULL,
  `timezone` varchar(64) NOT NULL DEFAULT 'UTC',
  `status` enum('active','blocked') NOT NULL DEFAULT 'active',
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `uniq_users_steamid64` (`steamid64`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci
```

