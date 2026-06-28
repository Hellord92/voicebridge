"""
VoiceBridge — Auth & Account Integration Tests
Tests: Firebase token detection, /api/auth/me flow, firebase_uid license linking,
       full account → purchase → activate → validate → consume E2E flow.
Run: python3 -m pytest tests/test_auth.py -v
"""
import os
import sys
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'server'))


# ═══════════════════════════════════════════════════════════════════════════════
#  1. Firebase token detection
# ═══════════════════════════════════════════════════════════════════════════════

class TestFirebaseTokenDetection:
    def test_firebase_token_detected(self):
        from services.auth import is_firebase_token
        # Firebase ID tokens are JWTs: base64.base64.base64
        fake_jwt = 'eyJhbGciOiJSUzI1NiJ9.eyJ1aWQiOiJ0ZXN0MTIzIn0.signature_here'
        assert is_firebase_token(fake_jwt)

    def test_license_key_not_firebase_token(self):
        from services.auth import is_firebase_token
        assert not is_firebase_token('VB-T-A1B2C3-D4E5F6-ABCD')
        assert not is_firebase_token('some_random_key')
        assert not is_firebase_token('')

    def test_only_two_dots_required(self):
        from services.auth import is_firebase_token
        # Must have exactly 2 dots (3 parts)
        assert not is_firebase_token('eyJ.only.one.too.many')
        assert not is_firebase_token('eyJnodots')

    def test_firebase_token_starts_eyj(self):
        from services.auth import is_firebase_token
        # Must start with eyJ (base64 of '{"')
        assert not is_firebase_token('notbase64.something.here')


# ═══════════════════════════════════════════════════════════════════════════════
#  2. Auth service init (without Firebase configured)
# ═══════════════════════════════════════════════════════════════════════════════

class TestAuthServiceNoop:
    def test_verify_raises_when_firebase_not_configured(self):
        """Without FIREBASE_SERVICE_ACCOUNT_JSON, verify should raise ValueError."""
        import importlib
        import services.auth as auth_mod

        # Remove any existing Firebase app
        try:
            import firebase_admin
            for app_name in list(firebase_admin._apps.keys()):
                firebase_admin.delete_app(firebase_admin.get_app(app_name))
        except Exception:
            pass

        # Reset initialized flag
        auth_mod._initialized = False
        os.environ.pop('FIREBASE_SERVICE_ACCOUNT_JSON', None)

        with pytest.raises(ValueError, match='Firebase not configured|Firebase init error'):
            auth_mod.verify_firebase_token('eyJhbGciOiJSUzI1NiJ9.eyJ1aWQiOiJ0ZXN0In0.sig')


# ═══════════════════════════════════════════════════════════════════════════════
#  3. Account flow (E2E with in-memory DB, mocked Firebase)
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
class TestAccountFlow:
    async def _make_db(self):
        from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
        from models import Base
        engine = create_async_engine('sqlite+aiosqlite:///:memory:', echo=False)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        return async_sessionmaker(engine, expire_on_commit=False), engine

    async def test_first_login_creates_free_license(self):
        """Simulates /api/auth/me creating a free license on first login."""
        from sqlalchemy import select, update
        from services.license import create_license
        from models import License

        SessionFactory, engine = await self._make_db()
        uid   = 'firebase_uid_001'
        email = 'newuser@example.com'

        async with SessionFactory() as db:
            # Check no license for this UID
            stmt = select(License).where(License.firebase_uid == uid)
            existing = (await db.execute(stmt)).scalars().all()
            assert len(existing) == 0

            # Simulate first login → create free license
            lic = await create_license(db, email=email, plan_id='free')
            await db.execute(update(License).where(License.id == lic.id).values(firebase_uid=uid))
            await db.commit()

            # Verify
            stmt2 = select(License).where(License.firebase_uid == uid)
            lics  = (await db.execute(stmt2)).scalars().all()
            assert len(lics) == 1
            assert lics[0].plan_id == 'free'
            assert lics[0].active  == True

        await engine.dispose()

    async def test_second_login_finds_existing_license(self):
        """Second login with same UID should return existing license."""
        from sqlalchemy import select, update
        from services.license import create_license
        from models import License

        SessionFactory, engine = await self._make_db()
        uid   = 'firebase_uid_002'
        email = 'returning@example.com'

        async with SessionFactory() as db:
            # Create and attach license (simulating first login)
            lic = await create_license(db, email=email, plan_id='free')
            await db.execute(update(License).where(License.id == lic.id).values(firebase_uid=uid))
            await db.commit()

            # Simulate second login — should find existing
            stmt = select(License).where(License.firebase_uid == uid)
            lics = (await db.execute(stmt)).scalars().all()
            assert len(lics) == 1
            assert lics[0].key == lic.key

        await engine.dispose()

    async def test_purchase_links_to_firebase_uid(self):
        """Simulate full flow: login → buy plan → confirm payment → license linked to UID."""
        from sqlalchemy import select, update
        from services.license import create_license, activate_license, validate_license
        from models import License, Order

        SessionFactory, engine = await self._make_db()
        uid   = 'firebase_uid_buyer'
        email = 'buyer@example.com'

        async with SessionFactory() as db:
            # 1. First login → free license
            free_lic = await create_license(db, email=email, plan_id='free')
            await db.execute(update(License).where(License.id == free_lic.id).values(firebase_uid=uid))
            await db.commit()

            # 2. User buys 240 min plan
            paid_lic = await create_license(
                db, email=email, plan_id='min_240',
                payment_method='crypto', payment_ref='nowpayments_123',
            )
            # Link paid license to same UID (as _confirm_order would do)
            await db.execute(update(License).where(License.id == paid_lic.id).values(firebase_uid=uid))
            await activate_license(db, paid_lic.key)

            # 3. Validate by UID — should get the paid (active, minutes_total=240) license
            stmt = select(License).where(
                License.firebase_uid == uid,
                License.active == True,
                License.plan_id != 'free',
            )
            active_paid = (await db.execute(stmt)).scalars().first()
            assert active_paid is not None
            assert active_paid.minutes_total == 240
            assert active_paid.plan_id == 'min_240'

            # 4. Validate by key
            result = await validate_license(db, paid_lic.key)
            assert result['valid']
            assert result['minutes_left'] == 240

        await engine.dispose()

    async def test_firebase_uid_auth_flow_validates_and_consumes(self):
        """Full auth flow: uid → validate_license_by_uid → consume."""
        from sqlalchemy import select, update
        from services.license import create_license, activate_license, consume_minutes
        from models import License

        SessionFactory, engine = await self._make_db()
        uid = 'firebase_uid_consume_test'

        async with SessionFactory() as db:
            # Create paid license linked to UID
            lic = await create_license(db, email='c@test.com', plan_id='min_120')
            await db.execute(update(License).where(License.id == lic.id).values(firebase_uid=uid))
            await activate_license(db, lic.key)

            # Simulate main.py: validate_license_by_uid
            from pricing import get_plan
            stmt = select(License).where(License.firebase_uid == uid, License.active == True)
            found = (await db.execute(stmt)).scalar_one_or_none()
            assert found is not None

            plan = get_plan(found.plan_id)
            assert plan is not None
            minutes_left = found.minutes_total - found.minutes_used
            assert minutes_left == 120

            # Consume 30 minutes
            await consume_minutes(db, found.key, 1800)  # 30 min = 1800 sec
            await db.refresh(found)
            assert found.minutes_used == 30

        await engine.dispose()


# ═══════════════════════════════════════════════════════════════════════════════
#  4. API route structure tests (static analysis)
# ═══════════════════════════════════════════════════════════════════════════════

class TestApiRouteStructure:
    def test_auth_me_endpoint_exists(self):
        main_path = os.path.join(os.path.dirname(__file__), '..', 'server', 'main.py')
        with open(main_path) as f:
            content = f.read()
        assert "@app.post('/api/auth/me')" in content or '@app.post("/api/auth/me")' in content, \
            "/api/auth/me endpoint not found in main.py"

    def test_all_required_endpoints_exist(self):
        main_path = os.path.join(os.path.dirname(__file__), '..', 'server', 'main.py')
        with open(main_path) as f:
            content = f.read()

        required = [
            '/health', '/api/auth/me', '/api/pipeline', '/api/tts',
            '/api/license/validate', '/api/license/consume',
            '/api/orders/create', '/api/payments/crypto/webhook',
            '/api/payments/iban/confirm',
        ]
        missing = [r for r in required if r not in content]
        assert not missing, f"Missing endpoints in main.py: {missing}"

    def test_firebase_admin_in_requirements(self):
        req_path = os.path.join(os.path.dirname(__file__), '..', 'server', 'requirements.txt')
        with open(req_path) as f:
            content = f.read()
        assert 'firebase-admin' in content, "firebase-admin missing from requirements.txt"

    def test_firebase_uid_field_in_models(self):
        import ast
        model_path = os.path.join(os.path.dirname(__file__), '..', 'server', 'models.py')
        with open(model_path) as f:
            content = f.read()
        assert 'firebase_uid' in content, "firebase_uid field missing from models.py"


# ═══════════════════════════════════════════════════════════════════════════════
#  5. Website auth components (static analysis)
# ═══════════════════════════════════════════════════════════════════════════════

class TestWebsiteAuth:
    def test_firebase_lib_exists(self):
        path = os.path.join(os.path.dirname(__file__), '..', 'website', 'src', 'lib', 'firebase.ts')
        assert os.path.exists(path), "website/src/lib/firebase.ts missing"

    def test_auth_context_exists(self):
        path = os.path.join(os.path.dirname(__file__), '..', 'website', 'src', 'lib', 'auth.tsx')
        assert os.path.exists(path), "website/src/lib/auth.tsx missing"
        with open(path) as f:
            content = f.read()
        assert 'AuthProvider' in content,  "AuthProvider not exported from auth.tsx"
        assert 'useAuth'      in content,  "useAuth hook not exported from auth.tsx"
        assert 'signInGoogle' in content,  "signInGoogle not in auth.tsx"
        assert 'signOut'      in content,  "signOut not in auth.tsx"

    def test_dashboard_page_exists(self):
        path = os.path.join(os.path.dirname(__file__), '..', 'website', 'src',
                            'app', '[locale]', 'dashboard', 'page.tsx')
        assert os.path.exists(path), "Dashboard page missing"
        with open(path) as f:
            content = f.read()
        assert 'useAuth'       in content
        assert 'minutes_left'  in content
        assert 'releases'      in content.lower() or 'github' in content.lower()

    def test_download_page_uses_github_releases(self):
        path = os.path.join(os.path.dirname(__file__), '..', 'website', 'src',
                            'app', '[locale]', 'download', 'page.tsx')
        with open(path) as f:
            content = f.read()
        assert 'github.com' in content.lower(), "Download page should link to GitHub releases"
        assert 'releases/latest' in content,    "Download page should use /releases/latest URL"
        assert '.dmg' in content,               "macOS DMG download missing"
        assert '.exe' in content,               "Windows EXE download missing"

    def test_navbar_exists(self):
        path = os.path.join(os.path.dirname(__file__), '..', 'website', 'src', 'components', 'Navbar.tsx')
        assert os.path.exists(path), "Navbar.tsx missing"
        with open(path) as f:
            content = f.read()
        assert 'signInGoogle' in content, "Navbar should have sign-in button"
        assert 'dashboard'    in content.lower(), "Navbar should link to dashboard"

    def test_layout_has_auth_provider(self):
        path = os.path.join(os.path.dirname(__file__), '..', 'website', 'src',
                            'app', '[locale]', 'layout.tsx')
        with open(path) as f:
            content = f.read()
        assert 'AuthProvider' in content, "Layout must wrap children in AuthProvider"
        assert 'Navbar'       in content, "Layout must include Navbar"

    def test_firebase_in_package_json(self):
        import json
        path = os.path.join(os.path.dirname(__file__), '..', 'website', 'package.json')
        with open(path) as f:
            pkg = json.load(f)
        assert 'firebase' in pkg.get('dependencies', {}), "firebase missing from website/package.json"

    def test_stripe_removed_from_package_json(self):
        import json
        path = os.path.join(os.path.dirname(__file__), '..', 'website', 'package.json')
        with open(path) as f:
            pkg = json.load(f)
        deps = pkg.get('dependencies', {})
        assert 'stripe'           not in deps, "stripe should be removed"
        assert '@stripe/stripe-js' not in deps, "@stripe/stripe-js should be removed"


# ═══════════════════════════════════════════════════════════════════════════════
#  6. Electron app auth components
# ═══════════════════════════════════════════════════════════════════════════════

class TestElectronAuth:
    def test_signin_component_exists(self):
        path = os.path.join(os.path.dirname(__file__), '..', 'app', 'src', 'components', 'SignIn.jsx')
        assert os.path.exists(path), "SignIn.jsx missing"
        with open(path) as f:
            content = f.read()
        assert 'signInWithGoogle' in content, "SignIn must call signInWithGoogle"
        assert 'Continue with Google' in content

    def test_firebase_lib_for_electron(self):
        path = os.path.join(os.path.dirname(__file__), '..', 'app', 'src', 'lib', 'firebase.js')
        assert os.path.exists(path), "app/src/lib/firebase.js missing"
        with open(path) as f:
            content = f.read()
        assert 'signInWithPopup'    in content
        assert 'GoogleAuthProvider' in content
        assert 'firebasePostLogin'  in content

    def test_preload_exposes_firebase_methods(self):
        path = os.path.join(os.path.dirname(__file__), '..', 'app', 'electron', 'preload.js')
        with open(path) as f:
            content = f.read()
        for method in ['getStoredUser', 'saveFirebaseUser', 'firebasePostLogin', 'signOut']:
            assert method in content, f"preload.js missing: {method}"

    def test_main_js_has_firebase_ipc(self):
        path = os.path.join(os.path.dirname(__file__), '..', 'app', 'electron', 'main.js')
        with open(path) as f:
            content = f.read()
        assert 'get-stored-user'    in content
        assert 'firebase-post-login' in content
        assert 'save-firebase-user'  in content

    def test_firebase_in_app_package_json(self):
        import json
        path = os.path.join(os.path.dirname(__file__), '..', 'app', 'package.json')
        with open(path) as f:
            pkg = json.load(f)
        assert 'firebase' in pkg.get('dependencies', {}), "firebase missing from app/package.json"


# ═══════════════════════════════════════════════════════════════════════════════
#  7. CI/CD workflow tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestCIWorkflows:
    def test_build_workflow_has_firebase_secrets(self):
        path = os.path.join(os.path.dirname(__file__), '..', '.github', 'workflows', 'build.yml')
        with open(path) as f:
            content = f.read()
        assert 'VITE_FIREBASE_API_KEY' in content, "build.yml missing VITE_FIREBASE_API_KEY secret"
        assert 'VITE_FIREBASE_PROJECT_ID' in content

    def test_build_workflow_creates_named_release_files(self):
        path = os.path.join(os.path.dirname(__file__), '..', '.github', 'workflows', 'build.yml')
        with open(path) as f:
            content = f.read()
        assert 'VoiceBridge.dmg' in content,       "Release must include VoiceBridge.dmg"
        assert 'VoiceBridge-Setup.exe' in content,  "Release must include VoiceBridge-Setup.exe"

    def test_deploy_website_workflow_exists(self):
        path = os.path.join(os.path.dirname(__file__), '..', '.github', 'workflows', 'deploy-website.yml')
        assert os.path.exists(path), "deploy-website.yml missing"
        with open(path) as f:
            content = f.read()
        assert 'vercel' in content.lower(), "deploy-website.yml should use Vercel"

    def test_deploy_server_workflow_exists(self):
        path = os.path.join(os.path.dirname(__file__), '..', '.github', 'workflows', 'deploy-server.yml')
        assert os.path.exists(path), "deploy-server.yml missing"
