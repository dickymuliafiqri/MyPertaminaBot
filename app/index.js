"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = require("./modules/database");
const pertamina_1 = require("./modules/pertamina");
(() => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    let transactionLimit = 10;
    const db = new database_1.Database();
    yield db.doc.loadInfo();
    for (let i = 0; i < db.doc.sheetCount - 1; i++) {
        if (transactionLimit <= 0)
            break;
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
        let rows = [];
        try {
            rows = yield sheet.getRows();
            yield sheet.loadCells();
        }
        catch (e) {
            console.log(e.response);
        }
        if (!rows)
            continue;
        const bearer = ((_a = sheet.getCellByA1("B1").value) === null || _a === void 0 ? void 0 : _a.toString()) || "";
        const username = ((_b = sheet.getCellByA1("B2").value) === null || _b === void 0 ? void 0 : _b.toString()) || "";
        const password = ((_c = sheet.getCellByA1("B3").value) === null || _c === void 0 ? void 0 : _c.toString()) || "";
        const pertamina = new pertamina_1.Pertamina(username, password, bearer);
        const isTokenValid = yield pertamina.checkToken();
        const stock = yield pertamina.checkStock();
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
                if (maxColumnIndex < rawData.length)
                    maxColumnIndex = rawData.length;
            }
            for (const row of rows) {
                const rawData = row["_rawData"];
                if (!isNaN((_d = rawData[0]) === null || _d === void 0 ? void 0 : _d.replaceAll(" ", "")) && rawData[rawData.length - 1] != "End") {
                    if (rawData.length < maxColumnIndex) {
                        // Process data
                        const nik = parseInt(rawData[0].replaceAll(" ", "")).toString();
                        console.log(`[+] Processing ${nik}...`);
                        const transaction = yield pertamina.transaction(nik);
                        const cellA1Notation = (rawData.length + 9).toString(36).toUpperCase() + row["_rowNumber"];
                        const cell = sheet.getCell(row["_rowNumber"] - 1, rawData.length);
                        if (transaction.success) {
                            console.log(`[+] Transaction success!`);
                            cell.value = transaction.payload.products[0].quantity;
                            transactionLimit -= 1;
                        }
                        else if (transaction.code == 404) {
                            console.log(`[-] Found bad NIK, deleting...`);
                            yield row.delete();
                        }
                        else {
                            console.log(`[-] Error occured: ${transaction.message}`);
                            cell.value = 0;
                        }
                        console.log(`[+] Saving changes to Google Sheets...`);
                        yield sheet.saveUpdatedCells();
                        console.log(`[+] Changes saved on ${cellA1Notation}!`);
                        console.log(`[+] Done!`);
                        break;
                    }
                }
            }
        }
    }
}))();
