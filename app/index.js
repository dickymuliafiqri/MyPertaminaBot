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
function sheetTransaction(sheet, transactionLimit, pertamina, db) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        console.log(`\n[+] Making transaction for ${sheet.title} sheet...`);
        let loopLimit = 2;
        let maxColumnIndex = 0;
        let rows = yield sheet.getRows();
        if (sheet.title == "Bansos") {
            yield sheet.loadCells();
        }
        for (const row of rows) {
            const rawData = row["_rawData"];
            if (maxColumnIndex < rawData.length)
                maxColumnIndex = rawData.length;
        }
        while (loopLimit > 0) {
            for (const row of rows) {
                if (transactionLimit <= 0)
                    break;
                const rawData = row["_rawData"];
                if (!isNaN((_a = rawData[0]) === null || _a === void 0 ? void 0 : _a.replaceAll(" ", "")) && rawData[rawData.length - 1] != "End") {
                    if (rawData.length < maxColumnIndex) {
                        const name = rawData[1];
                        if (name == "ANA SULISTYO WATI") {
                            console.log(rawData);
                            console.log(maxColumnIndex);
                            return;
                        }
                        const nik = parseInt(rawData[0].replaceAll(" ", "")).toString();
                        const cellA1Notation = (rawData.length + 1 + 9).toString(36).toUpperCase() + row["_rowNumber"];
                        const cell = sheet.getCell(row["_rowNumber"] - 1, rawData.length);
                        const transactionRecord = rawData.filter((t) => parseInt(t) <= 3 && parseInt(t) > 0);
                        if (transactionRecord.length > 2) {
                            console.log(`[+] Buy limit reached for ${name}!`);
                            cell.value = 0;
                            if (sheet.title != "Bansos") {
                                console.log(`[+] Proceeding bansos...`);
                                yield sheetTransaction(db.doc.sheetsByIndex[db.doc.sheetCount - 1], 1, pertamina, db);
                                transactionLimit -= 1;
                            }
                            continue;
                        }
                        console.log(`[+] Processing ${name}...`);
                        const transaction = yield pertamina.transaction(nik);
                        if (transaction.success) {
                            console.log(`[+] Transaction success!`);
                            cell.value = transaction.payload.products[0].quantity;
                        }
                        else if (transaction.code == 404) {
                            console.log(`[-] Found bad NIK, deleting...`);
                            yield row.delete();
                        }
                        else if (transaction.message == "Transaksi melebihi kuota subsidi") {
                            console.log(`[-] Transaction limit reached for ${name}!`);
                            cell.value = "End";
                        }
                        else {
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
            yield sheet.clear(`C1:Z${rows.length + 1}`);
        }
        console.log(`[+] Saving changes to Google Sheets...`);
        yield sheet.saveUpdatedCells();
        console.log(`[+] Done!`);
    });
}
(() => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    let userLimit = 10;
    const db = new database_1.Database();
    yield db.doc.loadInfo();
    for (let i = 0; i < db.doc.sheetCount - 1; i++) {
        const sheet = db.doc.sheetsByIndex[i];
        let transactionLimit = 3;
        if (userLimit <= 0)
            break;
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
        yield sheet.loadCells();
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
            yield sheetTransaction(sheet, transactionLimit, pertamina, db);
            userLimit -= 1;
        }
    }
}))();
