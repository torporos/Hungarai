# Hungarai

Minimalistická aplikace pro výuku maďarštiny českými mluvčími. Webové rozhraní v Reactu a Vite používá tmavý vzhled s ostrými hranami, maďarskou trikolóru a vlastní transparentní ilustrace honvéda z roku 1914 v modrošedé polní uniformě. Lekce jsou tematické a postupně rostou od pěti nových slov k náročnější gramatice; hotové lekce lze znovu procvičovat.

## Spuštění

```sh
npm.cmd install
npm.cmd run dev
```

Produkční sestavení ověříte příkazem `npm.cmd run build`; testy dat a načítání příkazem `npm.cmd test`.

## Android APK

Pro sestavení je potřeba JDK 17 nebo novější a Android SDK s platformou 36 a Build Tools 36. Nastavte `JAVA_HOME` a `ANDROID_SDK_ROOT` (případně také `ANDROID_HOME`) a spusťte:

```powershell
npm.cmd run android:debug
```

Debug APK se vytvoří v `android\app\build\outputs\apk\debug\app-debug.apk`. Jde o testovací APK podepsané vývojovým klíčem.

V Android aplikaci se výslovnost přehrává přes systémový TextToSpeech, ne přes řečové API WebView. Při prvním spuštění aplikace ověří dostupnost maďarského hlasu a při jeho absenci otevře systémovou instalaci hlasových dat, kterou je potřeba potvrdit. Pro samotné přehrávání není potřeba oprávnění k mikrofonu.

## Zatím hotovo

- Přehled a lekce s odemykáním podle zkušeností.
- Třináct navazujících modulů v šesti tématech; každá lekce začíná představením slov a gramatiky a obsahuje další procvičování nad rámec jedné otázky na nové slovo.
- Nová slovní zásoba, věty, gramatika i příběhy respektují historický cutoff roku 1914; nová série je zasazená do Uherska roku 1913.
- Promíchané cvičení na rozpoznání, vybavení z paměti, psaní maďarských tvarů, skládání vět, poslech a doplňování.
- Vyhledávání a řazení ve slovníčku, samostatná gramatická sekce a příběhy s kontextovou nápovědou ke slovům.
- Slovník zobrazuje základní tvary; postupně odemyká skloňování, časování i související gramatiku.
- Místní rozvrh opakování vrací slova k aktivnímu vybavení po rostoucích intervalech.
- Průvodcovské ilustrace honvéda pro lekce, slovníček a příběhy.

## Didaktické principy

Cvičení využívají aktivní vybavování místo pouhého opakovaného čtení, odložené opakování, střídání typů úloh, tvoření vlastních odpovědí a vysvětlující zpětnou vazbu. Tyto principy čerpají mimo jiné z výzkumu testovacího efektu, distribuovaného učení a přenosu poznatků:

- Roediger & Karpicke (2006), [Test-Enhanced Learning](https://doi.org/10.1111/j.1467-9280.2006.01693.x).
- Cepeda et al. (2006), [Distributed practice in verbal recall tasks](https://doi.org/10.1037/0033-2909.132.3.354).
- Butler (2010), [Repeated testing produces superior transfer of learning](https://doi.org/10.1037/a0019902).

Rozvrh opakování je lehká lokální heuristika, nikoli plná implementace FSRS.

Při spuštění aplikace se lekce, slovíčka, gramatika, cvičení a příběhy načítají z JSON souborů v [GitHub repozitáři](https://github.com/torporos/Hungarai/tree/main/src/data). Obsah lze ručně aktualizovat přímo v aplikaci; po úpravě JSON na GitHubu se změny projeví při příštím spuštění nebo obnovení obsahu, bez nového sestavení APK. Při výpadku internetu aplikace použije poslední staženou kopii, případně obsah přibalený v APK. Pokrok uživatele zůstává uložený místně v zařízení. Lokální kopie obsahu v `src/data/` se používají při vývoji a testech; jejich změny je nutné také publikovat na GitHub.
