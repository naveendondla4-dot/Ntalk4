# NTalk Advanced Fixed

This version was checked against the existing Supabase schema and fixes the frontend/database mismatch.

## Important fixes
- Uses `messages.chat_id` + `chat_members` (the schema you already created).
- Removes the broken `receiver_id`, `file_url`, and `file_type` assumptions from the old frontend.
- Adds a visible **People** directory so registered users appear even before a conversation exists.
- Creates a real private chat and adds both members.
- Realtime messages are scoped to the chat.
- Typing uses Supabase Broadcast.
- Online/offline uses Supabase Presence.
- Delivered/seen timestamps are written to the message row.
- Media is stored in the private `ntalk-media` bucket and displayed with signed URLs.
- Voice/video calling uses WebRTC + Google STUN. TURN may be required on some networks.
- PWA files are kept in the root.

## Deploy
All files are in the repository root:
`index.html`, `app.js`, `style.css`, `config.js`, `supabase_patch.sql`, `manifest.json`, `sw.js`, `icon.svg`, `README.md`.

### Supabase
1. You already ran the original `supabase.sql`.
2. Now run **supabase_patch.sql once** in SQL Editor.
3. Keep your `ntalk-media` bucket and its authenticated upload/view policies.
4. Deploy the root files over HTTPS.

## Security
`config.js` contains only the browser-safe Publishable key. Never put a service_role/secret key in frontend code.
