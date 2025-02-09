import got, { GotBodyOptions } from "got";
import { HttpsProxyAgent, HttpProxyAgent } from "hpagent";

export class Pertamina {
  private linkLogin = "https://pertamina-login.vercel.app";
  private linkReport = "https://api-map.my-pertamina.id/general/v1/transactions/report";
  private linkProduct = "https://api-map.my-pertamina.id/general/v2/products";
  private linkPersonal = "https://subsiditepatlpg.mypertamina.id/merchant/app/profile-merchant";
  private linkCheckNIK = "https://api-map.my-pertamina.id/customers/v2/verify-nik?nationalityId=";
  private linkTransaction = "https://api-map.my-pertamina.id/general/v2/transactions";

  private username: string;
  private password: string;
  private bearer: string;
  private options: GotBodyOptions<string>;

  private stockMap: any = {
    "Usaha Mikro": 2,
    "Rumah Tangga": 1,
  };

  constructor(username: string, password: string, bearer: string, proxy: string) {
    this.username = username;
    this.password = password;
    this.bearer = bearer;

    this.options = {
      agent: {
        http: new HttpProxyAgent({
          keepAlive: true,
          keepAliveMsecs: 1000,
          maxSockets: 256,
          maxFreeSockets: 256,
          scheduling: "lifo",
          proxy: "http://" + proxy,
        }),
        https: new HttpsProxyAgent({
          rejectUnauthorized: false,
          keepAlive: true,
          keepAliveMsecs: 1000,
          maxSockets: 256,
          maxFreeSockets: 256,
          scheduling: "lifo",
          proxy: "http://" + proxy,
        }),
      },
      headers: {
        Authorization: bearer,
        "Content-Type": "application/json",
      },
    };
  }

  async login() {
    console.log(`[+] Login using ${this.username}...`);

    let message = "Login Failed";
    const res = await fetch(`${this.linkLogin}/?username=${this.username}&password=${this.password}`, {
      signal: AbortSignal.timeout(30000),
    });

    if (res.status == 200) {
      message = await res.text();

      if (this.options.headers) {
        this.options.headers = {
          ...this.options.headers,
          Authorization: message,
        };
      }
    }

    return message;
  }

  async checkToken() {
    try {
      const req = await got(this.linkProduct, {
        ...this.options,
      });

      if (req.statusCode == 200) {
        return true;
      }
    } catch (e: any) {
      console.log(`[-] Token Expired!`);
    }

    return false;
  }

  async getReport(date: string) {
    try {
      const req = await got(`${this.linkReport}?startDate=${date}&endDate=${date}`, {
        ...this.options,
      });
      if (req.statusCode == 200) {
        return JSON.parse(req.body);
      }
    } catch (e: any) {
      return e.message;
    }
  }

  async cancelDoubleTransaction() {
    const messages = [];

    try {
      const [yyyy, mm, dd] = new Date().toISOString().split("T")[0].split("-");
      const now = `${yyyy}-${mm}-${dd}`;
      const yesterday = `${yyyy}-${mm}-${parseInt(dd) - 1}`;

      for (const date of [now, yesterday]) {
        const report = await this.getReport(date);
        if (report && report.success) {
          for (const customerReport of report.data.customersReport) {
            if (customerReport.total > this.stockMap[customerReport.categories[0]]) {
              try {
                const req = await got(
                  `${this.linkTransaction}?startDate=${date}&endDate=${date}&customerReportId=${customerReport.customerReportId}`,
                  {
                    ...this.options,
                  }
                );

                if (req.statusCode == 200) {
                  const transactionReport = JSON.parse(req.body);
                  if (transactionReport.success) {
                    for (let i = 1; i < transactionReport.data.data.length; i++) {
                      const transaction = transactionReport.data.data[i];
                      if (!transaction.isCanceled) {
                        try {
                          const req = await got(`${this.linkTransaction}/${transaction.transactionId}/cancel`, {
                            method: "post",
                            body: JSON.stringify({
                              reason: "Salah",
                              pin: `${this.password}`,
                            }),
                            ...this.options,
                          });

                          if (JSON.parse(req.body).success) {
                            messages.push(`[🟡] Transaction for ${transaction.customerName} canceled!`);
                          }
                        } catch (e: any) {
                          console.log(`[-] ${e.message}`);
                        }
                      }
                    }
                  }
                }
              } catch (e: any) {
                console.log(`[-] ${e.message}`);
              }
            }
          }
        }
      }
    } catch (e: any) {
      return e.message;
    }

    return messages.join("\n");
  }

  async checkStock() {
    try {
      const req = await got(this.linkProduct, {
        ...this.options,
      });

      if (req.statusCode == 200) {
        return JSON.parse(req.body).data.stockAvailable;
      }
    } catch (e: any) {
      console.log(`[-] Error getting stock!`);
    }

    return 0;
  }

  async getCustomer(nik: string) {
    try {
      const req = await got(this.linkCheckNIK + nik, {
        ...this.options,
      });
      return JSON.parse(req.body);
    } catch (e: any) {
      return e.message;
    }
  }

  async getProduct() {
    try {
      const req = await got(this.linkProduct, {
        ...this.options,
      });

      if (req.statusCode == 200) {
        return JSON.parse(req.body);
      }
    } catch (e: any) {
      return e.message;
    }
  }

  async transaction(nik: string) {
    const product = await this.getProduct();
    const customer = await this.getCustomer(nik);

    if (product.success && customer.success) {
      // Check price
      if (product.data.price < 18000) {
        return {
          success: false,
          message: "price not configured",
          code: 460,
        };
      }

      const customerType = (() => {
        const typeNames: string[] = (customer.data.customerTypes as object[]).map((c: any) => c.name) as string[];

        if (typeNames.includes("Usaha Mikro")) {
          return customer.data.customerTypes[typeNames.indexOf("Usaha Mikro")];
        } else if (typeNames.includes("Rumah Tangga")) {
          return customer.data.customerTypes[typeNames.indexOf("Rumah Tangga")];
        }
      })();

      if (!customerType) {
        return {
          success: false,
          message: "NIK Error/Not Found",
          code: 404,
        };
      }

      let buyQuantity = this.stockMap[customerType.name];
      if (customerType.name == "Usaha Mikro" && product.data.stockAvailable < 2)
        buyQuantity = product.data.stockAvailable;

      if (buyQuantity <= 0) {
        return {
          success: false,
          message: "Out of stock",
          code: 204,
        };
      }

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
          familyIdEncrypted: customer.data.familyIdEncrypted,
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
        token: customer.data.token,
      };

      try {
        const req = await got(this.linkTransaction, {
          method: "post",
          body: JSON.stringify(payload),
          ...this.options,
        });

        return {
          ...JSON.parse(req.body),
          payload: {
            ...payload,
          },
        };
      } catch (e: any) {
        const code = (e.message as string).match(/\d+/) || [];
        return {
          success: false,
          message: e.message,
          code: parseInt(code[0] || "500"),
          payload: {
            ...payload,
          },
        };
      }
    } else if (!customer.success) {
      return customer;
    } else if (!product.success) {
      return product;
    }

    return {
      success: false,
      message: "Unknown Error",
      code: 500,
    };
  }
}
