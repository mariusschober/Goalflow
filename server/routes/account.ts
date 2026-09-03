import { Router } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { telegramIdentity } from './telegramAuth';

const userIdExportTables = [
  'profiles', 'tasks', 'daily_plans', 'task_events', 'telegram_identities', 'telegram_captures',
  'sync_records', 'sync_mutations', 'sync_conflicts', 'api_mutation_receipts', 'ai_usage',
  'entitlements', 'backup_metadata'
] as const;

export const createAccountRouter = (admin?: SupabaseClient, telegramProviderId = 'custom:telegram') => {
  const router = Router();

  router.get('/account/export', async (request, response) => {
    if (!admin) return response.status(503).json({ error: { code: 'not_configured', message: 'Account export is not configured.' } });
    try {
      const collections: Record<string, unknown> = {};
      for (const table of userIdExportTables) {
        const { data, error } = await admin.from(table).select('*').eq('user_id', request.user!.id);
        if (error) throw error;
        collections[table] = data ?? [];
      }
      const { data: inviteCodes, error: inviteError } = await admin.from('invite_codes')
        .select('*').eq('created_by', request.user!.id);
      const { data: inviteRedemptions, error: redemptionError } = await admin.from('invite_redemptions')
        .select('*').eq('auth_user_id', request.user!.id);
      const { data: emailAttempts, error: attemptError } = await admin.from('email_auth_attempts')
        .select('id,invite_id,email,state,expires_at,auth_user_id,created_at,used_at')
        .eq('auth_user_id', request.user!.id);
      if (inviteError || redemptionError || attemptError) throw inviteError || redemptionError || attemptError;
      collections.invite_codes = inviteCodes ?? [];
      collections.invite_redemptions = inviteRedemptions ?? [];
      collections.email_auth_attempts = emailAttempts ?? [];
      const telegramIds = (collections.telegram_identities as Array<{ telegram_user_id?: number }> ?? [])
        .map(identity => identity.telegram_user_id)
        .filter((value): value is number => Number.isSafeInteger(value));
      if (telegramIds.length) {
        const { data: updates, error: updateError } = await admin.from('telegram_updates')
          .select('*').in('telegram_user_id', telegramIds);
        if (updateError) throw updateError;
        collections.telegram_updates = updates ?? [];
      } else {
        collections.telegram_updates = [];
      }
      return response.json({ schemaVersion: 3, exportedAt: new Date().toISOString(), collections });
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

  router.delete('/account', (_request, response) => {
    return response.status(409).json({
      error: {
        code: 'account_deletion_disabled',
        message: 'Self-service deletion is disabled during beta until the database and backup removal can commit safely together.'
      }
    });
  });

  return router;
};
