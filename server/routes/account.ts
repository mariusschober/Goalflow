import { Router } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { telegramIdentity } from './telegramAuth';

const exportTables = [
  'profiles', 'tasks', 'daily_plans', 'task_events', 'telegram_identities', 'telegram_captures',
  'sync_records', 'sync_mutations', 'sync_conflicts', 'ai_usage', 'entitlements', 'backup_metadata'
] as const;

export const createAccountRouter = (admin?: SupabaseClient, telegramProviderId = 'custom:telegram') => {
  const router = Router();

  router.get('/account/export', async (request, response) => {
    if (!admin) return response.status(503).json({ error: { code: 'not_configured', message: 'Account export is not configured.' } });
    try {
      const collections: Record<string, unknown> = {};
      for (const table of exportTables) {
        const { data, error } = await admin.from(table).select('*').eq('user_id', request.user!.id);
        if (error) throw error;
        collections[table] = data ?? [];
      }
      return response.json({ schemaVersion: 2, exportedAt: new Date().toISOString(), collections });
    } catch {
      return response.status(500).json({ error: { code: 'account_export_failed', message: 'Account data could not be exported.' } });
    }
  });

  router.post('/account/telegram/link', async (request, response) => {
    if (!admin) return response.status(503).json({ error: { code: 'not_configured', message: 'Telegram linking is not configured.' } });
    if (request.user?.role !== 'owner') return response.status(403).json({ error: { code: 'owner_required', message: 'Only the owner can use this linking flow.' } });
    try {
      const { data, error } = await admin.auth.admin.getUserById(request.user.id);
      if (error || !data.user) throw error || new Error('Auth user missing.');
      const identity = telegramIdentity(data.user, telegramProviderId);
      if (!identity) return response.status(409).json({ error: { code: 'telegram_identity_missing', message: 'Complete Telegram authorization before linking the bot.' } });
      const { data: existing } = await admin.from('telegram_identities').select('user_id')
        .eq('telegram_user_id', identity.id).maybeSingle();
      if (existing && existing.user_id !== request.user.id) {
        return response.status(409).json({ error: { code: 'telegram_identity_in_use', message: 'This Telegram identity is already linked to another Goalflow account.' } });
      }
      const { error: linkError } = await admin.from('telegram_identities').upsert({
        telegram_user_id: identity.id,
        user_id: request.user.id,
        telegram_username: identity.username || null,
        bot_access_granted: true,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });
      if (linkError) throw linkError;
      return response.json({ linked: true, username: identity.username || null });
    } catch {
      return response.status(500).json({ error: { code: 'telegram_link_failed', message: 'Telegram could not be linked to the owner account.' } });
    }
  });

  router.delete('/account', async (request, response) => {
    if (!admin) return response.status(503).json({ error: { code: 'not_configured', message: 'Account deletion is not configured.' } });
    try {
      z.object({ confirmation: z.literal('DELETE') }).parse(request.body);
      const { data: backups, error: backupQueryError } = await admin.from('backup_metadata').select('object_path').eq('user_id', request.user!.id);
      if (backupQueryError) throw backupQueryError;
      const { data: telegramIdentities, error: telegramQueryError } = await admin.from('telegram_identities').select('telegram_user_id').eq('user_id', request.user!.id);
      if (telegramQueryError) throw telegramQueryError;
      if (backups?.length) {
        const { error: removeError } = await admin.storage.from('goalflow-backups').remove(backups.map(item => item.object_path));
        if (removeError) throw removeError;
      }
      if (telegramIdentities?.length) {
        const { error: updateDeleteError } = await admin.from('telegram_updates').delete()
          .in('telegram_user_id', telegramIdentities.map(item => item.telegram_user_id));
        if (updateDeleteError) throw updateDeleteError;
      }
      const { error: redemptionDeleteError } = await admin.from('invite_redemptions').delete().eq('auth_user_id', request.user!.id);
      if (redemptionDeleteError) throw redemptionDeleteError;
      const { error: profileError } = await admin.from('profiles').update({ status: 'deleted', updated_at: new Date().toISOString() }).eq('user_id', request.user!.id);
      if (profileError) throw profileError;
      const { error: deleteError } = await admin.auth.admin.deleteUser(request.user!.id);
      if (deleteError) {
        await admin.from('profiles').update({ status: 'active', updated_at: new Date().toISOString() }).eq('user_id', request.user!.id);
        throw deleteError;
      }
      return response.status(204).end();
    } catch (error) {
      if (error instanceof z.ZodError) return response.status(400).json({ error: { code: 'confirmation_required', message: 'Type DELETE to confirm account deletion.' } });
      return response.status(500).json({ error: { code: 'account_delete_failed', message: 'The account could not be deleted.' } });
    }
  });

  return router;
};
