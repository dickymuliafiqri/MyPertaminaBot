"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Database = void 0;
const google_spreadsheet_1 = require("google-spreadsheet");
const google_auth_library_1 = require("google-auth-library");
const fs_1 = require("fs");
class Database {
    constructor() {
        this.userLocalData = JSON.parse((0, fs_1.readFileSync)("./temp/user.json").toString());
        this.doc = new google_spreadsheet_1.GoogleSpreadsheet("1ZktcnqKTqnd53ZTKFqbWe0GepwoDneJ1oBXYyl9QaVU", new google_auth_library_1.JWT({
            email: "my-pertamina@wise-env-401913.iam.gserviceaccount.com",
            key: "-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDIE5XK3+zxNuFZ\ndoWXMlvNTpfa23VjhG3IF8E08BYzwQnbQySPXV2U7ZMeEi/k1sRTG95jk0kMoiYA\nVcuXgu0ikKq7GXzZCk3NqWF/DYle8eyt/INuUJiUyVvST2fi86obroNvYTxablg3\nSw+HEZAzOwAcmU5IrJRUbQQb3zAj0kQerw11Bt5FVyf1pCbrNh6nTDke343q+4rY\nygZIV8qfMeoBaZ77QiApQ5wOE9Eig9EmKUep11r6/Ni/0v7TzalvEgbqNMbh9Z7g\nCN0Ad9Eo1GBG0N9gQlZjJbw3HoFY1sat8aY/N+CbeGKEIuxSeLXbLvvOW3nAd+In\nmvO5j9t7AgMBAAECggEAFvUoWv8W0RbbBMj0y0ScBBLgmdxUu/aWIj+Xi9uAsK+V\n0fMCXvD3q/8WwnyTwk5ieKbZ/dMIrspsUd2GXvxG+ZBgBtgF22GzS8YDyfBjsuFP\npycybZYR7ACu6JLz+La87jA4JK+jnTzMIowaXAVH5pj+ikmNEgm7e3SG5CvX+kQS\nIZMtI1sC6WnX7rSjoF+N032tCiTCRzpfJC+rHc7NM0oh7Xza6/5GPQa4qQA2srR+\nVDhD9OGLRBVDbDGULMxX1JURuk6byRChXANEx0Ffnmfg0vhlgaw5PqT9XJKq/ndO\nmAuN0frS3VzVidrBaQnXKjeEVX++xIuDEgNVYGLUAQKBgQD4td3ePMPWDBjqlBHk\nEtBPQpfU9LVBUhhdZZaNoEzuCd8B16/02SQ2LdQsjhF5YZqpl/dbvq024mkUKHgN\n30q/ccJHCuXr3swlzAWi0ybgQ9NPo6Jigqxl2+pqCTYj4VK0gNZAq5WvuJGi0wCI\nYFmgC8glwcziyI7lbSTaGPlfawKBgQDN8M6BPoVFE8VGWYSQkGQ8xUQrQG+YccjQ\n50IzkV91BdK6se/YrLKJMF9yO584m33RMwJBh9hvEgXlOPSHV6ArUde0dIoEsQmG\nzzmrHMQt6ARb+o+ycjmET7wAbIuDAuA43t9IP3Vcug+ASAA8mYAIDhW6XzWpV2yK\nbfzt7RvIMQKBgDrgAoeLZuiSsItHRfzxnzJEF2EoFIhEANSLKdqY6d0npQzwnAyg\nInxY2PM7JlPPkSc4fCvRtXtamXlWIyVViIJNUaozoD333efMpkDnLzrDk5A0skoT\nmO/74T/8sj5IJqXoIc/pTmPskz0yKdwewtiqMVUOzYuZ4onZDnI6mz3FAoGAV9KV\nffBXjPm9ax7JtYyd8nx9caRs8qmzZcL5LFyWRKVTFGLFUbVz/aUvTtu2LsHAifIi\nyCdSWStqcDI1tXHc0Bx6zG3WXeHRmjfM8/e0gY8sLL1RglvLw2ztU5D2fcxAKoCA\n36KQPhbqfV43G6CqRMUc5vmrPKgXlYEKF7zB2EECgYBgvP7XmUYktfg6LBNvCPgU\nxwiQSDeWSnJx8TQYn5jDn02L520gJy5Lg/LMpbmtIoHK99IRaDXVEMzxYNT1h11A\nIPTP2sjviphitkoXioRf51nuIDj+UI0n2xxRxJFx9NbE43e8IOztnzJ+EMlVZ1sW\naSj+TA9lbqil3EIAKzxTKg==\n-----END PRIVATE KEY-----\n",
            scopes: ["https://www.googleapis.com/auth/spreadsheets"],
        }));
    }
    getUserLocalData(name) {
        for (const user of this.userLocalData) {
            if (user.name == name) {
                return user;
            }
        }
    }
    setUserLocalData(user) {
        const usernames = this.userLocalData.map((u) => u.name);
        if (usernames.includes(user.name)) {
            this.userLocalData[usernames.indexOf(user.name)] = user;
        }
        else {
            this.userLocalData.push(user);
        }
        (0, fs_1.writeFileSync)("./temp/user.json", JSON.stringify(this.userLocalData, null, "  "));
    }
}
exports.Database = Database;
