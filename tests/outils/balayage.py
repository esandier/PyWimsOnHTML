# Exécute de nombreux tirages de chaque exercice avec CPython et SymPy, en utilisant le module
# pywims extrait de runtime/python.js. Pour chaque tirage : « avant » s’exécute, chaque champ a
# une solution convertible, et la solution saisie comme par un élève est jugée juste par « apres ».
# Usage : python balayage.py [NOMBRE_DE_TIRAGES]
import random
import re
import sys
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def load_pywims():
    source = (ROOT / "runtime" / "python.js").read_text(encoding="utf-8")
    module_source = re.search(r"pywimsModuleSource = String\.raw`(.*?)`;", source, re.S).group(1)
    module = types.ModuleType("pywims")
    exec(module_source, module.__dict__)
    sys.modules["pywims"] = module
    return module


# Lecture simplifiée du format .pwq ; le compilateur reste la référence pour sa validation.
def parse(text):
    lines = text.replace("\r\n", "\n").split("\n")
    fields, index = {}, 1
    while index < len(lines):
        name = lines[index].strip()[1:].strip()
        index += 2
        content = []
        while index < len(lines) and lines[index].strip() != "%":
            content.append(lines[index])
            index += 1
        fields[name] = "\n".join(content).rstrip()
        index += 1
        if all(not line.strip() for line in lines[index:]):
            break
    return fields


def input_tags(enonce):
    for tag in re.findall(r"{%\s*(.*?)\s*%}", enonce, re.S):
        kind, name = re.match(r"(\w+)\s+['\"](\w+)['\"]", tag).groups()
        choices = re.search(r"choices=(\w+)", tag)
        yield kind, name, re.search(r"solution=(\w+)", tag).group(1), choices and choices.group(1)


def main():
    pywims = load_pywims()
    draws = int(sys.argv[1]) if len(sys.argv) > 1 else 200
    failures = 0
    for path in sorted((ROOT / "exercises").glob("*.pwq")):
        fields = parse(path.read_text(encoding="utf-8"))
        for seed in range(draws):
            try:
                random.seed(seed)
                namespace = {}
                exec(fields["avant"], namespace)
                answers = {}
                for kind, name, variable, choices in input_tags(fields["enonce"]):
                    value = namespace[variable]
                    if kind in ("input_radio", "input_checkbox"):
                        # L’élève coche les bons choix : « apres » reçoit leurs indices.
                        count = len(pywims._choice_texts(namespace[choices]))
                        answers[name] = pywims._choice_solution(value, kind == "input_checkbox", count)
                    elif kind in ("input_text", "input_math"):
                        answers[name] = pywims._solution_text(value)
                    else:
                        # Une case libre reçoit une valeur quelconque, ici 1.
                        answers[name] = [[cell if cell is not None else "1" for cell in row]
                                         for row in pywims._solution_cells(value)]
                # Sans « apres », la correction par défaut est en JavaScript : le compilateur et
                # tests/compiler-tests.html la vérifient ; ici, « avant » et les solutions suffisent.
                if "apres" not in fields:
                    continue
                namespace.update(answers)
                namespace["ok_answer"] = {}
                exec(fields["apres"], namespace)
                ok = namespace["ok_answer"]
                if not ok or not all(ok.values()):
                    raise AssertionError(f"solution jugée fausse : {ok} — {namespace.get('feedback')}")
            except Exception as error:
                failures += 1
                print(f"ÉCHEC {path.name}, graine {seed} : {error!r}")
        print(f"{path.name} : {draws} tirages vérifiés.")
    print(f"{failures} échec(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
