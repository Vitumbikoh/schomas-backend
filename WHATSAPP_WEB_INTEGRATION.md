# EduNexus WhatsApp Integration (whatsapp-web.js)

This backend now includes a free WhatsApp integration using `whatsapp-web.js` and `qrcode-terminal`.

## What was added

- WhatsApp module and chatbot command handling:
  - `src/whatsapp/whatsapp.module.ts`
  - `src/whatsapp/whatsapp.service.ts`
  - `src/whatsapp/whatsapp.controller.ts`
  - `src/whatsapp/dto/send-whatsapp-message.dto.ts`
  - `src/whatsapp/dto/send-announcement.dto.ts`
  - `src/whatsapp/dto/event-notification.dto.ts`
- Root module wiring:
  - `src/app.module.ts`
- Notification delivery integration switched to WhatsApp Web client:
  - `src/notifications/notification.module.ts`
  - `src/notifications/notification-delivery.service.ts`

## Install dependencies

If dependencies are not installed yet:

```bash
npm install whatsapp-web.js qrcode-terminal
npm install -D @types/qrcode-terminal
```

## Environment variables

Add these to your `.env.development` (or active env file):

```env
WHATSAPP_ENABLED=true
WHATSAPP_DEFAULT_COUNTRY_CODE=265
WHATSAPP_CLIENT_ID=edunexus
WHATSAPP_AUTH_PATH=.wwebjs_auth
WHATSAPP_HEADLESS=true
WHATSAPP_QR_SMALL=true
# Optional fallback if terminal QR is too cramped:
# WHATSAPP_PAIRING_NUMBER=26599XXXXXXX
```

Notes:
- `WHATSAPP_AUTH_PATH` stores persistent session credentials.
- `WHATSAPP_HEADLESS=false` is useful during first setup/debug.
- `WHATSAPP_QR_SMALL=true` keeps the terminal QR in compact mode.
- `WHATSAPP_PAIRING_NUMBER` prints a WhatsApp pairing code in logs so you can link without scanning QR.

## Start backend and authenticate

1. Start backend:

```bash
npm run start:dev
```

2. Watch terminal for QR output from `qrcode-terminal`.
3. Open WhatsApp on phone:
   - Settings -> Linked Devices -> Link a Device
4. Scan QR.
5. Wait for log: `WhatsApp client is ready.`

Session persists across restarts via `LocalAuth`.

## Chatbot commands (WhatsApp user side)

Send to the linked WhatsApp account:

- `hi` (or `help`, `menu`)
- `results` or `1`
- `balance` or `2`
- `attendance` or `3`
- `announcements` or `4`

Unknown or unregistered phone numbers receive:

`This number is not registered in EduNexus.`

## Security behavior

- Phone number is resolved against registered user/student/parent/teacher/finance phones.
- Only active registered users can query data.
- Student-specific data (`results`, `balance`) is restricted to student-linked accounts (student or parent).

## Automated notification functions

Available in `WhatsAppService`:

- `sendWhatsAppMessage(phone, message)`
- `sendResultsPublishedNotification(phone, studentName?)`
- `sendFeeReminderNotification(phone, studentName?, customMessage?)`
- `sendAttendanceAlertNotification(phone, studentName?, customMessage?)`
- `sendAnnouncement(message, schoolId?, targetRoles?)`

## Admin API endpoints

All routes are under `/whatsapp` and use JWT + role guards.

- `GET /whatsapp/status`
- `POST /whatsapp/send`
- `POST /whatsapp/announce`
- `POST /whatsapp/notify/results-published`
- `POST /whatsapp/notify/fee-reminder`
- `POST /whatsapp/notify/attendance-alert`

Example payload (`POST /whatsapp/send`):

```json
{
  "phone": "265992453357",
  "message": "Hello Matthews, your exam results are now available on EduNexus."
}
```

## Automated notifications through existing notification flow

`NotificationDeliveryService` now uses `WhatsAppService` for WhatsApp delivery. If WhatsApp client is not ready, WhatsApp messages are skipped and delivery notes are recorded.

## Troubleshooting

- If build/start succeeds but no QR appears:
  - Ensure `WHATSAPP_ENABLED=true`
  - Remove stale auth folder and restart:
    - delete `.wwebjs_auth`
- If send fails with "client not ready":
  - Re-scan QR and confirm `ready` log.
- If install fails on Windows with `EBUSY`:
  - stop processes using backend `node_modules` (usually dev server), then run install again.
