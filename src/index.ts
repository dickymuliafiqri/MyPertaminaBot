import { GoogleSpreadsheetRow } from "google-spreadsheet";
import { Database } from "./modules/database";
import { sleep } from "./modules/helper";
import { Pertamina } from "./modules/pertamina";

(async () => {
  let transactionLimit = 10;
  const db = new Database();
  await db.doc.loadInfo();

  for (let i = 0; i < db.doc.sheetCount - 1; i++) {
    if (transactionLimit <= 0) break;

    const sheet = db.doc.sheetsByIndex[i];

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
    let rows: GoogleSpreadsheetRow<Record<string, any>>[] = [];
    try {
      rows = await sheet.getRows();
      await sheet.loadCells();
    } catch (e: any) {
      console.log(e.response);
    }

    if (!rows) continue;

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
      console.log(`\n[+] Using ${sheet.title} credential...`);

      let maxColumnIndex = 0;
      for (const row of rows) {
        const rawData = row["_rawData"];
        if (maxColumnIndex < rawData.length) maxColumnIndex = rawData.length;
      }

      for (const row of rows) {
        const rawData = row["_rawData"];
        if (!isNaN(rawData[0]?.replaceAll(" ", "")) && rawData[rawData.length - 1] != "End") {
          if (rawData.length < maxColumnIndex) {
            // Process data
            const nik = parseInt(rawData[0].replaceAll(" ", "")).toString();

            console.log(`[+] Processing ${nik}...`);
            const transaction = await pertamina.transaction(nik);
            const cellA1Notation = (rawData.length + 9).toString(36).toUpperCase() + row["_rowNumber"];
            const cell = sheet.getCell(row["_rowNumber"] - 1, rawData.length);

            if (transaction.success) {
              console.log(`[+] Transaction success!`);
              cell.value = transaction.payload.products[0].quantity;
              transactionLimit -= 1;
            } else if (transaction.code == 404) {
              console.log(`[-] Found bad NIK, deleting...`);
              await row.delete();
            } else {
              console.log(`[-] Error occured: ${transaction.message}`);
              cell.value = 0;
            }

            console.log(`[+] Saving changes to Google Sheets...`);
            await sheet.saveUpdatedCells();
            console.log(`[+] Changes saved on ${cellA1Notation}!`);
            console.log(`[+] Done!`);
            break;
          }
        }
      }
    }
  }
})();
