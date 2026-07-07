from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file='.env',
        env_file_encoding='utf-8',
        extra='ignore',
    )

    # AI keys — empty by default so the server starts; endpoints using them
    # will return 503 if not set.
    elevenlabs_api_key:  str = Field('', alias='ELEVENLABS_API_KEY')
    elevenlabs_voice_id: str = Field('21m00Tcm4TlvDq8ikWAM', alias='ELEVENLABS_VOICE_ID')
    groq_api_key:        str = Field('', alias='GROQ_API_KEY')
    groq_translate_model: str = Field('llama-3.1-8b-instant', alias='GROQ_TRANSLATE_MODEL')
    groq_stt_model:      str = Field('whisper-large-v3-turbo', alias='GROQ_STT_MODEL')

    # Premium tier (paid plans) — trial uses Groq only
    openai_api_key:       str = Field('', alias='OPENAI_API_KEY')
    openai_whisper_model: str = Field('whisper-1', alias='OPENAI_WHISPER_MODEL')
    gemini_api_key:       str = Field('', alias='GEMINI_API_KEY')
    gemini_translate_model: str = Field('gemini-2.0-flash', alias='GEMINI_TRANSLATE_MODEL')

    # Payments
    nowpayments_api_key:    str = Field('', alias='NOWPAYMENTS_API_KEY')
    nowpayments_ipn_secret: str = Field('', alias='NOWPAYMENTS_IPN_SECRET')

    # IBAN
    iban_account_holder: str = Field('VoiceBridge Ltd', alias='IBAN_ACCOUNT_HOLDER')
    iban_number:         str = Field('', alias='IBAN_NUMBER')
    iban_bic:            str = Field('', alias='IBAN_BIC')
    iban_bank_name:      str = Field('', alias='IBAN_BANK_NAME')

    server_public_url: str = Field('https://api.voicebridgeapps.com', alias='SERVER_PUBLIC_URL')
    website_url:       str = Field('https://voicebridgeapps.com',     alias='WEBSITE_URL')

    database_url:    str = Field('sqlite+aiosqlite:///./voicebridge.db', alias='DATABASE_URL')
    license_secret:  str = Field('changeme-set-in-railway', alias='LICENSE_SECRET')
    cors_origins:    str = Field(
        'https://voicebridgeapps.com,https://www.voicebridgeapps.com,http://localhost:3000',
        alias='CORS_ORIGINS',
    )
    server_port: int = Field(8000, alias='SERVER_PORT')

    # Firebase service account JSON (single-line JSON string)
    firebase_service_account_json: str = Field('', alias='FIREBASE_SERVICE_ACCOUNT_JSON')

    resend_api_key: str = Field('', alias='RESEND_API_KEY')
    email_from:     str = Field('VoiceBridge <noreply@voicebridgeapps.com>', alias='EMAIL_FROM')

    # Local dev only — set via Railway env var, defaults False in prod
    dev_unlimited_trial:     bool = Field(False, alias='DEV_UNLIMITED_TRIAL')
    dev_skip_license_verify: bool = Field(False, alias='DEV_SKIP_LICENSE_VERIFY')

    def get_cors_origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(',') if o.strip()]

settings = Settings()
