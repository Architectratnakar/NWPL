import { env } from '../config/env';
import { AppError } from './http';

/**
 * SMS sender used for login OTPs. Choose the provider with SMS_PROVIDER in Backend/.env:
 *
 *   console   — no SMS; the OTP is printed in the server log (development / first setup)
 *   fast2sms  — https://www.fast2sms.com   (SMS_API_KEY; optional DLT: SMS_SENDER_ID + SMS_TEMPLATE_ID)
 *   msg91     — https://msg91.com          (SMS_API_KEY = authkey, SMS_TEMPLATE_ID = OTP template id)
 *   twilio    — https://www.twilio.com     (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM)
 *
 * India: commercial SMS needs a DLT-registered sender ID and template (TRAI). Fast2SMS's "otp" route and
 * MSG91's OTP API use their own pre-approved templates, which is the quickest way to start.
 */

/** "+91 72502 27201" / "917250227201" / "7250227201" → { cc: '91', local: '7250227201' } */
export function normalizeIndianMobile(raw: string) {
  const digits = raw.replace(/\D/g, '');
  const local = digits.slice(-10);
  const cc = digits.length > 10 ? digits.slice(0, digits.length - 10) : '91';
  return { cc, local, e164: `+${cc}${local}` };
}

export const maskMobile = (raw: string) => {
  const { cc, local } = normalizeIndianMobile(raw);
  return `+${cc} ${local.slice(0, 2)}•••••${local.slice(-3)}`;
};

async function post(url: string, init: RequestInit, provider: string) {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  } catch (e) {
    console.error(`SMS (${provider}) could not be reached:`, e);
    throw new AppError(502, 'SMS_FAILED', 'Could not send the OTP SMS (SMS gateway not reachable). Try again in a minute.');
  }
  const text = await res.text();
  if (!res.ok || /"return"\s*:\s*false|"type"\s*:\s*"error"/i.test(text)) {
    console.error(`SMS (${provider}) failed: HTTP ${res.status} ${text.slice(0, 300)}`);
    throw new AppError(502, 'SMS_FAILED', 'Could not send the OTP SMS. Check the SMS gateway settings in Backend/.env.');
  }
}

export async function sendOtpSms(to: string, otp: string, purpose: string) {
  const { cc, local, e164 } = normalizeIndianMobile(to);
  const text = `${otp} is your Navarth Wellness ${purpose} OTP. Valid for ${env.OTP_EXPIRY_MINUTES} minutes. Do not share it with anyone.`;

  switch (env.SMS_PROVIDER) {
    case 'console':
      console.log(`\n📱 [SMS → ${e164}] ${text}\n   (SMS_PROVIDER=console — set a real provider in Backend/.env to send SMS)\n`);
      return;

    case 'fast2sms': {
      if (!env.SMS_API_KEY) throw new AppError(500, 'SMS_NOT_CONFIGURED', 'SMS_API_KEY is not set for Fast2SMS');
      const dlt = env.SMS_SENDER_ID && env.SMS_TEMPLATE_ID;
      const body = dlt
        ? { route: 'dlt', sender_id: env.SMS_SENDER_ID, message: env.SMS_TEMPLATE_ID, variables_values: otp, numbers: local, flash: 0 }
        : { route: 'otp', variables_values: otp, numbers: local, flash: 0 };
      return post('https://www.fast2sms.com/dev/bulkV2', { method: 'POST', headers: { authorization: env.SMS_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 'fast2sms');
    }

    case 'msg91': {
      if (!env.SMS_API_KEY || !env.SMS_TEMPLATE_ID) throw new AppError(500, 'SMS_NOT_CONFIGURED', 'SMS_API_KEY and SMS_TEMPLATE_ID must be set for MSG91');
      const qs = new URLSearchParams({ template_id: env.SMS_TEMPLATE_ID, mobile: `${cc}${local}`, otp, otp_expiry: String(env.OTP_EXPIRY_MINUTES) });
      return post(`https://control.msg91.com/api/v5/otp?${qs}`, { method: 'POST', headers: { authkey: env.SMS_API_KEY, 'Content-Type': 'application/json' }, body: '{}' }, 'msg91');
    }

    case 'twilio': {
      if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM) throw new AppError(500, 'SMS_NOT_CONFIGURED', 'TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM must be set');
      const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64');
      return post(
        `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`,
        { method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ To: e164, From: env.TWILIO_FROM, Body: text }).toString() },
        'twilio',
      );
    }
  }
}
