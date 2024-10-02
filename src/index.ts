import { GoogleSpreadsheetWorksheet } from "google-spreadsheet";
import { Database } from "./modules/database";
import { sleep } from "./modules/helper";
import { Pertamina } from "./modules/pertamina";

async function sheetTransaction(
  sheet: GoogleSpreadsheetWorksheet,
  transactionLimit: number,
  pertamina: Pertamina,
  db: Database
) {
  console.log(`\n[+] Making transaction for ${sheet.title} sheet...`);

  let loopLimit = 2;
  let maxColumnIndex = 0;

  let rows = await sheet.getRows();

  if (sheet.title == "Bansos") {
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

      if (!isNaN(rawData[0]?.replaceAll(" ", "")) && rawData[rawData.length - 1] != "End") {
        if (rawData.length < maxColumnIndex) {
          const name = rawData[1];
          /**
           * TODO
           *
           * - Figuring out indexing on bansos sheet
           */
          if (name == "ANA SULISTYO WATI") {
            console.log(rawData);
            console.log(maxColumnIndex);
            return;
          }

          const nik = parseInt(rawData[0].replaceAll(" ", "")).toString();
          const cellA1Notation = (rawData.length + 1 + 9).toString(36).toUpperCase() + row["_rowNumber"];
          const cell = sheet.getCell(row["_rowNumber"] - 1, rawData.length);
          const transactionRecord = rawData.filter((t: string) => parseInt(t) <= 3 && parseInt(t) > 0) as Array<string>;

          if (transactionRecord.length > 2) {
            console.log(`[+] Buy limit reached for ${name}!`);
            cell.value = 0;

            if (sheet.title != "Bansos") {
              console.log(`[+] Proceeding bansos...`);
              await sheetTransaction(db.doc.sheetsByIndex[db.doc.sheetCount - 1], 1, pertamina, db);
              transactionLimit -= 1;
            }

            continue;
          }

          console.log(`[+] Processing ${name}...`);
          const transaction = await pertamina.transaction(nik);

          if (transaction.success) {
            console.log(`[+] Transaction success!`);
            cell.value = transaction.payload.products[0].quantity;
          } else if (transaction.code == 404) {
            console.log(`[-] Found bad NIK, deleting...`);
            await row.delete();
          } else if (transaction.message == "Transaksi melebihi kuota subsidi") {
            console.log(`[-] Transaction limit reached for ${name}!`);
            cell.value = "End";
          } else {
            console.log(`[-] Error occured: ${transaction.message}`);
            cell.value = 0;
          }

          console.log(`[+] Data update on ${cellA1Notation}!`);

          transactionLimit -= 1;
        }
      }
    }

    loopLimit -= 1;
    maxColumnIndex += 1;
  }

  if (transactionLimit > 0) {
    console.log(`[+] Transaction limit not reached, clearing sheet...`);
    await sheet.clear(`C1:Z${rows.length + 1}`);
  }

  console.log(`[+] Saving changes to Google Sheets...`);
  await sheet.saveUpdatedCells();
  console.log(`[+] Done!`);
}

(async () => {
  let userLimit = 10;
  const db = new Database();
  await db.doc.loadInfo();

  for (let i = 0; i < db.doc.sheetCount - 1; i++) {
    const sheet = db.doc.sheetsByIndex[i];
    let transactionLimit = 3;

    if (userLimit <= 0) break;

    // Check user on local temp data
    let user = db.getUserLocalData(sheet.title);
    if (user) {
      if (Math.abs(new Date(user.lastUpdate).getTime() - new Date().getTime()) / 3600000 < 2) {
        if (user.stock <= 0 || !user.isTokenValid) {
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
    db.setUserLocalData({
      name: sheet.title,
      stock: stock,
      isTokenValid: isTokenValid,
      lastUpdate: new Date(),
    });

    if (isTokenValid && stock > 0) {
      await sheetTransaction(sheet, transactionLimit, pertamina, db);

      userLimit -= 1;
    }
  }
})();
