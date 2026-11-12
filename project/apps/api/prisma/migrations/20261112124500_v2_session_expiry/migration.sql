INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt", "createdAt")
VALUES (
    'changelog-20261112-v2-session-expiry',
    'Return safely to sign-in when a session expires',
    'When an application session expires, the app clears the server-issued sign-in token, stops authenticated polling, and returns to Login with a short message. After signing in again, users can resume a validated internal page; permission denials remain distinct from expired sessions.',
    '2026-11-12T12:45:00.000Z',
    '2026-11-12T12:45:00.000Z'
);
