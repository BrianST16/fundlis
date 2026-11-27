"""Genera las imagenes FICTICIAS de los datos de demostracion (sin personas).

    python db/postgres/demo/generar_imagenes.py

Escribe en db/postgres/demo/imagenes/:
  - <clave>.jpg            foto de la publicacion (una por oferta demo)
  - <clave>-recepcion.jpg  foto de la recepcion fisica en el LIS
  - <clave>-entrega.jpg    foto de la entrega final al estudiante
  - certificado-demo.pdf   certificado de estudio ficticio
  - imagenes.json          manifiesto que lee backend/scripts/db/demo.js

Cualquier .jpg se puede reemplazar por una FOTO REAL del producto con el
mismo nombre (JPEG, maximo 2 MB); demo.js la cargara tal cual.
"""
import json
import os

from PIL import Image, ImageDraw, ImageFont

DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'imagenes')
W, H = 800, 600

# clave -> (nombre visible, categoria)
PRODUCTOS = {
    'OP1': ('Morral escolar', 'utiles'),
    'OP2': ('Diccionario inglés-español', 'libros'),
    'OP3': ('Lámpara de escritorio', 'mobiliario'),
    'OP4': ('Mouse inalámbrico', 'tecnologia'),
    'OR1': ('Gorra deportiva', 'ropa'),
    'OC1': ('Set de marcadores', 'utiles'),
    'OA1': ('Chaqueta impermeable', 'ropa'),
    'OA2': ('Calculadora científica', 'utiles'),
    'OA3': ('Portátil 8 GB', 'tecnologia'),
    'OA4': ('Silla ergonómica', 'mobiliario'),
    'OA5': ('Kit de aseo personal', 'aseo'),
    'OH1': ('Cuadernos x10', 'utiles'),
    'OH2': ('Libro de Cálculo I', 'libros'),
    'OH3': ('Bata de laboratorio', 'laboratorio'),
    'OS1': ('Tablet 10 pulgadas', 'tecnologia'),
    'OF1': ('Audífonos con micrófono', 'tecnologia'),
    'OI1': ('Resmas de papel carta', 'utiles'),
    'OD1': ('Monitor 19 pulgadas', 'tecnologia'),
    'L1': ('Impresora láser', 'tecnologia'),
    'L2': ('Videoproyector', 'tecnologia'),
    'L3': ('Estantería metálica', 'mobiliario'),
    'L4': ('Pizarra acrílica', 'mobiliario'),
    'L5': ('Microscopio escolar', 'laboratorio'),
    'L6': ('Osciloscopio digital', 'laboratorio'),
    'R_REGLAS': ('Juego de reglas y escuadras', 'utiles'),
    'R_MOCHILA': ('Mochila deportiva', 'utiles'),
    'R_TERMOMETRO': ('Termómetro digital', 'laboratorio'),
    'R_GRAFICADORA': ('Calculadora graficadora', 'utiles'),
}
RECEPCION = ['OA3', 'OA5', 'OH1', 'OH2', 'OH3', 'OS1', 'OD1', 'OI1', 'L2', 'L3', 'L4', 'L5', 'L6',
             'R_MOCHILA', 'R_TERMOMETRO', 'R_GRAFICADORA']
ENTREGA = ['OH1', 'OH2', 'OH3', 'R_MOCHILA']

# Paleta del proyecto: verdes como base (D-67), un tono por categoria.
COLORES = {
    'tecnologia': ((22, 101, 52), (74, 160, 104)),
    'utiles': ((21, 94, 79), (72, 156, 132)),
    'libros': ((52, 86, 46), (118, 152, 96)),
    'ropa': ((30, 82, 64), (88, 146, 118)),
    'aseo': ((24, 110, 96), (96, 176, 160)),
    'mobiliario': ((60, 80, 52), (130, 150, 110)),
    'laboratorio': ((18, 90, 100), (80, 160, 170)),
}
BLANCO = (255, 255, 255)
TINTA = (245, 250, 246)


def fuente(tam, negrita=False):
    for nombre in (['segoeuib.ttf', 'arialbd.ttf'] if negrita else ['segoeui.ttf', 'arial.ttf']):
        ruta = os.path.join(os.environ.get('WINDIR', 'C:/Windows'), 'Fonts', nombre)
        if os.path.exists(ruta):
            return ImageFont.truetype(ruta, tam)
    for ruta in ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if negrita else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',):
        if os.path.exists(ruta):
            return ImageFont.truetype(ruta, tam)
    return ImageFont.load_default()


def fondo(c1, c2):
    img = Image.new('RGB', (W, H), c1)
    d = ImageDraw.Draw(img)
    for y in range(H):
        t = y / (H - 1)
        d.line([(0, y), (W, y)], fill=tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3)))
    return img


def icono(d, cat, cx, cy, s=1.0):
    """Icono simple de la categoria, centrado en (cx, cy)."""
    L = lambda v: int(v * s)  # noqa: E731
    g = dict(fill=TINTA)
    o = dict(outline=TINTA, width=L(10))
    if cat == 'tecnologia':      # portatil
        d.rounded_rectangle([cx - L(150), cy - L(110), cx + L(150), cy + L(70)], radius=L(14), **o)
        d.rectangle([cx - L(118), cy - L(80), cx + L(118), cy + L(40)], fill=(255, 255, 255, 60))
        d.polygon([(cx - L(190), cy + L(85)), (cx + L(190), cy + L(85)), (cx + L(160), cy + L(115)), (cx - L(160), cy + L(115))], **g)
    elif cat == 'utiles':        # cuaderno con espiral y lapiz
        d.rounded_rectangle([cx - L(110), cy - L(130), cx + L(80), cy + L(130)], radius=L(12), **o)
        for i in range(6):
            y = cy - L(100) + i * L(40)
            d.ellipse([cx - L(130), y, cx - L(98), y + L(22)], **o)
        for i in range(4):
            y = cy - L(60) + i * L(45)
            d.line([cx - L(70), y, cx + L(50), y], fill=TINTA, width=L(6))
        d.polygon([(cx + L(120), cy - L(120)), (cx + L(150), cy - L(120)), (cx + L(150), cy + L(90)), (cx + L(135), cy + L(130)), (cx + L(120), cy + L(90))], **g)
    elif cat == 'libros':        # libro abierto
        d.polygon([(cx, cy - L(90)), (cx - L(170), cy - L(120)), (cx - L(170), cy + L(100)), (cx, cy + L(130))], **o)
        d.polygon([(cx, cy - L(90)), (cx + L(170), cy - L(120)), (cx + L(170), cy + L(100)), (cx, cy + L(130))], **o)
        for i in range(4):
            y = cy - L(60) + i * L(40)
            d.line([cx - L(140), y - L(20), cx - L(30), y], fill=TINTA, width=L(5))
            d.line([cx + L(30), y, cx + L(140), y - L(20)], fill=TINTA, width=L(5))
    elif cat == 'ropa':          # camiseta
        d.polygon([(cx - L(70), cy - L(130)), (cx - L(170), cy - L(80)), (cx - L(130), cy - L(10)), (cx - L(90), cy - L(35)),
                   (cx - L(90), cy + L(130)), (cx + L(90), cy + L(130)), (cx + L(90), cy - L(35)), (cx + L(130), cy - L(10)),
                   (cx + L(170), cy - L(80)), (cx + L(70), cy - L(130)), (cx + L(35), cy - L(100)), (cx - L(35), cy - L(100))], **o)
    elif cat == 'aseo':          # frasco y jabon
        d.rounded_rectangle([cx - L(150), cy - L(60), cx - L(30), cy + L(130)], radius=L(20), **o)
        d.rectangle([cx - L(110), cy - L(110), cx - L(70), cy - L(60)], **g)
        d.rounded_rectangle([cx + L(10), cy + L(30), cx + L(170), cy + L(130)], radius=L(30), **o)
        for i, (x, y, r) in enumerate([(60, -40, 22), (110, -70, 14), (140, -20, 18)]):
            d.ellipse([cx + L(x - r), cy + L(y - r), cx + L(x + r), cy + L(y + r)], outline=TINTA, width=L(6))
    elif cat == 'mobiliario':    # silla
        d.rounded_rectangle([cx - L(90), cy - L(140), cx + L(90), cy - L(10)], radius=L(18), **o)
        d.rectangle([cx - L(110), cy, cx + L(110), cy + L(30)], **g)
        for x in (-95, 75):
            d.rectangle([cx + L(x), cy + L(30), cx + L(x + 20), cy + L(140)], **g)
    elif cat == 'laboratorio':   # matraz
        d.polygon([(cx - L(35), cy - L(140)), (cx + L(35), cy - L(140)), (cx + L(35), cy - L(50)), (cx + L(140), cy + L(120)),
                   (cx - L(140), cy + L(120)), (cx - L(35), cy - L(50))], **o)
        d.polygon([(cx - L(80), cy + L(40)), (cx + L(80), cy + L(40)), (cx + L(120), cy + L(110)), (cx - L(120), cy + L(110))], **g)


def centrado(d, texto, y, f, color=BLANCO):
    ancho = d.textlength(texto, font=f)
    d.text(((W - ancho) / 2, y), texto, font=f, fill=color)


def publicacion(nombre, cat, etiqueta=None):
    c1, c2 = COLORES[cat]
    img = fondo(c1, c2)
    d = ImageDraw.Draw(img, 'RGBA')
    d.ellipse([W / 2 - 210, 70, W / 2 + 210, 450], fill=(255, 255, 255, 28))
    icono(d, cat, W // 2, 255)
    d.rectangle([0, H - 120, W, H], fill=(0, 0, 0, 90))
    centrado(d, nombre, H - 105, fuente(40, True))
    centrado(d, 'Imagen de ejemplo · LIS Dona', H - 48, fuente(22), (220, 235, 225))
    if etiqueta:
        f = fuente(30, True)
        ancho = d.textlength(etiqueta, font=f) + 44
        d.rounded_rectangle([24, 24, 24 + ancho, 80], radius=28, fill=(250, 204, 21, 235))
        d.text((46, 32), etiqueta, font=f, fill=(40, 40, 20))
    return img


def certificado():
    img = Image.new('RGB', (1240, 1754), BLANCO)  # A4 a 150 ppp
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 1240, 160], fill=COLORES['tecnologia'][0])
    d.text((80, 50), 'Universidad ficticia de demostración', font=fuente(48, True), fill=BLANCO)
    d.text((80, 280), 'Certificado de estudio vigente (DEMO)', font=fuente(56, True), fill=(20, 60, 40))
    lineas = ['Documento FICTICIO generado para la demostración de LIS Dona.',
              'No corresponde a ninguna persona real ni tiene validez.',
              '', 'Programa: Ingeniería de Sistemas (ejemplo)', 'Semestre: 2026-2 (ejemplo)']
    for i, t in enumerate(lineas):
        d.text((80, 420 + i * 70), t, font=fuente(36), fill=(40, 40, 40))
    return img


def main():
    os.makedirs(DIR, exist_ok=True)
    manifiesto = {'productos': {}, 'recepcion': {}, 'entrega': {}}
    for clave, (nombre, cat) in PRODUCTOS.items():
        base = clave.lower().replace('_', '-')
        publicacion(nombre, cat).save(os.path.join(DIR, f'{base}.jpg'), quality=80, optimize=True)
        manifiesto['productos'][clave] = f'{base}.jpg'
        if clave in RECEPCION:
            publicacion(nombre, cat, 'Recepción en el LIS').save(os.path.join(DIR, f'{base}-recepcion.jpg'), quality=78, optimize=True)
            manifiesto['recepcion'][clave] = f'{base}-recepcion.jpg'
        if clave in ENTREGA:
            publicacion(nombre, cat, 'Entrega al estudiante').save(os.path.join(DIR, f'{base}-entrega.jpg'), quality=78, optimize=True)
            manifiesto['entrega'][clave] = f'{base}-entrega.jpg'
    certificado().save(os.path.join(DIR, 'certificado-demo.pdf'), 'PDF', resolution=150)
    manifiesto['certificado'] = 'certificado-demo.pdf'
    with open(os.path.join(DIR, 'imagenes.json'), 'w', encoding='utf-8') as f:
        json.dump(manifiesto, f, ensure_ascii=False, indent=2)
    total = sum(os.path.getsize(os.path.join(DIR, x)) for x in os.listdir(DIR))
    print(f'{len(os.listdir(DIR))} archivos, {total / 1024:.0f} KB en {DIR}')


if __name__ == '__main__':
    main()
