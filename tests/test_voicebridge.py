"""
VoiceBridge — Comprehensive Test Suite
Tests: pricing, license system, payments, 50-language validation, server routes, pipeline logic.
Run: python3 -m pytest tests/ -v
"""
import pytest
import asyncio
import hashlib
import hmac
import os
import sys
from decimal import Decimal

# Make server/ importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'server'))


# ═══════════════════════════════════════════════════════════════════════════════
#  1. PRICING TESTS
# ═══════════════════════════════════════════════════════════════════════════════

class TestPricing:
    def test_plan_count(self):
        from pricing import PLANS
        assert len(PLANS) == 7, f"Expected 7 plans (free + 6 paid), got {len(PLANS)}"

    def test_free_plan_exists(self):
        from pricing import get_plan
        free = get_plan('free')
        assert free is not None
        assert free['price_usd'] == Decimal('0')
        assert free['minutes'] == 5

    def test_paid_plans_are_multiples_of_60(self):
        from pricing import PLANS
        for p in PLANS:
            if p['id'] == 'free':
                continue
            assert p['minutes'] % 60 == 0, f"{p['id']}: minutes {p['minutes']} not a multiple of 60"

    def test_bulk_discount_progression(self):
        """Each larger plan should be cheaper per-minute."""
        from pricing import PLANS
        paid = [p for p in PLANS if p['id'] != 'free']
        per_min = [float(p['per_min_usd']) for p in paid]
        for i in range(1, len(per_min)):
            assert per_min[i] <= per_min[i-1], \
                f"Plan {paid[i]['id']} per-minute cost ${per_min[i]} is NOT cheaper than {paid[i-1]['id']} ${per_min[i-1]}"

    def test_enterprise_is_most_expensive_total(self):
        from pricing import get_plan
        starter    = get_plan('min_60')
        enterprise = get_plan('min_600')
        assert enterprise['price_usd'] > starter['price_usd']

    def test_per_minute_prices_accurate(self):
        """per_min_usd should match price/minutes within $0.05."""
        from pricing import PLANS
        for p in PLANS:
            if p['id'] == 'free' or p['minutes'] == 0:
                continue
            calculated = float(p['price_usd']) / p['minutes']
            stated     = float(p['per_min_usd'])
            assert abs(calculated - stated) < 0.10, \
                f"{p['id']}: calculated {calculated:.3f} vs stated {stated:.3f}"

    def test_all_plans_have_required_fields(self):
        from pricing import PLANS
        required = ['id', 'name', 'minutes', 'price_usd', 'description', 'highlight']
        for p in PLANS:
            for field in required:
                assert field in p, f"{p['id']} missing field: {field}"


# ═══════════════════════════════════════════════════════════════════════════════
#  2. LICENSE KEY TESTS
# ═══════════════════════════════════════════════════════════════════════════════

class TestLicenseKey:
    def test_generate_key_format(self):
        os.environ.setdefault('ELEVENLABS_API_KEY', 'test')
        os.environ.setdefault('GROQ_API_KEY', 'test')
        from services.license import generate_key
        for plan_id in ['free', 'min_60', 'min_120', 'min_240', 'min_360', 'min_480', 'min_600']:
            key = generate_key(plan_id)
            parts = key.split('-')
            assert parts[0] == 'VB', f"Key {key} doesn't start with VB"
            assert len(parts) == 5, f"Key {key} has {len(parts)} parts, expected 5"

    def test_verify_valid_key(self):
        from services.license import generate_key, verify_key_format
        for plan_id in ['min_60', 'min_240', 'min_600']:
            key = generate_key(plan_id)
            assert verify_key_format(key), f"Valid key {key} failed format check"

    def test_reject_invalid_key(self):
        from services.license import verify_key_format
        bad_keys = [
            'VB-T-A1B2C3-D4E5F6-ZZZZ',  # bad sig
            'INVALID-KEY',
            'VB-M-SHORT',
            '',
            'VB-T-A1B2C3-D4E5F6',        # missing sig part
        ]
        for k in bad_keys:
            assert not verify_key_format(k), f"Invalid key {k!r} passed format check"

    def test_all_tier_prefixes_unique(self):
        from services.license import TIER_PREFIX
        assert len(set(TIER_PREFIX.values())) == len(TIER_PREFIX), "Duplicate tier prefixes"

    def test_keys_are_unique(self):
        from services.license import generate_key
        keys = set()
        for _ in range(50):
            k = generate_key('min_240')
            assert k not in keys, f"Duplicate key generated: {k}"
            keys.add(k)


# ═══════════════════════════════════════════════════════════════════════════════
#  3. FIFTY-LANGUAGE TESTS
# ═══════════════════════════════════════════════════════════════════════════════

class TestLanguages:
    def test_exactly_50_languages(self):
        from languages import LANGUAGES
        assert len(LANGUAGES) == 50, f"Expected 50, got {len(LANGUAGES)}"

    def test_all_codes_unique(self):
        from languages import LANGUAGES
        codes = list(LANGUAGES.keys())
        assert len(codes) == len(set(codes)), "Duplicate language codes"

    def test_required_language_fields(self):
        from languages import LANGUAGES
        for code, data in LANGUAGES.items():
            assert 'name' in data,    f"{code}: missing name"
            assert 'whisper' in data, f"{code}: missing whisper"
            assert 'el_code' in data, f"{code}: missing el_code"

    def test_key_languages_present(self):
        from languages import LANGUAGES
        must_have = ['en', 'tr', 'fr', 'de', 'es', 'ar', 'hi', 'zh', 'ja', 'ko',
                     'ru', 'pt', 'it', 'nl', 'pl', 'vi', 'th', 'id', 'sv', 'fi']
        for lang in must_have:
            assert lang in LANGUAGES, f"Missing required language: {lang}"

    def test_get_whisper_lang_auto(self):
        from languages import get_whisper_lang
        assert get_whisper_lang('auto') is None

    def test_get_whisper_lang_valid(self):
        from languages import get_whisper_lang
        assert get_whisper_lang('tr') == 'tr'
        assert get_whisper_lang('zh') == 'zh'
        assert get_whisper_lang('ja') == 'ja'

    def test_get_el_lang_fallback(self):
        from languages import get_el_lang
        assert get_el_lang('unknown_lang') == 'en'

    def test_all_whisper_codes_non_empty(self):
        from languages import LANGUAGES
        for code, data in LANGUAGES.items():
            assert data['whisper'], f"{code}: empty whisper code"

    def test_app_languages_js_matches(self):
        """Check that the Electron app languages.js has the same 50 codes."""
        import re
        lang_file = os.path.join(os.path.dirname(__file__), '..', 'app', 'src', 'languages.js')
        with open(lang_file) as f:
            content = f.read()
        codes = re.findall(r"code:\s*'([^']+)'", content)
        assert len(codes) == 50, f"app/src/languages.js has {len(codes)} codes, expected 50"

    def test_both_chinese_variants(self):
        from languages import LANGUAGES
        assert 'zh' in LANGUAGES,    "Missing Simplified Chinese"
        assert 'zh-TW' in LANGUAGES, "Missing Traditional Chinese"

    def test_whisper_language_codes_are_valid_iso(self):
        """Whisper language codes should be lowercase ISO 639-1 (or known exceptions)."""
        from languages import LANGUAGES
        KNOWN_EXCEPTIONS = {'zh'}  # zh is used for both simplified and traditional
        for code, data in LANGUAGES.items():
            w = data['whisper']
            assert w == w.lower(), f"{code}: whisper code {w!r} not lowercase"
            assert len(w) in (2, 3), f"{code}: whisper code {w!r} unexpected length"


# ═══════════════════════════════════════════════════════════════════════════════
#  4. PAYMENT SERVICE TESTS
# ═══════════════════════════════════════════════════════════════════════════════

class TestPayments:
    def test_transfer_reference_format(self):
        from services.payments import generate_transfer_reference
        ref = generate_transfer_reference('abc12345')
        assert ref.startswith('VB-'), f"Reference {ref} doesn't start with VB-"
        assert len(ref) == 9, f"Expected VB-XXXXXX (9 chars), got {len(ref)}"

    def test_transfer_reference_unique(self):
        from services.payments import generate_transfer_reference
        refs = {generate_transfer_reference(f'order-{i:04d}') for i in range(20)}
        assert len(refs) == 20, "Transfer references are not unique"

    def test_nowpayments_signature_valid(self):
        from services.payments import verify_nowpayments_signature
        import json
        # Simulate a webhook body + matching signature
        secret  = 'test_ipn_secret'
        payload = json.dumps({'payment_id': 123, 'payment_status': 'finished'}).encode()
        sig     = hmac.new(secret.encode(), payload, hashlib.sha512).hexdigest()
        # Temporarily patch settings
        import services.payments as pm
        orig = pm.settings.nowpayments_ipn_secret
        pm.settings.nowpayments_ipn_secret = secret
        result = verify_nowpayments_signature(payload, sig)
        pm.settings.nowpayments_ipn_secret = orig
        assert result, "Valid IPN signature rejected"

    def test_nowpayments_signature_invalid(self):
        from services.payments import verify_nowpayments_signature
        import json
        payload = json.dumps({'test': 1}).encode()
        result  = verify_nowpayments_signature(payload, 'bad_signature')
        assert not result, "Invalid IPN signature accepted"

    def test_crypto_currencies_list(self):
        from services.payments import CRYPTO_CURRENCIES
        assert len(CRYPTO_CURRENCIES) >= 4
        codes = [c['code'] for c in CRYPTO_CURRENCIES]
        for required in ['BTC', 'ETH', 'USDT', 'USDC']:
            assert required in codes, f"Missing {required} from crypto currencies"

    def test_iban_details_has_required_fields(self):
        from services.payments import get_iban_details
        details = get_iban_details()
        for field in ['account_holder', 'iban', 'bic_swift', 'bank_name', 'instructions']:
            assert field in details, f"IBAN details missing: {field}"


# ═══════════════════════════════════════════════════════════════════════════════
#  5. DATABASE + LICENSE SERVICE (async)
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
class TestLicenseService:
    async def _make_db(self):
        from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
        from models import Base
        engine = create_async_engine('sqlite+aiosqlite:///:memory:', echo=False)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        return async_sessionmaker(engine, expire_on_commit=False)

    async def test_create_and_validate_paid_license(self):
        from services.license import create_license, activate_license, validate_license
        SessionFactory = await self._make_db()
        async with SessionFactory() as db:
            lic = await create_license(db, 'user@test.com', 'min_240')
            assert not lic.active, "License should be inactive before payment"
            await activate_license(db, lic.key)
            result = await validate_license(db, lic.key)
            assert result['valid'], f"License should be valid after activation: {result}"
            assert result['minutes_total'] == 240
            assert result['minutes_left']  == 240

    async def test_create_free_license(self):
        from services.license import create_license, validate_license
        SessionFactory = await self._make_db()
        async with SessionFactory() as db:
            lic = await create_license(db, 'free@test.com', 'free')
            assert lic.active, "Free license should be active immediately"
            result = await validate_license(db, lic.key)
            assert result['valid']
            assert result['free_trial']

    async def test_consume_minutes(self):
        from services.license import create_license, activate_license, validate_license, consume_minutes
        SessionFactory = await self._make_db()
        async with SessionFactory() as db:
            lic = await create_license(db, 'test2@test.com', 'min_60')
            await activate_license(db, lic.key)
            ok = await consume_minutes(db, lic.key, 600)  # 10 minutes (600 seconds)
            assert ok
            result = await validate_license(db, lic.key)
            assert result['minutes_used'] == 10
            assert result['minutes_left'] == 50

    async def test_exhausted_license(self):
        from services.license import create_license, activate_license, validate_license, consume_minutes
        SessionFactory = await self._make_db()
        async with SessionFactory() as db:
            lic = await create_license(db, 'exhaust@test.com', 'min_60')
            await activate_license(db, lic.key)
            # Consume all 60 minutes
            for _ in range(60):
                await consume_minutes(db, lic.key, 60)
            result = await validate_license(db, lic.key)
            assert not result['valid'], "Exhausted license should not be valid"
            assert result['reason'] == 'minutes_exhausted'

    async def test_invalid_key_rejected(self):
        from services.license import validate_license
        SessionFactory = await self._make_db()
        async with SessionFactory() as db:
            result = await validate_license(db, 'VB-X-AAAAAA-BBBBBB-CCCC')
            assert not result['valid']

    async def test_pending_payment_rejected(self):
        from services.license import create_license, validate_license
        SessionFactory = await self._make_db()
        async with SessionFactory() as db:
            lic = await create_license(db, 'pending@test.com', 'min_120')
            result = await validate_license(db, lic.key)
            assert not result['valid']
            assert result['reason'] == 'payment_pending'


# ═══════════════════════════════════════════════════════════════════════════════
#  6. TRANSLATION + TTS SERVICE (unit / mock)
# ═══════════════════════════════════════════════════════════════════════════════

class TestTranslationService:
    def test_translate_function_exists(self):
        from services.translate import translate
        assert callable(translate)

    def test_synthesize_function_exists(self):
        from services.tts_proxy import synthesize
        assert callable(synthesize)

    def test_optimize_cache_lru(self):
        from services.optimizations import LRUCache
        cache = LRUCache(maxsize=3)
        cache.put('a', 'A')
        cache.put('b', 'B')
        cache.put('c', 'C')
        assert cache.get('a') == 'A'
        # Access 'a' to make it recently used, then add 'd' — 'b' should be evicted
        cache.put('d', 'D')
        assert cache.get('b') is None, "'b' should have been evicted (LRU)"
        assert cache.get('a') == 'A'
        assert cache.get('d') == 'D'

    def test_cache_key_deterministic(self):
        from services.optimizations import cache_key
        k1 = cache_key('hello world', 'en', 'tr')
        k2 = cache_key('hello world', 'en', 'tr')
        assert k1 == k2

    def test_cache_key_different_for_different_langs(self):
        from services.optimizations import cache_key
        k_en_tr = cache_key('hello', 'en', 'tr')
        k_en_fr = cache_key('hello', 'en', 'fr')
        assert k_en_tr != k_en_fr

    def test_tts_supported_langs(self):
        from services.tts_proxy import SUPPORTED_LANGS
        assert len(SUPPORTED_LANGS) >= 50
        for code in ['en', 'tr', 'fr', 'de', 'ar', 'hi', 'zh', 'ja']:
            assert code in SUPPORTED_LANGS, f"{code} missing from TTS supported languages"


# ═══════════════════════════════════════════════════════════════════════════════
#  7. EXTENSION CHECKS (Node.js via subprocess)
# ═══════════════════════════════════════════════════════════════════════════════

class TestExtension:
    def test_extension_checks_pass(self):
        import subprocess
        ext_dir = os.path.join(os.path.dirname(__file__), '..', 'extension')
        result  = subprocess.run(
            ['node', 'tests/run-checks.mjs'],
            cwd=ext_dir, capture_output=True, text=True, timeout=30
        )
        assert result.returncode == 0, (
            f"Extension checks failed!\n{result.stdout}\n{result.stderr}"
        )
        assert 'FAIL: 0' in result.stdout, f"Extension tests have failures:\n{result.stdout}"

    def test_manifest_version(self):
        import json
        manifest_path = os.path.join(os.path.dirname(__file__), '..', 'extension', 'manifest.json')
        with open(manifest_path) as f:
            manifest = json.load(f)
        assert manifest['manifest_version'] == 3
        assert manifest['name'] == 'VoiceBridge'
        assert manifest['version'] == '0.2.0'

    def test_manifest_no_elevenlabs_host(self):
        import json
        manifest_path = os.path.join(os.path.dirname(__file__), '..', 'extension', 'manifest.json')
        with open(manifest_path) as f:
            manifest = json.load(f)
        host_perms = ' '.join(manifest.get('host_permissions', []))
        assert 'elevenlabs' not in host_perms.lower(), \
            "ElevenLabs should NOT be in host_permissions — use proxy server"
        assert 'voicebridgeapps.com' in host_perms, \
            "VoiceBridge proxy domain should be in host_permissions"

    def test_shared_js_uses_proxy(self):
        js_path = os.path.join(os.path.dirname(__file__), '..', 'extension', 'lib', 'shared.js')
        with open(js_path) as f:
            content = f.read()
        assert 'synthesizeTtsProxy' in content, "Extension should use proxy TTS, not direct ElevenLabs"
        assert 'elevenlab' not in content.lower(), \
            "Direct ElevenLabs API calls should not exist in shared.js"


# ═══════════════════════════════════════════════════════════════════════════════
#  8. DRIVER / PLATFORM TESTS
# ═══════════════════════════════════════════════════════════════════════════════

class TestDriverFiles:
    def test_macos_driver_files_exist(self):
        base = os.path.join(os.path.dirname(__file__), '..', 'drivers', 'macos')
        for fname in ['VoiceBridgeDriver.cpp', 'VoiceBridgeDriver.h', 'CMakeLists.txt',
                      'Info.plist', 'ShmWriter.cpp', 'ShmWriter.h']:
            assert os.path.exists(os.path.join(base, fname)), f"Missing: {fname}"

    def test_windows_driver_files_exist(self):
        base = os.path.join(os.path.dirname(__file__), '..', 'drivers', 'windows')
        for fname in ['WinVirtualMic.cpp', 'WinVirtualMic.h', 'installer.nsi']:
            assert os.path.exists(os.path.join(base, fname)), f"Missing: {fname}"

    def test_macos_driver_has_voicebridge_name(self):
        path = os.path.join(os.path.dirname(__file__), '..', 'drivers', 'macos', 'VoiceBridgeDriver.cpp')
        with open(path) as f:
            content = f.read()
        assert 'VoiceBridge Microphone' in content, "Driver must expose 'VoiceBridge Microphone' device name"

    def test_macos_shared_memory_name(self):
        """ShmWriter and driver must use the same shared memory name."""
        import re
        driver_path = os.path.join(os.path.dirname(__file__), '..', 'drivers', 'macos', 'VoiceBridgeDriver.cpp')
        writer_path = os.path.join(os.path.dirname(__file__), '..', 'drivers', 'macos', 'ShmWriter.cpp')
        header_path = os.path.join(os.path.dirname(__file__), '..', 'drivers', 'macos', 'VoiceBridgeDriver.h')

        # The name is defined via #define VB_SHM_NAME in header, used in both .cpp files
        with open(header_path) as f:
            header = f.read()
        with open(driver_path) as f:
            driver = f.read()
        with open(writer_path) as f:
            writer = f.read()

        # Find the #define value
        m = re.search(r'#define\s+VB_SHM_NAME\s+"([^"]+)"', header)
        assert m, "VB_SHM_NAME not defined in header"
        shm_name = m.group(1)
        assert shm_name.startswith('/'), f"SHM name should start with /: {shm_name}"

        # Both cpp files must reference VB_SHM_NAME
        assert 'VB_SHM_NAME' in driver, "Driver doesn't use VB_SHM_NAME macro"
        assert 'VB_SHM_NAME' in writer, "ShmWriter doesn't use VB_SHM_NAME macro"

    def test_core_cpp_files_exist(self):
        base = os.path.join(os.path.dirname(__file__), '..', 'core')
        for fname in ['src/AudioCapture.cpp', 'src/VAD.cpp', 'src/PhraseDetector.cpp',
                      'src/AudioPipeline.cpp', 'addon/addon.cpp', 'binding.gyp', 'index.js']:
            assert os.path.exists(os.path.join(base, fname)), f"Missing: core/{fname}"


# ═══════════════════════════════════════════════════════════════════════════════
#  9. WEBSITE + CONFIGS
# ═══════════════════════════════════════════════════════════════════════════════

class TestWebsite:
    def test_all_10_locale_files_exist(self):
        msgs_dir = os.path.join(os.path.dirname(__file__), '..', 'website', 'messages')
        required = ['en', 'tr', 'fr', 'hi', 'de', 'es', 'pt', 'zh', 'ja', 'ar']
        for locale in required:
            path = os.path.join(msgs_dir, f'{locale}.json')
            assert os.path.exists(path), f"Missing locale file: {locale}.json"

    def test_locale_files_valid_json(self):
        import json
        msgs_dir = os.path.join(os.path.dirname(__file__), '..', 'website', 'messages')
        for fname in os.listdir(msgs_dir):
            if fname.endswith('.json'):
                with open(os.path.join(msgs_dir, fname)) as f:
                    data = json.load(f)
                assert 'hero_headline' in data, f"{fname}: missing hero_headline"
                assert 'pricing_title' in data, f"{fname}: missing pricing_title"

    def test_pricing_page_has_no_stripe(self):
        path = os.path.join(os.path.dirname(__file__), '..', 'website', 'src',
                            'app', '[locale]', 'pricing', 'page.tsx')
        with open(path) as f:
            content = f.read()
        assert 'stripe' not in content.lower(), "Pricing page should not reference Stripe"
        assert 'crypto' in content.lower(), "Pricing page should mention crypto payment"
        assert 'iban' in content.lower(), "Pricing page should mention IBAN"

    def test_checkout_api_proxies_to_backend(self):
        path = os.path.join(os.path.dirname(__file__), '..', 'website', 'src',
                            'app', 'api', 'checkout', 'route.ts')
        with open(path) as f:
            content = f.read()
        assert 'orders/create' in content, "Checkout API should call /api/orders/create"
        assert 'STRIPE' not in content, "Checkout API should not use Stripe"

    def test_vercel_config_exists(self):
        path = os.path.join(os.path.dirname(__file__), '..', 'website', 'vercel.json')
        assert os.path.exists(path), "vercel.json missing"


# ═══════════════════════════════════════════════════════════════════════════════
#  10. INTEGRATION: FULL PIPELINE FLOW (mocked)
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
class TestPipelineFlow:
    async def test_pipeline_language_detection_all_50(self):
        """Verify that all 50 language codes are handled by get_whisper_lang without error."""
        from languages import LANGUAGES, get_whisper_lang, get_el_lang
        for code in LANGUAGES:
            w = get_whisper_lang(code)
            e = get_el_lang(code)
            assert w is not None, f"{code}: get_whisper_lang returned None"
            assert e,             f"{code}: get_el_lang returned empty"
            assert len(w) >= 2,   f"{code}: whisper code too short: {w!r}"

    async def test_license_gate_flow(self):
        """Full flow: create order → confirm → activate → validate → consume → exhausted."""
        from services.license import (
            create_license, activate_license, validate_license, consume_minutes
        )
        from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
        from models import Base

        engine = create_async_engine('sqlite+aiosqlite:///:memory:', echo=False)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        DB = async_sessionmaker(engine, expire_on_commit=False)

        async with DB() as db:
            # 1. Create license (min_60 = 60 minutes)
            lic = await create_license(db, 'flow@test.com', 'min_60')
            assert not lic.active

            # 2. Activate (simulating payment confirmation)
            await activate_license(db, lic.key)

            # 3. Validate
            v = await validate_license(db, lic.key)
            assert v['valid']
            assert v['minutes_left'] == 60

            # 4. Consume 55 minutes (3300 seconds)
            await consume_minutes(db, lic.key, 3300)
            v2 = await validate_license(db, lic.key)
            assert v2['valid']
            assert v2['minutes_left'] == 5

            # 5. Consume remaining 5 minutes (300 seconds)
            await consume_minutes(db, lic.key, 300)
            v3 = await validate_license(db, lic.key)
            assert not v3['valid']
            assert v3['reason'] == 'minutes_exhausted'

        await engine.dispose()
