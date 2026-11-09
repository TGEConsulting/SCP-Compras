import sys, json, time, uuid, random, datetime, os
from helpers import *
ST = os.path.join(OUT, "state.json")
st = json.load(open(ST)) if os.path.exists(ST) else {}
def save(): json.dump(st, open(ST, "w"), indent=1)
def txt(page, n=700): return page.locator("main").inner_text()[:n].replace("\n", " | ")
def confirm(page):
    page.get_by_role("button", name="Confirmar", exact=True).click(); page.wait_for_load_state("networkidle"); time.sleep(1.5)

def s1(b):
    ctx, page = new_page(b, "solicitante", "s1")
    page.goto(BASE + "/solicitudes/nueva"); page.wait_for_load_state("networkidle")
    page.locator("#title").fill(f"QA Sal para producción {int(time.time())}")
    page.locator("#just").fill("Reposición de inventario de sal para el lote semanal de queso.")
    page.locator("#p0").select_option(label="SAL-001 · Sal grado alimenticio")
    page.locator("#q0").fill("100")
    page.get_by_role("button", name="Enviar a mi jefe de área").click()
    page.wait_for_url(re.compile(r"/solicitudes/[0-9a-f-]{36}"), timeout=45000); page.wait_for_load_state("networkidle")
    st["request"] = re.search(r"/solicitudes/([0-9a-f-]{36})", page.url).group(1); save()
    page.screenshot(path=os.path.join(OUT, "s1-solicitud.png")); print("S1", page.url, "|", txt(page, 300))

def s2(b):
    ctx, page = new_page(b, "jefe", "s2")
    page.goto(f"{BASE}/solicitudes/{st['request']}"); page.wait_for_load_state("networkidle")
    print("S2 antes:", txt(page, 250))
    if page.get_by_role("button", name="Tomar en revisión").count():
        page.get_by_role("button", name="Tomar en revisión").click(); page.wait_for_load_state("networkidle"); time.sleep(1.5)
    page.get_by_role("button", name="Aprobar", exact=True).click(); confirm(page)
    page.goto(f"{BASE}/solicitudes/{st['request']}"); page.wait_for_load_state("networkidle")
    print("S2 despues:", txt(page, 250)); page.screenshot(path=os.path.join(OUT, "s2-aprobada.png"))

def s3(b):
    ctx, page = new_page(b, "compras", "s3")
    page.goto(f"{BASE}/ordenes/nueva?solicitud={st['request']}"); page.wait_for_load_state("networkidle")
    page.locator("#sup").select_option(label=re.compile("Cultivos y Fermentos").pattern) if False else None
    opts = page.locator("#sup option").all_inner_texts(); print("proveedores:", opts)
    page.locator("#sup").select_option(index=[i for i, o in enumerate(opts) if "Cultivos y Fermentos" in o][0])
    page.locator("#terms").fill("Crédito 30 días"); page.locator("#addr").fill("Planta La Quinta, Querétaro")
    page.locator("input[id^=pr]").first.fill("50.00")
    page.get_by_role("button", name="Generar orden de compra").click()
    page.wait_for_url(re.compile(r"/ordenes/[0-9a-f-]{36}$"), timeout=45000); page.wait_for_load_state("networkidle")
    st["order"] = re.search(r"/ordenes/([0-9a-f-]{36})", page.url).group(1); save()
    print("S3 OC:", txt(page, 250))
    page.get_by_role("button", name="Enviar al proveedor").click(); confirm(page)
    page.goto(f"{BASE}/ordenes/{st['order']}"); page.wait_for_load_state("networkidle")
    print("S3 enviada:", txt(page, 200)); page.screenshot(path=os.path.join(OUT, "s3-orden.png"))

def s4(b):
    ctx, page = new_page(b, "proveedor", "s4")
    page.goto(f"{BASE}/proveedor/ordenes/{st['order']}"); page.wait_for_load_state("networkidle")
    print("S4 antes:", txt(page, 250))
    d = (datetime.date.today() + datetime.timedelta(days=7)).isoformat()
    page.locator("#fc").fill(d); page.locator("#gu").fill("GUIA-QA-001")
    page.get_by_role("button", name="Confirmar orden").click(); page.wait_for_load_state("networkidle"); time.sleep(2)
    page.goto(f"{BASE}/proveedor/ordenes/{st['order']}"); page.wait_for_load_state("networkidle")
    print("S4 despues:", txt(page, 250)); page.screenshot(path=os.path.join(OUT, "s4-confirmada.png"))

MSG = "La factura aún no ha sido cargada por el proveedor. La recepción quedará pendiente de conciliación y el pago permanecerá bloqueado."
def s5(b):
    ctx, page = new_page(b, "almacen", "s5")
    page.goto(f"{BASE}/recepcion/{st['order']}"); page.wait_for_load_state("networkidle")
    body = page.locator("main").inner_text()
    print("S5 mensaje exacto presente:", MSG in body.replace("\n", " ")); print("S5 estado factura:", [l for l in body.split("\n") if "actura" in l][:4])
    page.screenshot(path=os.path.join(OUT, "s5-recepcion-sin-factura.png"), full_page=True)
    page.get_by_label(re.compile("^Recibida")).fill("100")
    print("S5 aceptada autollenada:", page.get_by_label("Aceptada").input_value(), "| rechazada:", page.get_by_label("Rechazada").input_value())
    page.get_by_label("Aceptada").fill("100"); page.get_by_label("Rechazada").fill("0")
    page.get_by_label("Lote del proveedor").fill("L-QA-001")
    page.get_by_label("Condición del empaque").select_option(label="Íntegro")
    page.locator("#rem").fill("REM-QA-001")
    btn = page.get_by_role("button", name="Guardar recepción como PENDIENTE_FACTURA"); print("S5 boton habilitado:", btn.is_enabled())
    btn.click(); page.wait_for_load_state("networkidle"); time.sleep(3)
    print("S5 resultado:", txt(page, 400)); page.screenshot(path=os.path.join(OUT, "s5-resultado.png"), full_page=True)
    page.goto(f"{BASE}/ordenes/{st['order']}"); page.wait_for_load_state("networkidle")
    print("S5 orden:", txt(page, 700))

def make_files(tag, qty="100", price="50.00"):
    from decimal import Decimal as D
    sub = D(qty) * D(price); tax = (sub * D("0.16")).quantize(D("0.01")); tot = sub + tax
    u = str(uuid.uuid4()).upper(); fol = str(random.randint(1000, 9999))
    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="4.0" Serie="QA" Folio="{fol}" Fecha="{datetime.datetime.now().strftime('%Y-%m-%dT%H:%M:%S')}" TipoDeComprobante="I" SubTotal="{sub:.2f}" Total="{tot:.2f}" Moneda="MXN" Exportacion="01">
  <cfdi:Emisor Rfc="AAA010101AAA" Nombre="CULTIVOS Y FERMENTOS DEMO" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="PLQ9002286Q6" Nombre="PRODUCTOS LACTEOS LA QUINTA" UsoCFDI="G03"/>
  <cfdi:Conceptos><cfdi:Concepto ClaveProdServ="50131600" NoIdentificacion="SAL-001" ClaveUnidad="KGM" Unidad="KG" Descripcion="Sal grado alimenticio" Cantidad="{qty}" ValorUnitario="{price}" Importe="{sub:.2f}" ObjetoImp="02"><cfdi:Impuestos><cfdi:Traslados><cfdi:Traslado Base="{sub:.2f}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="{tax:.2f}"/></cfdi:Traslados></cfdi:Impuestos></cfdi:Concepto></cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="{tax:.2f}"/>
  <cfdi:Complemento><tfd:TimbreFiscalDigital Version="1.1" UUID="{u}"/></cfdi:Complemento>
</cfdi:Comprobante>"""
    open(os.path.join(OUT, f"{tag}.xml"), "w").write(xml)
    open(os.path.join(OUT, f"{tag}.pdf"), "wb").write(b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n")
    return u, fol, f"{tot:.2f}"

def s6(b, tag="factura1", qty="100", price="50.00"):
    u, fol, tot = make_files(tag, qty, price); st[tag] = {"uuid": u, "folio": fol, "total": tot}; save()
    ctx, page = new_page(b, "proveedor", "s6")
    page.goto(f"{BASE}/proveedor/ordenes/{st['order']}"); page.wait_for_load_state("networkidle")
    page.locator("#pdf").set_input_files(os.path.join(OUT, f"{tag}.pdf")); page.locator("#xml").set_input_files(os.path.join(OUT, f"{tag}.xml"))
    page.get_by_role("button", name="Cargar factura").click(); page.wait_for_load_state("networkidle"); time.sleep(4)
    page.goto(f"{BASE}/proveedor/ordenes/{st['order']}"); page.wait_for_load_state("networkidle")
    print("S6 proveedor ve:", txt(page, 900)); page.screenshot(path=os.path.join(OUT, f"s6-{tag}.png"), full_page=True)

def s7(b):
    ctx, page = new_page(b, "finanzas", "s7")
    page.goto(f"{BASE}/pagos"); page.wait_for_load_state("networkidle"); print("S7 /pagos:", txt(page, 500))
    page.get_by_role("link", name=re.compile(st["factura1"]["folio"])).first.click(); page.wait_for_load_state("networkidle")
    print("S7 factura:", txt(page, 700)); page.screenshot(path=os.path.join(OUT, "s7-factura.png"), full_page=True)
    page.get_by_role("button", name="Autorizar pago").click(); page.wait_for_load_state("networkidle"); time.sleep(3)
    print("S7 tras autorizar:", txt(page, 400))
    page.locator("#ref").fill("SPEI-QA-0001"); page.locator("#pd").fill(datetime.date.today().isoformat())
    page.get_by_role("button", name="Registrar pago").click(); page.wait_for_load_state("networkidle"); time.sleep(3)
    page.reload(); page.wait_for_load_state("networkidle"); print("S7 final:", txt(page, 500)); page.screenshot(path=os.path.join(OUT, "s7-pagada.png"), full_page=True)

def sN(b):
    st["A"] = {"request": st["request"], "order": st["order"]}; save()
    s1(b); s2(b); s3(b); s4(b)
    try:
        from PIL import Image; Image.new("RGB", (64, 64), (200, 30, 30)).save(os.path.join(OUT, "evidencia.jpg"), "JPEG")
    except Exception:
        open(os.path.join(OUT, "evidencia.jpg"), "wb").write(bytes.fromhex("ffd8ffe000104a46494600010100000100010000ffdb004300") + b"\x08" * 64 + bytes.fromhex("ffd9"))
    ctx, page = new_page(b, "almacen", "sN")
    page.goto(f"{BASE}/recepcion/{st['order']}"); page.wait_for_load_state("networkidle")
    page.get_by_label(re.compile("^Recibida")).fill("100"); page.get_by_label("Aceptada").fill("80"); page.get_by_label("Rechazada").fill("20")
    page.get_by_label("Lote del proveedor").fill("L-QA-002"); page.get_by_label("Condición del empaque").select_option(label="Daño leve")
    page.get_by_label("Resultado de inspección").select_option(label="Condicionado")
    page.get_by_label("Motivo del rechazo").fill("Bolsas rotas, producto contaminado"); page.get_by_label("Acción correctiva solicitada").fill("Reposición sin costo")
    page.get_by_label(re.compile("Evidencias fotográficas")).set_input_files(os.path.join(OUT, "evidencia.jpg"))
    btn = page.get_by_role("button", name="Guardar recepción como PENDIENTE_FACTURA"); print("SN boton:", btn.is_enabled())
    btn.click(); page.wait_for_load_state("networkidle"); time.sleep(4)
    page.goto(f"{BASE}/ordenes/{st['order']}"); page.wait_for_load_state("networkidle"); print("SN orden:", txt(page, 600))
    s6(b, "factura2", "100", "50.00")
    ctx2, p2 = new_page(b, "finanzas", "sN2")
    p2.goto(f"{BASE}/pagos"); p2.wait_for_load_state("networkidle"); body = p2.locator("main").inner_text()
    print("SN /pagos contiene factura2:", st["factura2"]["folio"] in body)
    p2.goto(f"{BASE}/facturas"); p2.wait_for_load_state("networkidle")
    p2.get_by_role("link", name=re.compile(st["factura2"]["folio"])).first.click(); p2.wait_for_load_state("networkidle")
    print("SN factura2 vista finanzas:", txt(p2, 1100)); print("SN boton Autorizar pago visible:", p2.get_by_role("button", name="Autorizar pago").count())
    p2.screenshot(path=os.path.join(OUT, "sN-bloqueada.png"), full_page=True)

def s8(b):
    ctx, page = new_page(b, "compras", "s8")
    page.goto(BASE + "/seguimiento"); page.wait_for_load_state("networkidle")
    body = page.locator("main").inner_text(); print("S8 seguimiento:", body[:600].replace(chr(10), " | "))
    assert "Seguimiento" in body and "Monto detenido" in body, "El tablero de seguimiento no cargó"
    page.screenshot(path=os.path.join(OUT, "s8-seguimiento.png"), full_page=True)

def s9(b):
    """Descarga segura: el XML de un tercero se baja como adjunto y con CSP sandbox; el PDF sigue en línea."""
    ctx, page = new_page(b, "finanzas", "s9")
    page.goto(BASE + "/facturas"); page.wait_for_load_state("networkidle")
    page.get_by_role("link", name=re.compile(st["factura1"]["folio"])).first.click(); page.wait_for_load_state("networkidle")
    for nombre, es_xml in (("Descargar XML", True), ("Abrir PDF", False)):
        href = page.get_by_role("link", name=nombre).first.get_attribute("href")
        r = page.request.get(href if href.startswith("http") else BASE + href)
        cd, csp = r.headers.get("content-disposition", ""), r.headers.get("content-security-policy", "")
        print(f"S9 {nombre}: status={r.status} disposicion={cd.split(';')[0]} csp_sandbox={'sandbox' in csp}")
        assert r.status == 200, "la descarga firmada debe funcionar"
        assert ("sandbox" in csp) == es_xml, "CSP sandbox solo en XML (en PDF bloquea el visor)"
        assert cd.startswith("attachment" if es_xml else "inline"), "disposición incorrecta"
    # Un enlace manipulado (firma alterada) debe rechazarse
    href = page.get_by_role("link", name="Descargar XML").first.get_attribute("href")
    mal = href[:-3] + ("aaa" if not href.endswith("aaa") else "bbb")
    print("S9 firma alterada ->", page.request.get(mal if mal.startswith("http") else BASE + mal).status)

STEPS = {"9": s9, "8": s8, "N": sN, "7": s7, "6": s6, "5": s5, "1": s1, "2": s2, "3": s3, "4": s4}
if __name__ == "__main__":
    with sync_playwright() as p:
        b = p.chromium.launch()
        for k in sys.argv[1:]:
            try: STEPS[k](b)
            except Exception as e:
                print("FALLO paso", k, type(e).__name__, str(e)[:600]); sys.exit(1)
        b.close()
