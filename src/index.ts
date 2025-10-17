import { GoogleSpreadsheetWorksheet } from "google-spreadsheet";
import { Database, UserLocalData } from "./modules/database";
import { Pertamina } from "./modules/pertamina";
import { Telegram } from "./modules/telegram";
import { config as loadEnv } from "dotenv";
import { getProxyList } from "./modules/helper";
import { sleep } from "bun";

// Initialize
loadEnv();
const bot = new Telegram();
let finalMessage: string[] = [];
let niks = Database.getNiksArray();
let userLimit = 3;
let errorCount = 0;

async function sheetTransaction(
  sheet: GoogleSpreadsheetWorksheet,
  transactionLimit: number,
  pertamina: Pertamina,
  accountData: UserLocalData
): Promise<string> {
  const sheetName = sheet.title;
  const message: string[] = [];
  const nowDate = new Date().getDate();

  console.log(`\n[+] Making transaction for ${sheetName} sheet...`);
  if (sheetName != "Bansos") message.push(`${sheetName} | ${accountData.stock}`);

  let loopLimit = 5;
  let bansosLimit = 3;
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
      if (accountData.stock <= 0 || transactionLimit <= 0 || errorCount >= 5) break;

      const rawData = row["_rawData"];

      if (rawData.length > 25) {
        if (loopLimit == 1) {
          console.log(`[+] Sheet has reached max column, clearing...`);
          await sheet.clear(`C1:Z${rows.length + 1}`);
          message.push(`[🟡] Max column reached!, sheet ${sheetName} has been cleared!`);
        }

        break;
      }

      if (!isNaN(rawData[0]?.replaceAll(" ", ""))) {
        if (rawData.length < maxColumnIndex) {
          const name = rawData[1];

          const nik = parseInt(rawData[0].replaceAll(" ", ""), 10).toString();
          const cellA1Notation = (rawData.length + 1 + 9).toString(36).toUpperCase() + row["_rowNumber"];
          const sheetA1Notation = `${sheetName}:${cellA1Notation}`;
          const cell = sheet.getCell(row["_rowNumber"] - 1, rawData.length);
          const cellNIK = sheet.getCell(row["_rowNumber"] - 1, 0);
          const cellName = sheet.getCell(row["_rowNumber"] - 1, 1);

          const transactionRecord = rawData.filter(
            (t: string) => parseInt(t, 10) <= 3 && parseInt(t, 10) > 0
          ) as string[];

          // Bansos first
          if (sheetName != "Bansos" && bansosLimit > 0) {
            console.log(`[+] Proceeding bansos...`);
            const bansosDB = new Database();
            await bansosDB.doc.loadInfo();

            message.push(await sheetTransaction(bansosDB.doc.sheetsByTitle["Bansos"], 1, pertamina, accountData));
            bansosLimit -= 1;
          }

          // Check duplicate NIK
          if (niks.done.day != nowDate) {
            niks.done = {
              data: [],
              day: nowDate,
            };
          }

          if (nowDate - niks.exceeded.day >= 3) {
            niks.exceeded = {
              data: [],
              day: nowDate,
            };
          }

          if (niks.done.data.includes(nik)) {
            console.log(`[-] Found duplicate NIK Transaction!`);
            cell.value = 0;
            continue;
          }

          if (niks.exceeded.data.includes(nik) || transactionRecord.length > 5) {
            console.log(`[-] Exceeded NIK Process Detected!`);
            cell.value = "End";
            continue;
          }

          if (rawData[rawData.length - 1] != "End") {
            console.log(`[+] Processing ${name}...`);
            const transaction = await pertamina.transaction(nik);

            if (transaction.success) {
              console.log(`[+] Transaction success!`);
              const quantity = transaction.quantity!;
              cell.value = quantity;
              accountData.stock -= quantity;

              message.push(
                `[🟢] ${sheetName} > Transaction success > ${sheetA1Notation} > ${quantity}/${accountData.stock}`
              );

              // Update NIK Info
              cellNIK.value = nik;
              // cellName.value = transaction.payload.subsidi.nama;

              niks.done.data.push(nik);
              transactionLimit -= 1;
            } else {
              console.log(`[-] Error: ${transaction}`);
              message.push(
                `[🔴] ${sheetName} > Error ${transaction.code}: ${transaction.message} > ${nik} > ${sheetA1Notation}`
              );

              switch (transaction.code) {
                case 204:
                  if (transaction.message == "Out of stock") {
                    errorCount = 5;
                  }
                  break;
                case 400:
                  if (transaction.message == "Transaksi melebihi stok yang dapat dijual") {
                    errorCount = 5;
                  } else {
                    niks.exceeded.data.push(nik);
                    cell.value = "End";
                  }
                  break;
                case 404:
                  await row.delete();
                  break;
                case 403:
                case 429:
                case 460:
                  errorCount = 5;
                  break;
                default:
                  cell.value = 0;
              }

              errorCount += 1;
              if (errorCount >= 5) {
                transactionLimit = 0;
                bansosLimit = 0;
                loopLimit = 0;
              }
            }
          }

          Database.setNiksArray(niks);
          console.log(`[+] Data update on ${cellA1Notation}!`);
        }
      }
    }

    loopLimit -= 1;
    maxColumnIndex += 1;
  }

  if (
    (transactionLimit > 0 && (accountData.lastUpdate.getDate() != nowDate || sheetName == "Bansos")) ||
    (accountData.lastUpdate.getDate() != nowDate && nowDate == 1)
  ) {
    console.log(`[+] Transaction limit not reached, clearing sheet...`);
    await sheet.clear(`C1:Z${rows.length + 1}`);
    message.push(`[🟡] Transaction limit not reached, sheet ${sheetName} has been cleared!`);

    if (sheetName != "Bansos") userLimit += 1;
  }

  console.log(`[+] Saving changes to Google Sheets...`);
  await sheet.saveUpdatedCells();
  console.log(`[+] Done!`);

  return message.join("\n");
}

async function main() {
  console.log("STARTING PROGRAM...");
  console.log("[+] Initializing classes...");

  // Send cred
  // await bot.sendCredToAdmin();

  // Get proxies
  const proxies = await getProxyList();
  if (proxies.length <= 0) {
    throw new Error("no proxies found");
  }

  const db = new Database();
  await db.doc.loadInfo();
  db.resetUserCycleSafe();

  await bot.sendToAdmin("BOT STARTED!");

  for (let i = 0; i < db.doc.sheetCount - 1; i++) {
    try {
      const sheet = db.doc.sheetsByIndex[i];
      const sheetName = sheet.title;
      let transactionLimit = 2;

      if (userLimit <= 0) break;

      console.log(`\n[+] Accessing ${sheetName} sheet...`);
      if (sheetName.endsWith("DISABLE")) continue;

      // Check user on local temp data
      let user = db.getUserLocalData(sheetName);
      if (user && (user?.cycle ?? 0) <= 10) {
        user.cycle = (user.cycle ?? 0) + 1;
        db.setUserLocalData(user);

        // 60 minutes differences
        if (Math.abs(new Date(user.lastUpdate).getTime() - new Date().getTime()) < 60 * 60 * 1000) {
          if (user.stock <= 0 || user.stock >= 500) {
            console.log("[-] Stock: " + user.stock);
            continue;
          }
        }

        // Proceed user
        await sheet.loadCells();

        const tokenCell = sheet.getCellByA1("B1");
        const token = tokenCell.value?.toString() || "";
        const username = sheet.getCellByA1("B2").value?.toString() || "";
        const password = sheet.getCellByA1("B3").value?.toString() || "";
        const proxy = proxies[Math.floor(Math.random() * proxies.length)];

        const pertamina = new Pertamina(username, password, token, proxy);

        let isTokenValid = false;
        if (!isTokenValid && userLimit > 0) {
          try {
            const newToken = await pertamina.login();
            if (newToken.length > 800) {
              isTokenValid = await pertamina.checkToken();
              if (isTokenValid) {
                tokenCell.value = newToken;
                await sheet.saveUpdatedCells();

                console.log("[+] Logged In!");
                finalMessage.push(`[🟡] ${sheet.title} Logged In!`);
              } else {
                throw new Error("Unknown error");
              }
            }
          } catch (e: any) {
            console.log(`[-] Login Failed: ${e.message}`);
            finalMessage.push(`[🔴] ${sheet.title} Login Failed: ${e.message}`);
          }
        }

        // Save updated stock
        user = {
          name: sheetName,
          stock: isTokenValid ? await pertamina.checkStock() : user?.stock,
          isTokenValid: isTokenValid,
          isAlive: true,
          lastUpdate: new Date(),
          cycle: user?.cycle ?? 0,
        };

        if (user.isTokenValid && user.stock > 0 && user.isAlive) {
          let message: string = "";
          try {
            errorCount = 0;
            message = await sheetTransaction(sheet, transactionLimit, pertamina, user);
          } catch (e: any) {
            console.log(`[-] Error occured: ${e.message}`);
            message += `\n[🔴] Error occured: ${e.message}`;
          } finally {
            finalMessage.push(message);
            if (message.includes("success")) {
              // userLimit -= 1;
            } else if (!message.includes(">")) {
              // user.isAlive = false;
            }
          }
        }

        if (user.isTokenValid) {
          console.log("[+] Canceling duplicated transactions...");
          let message: string = "";
          try {
            message = await pertamina.cancelDoubleTransaction();
          } catch (e: any) {
            console.log(`[-] Error occured: ${e.message}`);
            message += `\n[🔴] Error occured: ${e.message}`;
          } finally {
            if (message) finalMessage.push(message);
          }
        }

        await pertamina.close();
        userLimit -= 1;
        db.setUserLocalData(user);
        await sleep(5000);
      }

      console.log(`[+] Done proceeding ${sheetName} sheet!`);
    } catch (e: any) {
      console.log(`[-] Error occured: ${e.message}`);
      finalMessage.push(`[🔴] Error occured: ${e.message}`);
    }
  }
}

(async () => {
  try {
    await main();
  } catch (e: any) {
    const errorMessage = `${e.stack}\n\n${e.message}`;
    console.log(errorMessage);
    await bot.sendRawToAdmin(errorMessage);
  } finally {
    // Final process

    for (const message of finalMessage) {
      await bot.sendToAdmin(message);
    }
    finalMessage = [];

    await bot.sendToAdmin("PROGRAM FINISHED!");
    console.log("PROGRAM FINISHED!");
    process.exit(0);
  }
})();
