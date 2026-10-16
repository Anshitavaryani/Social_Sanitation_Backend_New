-- Role ids the code uses (src/config/roles.js, ROLE and ROLE_NAMES); 4 is kept so the ids stay in
-- line but nothing uses it. tests/roles.test.js checks this file against ROLE_NAMES.
INSERT INTO `roles` (`id`, `name`, `abbreviation`, `is_active`, `created_at`, `updated_at`, `deleted_at`) VALUES
(1, 'Super Admin', 'SUP_ADM', 1, '2023-05-30 19:24:35', '2023-09-18 16:19:06', NULL),
(2, 'Admin', 'ADM', 1, '2023-05-30 19:24:41', '2023-05-30 19:24:41', NULL),
(3, 'Operations Administrator', 'OPS_ADM', 1, '2023-05-30 19:25:04', '2023-05-30 19:25:04', NULL),
(4, 'Engineer', 'ENG', 1, '2023-05-30 19:25:10', '2023-05-30 19:25:10', NULL),
(5, 'BDM', 'BDM', 1, '2023-05-30 19:25:16', '2023-05-30 19:25:16', NULL),
(6, 'Client', 'CLT', 1, '2023-09-18 16:21:08', '2023-10-02 08:08:48', NULL),
(7, 'Supervisor', 'SUP', 1, '2026-10-16 00:00:00', '2026-10-16 00:00:00', NULL),
(8, 'Quality Inspector', 'QI', 1, '2026-10-16 00:00:00', '2026-10-16 00:00:00', NULL),
(9, 'Cleaner', 'CLN', 1, '2026-10-16 00:00:00', '2026-10-16 00:00:00', NULL),
(10, 'Janitor', 'JAN', 1, '2026-10-16 00:00:00', '2026-10-16 00:00:00', NULL),
(11, 'Housekeeping', 'HSK', 1, '2026-10-16 00:00:00', '2026-10-16 00:00:00', NULL);
