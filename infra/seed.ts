/**
 * Sends synthetic Slovak test messages to the local test mailbox.
 * Run with: pnpm seed (needs the test mailserver from docker-compose.yml running).
 * All names, addresses and content are made up.
 */
import nodemailer from "nodemailer";
import type { SendMailOptions } from "nodemailer";

const transport = nodemailer.createTransport({
  host: process.env["MAIL_TEST_SMTP_HOST"] ?? "127.0.0.1",
  port: Number(process.env["MAIL_TEST_SMTP_PORT"] ?? 3025),
  secure: false,
  tls: { rejectUnauthorized: false },
});

const TO = "podpora@aquapro.test";

const messages: SendMailOptions[] = [
  {
    messageId: "<seed-001@hotelpanorama.example>",
    from: '"Jana Horváthová" <j.horvathova@hotelpanorama.example>',
    to: TO,
    subject: "Reklamácia dodávky: zakalená voda",
    text: "Dobrý deň,\n\ndve fľaše z poslednej dodávky majú zakalenú vodu. Prosíme o výmenu a stanovisko.\n\nĎakujem,\nJana Horváthová\nHotel Panoráma",
  },
  {
    messageId: "<seed-002@fitnessaktiv.example>",
    from: '"Martin Dobrovič" <m.dobrovic@fitnessaktiv.example>',
    to: TO,
    subject: "Dopyt na prenájom chladených dávkovačov",
    text: "Dobrý deň, zaujíma nás prenájom 2 chladených dávkovačov pre fitness centrum. Môžete poslať ponuku?",
    html: "<p>Dobrý deň,</p><p>zaujíma nás <b>prenájom 2 chladených dávkovačov</b> pre fitness centrum. Môžete poslať ponuku?</p>",
  },
  {
    messageId: "<seed-003@autoservis.example>",
    from: '"Ján Kováč" <kovac@autoservis.example>',
    to: TO,
    subject: "Servisný interval dávkovača",
    text: "Dobrý deň, ako často treba robiť servisnú kontrolu dávkovača?",
  },
  {
    messageId: "<seed-004@autoservis.example>",
    inReplyTo: "<seed-003@autoservis.example>",
    references: ["<seed-003@autoservis.example>"],
    from: '"Ján Kováč" <kovac@autoservis.example>',
    to: TO,
    subject: "Re: Servisný interval dávkovača",
    text: "Ďakujem za odpoveď. Termín v stredu popoludní mi vyhovuje.",
  },
  {
    messageId: "<seed-005@zspripark.example>",
    from: '"Eva Kováčová" <riaditelka@zspripark.example>',
    to: TO,
    subject: "Žiadosť o zmenu dodacieho dňa – štvrtok",
    text: "Dobrý deň, prosíme o presun dodávky na štvrtok. Ďakujeme.",
  },
  {
    messageId: "<seed-006@novakpartners.example>",
    from: '"Alena Nováková" <a.novakova@novakpartners.example>',
    to: TO,
    subject: "Dodací list október",
    text: "V prílohe posielam dodací list k rozporovanej faktúre.",
    attachments: [
      {
        filename: "dodaci-list-oktober.txt",
        content: "Dodací list č. 2026-1187\nPoložka: voda 19 l\nPočet: 24\n",
        contentType: "text/plain",
      },
    ],
  },
  {
    // Deliberately hostile HTML: used later to test sanitizing of incoming mail.
    messageId: "<seed-007@marketing.example>",
    from: '"Akcie" <akcie@marketing.example>',
    to: TO,
    subject: "Akcia novembra (test sanitizácie)",
    html: '<p onclick="alert(1)">Veľká akcia!</p><script>alert("xss")</script><img src="http://tracker.example/pixel.gif" width="1" height="1"><a href="javascript:alert(2)">Klikni</a>',
  },
  {
    messageId: "<seed-008@dodavatel.example>",
    from: '"Dodávateľ" <newsletter@dodavatel.example>',
    to: TO,
    subject: "Novinky v novembri",
    text: "Pozrite si naše novinky. (hromadná správa)",
  },
];

for (const message of messages) {
  await transport.sendMail(message);
  console.log(`odoslané: ${String(message.subject)}`);
}
console.log(`Hotovo, ${messages.length} správ v schránke ${TO}.`);
