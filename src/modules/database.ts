import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";
import { readFileSync, writeFileSync } from "fs";

export interface UserLocalData {
  name: string;
  stock: number;
  isTokenValid: boolean;
  isAlive: boolean;
  lastUpdate: Date;
}

interface NIKsData {
  data: string[];
  day: number;
}

export interface NIKsLocalData {
  done: NIKsData;
  exceeded: NIKsData;
}

export class Database {
  private userLocalData: UserLocalData[] = JSON.parse(readFileSync("./temp/user.json").toString());
  doc: GoogleSpreadsheet = new GoogleSpreadsheet(
    process.env.SHEET_ID as string,
    new JWT({
      email: process.env.DATABASE_EMAIL as string,
      key: process.env.DATABASE_KEY as string,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    })
  );

  getUserLocalData(name: string) {
    for (const user of this.userLocalData) {
      if (user.name == name) {
        return user;
      }
    }
  }

  setUserLocalData(user: UserLocalData) {
    const usernames: string[] = this.userLocalData.map((u) => u.name);
    if (usernames.includes(user.name)) {
      this.userLocalData[usernames.indexOf(user.name)] = user;
    } else {
      this.userLocalData.push(user);
    }

    writeFileSync("./temp/user.json", JSON.stringify(this.userLocalData, null, "  "));
  }

  static getNiksArray(): NIKsLocalData {
    return JSON.parse(readFileSync("./temp/niks.json").toString()) as NIKsLocalData;
  }

  static setNiksArray(niks: NIKsLocalData) {
    writeFileSync("./temp/niks.json", JSON.stringify(niks, null, "  "));
  }
}
