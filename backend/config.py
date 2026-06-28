import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    ELEVENLABS_API_KEY: str = os.getenv("ELEVENLABS_API_KEY", "")
    ELEVENLABS_VOICE_ID: str = os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")
    # Inbound Türkçe TTS için ayrı ses — Charlotte multilingual (Türkçe destekli)
    ELEVENLABS_INBOUND_VOICE_ID: str = os.getenv("ELEVENLABS_INBOUND_VOICE_ID", "XB0fDUnXU5powFXDhCwa")
    BACKEND_HOST: str = os.getenv("BACKEND_HOST", "0.0.0.0")
    BACKEND_PORT: int = int(os.getenv("BACKEND_PORT", "8000"))

    def validate(self) -> None:
        if not self.GROQ_API_KEY:
            raise ValueError("GROQ_API_KEY eksik.")
        if not self.ELEVENLABS_API_KEY:
            raise ValueError("ELEVENLABS_API_KEY eksik.")


settings = Settings()
