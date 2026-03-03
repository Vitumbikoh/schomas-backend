# Notification Channel Setup (Email + WhatsApp)

The backend now delivers notifications through real channels based on each user's saved preferences:

- `notifications.email = true` → sends email
- `notifications.whatsapp = true` → sends WhatsApp message

In-app/browser notifications still work as before.

## 1) Configure Email (SMTP)

Add these variables to your `schomas-backend/.env.development` (or `.env.production`):

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-username
SMTP_PASS=your-smtp-password
SMTP_FROM="Schomas Notifications <no-reply@yourdomain.com>"
SMTP_FROM_NAME="Schomas Notifications"
```

For SaaS multi-school behavior:

- Transport/auth still uses your platform SMTP account (`SMTP_*`).
- Sender identity is branded per school automatically:
   - `From`: `{{School Name}} via Schomas <platform-sender@...>`
   - `Reply-To`: school email from settings (`schoolSettings.schoolEmail`) when present

This gives clear school differentiation without requiring each school to manage SMTP credentials.

## 2) Configure WhatsApp (Meta Cloud API)

Add:

```env
WHATSAPP_ACCESS_TOKEN=your-meta-access-token
WHATSAPP_PHONE_NUMBER_ID=your-phone-number-id
WHATSAPP_API_VERSION=v20.0
WHATSAPP_API_BASE_URL=https://graph.facebook.com
WHATSAPP_DEFAULT_COUNTRY_CODE=254
```

`WHATSAPP_DEFAULT_COUNTRY_CODE` is used when a stored phone number starts with `0`.

## 3) Delivery behavior

When `NotificationService.create(...)` is called:

- Notification is saved in DB.
- Recipients are resolved from:
  - `metadata.targetUserId` (single user), or
  - `targetRoles` + `schoolId`, or
  - default admin/super-admin fallback.
- For each recipient, channel send respects preferences from `user_settings.notifications`.

## 4) Quick verification

1. Ensure user has:
   - valid email in `users.email` (for email channel)
   - valid phone in one of: `users.phone`, `teacher.phoneNumber`, `student.phoneNumber`, `parent.phoneNumber`, `finance.phoneNumber` (for WhatsApp channel)
2. Set preferences in UI:
   - enable Email Notifications and/or WhatsApp Notifications
3. Trigger an action that creates notifications (e.g. progression, payroll, expenses).
4. Confirm message is received on actual email/WhatsApp target.

If channel credentials are missing, the system skips that channel safely and still stores in-app notification.
