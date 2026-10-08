-- NTalk patch for the database already created.
-- Run this ONCE in Supabase SQL Editor after the original supabase.sql.

-- Allow a chat creator to add the other participant.
drop policy if exists "Users can add themselves to chats" on public.chat_members;
create policy "Chat creators can add members"
on public.chat_members
for insert
to authenticated
with check (
  auth.uid() = user_id
  or exists (
    select 1 from public.chats c
    where c.id = chat_members.chat_id
      and c.created_by = auth.uid()
  )
);

-- Members can update delivery/seen state on messages in their chats.
create policy "Chat members can update delivery state"
on public.messages
for update
to authenticated
using (
  exists (
    select 1 from public.chat_members cm
    where cm.chat_id = messages.chat_id
      and cm.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.chat_members cm
    where cm.chat_id = messages.chat_id
      and cm.user_id = auth.uid()
  )
);

-- Make sure Realtime keeps full rows for message changes.
alter table public.messages replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
end $$;
