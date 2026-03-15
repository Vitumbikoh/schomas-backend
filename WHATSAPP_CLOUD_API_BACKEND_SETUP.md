# EduNexus WhatsApp Cloud API Backend Setup

This implementation supports user-initiated WhatsApp chats only and processes inbound webhook events from Meta WhatsApp Cloud API.

## 1. Configure environment variables

Use values from `.env.whatsapp.example`:

- `WHATSAPP_API_TOKEN`
- `WHATSAPP_PHONE_ID`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_API_URL` (default: `https://graph.facebook.com/v22.0`)

Optional aliases for older setups are also supported:

- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_API_BASE_URL` + `WHATSAPP_API_VERSION`

## 2. Create message log table

Run:

- `migrations/20260315_create_whatsapp_message_log.sql`

Table created:

- `whatsapp_message_log(id, sender_phone, message_type, message_body, timestamp)`

## 3. Webhook endpoints

- Verification: `GET /whatsapp/webhook`
- Inbound messages: `POST /whatsapp/webhook`

### Verification behavior

The backend compares `hub.verify_token` with `WHATSAPP_VERIFY_TOKEN`.

If valid, it returns `hub.challenge` with HTTP 200.

## 4. Message handling behavior

For each inbound WhatsApp message:

1. Sender phone is normalized.
2. Incoming message is logged into `whatsapp_message_log`.
3. Number is validated against `student.phoneNumber`, then `parent.phoneNumber`.
4. Unknown numbers receive: `This number is not registered in EduNexus.`
5. 24-hour session is enforced from latest incoming text record.
6. If outside session window, reply: `Please send a new message to start a session.`
7. Outgoing message attempts and failures are logged.

## 5. Testing with ngrok

1. Start backend:
   - `npm run start:dev`
2. Expose server:
   - `ngrok http 5000`
3. In Meta App webhook settings, set callback URL:
   - `https://<ngrok-id>.ngrok.io/whatsapp/webhook`
4. Set verify token to your `WHATSAPP_VERIFY_TOKEN`.
5. Subscribe to `messages` webhook field.
6. Send a WhatsApp message from a registered student/parent phone.
7. Check logs in `whatsapp_message_log`.

## 6. Optional direct send usage (service method)

`WhatsAppService.sendMessage()` supports:

- Text payloads
- Template payloads (`templateName`, `languageCode`, `templateVariables`)
- Optional 24-hour session enforcement toggle (`enforceSessionWindow`)

## 7. Security notes

- Keep tokens only in env files and secret managers.
- Do not commit production tokens.
- Restrict webhook URL exposure to trusted environments.
