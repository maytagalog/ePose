export type ShareEmailValidationMode = 'ui-send-confirmation' | 'full-inbox-guest';

export const SHARE_EMAIL_UI_SEND_CONFIRMATION_LABEL = 'Share email — UI send confirmation';

export const SHARE_EMAIL_EXCLUDED_FROM_UI_MODE = [
    'inbox delivery (Gmail)',
    'guest report verification',
] as const;