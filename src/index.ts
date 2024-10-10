import { GoogleSpreadsheetWorksheet } from "google-spreadsheet";
import { Database, UserLocalData } from "./modules/database";
import { Pertamina } from "./modules/pertamina";
import { Telegram } from "./modules/telegram";
import { config as loadEnv } from "dotenv";

async function sheetTransaction(
  sheet: GoogleSpreadsheetWorksheet,
  transactionLimit: number,
  pertamina: Pertamina,
  accountData: UserLocalData
): Promise<string> {
  const sheetName = sheet.title;
  const message: string[] = [];

  console.log(`\n[+] Making transaction for ${sheetName} sheet...`);
  if (sheetName != "Bansos") message.push(`${sheetName}`);

  let loopLimit = 2;
  let maxColumnIndex = 0;

  let rows = await sheet.getRows();

  if (sheetName == "Bansos") {
    await sheet.loadCells();
  }

  for (const row of rows) {
    const rawData = row["_rawData"];
    if (maxColumnIndex < rawData.length) maxColumnIndex = rawData.length;
  }

  while (loopLimit > 0) {
    for (const row of rows) {
      if (transactionLimit <= 0) break;
      const rawData = row["_rawData"];

      if (rawData.length > 25) break;

      if (!isNaN(rawData[0]?.replaceAll(" ", "")) && rawData[rawData.length - 1] != "End") {
        if (rawData.length < maxColumnIndex) {
          const name = rawData[1];

          const nik = parseInt(rawData[0].replaceAll(" ", ""), 10).toString();
          const cellA1Notation = (rawData.length + 1 + 9).toString(36).toUpperCase() + row["_rowNumber"];
          const cell = sheet.getCell(row["_rowNumber"] - 1, rawData.length);
          const transactionRecord = rawData.filter(
            (t: string) => parseInt(t, 10) <= 3 && parseInt(t, 10) > 0
          ) as string[];

          if (transactionRecord.length > 2) {
            console.log(`[+] Buy limit reached for ${name}!`);
            cell.value = 0;

            if (sheetName != "Bansos") {
              console.log(`[+] Proceeding bansos...`);
              const bansosDB = new Database();
              await bansosDB.doc.loadInfo();

              message.push(await sheetTransaction(bansosDB.doc.sheetsByTitle["Bansos"], 1, pertamina, accountData));
              transactionLimit -= 1;
            }

            continue;
          }

          console.log(`[+] Processing ${name}...`);
          const transaction = await pertamina.transaction(nik);
          const sheetA1Notation = `${sheetName}:${cellA1Notation}`;

          if (transaction.success) {
            console.log(`[+] Transaction success!`);
            const quantity = transaction.payload.products[0].quantity;
            cell.value = quantity;
            message.push(
              `[🟢] ${sheetName} > Transaction success > ${sheetA1Notation} > ${quantity}/${(accountData.stock -=
                quantity)}`
            );
            transactionLimit -= 1;
          } else if (transaction.code == 404) {
            console.log(`[-] Found bad NIK, deleting...`);
            message.push(`[🔴] ${sheetName} > Found bad NIK > ${nik} > ${sheetA1Notation}`);
            await row.delete();
          } else if (transaction.message == "Transaksi melebihi kuota subsidi") {
            console.log(`[-] Transaction limit reached for ${name}!`);
            cell.value = "End";
            message.push(`[🟡] ${sheetName} > Transaction limit reached > ${nik} > ${sheetA1Notation}`);
          } else {
            console.log(`[-] Error occured: ${transaction.message}`);
            cell.value = 0;
            message.push(`[🔴] ${sheetName} > Error: ${transaction.message} > ${nik} > ${sheetA1Notation}`);
          }

          console.log(`[+] Data update on ${cellA1Notation}!`);
        }
      }
    }

    loopLimit -= 1;
    maxColumnIndex += 1;
  }

  if (transactionLimit > 0) {
    console.log(`[+] Transaction limit not reached, clearing sheet...`);
    await sheet.clear(`C1:Z${rows.length + 1}`);
    message.push(`[+] Transaction limit not reached, sheet ${sheetName} cleared!`);
  }

  console.log(`[+] Saving changes to Google Sheets...`);
  await sheet.saveUpdatedCells();
  console.log(`[+] Done!`);

  return message.join("\n");
}

// Initialize
loadEnv();
const bot = new Telegram();
const finalMessage: string[] = [];

(async () => {
  console.log("STARTING PROGRAM...");
  console.log("[+] Initializing classes...");

  let userLimit = 10;
  const db = new Database();
  await db.doc.loadInfo();

  await bot.sendToAdmin("BOT STARTED!");

  for (let i = 0; i < db.doc.sheetCount - 1; i++) {
    const sheet = db.doc.sheetsByIndex[i];
    const sheetName = sheet.title;
    let transactionLimit = 3;

    if (userLimit <= 0) break;

    console.log(`\n[+] Accessing ${sheetName} sheet...`);

    // Check user on local temp data
    let user = db.getUserLocalData(sheetName);
    if (user) {
      if (Math.abs(new Date(user.lastUpdate).getTime() - new Date().getTime()) / 3600000 < 2) {
        if (user.stock <= 0 || !user.isTokenValid) {
          console.log("[-] Out of stock or token invalid!");
          continue;
        }
      }
    }

    // Proceed user
    await sheet.loadCells();

    const bearer = sheet.getCellByA1("B1").value?.toString() || "";
    const username = sheet.getCellByA1("B2").value?.toString() || "";
    const password = sheet.getCellByA1("B3").value?.toString() || "";

    const pertamina = new Pertamina(username, password, bearer);
    const isTokenValid = await pertamina.checkToken();
    const stock = await pertamina.checkStock();

    // Save updated stock
    user = {
      name: sheetName,
      stock: stock,
      isTokenValid: isTokenValid,
      lastUpdate: new Date(),
    };
    db.setUserLocalData(user);

    if (isTokenValid && stock > 0) {
      const message = await sheetTransaction(sheet, transactionLimit, pertamina, user);
      finalMessage.push(message);

      userLimit -= 1;
    }

    console.log(`[+] Done proceeding ${sheetName} sheet!`);
  }
})()
  .catch(async (e: any) => {
    const errorMessage = `${e.stack}\n\n${e.message}`;
    console.log(errorMessage);
    await bot.sendRawToAdmin(errorMessage);
  })
  .finally(async () => {
    // Final process
    console.log("PROGRAM FINISHED!");
    if (finalMessage.length > 0) {
      await bot.sendToAdmin(finalMessage.join("\n\n"));
    }
    await bot.sendToAdmin("PROGRAM FINISHED!");
  });
