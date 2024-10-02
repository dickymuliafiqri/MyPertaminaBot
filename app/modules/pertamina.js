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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Pertamina = void 0;
const axios_1 = __importDefault(require("axios"));
class Pertamina {
    constructor(username, password, bearer) {
        this.linkLogin = "https://pertamina-login.vercel.app";
        this.linkReport = "https://api-map.my-pertamina.id/general/v1/transactions/report";
        this.linkProduct = "https://api-map.my-pertamina.id/general/v2/products";
        this.linkPersonal = "https://subsiditepatlpg.mypertamina.id/merchant/app/profile-merchant";
        this.linkCheckNIK = "https://api-map.my-pertamina.id/customers/v1/verify-nik?nationalityId=";
        this.linkTransaction = "https://api-map.my-pertamina.id/general/v1/transactions";
        this.username = username;
        this.password = password;
        this.options = {
            headers: {
                Authorization: bearer,
                "Content-Type": "application/json",
            },
        };
    }
    checkToken() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const req = yield axios_1.default.get(this.linkProduct, Object.assign({}, this.options));
                if (req.status == 200) {
                    return true;
                }
            }
            catch (e) {
                console.log(`[-] Token Expired!`);
            }
            return false;
        });
    }
    checkStock() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const req = yield axios_1.default.get(this.linkProduct, Object.assign({}, this.options));
                if (req.status == 200) {
                    return req.data.data.stockAvailable;
                }
            }
            catch (e) {
                console.log(`[-] Error getting stock!`);
            }
            return 0;
        });
    }
    getCustomer(nik) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const req = yield axios_1.default.get(this.linkCheckNIK + nik, Object.assign({}, this.options));
                return req.data;
            }
            catch (e) {
                return e.response.data;
            }
        });
    }
    getProduct() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const req = yield axios_1.default.get(this.linkProduct, Object.assign({}, this.options));
                if (req.status == 200) {
                    return req.data;
                }
            }
            catch (e) {
                return e.response.data;
            }
        });
    }
    transaction(nik) {
        return __awaiter(this, void 0, void 0, function* () {
            const product = yield this.getProduct();
            const customer = yield this.getCustomer(nik);
            if (product.success && customer.success) {
                const customerType = (() => {
                    const typeNames = customer.data.customerTypes.map((c) => c.name);
                    if (typeNames.includes("Usaha Mikro")) {
                        return customer.data.customerTypes[typeNames.indexOf("Usaha Mikro")];
                    }
                    else if (typeNames.includes("Rumah Tangga")) {
                        return customer.data.customerTypes[typeNames.indexOf("Rumah Tangga")];
                    }
                })();
                let buyQuantity = customerType.name == "Usaha Mikro" ? 3 : 1;
                if (customerType.name == "Usaha Mikro" && product.data.stockAvailable < 3)
                    buyQuantity = product.data.stockAvailable;
                const payload = {
                    products: [
                        {
                            productId: product.data.productId,
                            quantity: buyQuantity,
                        },
                    ],
                    geoTagging: "",
                    inputNominal: buyQuantity * product.data.price,
                    change: 0,
                    paymentType: "cash",
                    subsidi: {
                        nik: nik,
                        IDValidation: "",
                        familyId: customer.data.familyId,
                        category: customerType.name,
                        sourceTypeId: customerType.sourceTypeId,
                        nama: customer.data.name,
                        noHandPhoneKPM: customer.data.phoneNumber,
                        channelInject: customer.data.channelInject,
                        pengambilanItemSubsidi: [
                            {
                                item: "ELPIJI",
                                quantitas: buyQuantity,
                                potongan_harga: 0,
                            },
                        ],
                    },
                };
                try {
                    const req = yield axios_1.default.post(this.linkTransaction, payload, Object.assign({}, this.options));
                    return Object.assign(Object.assign({}, req.data), { payload: Object.assign({}, payload) });
                }
                catch (e) {
                    return Object.assign(Object.assign({}, e.response.data), { payload: Object.assign({}, payload) });
                }
            }
            else if (customer.code == 404) {
                return {
                    success: false,
                    message: "Unregistered NIK",
                    code: 404,
                };
            }
            return {
                success: false,
                message: "Unknown Error",
                code: 500,
            };
        });
    }
}
exports.Pertamina = Pertamina;
