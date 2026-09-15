const SmsBatch = require('../../model/smsBatchModel');
const SmsLog = require('../../model/smsLogModel');
const { renderTemplate } = require('./templateEngine');
const { getActiveProvider } = require('./providers');

const CONCURRENCY = Number(process.env.SMS_BATCH_CONCURRENCY) || 5;
const PROGRESS_FLUSH_EVERY = 25;

// No Redis/BullMQ in this stack today, so this runs in-process with a concurrency
// cap instead of a real job queue. Good enough for current volumes; if this needs to
// survive server restarts or scale past a few thousand recipients per batch, swap this
// for a persisted queue (BullMQ+Redis) behind the same processBatch(batchId, recipients, template) signature.
const runWithConcurrency = async (items, worker, concurrency) => {
  let cursor = 0;

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const current = cursor++;
      await worker(items[current]);
    }
  });

  await Promise.all(runners);
};

// `template` is a raw message with {{placeholders}} rendered per-recipient. Pass
// template: null and give each recipient a precomputed `message` instead (used by retry).
const processBatch = async (batchId, recipients, template) => {
  console.log("<><>working")
  const provider = getActiveProvider();
  let sent = 0;
  let failed = 0;
  let processed = 0;

  const flushProgress = () => SmsBatch.updateOne({ _id: batchId }, { $set: { sentCount: sent, failedCount: failed } });

  await runWithConcurrency(
    recipients,
    async (recipient) => {
      const text = template ? renderTemplate(template, recipient.variables || {}) : recipient.message;

      const log = await SmsLog.create({
        batch_id: batchId,
        student_id: recipient.studentId,
        recipient_name: recipient.variables?.student_name,
        phone: recipient.phone,
        message: text,
        status: 'queued',
        provider: provider.name,
        location_id: recipient.locationId,
        dlt_template_id: recipient.templateId,
        dlt_variables: recipient.dltVariables,
        sender_id: recipient.senderId,
        template_key: recipient.templateKey,
        template_version: recipient.templateVersion,
      });

      try {
        // When the recipient carries a DLT template + ordered variables, force
        // the dlt route so this doesn't depend on FAST2SMS_ROUTE. Otherwise
        // (console/dev) fall back to a plain rendered-text send.
        const sendArgs = { to: recipient.phone, message: text };
        if (recipient.templateId) {
          sendArgs.route = 'dlt';
          sendArgs.templateId = recipient.templateId;
          sendArgs.variables = recipient.dltVariables;
          sendArgs.senderId = recipient.senderId;
        }

        const result = await provider.send(sendArgs);
        log.status = result.success ? 'sent' : 'failed';
        log.provider_response = result.raw;
        log.provider_message_id = result.raw?.request_id;
        if (!result.success) log.error = result.error || 'Unknown provider error';
        await log.save();
        result.success ? sent++ : failed++;
      } catch (error) {
        log.status = 'failed';
        log.error = error.message;
        await log.save();
        failed++;
      }

      processed++;
      if (processed % PROGRESS_FLUSH_EVERY === 0 || processed === recipients.length) {
        await flushProgress();
      }
    },
    CONCURRENCY
  );

  const status = failed === 0 ? 'completed' : sent === 0 ? 'failed' : 'completed_with_errors';
  await SmsBatch.updateOne({ _id: batchId }, { $set: { status, sentCount: sent, failedCount: failed, completedAt: new Date() } });
};

module.exports = { processBatch };
