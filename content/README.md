# Správa obsahu

Upravujte zdrojové soubory v `content/packs/`, ne agregované soubory v `src/data/`. Každý JSON balíček obsahuje jednu lekci a její slovíčka, gramatiku, cvičení a příběhy. Díky tomu lze obsah přidávat a kontrolovat po menších, samostatných celcích.

## Rozšíření existující lekce

Upravte `content/packs/<id-lekce>.json`. Přidejte slovíčka, cvičení nebo příběh do příslušného pole a aktualizujte navazující ID v objektu `lesson` (například `new_vocabulary_ids`, `exercise_ids` nebo `story_ids`). Kompletní příklad je v `content/packs/q1-hodnosti.json`.

## Přidání nové lekce

1. Zkopírujte existující balíček v `content/packs/` a pojmenujte jej podle ID nové lekce, například `q2-novy-modul.json`.
2. Zvyšte jedinečné číselné pole `order`; určuje pořadí lekcí v aplikaci.
3. Upravte objekt `lesson` a přidejte odpovídající položky do polí `vocabulary`, `grammar`, `exercises` a `stories`. Prázdná pole zapište jako `[]`.
4. Spusťte `npm.cmd run content:build`. Kompilátor zkontroluje JSON, duplicitní ID a odkazy mezi lekcemi a obsahem. Při chybě vypíše problém a negeneruje výstup.
5. Spusťte `npm.cmd test` a `npm.cmd run build`. Do GitHubu publikujte současně změněné balíčky i vygenerované soubory `src/data/*.json`.

Každý balíček má jedinečné `order`, jeden objekt `lesson` a pole `vocabulary`, `grammar`, `exercises` a `stories`. ID lekce musí odpovídat názvu souboru. Gramatiku používanou ve více lekcích uložte do balíčku, kde se zavádí poprvé; ostatní lekce na ni odkážou přes její ID. Příběh patří do balíčku lekce uvedené v `curriculum_lesson_id`, i když jej používá více lekcí.

`src/data/` zůstává výstupním formátem aplikace a soubory z něj se nadále načítají z GitHubu. Samostatná databáze by se hůře upravovala a kontrolovala v historii GitHubu; JSON balíčky zachovávají přehledné rozdíly a stávající způsob distribuce.
