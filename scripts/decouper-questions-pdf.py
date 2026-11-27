"""
Découpe chaque question d'un sujet PDF en une image (concours blancs).

    python3 scripts/decouper-questions-pdf.py <sujet.pdf> <dossier-sortie> <PREFIXE> <mode>

    mode « qcm »        : questions « 12- … » suivies de propositions « A) … D) »
                          (Avenir). Images PREFIXE-01.png, PREFIXE-02.png… dans
                          l'ordre du sujet, doublons de numéro compris.
    mode « affirmations »: exercices « EXERCICE n : » et affirmations « a. … »
                          (Puissance Alpha). Images PREFIXE-01a.png…

Pourquoi : les formules des sujets scientifiques sont des images dans le PDF,
que la transcription perd. Renvoyer l'élève « au sujet, page 8 » l'oblige à y
chercher sa question parmi trois ou quatre ; l'image de la question elle-même,
au-dessus des boutons de réponse, est exacte et se lit d'un coup d'œil.

Méthode : les coordonnées des lignes de texte (`pdftotext -bbox-layout`)
situent le début de chaque question et sa dernière proposition ; l'image
descend ensuite jusqu'à la première bande blanche, pour ne pas couper une
formule plus haute que sa lettre. Une question à cheval sur deux pages est
recollée. Requiert poppler (pdftoppm, pdftotext) et Pillow.
"""

import html
import os
import re
import subprocess
import sys
import tempfile

from PIL import Image

DPI = 150
ECHELLE = DPI / 72  # points PDF → pixels
MARGE_HAUT = 6  # points au-dessus de la ligne d'en-tête
BANDE_BLANCHE = 10  # points : un écart plus grand termine la question
MARGE_PAGE = 50  # points : en-tête et pied de page ignorés
BLANC = 245


def lignes_du_pdf(pdf):
    sortie = subprocess.run(["pdftotext", "-bbox-layout", pdf, "-"], capture_output=True, text=True, check=True).stdout
    pages = re.findall(r'<page width="([\d.]+)" height="([\d.]+)">(.*?)</page>', sortie, re.S)
    resultat = []
    for numero, (largeur, hauteur, corps) in enumerate(pages, 1):
        for x0, y0, x1, y1, contenu in re.findall(
            r'<line xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</line>', corps, re.S
        ):
            texte = " ".join(html.unescape(m) for m in re.findall(r">([^<]+)</word>", contenu))
            resultat.append({"page": numero, "y0": float(y0), "y1": float(y1), "texte": texte,
                             "hauteur_page": float(hauteur), "largeur_page": float(largeur)})
    return resultat


def ligne_vide(image, y, x0, x1):
    rangee = image.crop((x0, y, x1, y + 1)).convert("L")
    return rangee.getextrema()[0] >= BLANC


def fin_par_bande_blanche(image, depart_px, limite_px, x0, x1):
    """Première bande blanche d'au moins BANDE_BLANCHE points après `depart_px`."""
    seuil = int(BANDE_BLANCHE * ECHELLE)
    vides = 0
    for y in range(depart_px, limite_px):
        vides = vides + 1 if ligne_vide(image, y, x0, x1) else 0
        if vides >= seuil:
            return y - vides + 2
    return limite_px


def premiere_ligne_pleine(image, depart_px, limite_px, x0, x1):
    for y in range(depart_px, limite_px):
        if not ligne_vide(image, y, x0, x1):
            return y
    return depart_px


def derniere_ligne_pleine(image, depart_px, limite_px, x0, x1):
    for y in range(limite_px, depart_px, -1):
        if not ligne_vide(image, y, x0, x1):
            return y + 4
    return limite_px


def main():
    pdf, sortie, prefixe, mode = sys.argv[1:5]
    os.makedirs(sortie, exist_ok=True)
    lignes = lignes_du_pdf(pdf)

    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(["pdftoppm", "-r", str(DPI), "-png", pdf, os.path.join(tmp, "p")], check=True)
        fichiers = sorted(os.listdir(tmp), key=lambda f: int(re.search(r"(\d+)", f).group(1)))
        images = {i + 1: Image.open(os.path.join(tmp, f)).convert("RGB") for i, f in enumerate(fichiers)}

        if mode == "qcm":
            entete = re.compile(r"^(\d{1,2})\s*-")
            option = re.compile(r"^[A-E]\)")
            coupure = re.compile(r"^(Exercice|\d{1,2}\s*-)")
        else:
            # « a.​ » : le PDF place un espace sans largeur après le point.
            entete = re.compile(r"^([a-d])\.[\s\u200b]")
            option = None
            coupure = re.compile(r"^(EXERCICE|[a-d]\.[\s\u200b])")

        en_tetes = [i for i, l in enumerate(lignes) if entete.match(l["texte"])]
        exercice = 0
        rang = 0
        for k, i in enumerate(en_tetes):
            l = lignes[i]
            # Numéro d'exercice (affirmations) : le dernier titre rencontré.
            titres = [x for x in lignes[: i + 1] if re.match(r"^EXERCICE\s+(\d+)", x["texte"])]
            if titres:
                exercice = int(re.match(r"^EXERCICE\s+(\d+)", titres[-1]["texte"]).group(1))

            # Ancre : la dernière proposition de la question, sinon son en-tête.
            ancre = l
            if option:
                suivantes = lignes[i + 1:]
                for x in suivantes:
                    if coupure.match(x["texte"]):
                        break
                    if option.match(x["texte"]):
                        ancre = x

            largeur_px = images[l["page"]].width
            x0, x1 = int(40 * ECHELLE), largeur_px - int(40 * ECHELLE)
            morceaux = []
            haut = max(0, int((l["y0"] - MARGE_HAUT) * ECHELLE))
            for page in range(l["page"], ancre["page"] + 1):
                image = images[page]
                bas_page = int((l["hauteur_page"] - MARGE_PAGE) * ECHELLE)
                if page == ancre["page"]:
                    depart = int(ancre["y1"] * ECHELLE) if page == ancre["page"] else haut
                    bas = fin_par_bande_blanche(image, depart, bas_page, x0, x1)
                else:
                    bas = derniere_ligne_pleine(image, haut, bas_page, x0, x1)
                if page != l["page"]:
                    haut = premiere_ligne_pleine(image, int(MARGE_PAGE * ECHELLE), bas_page, x0, x1) - 4
                morceaux.append(image.crop((x0, haut, x1, max(bas, haut + 10))))

            total = sum(m.height for m in morceaux)
            resultat = Image.new("RGB", (x1 - x0, total), "white")
            y = 0
            for m in morceaux:
                resultat.paste(m, (0, y))
                y += m.height

            rang += 1
            if mode == "qcm":
                nom = f"{prefixe}-{rang:02d}.png"
            else:
                nom = f"{prefixe}-{exercice:02d}{entete.match(l['texte']).group(1)}.png"
            resultat.save(os.path.join(sortie, nom), optimize=True)
            print(nom, f"page {l['page']}" + (f"-{ancre['page']}" if ancre["page"] != l["page"] else ""),
                  f"{resultat.width}×{resultat.height}")


if __name__ == "__main__":
    main()
