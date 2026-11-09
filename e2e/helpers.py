import json, re, os
from playwright.sync_api import sync_playwright
BASE = os.environ["E2E_BASE_URL"].rstrip("/")            # URL del Preview (staging), nunca producción
SHARE = os.environ.get("E2E_SHARE_URL")                  # enlace «compartir» de Vercel si el Preview está protegido
PW = os.environ["E2E_PASSWORD"]                          # el mismo con el que se corrió scripts/e2e-usuarios.ts up
EMAIL = {r: f"qa.{r}+clerk_test@example.com" for r in ["solicitante", "jefe", "compras", "almacen", "finanzas", "proveedor"]}
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out"); os.makedirs(OUT, exist_ok=True)
def new_page(browser, who, shot):
    ctx = browser.new_context(viewport={"width": 1200, "height": 900}, locale="es-MX")
    page = ctx.new_page(); page.set_default_timeout(45000)
    if SHARE: page.goto(SHARE); page.wait_for_load_state("networkidle")
    page.goto(BASE + "/sign-in"); page.wait_for_load_state("networkidle")
    page.locator("input[name=identifier]").fill(EMAIL[who])
    page.get_by_role("button", name=re.compile("Continu", re.I)).first.click()
    page.locator("input[name=password]").fill(PW)
    page.get_by_role("button", name=re.compile("Continu", re.I)).first.click()
    page.wait_for_url(re.compile(r"/(dashboard|proveedor|sin-acceso|sign-in/factor-two)"), timeout=60000)
    if "factor-two" in page.url:
        page.wait_for_load_state("networkidle")
        otp = page.locator("input[inputmode=numeric], input[autocomplete=one-time-code], input[name=code]").first
        otp.click(); page.keyboard.type("424242", delay=80)
        page.wait_for_url(re.compile(r"/(dashboard|proveedor|sin-acceso)"), timeout=60000)
    page.wait_for_load_state("networkidle")
    page.screenshot(path=os.path.join(OUT, f"{shot}-{who}-login.png"))
    return ctx, page
