CREATE TABLE IF NOT EXISTS whatsapp_message_log (
  id SERIAL PRIMARY KEY,
  sender_phone VARCHAR(20) NOT NULL,
  message_type VARCHAR(20) NOT NULL,
  message_body TEXT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_message_log_sender_phone
  ON whatsapp_message_log(sender_phone);

CREATE INDEX IF NOT EXISTS idx_whatsapp_message_log_timestamp
  ON whatsapp_message_log(timestamp DESC);
