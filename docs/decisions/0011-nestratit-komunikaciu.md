# 0011 · Komunikácia sa nesmie stratiť, ani keď človek chýba

Stav: návrh (24. 11. 2026), čaká na overenie Mailcow. Dopĺňa 0009.

## Problém

Previazanie e-mailov s úlohou vyžaduje čítať schránku. Vo vývoji to ide len počas prihlásenia, lebo heslo schránky drží aplikácia v pamäti. V ostrej prevádzke to **nie je prijateľné**: ak je človek na dovolenke, chorý alebo odišiel, odpoveď klienta sa v úlohe neobjaví a úloha vyzerá, že klient mlčí.

## Navrhované riešenie (vrstvy)

1. **Služobný účet namiesto hesla používateľa.** Samostatný proces (worker) číta schránky cez služobný prístup poštového servera (v Dovecote tzv. master user), nie cez heslo človeka. Funguje to bez ohľadu na to, či je dotyčný prihlásený. _Treba overiť, ako sa to nastavuje v Mailcow._
2. **Worker robí len to, čo potrebuje.** Pri nových správach načíta len hlavičky (`Message-ID`, `In-Reply-To`, `References`). Celú správu skopíruje do úlohy **len vtedy, keď patrí do už previazaného vlákna**. Ostatnú poštu neotvára. Každé skopírovanie sa zapíše do záznamu zmien. Superadmin ani admin tým nedostáva možnosť čítať cudzie schránky (rozhodnutie 0008 platí).
3. **Nikdy nie ticho zastarané údaje.** Úloha ukazuje, kedy sa pošta naposledy synchronizovala. Ak je synchronizácia neaktuálna alebo zlyhala, admin dostane upozornenie a úloha má viditeľný štítok.
4. **Zastupovanie.** Používateľ (alebo admin) môže nastaviť zástupcu na obdobie neprítomnosti. Úlohy a nové odpovede klientov v tom čase vidí aj zástupca. Pri odchode zamestnanca platí presmerovanie z 0009.
5. **Upozornenie na čakajúceho klienta.** Ak do úlohy príde odpoveď klienta a vlastník ju nezobral do stanovenej doby (napr. 4 pracovné hodiny), úloha sa ukáže v prehľade podpory ako „klient čaká“.
6. **Poistka na neskôr (voliteľné):** pravidlo na strane poštového servera (Sieve), ktoré kópiu odpovede na odoslané správy z úlohy (podľa označenia v `Reply-To`) pošle do spoločnej schránky. Zlepší to spoľahlivosť, ale je zložitejšie, preto až po overení.

## Vo vývoji

Kým nemáme Mailcow, kópie sa robia pri prihlásení používateľa, a úloha to otvorene hovorí („pošta naposledy synchronizovaná…“). Rozhranie čítania pošty je rovnaké, takže prechod na služobný účet nezmení zvyšok aplikácie.

## Otvorené

- Ako presne nastaviť služobný prístup v Mailcow a či je prijateľný z hľadiska GDPR a interných pravidiel firmy (formálne to musí schváliť vedenie).
- Presná doba pre „klient čaká“ a či sa počíta len do pracovnej doby.
