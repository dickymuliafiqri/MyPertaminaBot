import { fetch } from "bun";

export class Pertamina {
  private linkLogin = "https://pertamina-login.vercel.app";
  private linkReport = "https://api-map.my-pertamina.id/general/v1/transactions/report";
  private linkProduct = "https://api-map.my-pertamina.id/general/v2/products";
  private linkPersonal = "https://subsiditepatlpg.mypertamina.id/merchant/app/profile-merchant";
  private linkCheckNIK = "https://api-map.my-pertamina.id/customers/v1/verify-nik?nationalityId=";
  private linkTransaction = "https://api-map.my-pertamina.id/general/v1/transactions";

  private username: string;
  private password: string;
  private bearer: string;
  private options: RequestInit;

  private stockMap: any = {
    "Usaha Mikro": 2,
    "Rumah Tangga": 1,
  };

  constructor(username: string, password: string, bearer: string) {
    this.username = username;
    this.password = password;
    this.bearer = bearer;

    this.options = {
      headers: {
        Authorization: bearer,
        "Content-Type": "application/json",
      },
    };
  }

  async login() {
    console.log(`[+] Login using ${this.username}...`);

    let message = "Login Failed";
    const res = await fetch(`https://pertamina-login.vercel.app/?username=${this.username}&password=${this.password}`);

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
      const req = await fetch(this.linkProduct, {
        ...this.options,
      });

      if (req.status == 200) {
        return true;
      }
    } catch (e: any) {
      console.log(e);
      console.log(`[-] Token Expired!`);
    }

    return false;
  }

  async getReport(date: string) {
    try {
      const req = await fetch(`${this.linkReport}?startDate=${date}&endDate=${date}`, {
        ...this.options,
      });
      if (req.status == 200) {
        return await req.json();
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
                const req = await fetch(
                  `${this.linkTransaction}?startDate=${date}&endDate=${date}&customerReportId=${customerReport.customerReportId}`,
                  {
                    ...this.options,
                  }
                );

                if (req.status == 200) {
                  const transactionReport = await req.json();
                  if (transactionReport.success) {
                    for (let i = 1; i < transactionReport.data.data.length; i++) {
                      const transaction = transactionReport.data.data[i];
                      if (!transaction.isCanceled) {
                        try {
                          const req = await fetch(`${this.linkTransaction}/${transaction.transactionId}/cancel`, {
                            method: "post",
                            body: JSON.stringify({
                              reason: "Salah",
                              pin: `${this.password}`,
                            }),
                            ...this.options,
                          });

                          if ((await req.json()).success) {
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
      const req = await fetch(this.linkProduct, {
        ...this.options,
      });

      if (req.status == 200) {
        return (await req.json()).data.stockAvailable;
      }
    } catch (e: any) {
      console.log(`[-] Error getting stock!`);
    }

    return 0;
  }

  async getCustomer(nik: string) {
    try {
      const req = await fetch(this.linkCheckNIK + nik, {
        ...this.options,
      });
      return await req.json();
    } catch (e: any) {
      return e.message;
    }
  }

  async getProduct() {
    try {
      const req = await fetch(this.linkProduct, {
        ...this.options,
      });

      if (req.status == 200) {
        return await req.json();
      }
    } catch (e: any) {
      return e.message;
    }
  }

  async transaction(nik: string) {
    const product = await this.getProduct();
    const customer = await this.getCustomer(nik);

    if (product.success && customer.success) {
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
        const req = await fetch(this.linkTransaction, {
          method: "post",
          body: JSON.stringify(payload),
          ...this.options,
        });

        return {
          ...(await req.json()),
          payload: {
            ...payload,
          },
        };
      } catch (e: any) {
        return {
          success: false,
          message: e.message,
          code: 500,
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
